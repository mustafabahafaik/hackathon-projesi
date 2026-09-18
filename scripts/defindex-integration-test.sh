#!/usr/bin/env bash
# Proves contracts/escrow's DeFindex integration is real, on Stellar
# Testnet: deposit() and settle_undisputed() both make a genuine
# cross-contract call to DeFindex's own deployed testnet vault — no mock,
# no hardcoded share count (CLAUDE.md rule 1). Every step below is a signed
# testnet transaction; the deposit()/settle_undisputed() steps specifically
# read back whatever DeFindex's vault actually returns (shares minted,
# payout amount) rather than asserting a number this script chose itself.
#
# Usage:
#   scripts/defindex-integration-test.sh [alias]
#
# Deploys a FRESH escrow contract instance (via deploy-testnet.sh) rather
# than reusing docs/submission.md's existing deploy: that one was
# `initialize`d with a placeholder `defindex_vault` address before this
# integration existed, and `initialize` only runs once per contract.
#
# Requires: rustup (wasm32v1-none target), cargo, the `stellar` CLI — same
# as deploy-testnet.sh, which this calls directly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALIAS="${1:-depozito-escrow-defindex-test}"
NETWORK="testnet"

# Real DeFindex testnet vault (Paltalabs USDC vault) and its underlying
# asset — confirmed live against testnet with `stellar contract info
# interface` / `get_assets()` (see contracts/escrow/src/vault.rs and
# docs/submission.md for the exact commands and output). Cross-check
# against https://github.com/defindex-io/stellar-contracts/blob/main/public/testnet.contracts.json
# if this script starts failing — testnet vaults get redeployed.
DEFINDEX_VAULT="CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN"
USDC_TOKEN="CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU"

# Blend Capital's testnet faucet — the shared source of testnet USDC for
# this whole token (see the module note in vault.rs: USDC_TOKEN is issued
# by Blend's testnet faucet account). Confirmed working by hand before this
# script existed: it returns a partially-signed tx (by the faucet account)
# that still needs the requesting account's own signature before it can be
# submitted, since it opens trustlines sourced from that account.
FAUCET_URL="https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets"
# 10 USDC (7 decimals) — small enough to be a trivial ask of a shared
# faucet, large enough that DeFindex's MINIMUM_LIQUIDITY bootstrap burn
# (1000 stroops = 0.0001 USDC, see vault.rs's deposit doc) is negligible.
DEPOSIT_AMOUNT=100000000

log() { echo "[defindex-integration-test] $*" >&2; }

command -v stellar >/dev/null || { log "stellar CLI not found — see https://developers.stellar.org/docs/tools/cli/install-cli"; exit 1; }

ensure_identity() {
  local name="$1"
  if stellar keys address "$name" >/dev/null 2>&1; then
    log "reusing existing '$name' identity: $(stellar keys address "$name")"
  else
    log "generating and funding '$name'"
    stellar keys generate --network "$NETWORK" --fund "$name"
  fi
}

for id in deployer owner tenant arbitrator soroswap_router; do
  ensure_identity "$id"
done

usdc_balance() {
  stellar contract invoke --id "$USDC_TOKEN" --source-account deployer --network "$NETWORK" --send=no \
    -- balance --id "$1" 2>/dev/null | tr -d '"'
}

# Idempotent: only hits the faucet if the tenant doesn't already have
# enough real testnet USDC to fund this run's deposit.
ensure_tenant_usdc() {
  local tenant_addr tenant_balance
  tenant_addr="$(stellar keys address tenant)"
  tenant_balance="$(usdc_balance "$tenant_addr")"
  if [ "${tenant_balance:-0}" -ge "$DEPOSIT_AMOUNT" ] 2>/dev/null; then
    log "tenant already holds ${tenant_balance} stroops of real testnet USDC — skipping faucet"
    return
  fi

  log "requesting real testnet USDC from Blend's faucet for tenant ($tenant_addr)"
  local faucet_tx faucet_tx_signed
  faucet_tx="$(curl -sf "${FAUCET_URL}?userId=${tenant_addr}" | tr -d '"')"
  [ -n "$faucet_tx" ] || { log "faucet request failed or returned nothing"; exit 1; }

  # The faucet returns a tx pre-signed BY the faucet account, opening
  # trustlines sourced from the requesting account — those operations need
  # the requester's own signature too before the tx can be submitted.
  faucet_tx_signed="$(echo "$faucet_tx" | stellar tx sign --sign-with-key tenant --network "$NETWORK" 2>/dev/null | tail -n1)"
  echo "$faucet_tx_signed" | stellar tx send --network "$NETWORK" >&2

  tenant_balance="$(usdc_balance "$tenant_addr")"
  log "tenant USDC balance after faucet: $tenant_balance"
  [ "${tenant_balance:-0}" -ge "$DEPOSIT_AMOUNT" ] || { log "faucet didn't yield enough USDC"; exit 1; }
}

ensure_tenant_usdc

log "deploying a fresh escrow contract (alias: $ALIAS)"
CONTRACT_ID=$("$REPO_ROOT/scripts/deploy-testnet.sh" "$ALIAS")
log "contract_id=$CONTRACT_ID"

log "initialize() with the REAL DeFindex vault + real testnet USDC"
stellar contract invoke --id "$CONTRACT_ID" --source deployer --network "$NETWORK" -- initialize \
  --admin "$(stellar keys address deployer)" \
  --defindex_vault "$DEFINDEX_VAULT" \
  --soroswap_router "$(stellar keys address soroswap_router)" \
  --usdc_token "$USDC_TOKEN"

# Short-lived on purpose: this script needs the deadline to pass within its
# own runtime so settle_undisputed()'s permissionless branch is reachable
# without a second signer round-trip. A real lease's term is months out —
# see docs/submission.md's own smoke test for that path.
TERM=$(( $(date +%s) + 15 ))
log "create_lease() — term=$TERM (15s out), amount=$DEPOSIT_AMOUNT stroops"
LEASE_ID=$(stellar contract invoke --id "$CONTRACT_ID" --source owner --network "$NETWORK" -- create_lease \
  --owner "$(stellar keys address owner)" \
  --tenant "$(stellar keys address tenant)" \
  --arbitrator "$(stellar keys address arbitrator)" \
  --amount "$DEPOSIT_AMOUNT" \
  --term "$TERM" | tail -1)
log "lease_id=$LEASE_ID"

log "get_lease() before deposit — expect status 0 (Created), vault_shares 0"
BEFORE=$(stellar contract invoke --id "$CONTRACT_ID" --source-account deployer --network "$NETWORK" --send=no -- get_lease --lease_id "$LEASE_ID")
echo "$BEFORE" >&2

log "deposit() — real cross-contract call into DeFindex's vault ($DEFINDEX_VAULT)"
DEPOSIT_TX=$(stellar contract invoke --id "$CONTRACT_ID" --source tenant --network "$NETWORK" -- deposit --lease_id "$LEASE_ID" 2>&1)
echo "$DEPOSIT_TX" >&2

log "get_lease() after deposit — expect status 1 (Funded), vault_shares from DeFindex itself"
AFTER_DEPOSIT=$(stellar contract invoke --id "$CONTRACT_ID" --source-account deployer --network "$NETWORK" --send=no -- get_lease --lease_id "$LEASE_ID")
echo "$AFTER_DEPOSIT" >&2

VAULT_SHARES=$(echo "$AFTER_DEPOSIT" | grep -oE '"vault_shares":"[0-9]+"' | grep -oE '[0-9]+')
[ -n "$VAULT_SHARES" ] || { log "FAIL: couldn't read vault_shares back from get_lease"; exit 1; }
log "DeFindex minted $VAULT_SHARES vault shares for a $DEPOSIT_AMOUNT stroop deposit — read from the vault's own on-chain state, not asserted by this script"

log "record_photo_hash(MoveIn) x2 — moves the lease Funded -> Active"
# The CLI wants PhotoPhase/Party as their raw discriminants (0/1), not the
# variant names — `record_photo_hash --help` against the deployed contract
# spells this out (`--phase <0 | 1>`, `--party <0 | 1>`); MoveIn=0,
# Landlord=0, Tenant=1 per contracts/escrow/src/types.rs.
stellar contract invoke --id "$CONTRACT_ID" --source owner --network "$NETWORK" -- record_photo_hash \
  --lease_id "$LEASE_ID" --phase 0 --party 0 \
  --root_hash 000000000000000000000000000000000000000000000000000000000000000a
stellar contract invoke --id "$CONTRACT_ID" --source tenant --network "$NETWORK" -- record_photo_hash \
  --lease_id "$LEASE_ID" --phase 0 --party 1 \
  --root_hash 00000000000000000000000000000000000000000000000000000000000000b0

log "waiting for the lease term to pass (settle_undisputed's permissionless branch needs it)"
until [ "$(date +%s)" -ge "$TERM" ]; do sleep 2; done

log "settle_undisputed() — real cross-contract withdraw from DeFindex, pays the tenant"
TENANT_BEFORE=$(usdc_balance "$(stellar keys address tenant)")
stellar contract invoke --id "$CONTRACT_ID" --source-account deployer --network "$NETWORK" -- settle_undisputed --lease_id "$LEASE_ID"
TENANT_AFTER=$(usdc_balance "$(stellar keys address tenant)")

log "get_lease() after settle — expect status 9 (Resolved), vault_shares 0"
AFTER_SETTLE=$(stellar contract invoke --id "$CONTRACT_ID" --source-account deployer --network "$NETWORK" --send=no -- get_lease --lease_id "$LEASE_ID")
echo "$AFTER_SETTLE" >&2

echo "$BEFORE" | grep -q '"status":0' || { log "FAIL: pre-deposit status was not 0 (Created)"; exit 1; }
echo "$AFTER_DEPOSIT" | grep -q '"status":1' || { log "FAIL: post-deposit status was not 1 (Funded)"; exit 1; }
echo "$AFTER_SETTLE" | grep -q '"status":9' || { log "FAIL: post-settle status was not 9 (Resolved)"; exit 1; }
echo "$AFTER_SETTLE" | grep -q '"vault_shares":"0"' || { log "FAIL: post-settle vault_shares was not 0"; exit 1; }

PAYOUT=$(( TENANT_AFTER - TENANT_BEFORE ))
log "tenant balance moved by $PAYOUT stroops on withdraw (deposited $DEPOSIT_AMOUNT) — DeFindex's real payout, not this script's arithmetic"
[ "$PAYOUT" -gt 0 ] || { log "FAIL: settle_undisputed did not pay the tenant anything"; exit 1; }

log "PASS: lease $LEASE_ID moved Created -> Funded -> Active -> Resolved on $NETWORK via the REAL DeFindex vault ($DEFINDEX_VAULT), contract $CONTRACT_ID."
