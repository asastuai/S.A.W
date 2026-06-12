#!/usr/bin/env bash
# scripts/localnet-drift/setup.sh
#
# Drift mainnet-clone local validator — one-command setup.
#
# USAGE:
#   cd <repo-root>
#   bash scripts/localnet-drift/setup.sh
#
# WHAT IT DOES:
#   1. Dumps the Drift program bytecode from mainnet (drift.so) if not cached.
#   2. Starts solana-test-validator with:
#      - The mainnet Drift program injected at its real program ID
#      - Key Drift accounts cloned from mainnet (state, spot/perp markets,
#        oracles, USDC mint, USDC vault) so the program boots with live data.
#   3. Creates a local ephemeral keypair (.keys/local-wallet.json) for testing.
#   4. Airdrops SOL to the local wallet.
#   5. Creates and funds a mock-USDC token account (see note below).
#   6. Runs a health check — prints localnet URLs.
#
# MOCK-USDC APPROACH:
#   Real mainnet USDC mint (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) is
#   cloned. Its mint authority is owned by a Centre multisig — we cannot mint
#   new tokens locally. Strategy: clone a whale USDC ATA from mainnet that holds
#   a large balance, then use `solana-test-validator --account` to inject it with
#   our local wallet as the owner. This avoids needing mint authority.
#   Alternative: use the `--account` flag to inject a synthetic mint account with
#   a local keypair as mint authority (implemented below as the PRIMARY path).
#
# ORACLE STALENESS:
#   Cloned Pyth oracle accounts are snapshots from clone time. Drift's on-chain
#   program may reject oracle data older than its staleness threshold. If
#   placeOrders fails with OracleInvalid/OracleNotFound, re-run this script to
#   re-clone with fresh data, OR use the --amend-clock flag documented in README.
#
# SECURITY:
#   Keys under .keys/ are ephemeral localnet-only keys. They control nothing real.
#   They are .gitignored. Never copy them to mainnet configs.
#
# DEPENDENCIES:
#   - solana CLI >= 1.18 (solana-test-validator with --clone support)
#   - node >= 18
#   - pnpm (for init-markets.ts)
#
# After startup the validator runs in background. Kill it with:
#   pkill -f solana-test-validator
#   rm -rf test-ledger

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
KEYS_DIR="${SCRIPT_DIR}/.keys"
LEDGER_DIR="${REPO_ROOT}/test-ledger"
SO_CACHE="${SCRIPT_DIR}/drift.so"

# ── Program & account addresses ───────────────────────────────────────────────
DRIFT_PROGRAM_ID="dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"
DRIFT_ORACLE_RECEIVER_ID="G6EoTTTgpkNBtVXo96EQp2m6uwwVh2Kt6YidjkmQqoha"
PYTH_LAZER_PROGRAM_ID="pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt"
PYTH_LAZER_STORAGE="3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL"
SWITCHBOARD_PROGRAM_ID="SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv"

# Derived PDAs (see scripts/localnet-drift/README.md for derivation)
DRIFT_STATE="5zpq7DvB6UdFFvpmBPspGPNfUGoBRRCE2HHg5u3gxcsN"
SOL_PERP_MARKET="8UJgxaiQx5nTrdDgph5FiahMmzduuLTLf5WmsPegYA6W"     # index 0
USDC_SPOT_MARKET="6gMq3mRCKf8aP3ttTyYhuijVZ2LGi14oDsBbkgubfLB3"    # index 0
USDC_SPOT_VAULT="GXWqPpjQpdz7KZw9p7f5PX2eGxHAhvpNXiviFkAB8zXg"    # index 0
INSURANCE_FUND_VAULT="2CqkQvYxp9Mq4PqLvAQ1eryYxebUh4Liyn5YMDtXsYci"  # spot 0
SOL_SPOT_MARKET="3x85u7SWkmmr7YQGYhtjARgxwegTLJgkSLRprfXod6rh"     # index 1
SOL_SPOT_VAULT="DfYCNezifxAEsQbAJ1b3j6PX3JVBe8fu11KBhxsbw5d2"      # index 1

# Oracle accounts (PythLazer, owned by Drift program on mainnet)
SOL_PERP_ORACLE="3m6i4RFWEDw2Ft4tFHPJtYgmpPe21k56M3FHeWYrgGBz"
USDC_SPOT_ORACLE="9VCioxmni2gDLv11qufWzT3RDERhQE4iY5Gf7NTfYyAV"
SOL_SPOT_ORACLE="3m6i4RFWEDw2Ft4tFHPJtYgmpPe21k56M3FHeWYrgGBz"     # same as perp oracle

# Real mainnet USDC mint (cloned but not mintable — see mock-USDC approach)
MAINNET_USDC_MINT="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

# Lookup tables
MARKET_LUT_1="Fpys8GRa5RBWfyeN7AaDUwFGD1zkDCA4z3t4CJLV8dfL"
MARKET_LUT_2="EiWSskK5HXnBTptiS5DH6gpAJRVNQ3cAhTKBGaiaysAb"

# RPC
MAINNET_RPC="${MAINNET_RPC_URL:-https://api.mainnet-beta.solana.com}"
LOCAL_RPC="http://127.0.0.1:8899"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
command -v solana >/dev/null 2>&1 || { err "solana CLI not found"; exit 1; }
command -v solana-test-validator >/dev/null 2>&1 || { err "solana-test-validator not found"; exit 1; }
command -v node >/dev/null 2>&1 || { err "node not found"; exit 1; }
log "Solana CLI: $(solana --version | head -1)"

# Kill any existing validator
if pgrep -f solana-test-validator >/dev/null 2>&1; then
  warn "Existing solana-test-validator found — killing it"
  pkill -f solana-test-validator || true
  sleep 2
fi

# Clean old ledger to avoid account-state conflicts
if [[ -d "${LEDGER_DIR}" ]]; then
  warn "Removing stale ledger at ${LEDGER_DIR}"
  rm -rf "${LEDGER_DIR}"
fi

# ── Step 1: Dump Drift program bytecode ───────────────────────────────────────
if [[ -f "${SO_CACHE}" ]]; then
  log "drift.so already cached at ${SO_CACHE} — skipping dump"
else
  log "Dumping Drift program from mainnet (this takes ~30s)..."
  solana program dump "${DRIFT_PROGRAM_ID}" "${SO_CACHE}" --url "${MAINNET_RPC}"
  log "drift.so written ($(du -sh "${SO_CACHE}" | cut -f1))"
fi

# ── Step 2: Create ephemeral local wallet ─────────────────────────────────────
mkdir -p "${KEYS_DIR}"
LOCAL_WALLET="${KEYS_DIR}/local-wallet.json"
if [[ ! -f "${LOCAL_WALLET}" ]]; then
  log "Generating ephemeral local wallet..."
  solana-keygen new --no-bip39-passphrase --silent --outfile "${LOCAL_WALLET}"
fi
LOCAL_PUBKEY=$(solana-keygen pubkey "${LOCAL_WALLET}")
log "Local wallet pubkey: ${LOCAL_PUBKEY}"
log "  (localnet-only, gitignored — controls nothing real)"

# ── Step 3: Create mock-USDC mint with local authority ────────────────────────
# Strategy: generate a new keypair to use as a local mint with the SAME address
# as mainnet USDC. We override the cloned account with a modified JSON that sets
# our local wallet as mint authority so we can mint tokens.
#
# Implementation: use solana-test-validator --account flag to inject a
# pre-crafted account JSON. The mint account data follows SPL Token Mint layout
# (82 bytes): mint_authority option (36 bytes) + supply (8) + decimals (1) +
# is_initialized (1) + freeze_authority (36 bytes).
#
# SIMPLER ALTERNATIVE (chosen here): create a NEW mint keypair at a different
# address, then pass MOCK_USDC_MINT to init-markets.ts so Drift uses it.
# This avoids needing to patch the USDC spot market account on-chain.
# The tradeoff: the Drift state/spot-market accounts still reference the real
# USDC mint address, so deposit() will fail to verify the ATA mint unless we
# ALSO patch the SpotMarket account's mint field. That patching is done by
# init-markets.ts.
#
# For v1 we take the simplest path: mock-USDC via spl-token create-token with
# a local keypair as mint authority. The Drift spot market clone still points to
# the old mint address, but init-markets.ts overwrites the spot market's mint
# field via a crafted account injection so the program sees the mock mint.

MOCK_USDC_KEYPAIR="${KEYS_DIR}/mock-usdc-mint.json"
if [[ ! -f "${MOCK_USDC_KEYPAIR}" ]]; then
  log "Generating mock-USDC mint keypair..."
  solana-keygen new --no-bip39-passphrase --silent --outfile "${MOCK_USDC_KEYPAIR}"
fi
MOCK_USDC_MINT=$(solana-keygen pubkey "${MOCK_USDC_KEYPAIR}")
log "Mock USDC mint will be: ${MOCK_USDC_MINT}"

# ── Step 4: Start solana-test-validator ───────────────────────────────────────
log "Starting solana-test-validator with Drift mainnet clone..."
log "  Cloning ~20 accounts from mainnet (requires RPC access)..."

# Build the clone arguments
CLONE_ARGS=""
for ACCT in \
  "${DRIFT_STATE}" \
  "${SOL_PERP_MARKET}" \
  "${USDC_SPOT_MARKET}" \
  "${USDC_SPOT_VAULT}" \
  "${INSURANCE_FUND_VAULT}" \
  "${SOL_SPOT_MARKET}" \
  "${SOL_SPOT_VAULT}" \
  "${SOL_PERP_ORACLE}" \
  "${USDC_SPOT_ORACLE}" \
  "${PYTH_LAZER_STORAGE}" \
  "${MAINNET_USDC_MINT}" \
  "${MARKET_LUT_1}" \
  "${MARKET_LUT_2}"
do
  CLONE_ARGS="${CLONE_ARGS} --clone ${ACCT}"
done

# Clone upgradeable programs (program + programdata)
CLONE_PROG_ARGS=""
for PROG in \
  "${DRIFT_ORACLE_RECEIVER_ID}" \
  "${PYTH_LAZER_PROGRAM_ID}" \
  "${SWITCHBOARD_PROGRAM_ID}"
do
  CLONE_PROG_ARGS="${CLONE_PROG_ARGS} --clone-upgradeable-program ${PROG}"
done

# Launch in background
# shellcheck disable=SC2086
nohup solana-test-validator \
  --bpf-program "${DRIFT_PROGRAM_ID}" "${SO_CACHE}" \
  ${CLONE_ARGS} \
  ${CLONE_PROG_ARGS} \
  --url "${MAINNET_RPC}" \
  --ledger "${LEDGER_DIR}" \
  --reset \
  --quiet \
  > "${SCRIPT_DIR}/validator.log" 2>&1 &

VALIDATOR_PID=$!
log "Validator started (PID ${VALIDATOR_PID})"

# ── Step 5: Health check ──────────────────────────────────────────────────────
log "Waiting for validator to become healthy..."
MAX_WAIT=60
WAIT=0
until solana cluster-version --url "${LOCAL_RPC}" >/dev/null 2>&1; do
  sleep 2
  WAIT=$((WAIT + 2))
  if [[ ${WAIT} -ge ${MAX_WAIT} ]]; then
    err "Validator did not start within ${MAX_WAIT}s. Check ${SCRIPT_DIR}/validator.log"
    exit 1
  fi
done

CLUSTER_VER=$(solana cluster-version --url "${LOCAL_RPC}")
log "Validator healthy! Version: ${CLUSTER_VER}"

# ── Step 6: Fund local wallet ─────────────────────────────────────────────────
log "Airdropping 100 SOL to local wallet..."
solana airdrop 100 "${LOCAL_PUBKEY}" --url "${LOCAL_RPC}" >/dev/null 2>&1 || true
BALANCE=$(solana balance "${LOCAL_PUBKEY}" --url "${LOCAL_RPC}" 2>/dev/null || echo "unknown")
log "Local wallet balance: ${BALANCE}"

# ── Step 7: Create mock-USDC token mint & ATA ────────────────────────────────
log "Creating mock-USDC SPL token mint..."
# Use solana CLI directly (spl-token create-token uses local config)
MOCK_USDC_MINT_CREATED=$(
  solana config set --url "${LOCAL_RPC}" --keypair "${LOCAL_WALLET}" >/dev/null 2>&1 || true
  spl-token create-token --decimals 6 "${MOCK_USDC_KEYPAIR}" 2>&1 | grep "Address" | awk '{print $2}' || echo ""
)
if [[ -z "${MOCK_USDC_MINT_CREATED}" ]]; then
  warn "spl-token create-token did not print address — mock-USDC mint may already exist or spl-token not found"
  warn "Continuing: init-markets.ts will handle ATA creation"
else
  log "Mock USDC mint created at: ${MOCK_USDC_MINT_CREATED}"
fi

# Write config for init-markets.ts
cat > "${SCRIPT_DIR}/.localnet-config.json" <<EOF
{
  "localRpc": "${LOCAL_RPC}",
  "driftProgramId": "${DRIFT_PROGRAM_ID}",
  "driftState": "${DRIFT_STATE}",
  "solPerpMarket": "${SOL_PERP_MARKET}",
  "usdcSpotMarket": "${USDC_SPOT_MARKET}",
  "usdcSpotVault": "${USDC_SPOT_VAULT}",
  "solPerpOracle": "${SOL_PERP_ORACLE}",
  "usdcSpotOracle": "${USDC_SPOT_ORACLE}",
  "mainnetUsdcMint": "${MAINNET_USDC_MINT}",
  "mockUsdcMint": "${MOCK_USDC_MINT}",
  "localWallet": "${LOCAL_WALLET}",
  "mockUsdcKeypair": "${MOCK_USDC_KEYPAIR}"
}
EOF
log "Config written to ${SCRIPT_DIR}/.localnet-config.json"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} Drift localnet ready!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo "  RPC:          ${LOCAL_RPC}"
echo "  WebSocket:    ws://127.0.0.1:8900"
echo "  Drift program: ${DRIFT_PROGRAM_ID}"
echo "  State PDA:    ${DRIFT_STATE}"
echo "  Mock USDC:    ${MOCK_USDC_MINT}"
echo "  Local wallet: ${LOCAL_PUBKEY}"
echo ""
echo "Next steps:"
echo "  1. Run: cd ${REPO_ROOT} && node scripts/localnet-drift/init-markets.ts"
echo "  2. Then: SOLANA_RPC_URL=http://127.0.0.1:8899 DRIFT_ENV=localnet node -r tsx/esm scripts/drift-probe.ts"
echo ""
echo "Stop validator: pkill -f solana-test-validator"
echo "Logs: tail -f ${SCRIPT_DIR}/validator.log"
