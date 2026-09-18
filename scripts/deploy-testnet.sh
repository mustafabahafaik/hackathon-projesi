#!/usr/bin/env bash
# Builds contracts/escrow, funds a testnet deployer account, and deploys the
# contract to Stellar Testnet. Safe to re-run: it reuses an existing
# deployer identity and any existing testnet funding instead of failing on
# them.
#
# Usage:
#   scripts/deploy-testnet.sh [alias]
#
# `alias` (optional) names the deployed contract in `stellar contract alias
# ls` and defaults to "depozito-escrow". Prints the contract ID on stdout as
# its last line; every other message goes to stderr, so
# `CONTRACT_ID=$(scripts/deploy-testnet.sh)` captures just the ID.
#
# Requires: rustup (with the wasm32v1-none target), cargo, the `stellar` CLI.
# https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup
#
# Known gotcha (Windows, GNU-ABI host toolchain): `x86_64-w64-mingw32-gcc`
# / `ld.exe` cannot resolve paths containing non-ASCII characters (e.g. a
# repo under a "Masaüstü" — Turkish for "Desktop" — folder) and fail with
# confusing "No such file or directory" errors on files that plainly exist.
# This is a toolchain limitation, not a bug in the crate. Worked around
# below by building from a plain-ASCII mirror of contracts/escrow whenever
# the repo's own path isn't plain ASCII; on Linux/macOS, or on Windows with
# an ASCII repo path, this mirroring step is skipped and the build runs
# in-place.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATE_DIR="$REPO_ROOT/contracts/escrow"
ALIAS="${1:-depozito-escrow}"
DEPLOYER_IDENTITY="deployer"
NETWORK="testnet"
WASM_TARGET="wasm32v1-none"

log() { echo "[deploy-testnet] $*" >&2; }

command -v cargo >/dev/null || { log "cargo not found — install Rust via https://rustup.rs"; exit 1; }
command -v stellar >/dev/null || { log "stellar CLI not found — see https://developers.stellar.org/docs/tools/cli/install-cli"; exit 1; }

if ! rustup target list --installed | grep -q "^${WASM_TARGET}\$"; then
  log "adding rustup target ${WASM_TARGET}"
  rustup target add "$WASM_TARGET"
fi

BUILD_DIR="$CRATE_DIR"
if LC_ALL=C grep -q '[^ -~]' <<< "$REPO_ROOT"; then
  BUILD_DIR="${TMPDIR:-/tmp}/depozito-escrow-build"
  log "repo path has non-ASCII characters — building from a clean mirror at $BUILD_DIR instead"
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  cp "$CRATE_DIR/Cargo.toml" "$BUILD_DIR/"
  [ -f "$CRATE_DIR/Cargo.lock" ] && cp "$CRATE_DIR/Cargo.lock" "$BUILD_DIR/"
  cp -r "$CRATE_DIR/src" "$BUILD_DIR/"
fi

log "building contracts/escrow for ${WASM_TARGET} (release)"
( cd "$BUILD_DIR" && cargo build --target "$WASM_TARGET" --release )

WASM_PATH="$BUILD_DIR/target/$WASM_TARGET/release/escrow.wasm"
[ -f "$WASM_PATH" ] || { log "expected wasm not found at $WASM_PATH"; exit 1; }

log "optimizing wasm"
# `stellar contract optimize` is deprecated (CLI 28.x points at `contract
# build --optimize`, which builds from source rather than optimizing an
# existing .wasm) but is still the correct command for optimizing an
# already-built artifact like this one.
#
# Redirected to stderr: unlike every other `stellar` subcommand this script
# calls, `optimize` writes its "Reading: ... (N bytes)" progress line to
# stdout, not stderr — left alone, that breaks this script's own documented
# contract (stdout = just the contract ID, safe for `CONTRACT_ID=$(...)`).
stellar contract optimize --wasm "$WASM_PATH" >&2
OPTIMIZED_WASM="${WASM_PATH%.wasm}.optimized.wasm"
[ -f "$OPTIMIZED_WASM" ] || OPTIMIZED_WASM="$WASM_PATH"

if stellar keys address "$DEPLOYER_IDENTITY" >/dev/null 2>&1; then
  log "reusing existing '$DEPLOYER_IDENTITY' identity: $(stellar keys address "$DEPLOYER_IDENTITY")"
else
  log "generating '$DEPLOYER_IDENTITY' identity and funding it from the testnet faucet"
  stellar keys generate --network "$NETWORK" --fund "$DEPLOYER_IDENTITY"
fi

# Friendbot funds a brand-new account only; re-funding an already-funded one
# fails, so don't treat that failure as fatal on a re-run.
stellar keys fund "$DEPLOYER_IDENTITY" --network "$NETWORK" 2>/dev/null \
  || log "'$DEPLOYER_IDENTITY' already funded (or funding failed harmlessly) — continuing"

log "deploying to $NETWORK as alias '$ALIAS'"
DEPLOY_OUTPUT=$(stellar contract deploy \
  --wasm "$OPTIMIZED_WASM" \
  --source "$DEPLOYER_IDENTITY" \
  --network "$NETWORK" \
  --alias "$ALIAS" 2>&1)
echo "$DEPLOY_OUTPUT" >&2

# The contract ID is a bare 56-char C... line in the CLI's output; grep for
# the pattern instead of assuming it's the exact last line of a particular
# stream, since the CLI's own status/progress lines go to both stdout and
# stderr depending on version.
CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE '^C[A-Z0-9]{55}$' | tail -1)
[ -n "$CONTRACT_ID" ] || { log "could not find a contract ID in the deploy output above"; exit 1; }

log "deployed: $CONTRACT_ID"
log "record this in .env.example (as an example) and docs/submission.md (as the real value)"
echo "$CONTRACT_ID"
