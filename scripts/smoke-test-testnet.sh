#!/usr/bin/env bash
# Proves a deployed escrow contract actually works on Stellar Testnet: it
# initializes it, opens a real lease (create_lease), funds it with a real
# token transfer (deposit), and reads the lease back (get_lease) to confirm
# its on-chain state genuinely moved Created -> Funded. Nothing here is
# simulated — every step is a signed transaction against testnet.
#
# Usage:
#   scripts/smoke-test-testnet.sh <CONTRACT_ID>
#
# Uses the native XLM Stellar Asset Contract as a stand-in for
# USDC_TOKEN_ADDRESS — real testnet USDC (or a purpose-issued test asset)
# needs its own issuer/trustline setup that's out of scope for a one-shot
# smoke test; this proves the same token.transfer + storage code path with
# an asset the deployer account already holds. Point --usdc_token at the
# real address once one exists.
#
# Safe to re-run against the SAME contract ID only if it hasn't been
# initialized yet — `initialize` is one-time by design (contracts/escrow/
# src/config.rs). Deploy a fresh contract (scripts/deploy-testnet.sh) to
# smoke-test again from a clean state.

set -euo pipefail

CONTRACT_ID="${1:?usage: scripts/smoke-test-testnet.sh <CONTRACT_ID>}"
NETWORK="testnet"

log() { echo "[smoke-test] $*" >&2; }

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

for id in deployer owner tenant arbitrator defindex_vault soroswap_router; do
  ensure_identity "$id"
done

NATIVE_TOKEN=$(stellar contract id asset --asset native --network "$NETWORK")
log "using native XLM SAC as usdc_token stand-in: $NATIVE_TOKEN"

log "initialize()"
stellar contract invoke --id "$CONTRACT_ID" --source deployer --network "$NETWORK" -- initialize \
  --admin "$(stellar keys address deployer)" \
  --defindex_vault "$(stellar keys address defindex_vault)" \
  --soroswap_router "$(stellar keys address soroswap_router)" \
  --usdc_token "$NATIVE_TOKEN"

TERM=$(( $(date +%s) + 31536000 ))
log "create_lease() — term=$TERM (1 year out)"
LEASE_ID=$(stellar contract invoke --id "$CONTRACT_ID" --source owner --network "$NETWORK" -- create_lease \
  --owner "$(stellar keys address owner)" \
  --tenant "$(stellar keys address tenant)" \
  --arbitrator "$(stellar keys address arbitrator)" \
  --amount 10000000 \
  --term "$TERM" | tail -1)
log "lease_id=$LEASE_ID"

log "get_lease() before deposit — expect status 0 (Created), vault_shares 0"
BEFORE=$(stellar contract invoke --id "$CONTRACT_ID" --source deployer --network "$NETWORK" --send=no -- get_lease --lease_id "$LEASE_ID")
echo "$BEFORE" >&2

log "deposit()"
stellar contract invoke --id "$CONTRACT_ID" --source tenant --network "$NETWORK" -- deposit --lease_id "$LEASE_ID"

log "get_lease() after deposit — expect status 1 (Funded), vault_shares 10000000"
AFTER=$(stellar contract invoke --id "$CONTRACT_ID" --source deployer --network "$NETWORK" --send=no -- get_lease --lease_id "$LEASE_ID")
echo "$AFTER" >&2

echo "$BEFORE" | grep -q '"status":0' || { log "FAIL: pre-deposit status was not 0 (Created)"; exit 1; }
echo "$AFTER" | grep -q '"status":1' || { log "FAIL: post-deposit status was not 1 (Funded)"; exit 1; }
echo "$AFTER" | grep -q '"vault_shares":"10000000"' || { log "FAIL: post-deposit vault_shares was not 10000000"; exit 1; }

log "PASS: lease $LEASE_ID moved Created -> Funded on $NETWORK with a real token transfer."
