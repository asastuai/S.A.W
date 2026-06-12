#!/usr/bin/env bash
# scripts/localnet-adrena/setup.sh
#
# Adrena mainnet-clone local validator — one-command setup for Task 1d.
#
# USAGE:
#   cd <repo-root>
#   bash scripts/localnet-adrena/setup.sh
#
# WHAT IT DOES:
#   1. Uses cached adrena.so (4.2 MB bytecode dumped from mainnet-beta).
#      Re-dump only if missing: solana program dump 13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet
#      scripts/localnet-adrena/adrena.so --url mainnet-beta
#   2. Starts solana-test-validator with:
#      - Real Adrena program injected at mainnet program ID
#      - Key Adrena accounts cloned from mainnet (pool PDA, custodies, oracles,
#        cortex, mints, lookup table)
#   3. Creates an ephemeral local keypair (.keys/local-wallet.json — GITIGNORED).
#   4. Airdrops 100 SOL to the local wallet.
#   5. Creates a mock-USDC mint with local mint authority (GITIGNORED keypair).
#   6. Mints 10,000 USDC to a local ATA for the test wallet.
#   7. Runs a health check — prints localnet URLs and ready status.
#
# MOCK COLLATERAL FLOW:
#   The real USDC mint (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) is cloned
#   but its Centre multisig mint authority is not controllable locally. Instead:
#   - setup.sh creates a FRESH SPL Token mint (mock-usdc-mint.json keypair as authority)
#   - probe-localnet.ts uses this MOCK_USDC_MINT as collateral
#   - The Adrena program on localnet references the REAL USDC mint in its custody
#     account — the mock mint is only used for funding the local wallet.
#   - The actual open instruction must use the real cloned USDC custody. So in the
#     probe we fund the local wallet's ATA for the REAL USDC mint by directly
#     patching the cloned USDC custody token account to inject balance.
#   - Implementation: create a local ATA for the real USDC mint, then use
#     spl-token mint-to (won't work, authority mismatch) OR inject via account JSON.
#   - CHOSEN PATH (v1): use --account flag to inject a pre-crafted ATA JSON with
#     the local wallet as owner AND the real USDC mint — this is the only path that
#     works with the cloned Adrena pool state.
#   See README.md for the full rationale.
#
# ORACLE STALENESS:
#   Cloned Pyth oracle accounts are frozen snapshots. If Adrena's program rejects
#   stale oracles, try: solana-test-validator with --warp-slot, or re-run setup.sh
#   (re-clones fresh data). See README.md for investigation findings.
#
# SECURITY:
#   All keypairs in .keys/ are ephemeral localnet-only. They are .gitignored.
#   NEVER use these keypairs on mainnet.
#
# DEPENDENCIES:
#   - solana CLI >= 1.18 (solana-test-validator with --clone support)
#   - spl-token CLI (from solana-cli suite)
#   - node >= 18, pnpm
#
# Stop the validator:
#   pkill -f solana-test-validator
#   rm -rf test-ledger

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
KEYS_DIR="${SCRIPT_DIR}/.keys"
LEDGER_DIR="${REPO_ROOT}/test-ledger"
SO_CACHE="${SCRIPT_DIR}/adrena.so"

# ── Adrena Protocol Addresses ─────────────────────────────────────────────────
ADRENA_PROGRAM_ID="13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet"

# Pool PDA = PDA(["pool", "main-pool"], ADRENA_PROGRAM_ID)
POOL_PDA="4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34"

# Cortex (protocol state) = PDA(["cortex"], ADRENA_PROGRAM_ID)
CORTEX_PDA="Dhz8Ta79hgyUbaRcu7qHMnqMfY47kQHfHt2s42D9dC4e"

# Transfer authority = PDA(["transfer_authority"], ADRENA_PROGRAM_ID)
TRANSFER_AUTHORITY="4o3qAErcapJ6gRLh1m1x4saoLLieWDu7Rx3wpwLc7Zk9"

# Token mints (mainnet)
USDC_MINT="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
JITOSOL_MINT="J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"

# Custody PDAs = PDA(["custody", poolPDA, mintBytes], ADRENA_PROGRAM_ID)
USDC_CUSTODY="Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk"
JITOSOL_CUSTODY="GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71"

# Custody token accounts = PDA(["custody_token_account", poolPDA, mintBytes], ADRENA_PROGRAM_ID)
USDC_CUSTODY_TOKEN_ACCOUNT="3VqjUCorytnU29iPTavgHE69iAh617NgWMEtBWtMrkZv"
JITOSOL_CUSTODY_TOKEN_ACCOUNT="C7PiLKkDHq4q3w7n8BehcyCVYVAfH1jGEKLS3xRVxrab"

# BONK and WBTC — other custodies in the pool (loadCustodies fetches all 4)
BONK_MINT="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
WBTC_MINT="3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh"
BONK_CUSTODY="8aJuzsgjxBnvRhDcfQBD7z4CUj7QoPEpaNwVd7KqsSk5"
WBTC_CUSTODY="GFu3qS22mo6bAjg4Lr5R7L8pPgHq6GvbjJPKEHkbbs2c"
BONK_CUSTODY_TOKEN_ACCOUNT="HRcssrQHLHfyvotvMGPcudPTZFFPM82Rcb4fHB4t1Ptu"
WBTC_CUSTODY_TOKEN_ACCOUNT="9SMoFgK9XcinqMFws4fqhGeu8Kpa8msRUfHJ6Bv1ax5d"

# Oracle PDA = PDA(["oracle"], ADRENA_PROGRAM_ID) — Adrena's price aggregator
ORACLE_PDA="GEm9TZP7BL8rTz1JDy6X74PL595zr1putA9BXC8ehDmU"

# Pyth BONK and WBTC oracles (for completeness)
PYTH_BONK_ORACLE="DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX"
PYTH_WBTC_ORACLE="9gNX5vguzarZZPjTnE1hWze3s6UsZ7dsU3UnAmKPnMHG"

# Pyth Price Feed V2 oracle addresses (from adrena-sdk-ts constants.ts)
PYTH_SOL_ORACLE="7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
PYTH_JITOSOL_ORACLE="AxaxyeDT8JnWERSaTKvFXvPKkEdxnamKSqpWbsSjYg1g"
PYTH_USDC_ORACLE="Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"

# Adrena lookup table
ADRENA_LOOKUP_TABLE="4PZaPEXPzMLuBSKgZUvpzLi3zGXJ1pSz6NTKrtoXUd4q"

# DEV_PDA — referrer profile used by SDK for profile initialization
# Must be cloned so the InitUserProfile instruction can reference it
DEV_PDA="F5MG8jgytQT6pS5CgtRGRmNRCufkxR7CkGMQiPt6Z6xb"

# RPC
MAINNET_RPC="${MAINNET_RPC_URL:-https://api.mainnet-beta.solana.com}"
LOCAL_RPC="http://127.0.0.1:8899"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
command -v solana >/dev/null 2>&1        || { err "solana CLI not found"; exit 1; }
command -v solana-test-validator >/dev/null 2>&1 || { err "solana-test-validator not found"; exit 1; }
command -v node >/dev/null 2>&1          || { err "node not found"; exit 1; }
command -v spl-token >/dev/null 2>&1     || { err "spl-token not found (install solana-cli suite)"; exit 1; }
log "Solana CLI: $(solana --version | head -1)"

# Kill any existing validator
if pgrep -f solana-test-validator >/dev/null 2>&1; then
  warn "Existing solana-test-validator found — killing it"
  pkill -f solana-test-validator || true
  sleep 2
fi

# Clean old ledger
if [[ -d "${LEDGER_DIR}" ]]; then
  warn "Removing stale ledger at ${LEDGER_DIR}"
  rm -rf "${LEDGER_DIR}"
fi

# ── Step 1: Verify adrena.so ──────────────────────────────────────────────────
if [[ -f "${SO_CACHE}" ]]; then
  log "adrena.so cached at ${SO_CACHE} ($(du -sh "${SO_CACHE}" | cut -f1))"
else
  log "Dumping Adrena program from mainnet (takes ~30s)..."
  solana program dump "${ADRENA_PROGRAM_ID}" "${SO_CACHE}" --url "${MAINNET_RPC}"
  log "adrena.so written ($(du -sh "${SO_CACHE}" | cut -f1))"
fi

# ── Step 1b: Patch Oracle PDA timestamps ─────────────────────────────────────
# The cloned Oracle PDA has timestamps ~60 days old. The Adrena program has a
# staleness check and rejects prices with old timestamps (error 6088: MissingOraclePrice).
# We fetch the oracle data from mainnet, update all price timestamps and the
# account-level updatedAt to the current wall-clock time, then inject the patched
# account via --account instead of --clone. Prices stay at their cloned values;
# only the timestamps are refreshed so the staleness check passes.
ORACLE_PATCHED_JSON="${SCRIPT_DIR}/oracle-patched.json"
log "Patching Oracle PDA timestamps (fetching from mainnet)..."
ORACLE_DATA=$(curl -s -X POST "${MAINNET_RPC}" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"${ORACLE_PDA}\",{\"encoding\":\"base64\"}]}" \
  2>/dev/null)
ORACLE_B64=$(echo "${ORACLE_DATA}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['value']['data'][0])" 2>/dev/null || echo "")
ORACLE_LAMPORTS=$(echo "${ORACLE_DATA}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['value']['lamports'])" 2>/dev/null || echo "23329920")
ORACLE_OWNER=$(echo "${ORACLE_DATA}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['value']['owner'])" 2>/dev/null || echo "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet")

if [[ -z "${ORACLE_B64}" ]]; then
  warn "Could not fetch Oracle PDA from mainnet — will clone stale (may cause MissingOraclePrice)"
  ORACLE_PATCHED_JSON=""
else
  ORACLE_B64="${ORACLE_B64}" \
  ORACLE_LAMPORTS="${ORACLE_LAMPORTS}" \
  ORACLE_OWNER="${ORACLE_OWNER}" \
  ORACLE_PUBKEY="${ORACLE_PDA}" \
  ORACLE_PATCHED_JSON="${ORACLE_PATCHED_JSON}" \
  node - << 'PATCH_ORACLE_JS'
const fs = require("fs");
const base64Data = process.env.ORACLE_B64;
const lamports = parseInt(process.env.ORACLE_LAMPORTS || "23329920");
const owner = process.env.ORACLE_OWNER || "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet";
const oraclePubkey = process.env.ORACLE_PUBKEY;
const outPath = process.env.ORACLE_PATCHED_JSON;

const bytes = Buffer.from(base64Data, "base64");
const now = BigInt(Math.floor(Date.now() / 1000));

// Update Oracle.updatedAt (offset 16, i64 LE)
bytes.writeBigInt64LE(now, 16);

// Update each OraclePrice.timestamp (all 50 slots)
const headerSize = 24;
const priceSize = 64;
let updated = 0;
for (let i = 0; i < 50; i++) {
  const offset = headerSize + i * priceSize;
  if (offset + priceSize > bytes.length) break;
  const price = bytes.readBigUInt64LE(offset);
  const nameLen = bytes[offset + 63];
  if (price > 0n || nameLen > 0) {
    bytes.writeBigInt64LE(now, offset + 16);
    updated++;
  }
}

const patchedAccount = {
  pubkey: oraclePubkey,
  account: {
    lamports,
    data: [bytes.toString("base64"), "base64"],
    owner,
    executable: false,
    rentEpoch: 0
  }
};
fs.writeFileSync(outPath, JSON.stringify(patchedAccount, null, 2));
console.log("Oracle patched: " + updated + " price slots updated to ts=" + now.toString());
PATCH_ORACLE_JS
  PATCH_EXIT=$?
  if [[ ${PATCH_EXIT} -ne 0 ]]; then
    warn "Oracle patch script failed — will clone stale oracle"
    ORACLE_PATCHED_JSON=""
  fi
fi
log "Oracle PDA patched and written to ${ORACLE_PATCHED_JSON}"

# ── Step 2: Create ephemeral local wallet ─────────────────────────────────────
mkdir -p "${KEYS_DIR}"
LOCAL_WALLET="${KEYS_DIR}/local-wallet.json"
if [[ ! -f "${LOCAL_WALLET}" ]]; then
  log "Generating ephemeral local wallet..."
  solana-keygen new --no-bip39-passphrase --silent --outfile "${LOCAL_WALLET}"
fi
LOCAL_PUBKEY=$(solana-keygen pubkey "${LOCAL_WALLET}")
log "Local wallet: ${LOCAL_PUBKEY} (localnet only, gitignored)"

# ── Step 3: Start solana-test-validator ───────────────────────────────────────
log "Starting solana-test-validator with Adrena mainnet clone..."
log "  Cloning accounts from mainnet (requires RPC access to ${MAINNET_RPC})..."

# Accounts to clone — all relevant Adrena protocol state.
# NOTE: ORACLE_PDA is intentionally NOT in this list — it's injected via
# --account with patched timestamps (see Step 1b above). Cloning the oracle
# would give stale timestamps that cause MissingOraclePrice (error 6088).
CLONE_ARGS=""
for ACCT in \
  "${POOL_PDA}" \
  "${CORTEX_PDA}" \
  "${TRANSFER_AUTHORITY}" \
  "${USDC_CUSTODY}" \
  "${BONK_CUSTODY}" \
  "${JITOSOL_CUSTODY}" \
  "${WBTC_CUSTODY}" \
  "${USDC_CUSTODY_TOKEN_ACCOUNT}" \
  "${BONK_CUSTODY_TOKEN_ACCOUNT}" \
  "${JITOSOL_CUSTODY_TOKEN_ACCOUNT}" \
  "${WBTC_CUSTODY_TOKEN_ACCOUNT}" \
  "${USDC_MINT}" \
  "${JITOSOL_MINT}" \
  "${BONK_MINT}" \
  "${WBTC_MINT}" \
  "${PYTH_SOL_ORACLE}" \
  "${PYTH_JITOSOL_ORACLE}" \
  "${PYTH_USDC_ORACLE}" \
  "${PYTH_BONK_ORACLE}" \
  "${PYTH_WBTC_ORACLE}" \
  "${ADRENA_LOOKUP_TABLE}" \
  "${DEV_PDA}"
do
  CLONE_ARGS="${CLONE_ARGS} --clone ${ACCT}"
done

# Pre-funded USDC ATA for the test wallet
# Contains 10,000 USDC (real mint EPjFWdd5...) with local wallet as owner.
# This is the only way to fund a test wallet with real USDC on localnet since
# the real USDC mint has Centre multisig authority (not locally controllable).
USDC_ATA_JSON="${SCRIPT_DIR}/test-wallet-usdc-ata.json"
USDC_ATA_ADDR="86ETnxGX1LjtRxwwjvpW94Aty9ZLpTpVzMFW7jD8Ut4E"

# Inject account args: patched oracle + pre-funded USDC ATA
INJECT_ARGS=""
if [[ -n "${ORACLE_PATCHED_JSON}" && -f "${ORACLE_PATCHED_JSON}" ]]; then
  log "Injecting patched Oracle PDA with fresh timestamps"
  INJECT_ARGS="${INJECT_ARGS} --account ${ORACLE_PDA} ${ORACLE_PATCHED_JSON}"
else
  warn "Patched oracle JSON not found — falling back to --clone (may get MissingOraclePrice)"
  CLONE_ARGS="${CLONE_ARGS} --clone ${ORACLE_PDA}"
fi

if [[ -f "${USDC_ATA_JSON}" ]]; then
  log "Found pre-funded USDC ATA: ${USDC_ATA_ADDR}"
  INJECT_ARGS="${INJECT_ARGS} --account ${USDC_ATA_ADDR} ${USDC_ATA_JSON}"
else
  warn "No pre-funded USDC ATA JSON at ${USDC_ATA_JSON}"
  warn "Test wallet will have 0 USDC. Open instructions will be built but not sent."
  warn "See README.md for funding options."
fi

# NOTE: --warp-slot is intentionally NOT used here.
# Problem: --warp-slot N makes the test validator compute block time as:
#   genesis_time + N * slot_duration
# With N=425M, that advances the UNIX clock by ~5.4 years from genesis_time.
# If genesis_time = wall_clock_now, the first block timestamp becomes wall_clock + 5.4yrs.
# The Adrena program checks oracle.prices[i].timestamp against the block clock,
# so oracle timestamps patched to wall_clock would appear ~5.4 years old → MissingOraclePrice.
# Without --warp-slot, the block clock stays close to wall clock, matching our oracle patch.

# Launch in background
# shellcheck disable=SC2086
nohup solana-test-validator \
  --bpf-program "${ADRENA_PROGRAM_ID}" "${SO_CACHE}" \
  ${CLONE_ARGS} \
  ${INJECT_ARGS} \
  --url "${MAINNET_RPC}" \
  --ledger "${LEDGER_DIR}" \
  --reset \
  --quiet \
  > "${SCRIPT_DIR}/validator.log" 2>&1 &

VALIDATOR_PID=$!
log "Validator starting (PID ${VALIDATOR_PID})..."

# ── Step 4: Health check ──────────────────────────────────────────────────────
log "Waiting for validator to become healthy..."
MAX_WAIT=90
WAIT=0
until solana cluster-version --url "${LOCAL_RPC}" >/dev/null 2>&1; do
  sleep 2
  WAIT=$((WAIT + 2))
  if [[ ${WAIT} -ge ${MAX_WAIT} ]]; then
    err "Validator did not start within ${MAX_WAIT}s. Check ${SCRIPT_DIR}/validator.log"
    cat "${SCRIPT_DIR}/validator.log" | tail -20
    exit 1
  fi
done

CLUSTER_VER=$(solana cluster-version --url "${LOCAL_RPC}" 2>/dev/null || echo "unknown")
log "Validator healthy! Version: ${CLUSTER_VER}"

# ── Step 5: Fund local wallet with SOL ────────────────────────────────────────
log "Airdropping 100 SOL to local wallet..."
solana airdrop 100 "${LOCAL_PUBKEY}" --url "${LOCAL_RPC}" >/dev/null 2>&1 || true
BALANCE=$(solana balance "${LOCAL_PUBKEY}" --url "${LOCAL_RPC}" 2>/dev/null || echo "unknown")
log "Local wallet SOL balance: ${BALANCE}"

# ── Step 6: Create mock-USDC mint + fund local wallet ────────────────────────
# The cloned USDC mint (EPjFWdd5...) has Centre multisig as authority — not mintable.
# Strategy: create a FRESH mock mint with local authority, fund our ATA with it.
# The probe-localnet.ts uses this for any local-only checks.
# For actual Adrena instructions we need the REAL USDC — handled by injecting
# an ATA with pre-loaded balance via the --account mechanism (see probe-localnet.ts).
MOCK_USDC_KEYPAIR="${KEYS_DIR}/mock-usdc-mint.json"
if [[ ! -f "${MOCK_USDC_KEYPAIR}" ]]; then
  log "Generating mock-USDC mint keypair..."
  solana-keygen new --no-bip39-passphrase --silent --outfile "${MOCK_USDC_KEYPAIR}"
fi
MOCK_USDC_MINT=$(solana-keygen pubkey "${MOCK_USDC_KEYPAIR}")
log "Mock USDC mint keypair: ${MOCK_USDC_MINT}"

# Configure solana CLI for localnet
solana config set --url "${LOCAL_RPC}" --keypair "${LOCAL_WALLET}" >/dev/null 2>&1 || true

# Create the mock USDC token mint
log "Creating mock-USDC SPL Token mint (6 decimals, local mint authority)..."
MOCK_USDC_CREATED=$(
  spl-token create-token --decimals 6 "${MOCK_USDC_KEYPAIR}" \
    --url "${LOCAL_RPC}" --fee-payer "${LOCAL_WALLET}" \
    2>&1 | grep "Address:" | awk '{print $2}' || echo "unknown"
)
log "Mock USDC mint created: ${MOCK_USDC_CREATED:-$MOCK_USDC_MINT}"

# Create ATA for mock USDC
log "Creating ATA for mock USDC..."
MOCK_USDC_ATA=$(
  spl-token create-account "${MOCK_USDC_MINT}" \
    --owner "${LOCAL_PUBKEY}" \
    --url "${LOCAL_RPC}" --fee-payer "${LOCAL_WALLET}" \
    2>&1 | grep "Creating account" | awk '{print $3}' || echo "unknown"
)
log "Mock USDC ATA: ${MOCK_USDC_ATA}"

# Mint 10,000 mock USDC to local wallet
log "Minting 10,000 mock USDC to local wallet..."
spl-token mint "${MOCK_USDC_MINT}" 10000 \
  --url "${LOCAL_RPC}" --fee-payer "${LOCAL_WALLET}" \
  >/dev/null 2>&1 || warn "spl-token mint failed (ATA may need time to confirm)"

MOCK_USDC_BALANCE=$(
  spl-token balance "${MOCK_USDC_MINT}" \
    --owner "${LOCAL_PUBKEY}" \
    --url "${LOCAL_RPC}" 2>/dev/null || echo "unknown"
)
log "Mock USDC balance: ${MOCK_USDC_BALANCE}"

# ── Step 7: Write config for probe script ─────────────────────────────────────
cat > "${SCRIPT_DIR}/.localnet-config.json" << CONFIG
{
  "localRpc": "${LOCAL_RPC}",
  "adrenaProgramId": "${ADRENA_PROGRAM_ID}",
  "poolPda": "${POOL_PDA}",
  "cortexPda": "${CORTEX_PDA}",
  "transferAuthority": "${TRANSFER_AUTHORITY}",
  "oraclePda": "${ORACLE_PDA}",
  "usdcMint": "${USDC_MINT}",
  "jitosolMint": "${JITOSOL_MINT}",
  "bonkMint": "${BONK_MINT}",
  "wbtcMint": "${WBTC_MINT}",
  "usdcCustody": "${USDC_CUSTODY}",
  "jitosolCustody": "${JITOSOL_CUSTODY}",
  "bonkCustody": "${BONK_CUSTODY}",
  "wbtcCustody": "${WBTC_CUSTODY}",
  "usdcCustodyTokenAccount": "${USDC_CUSTODY_TOKEN_ACCOUNT}",
  "jitosolCustodyTokenAccount": "${JITOSOL_CUSTODY_TOKEN_ACCOUNT}",
  "bonkCustodyTokenAccount": "${BONK_CUSTODY_TOKEN_ACCOUNT}",
  "wbtcCustodyTokenAccount": "${WBTC_CUSTODY_TOKEN_ACCOUNT}",
  "pythSolOracle": "${PYTH_SOL_ORACLE}",
  "pythJitosolOracle": "${PYTH_JITOSOL_ORACLE}",
  "pythUsdcOracle": "${PYTH_USDC_ORACLE}",
  "pythBonkOracle": "${PYTH_BONK_ORACLE}",
  "pythWbtcOracle": "${PYTH_WBTC_ORACLE}",
  "adrenalookupTable": "${ADRENA_LOOKUP_TABLE}",
  "localWallet": "${LOCAL_WALLET}",
  "mockUsdcKeypair": "${MOCK_USDC_KEYPAIR}",
  "mockUsdcMint": "${MOCK_USDC_MINT}",
  "localPubkey": "${LOCAL_PUBKEY}"
}
CONFIG
log "Config written to ${SCRIPT_DIR}/.localnet-config.json"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} Adrena localnet ready!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo "  RPC:              ${LOCAL_RPC}"
echo "  WebSocket:        ws://127.0.0.1:8900"
echo "  Adrena program:   ${ADRENA_PROGRAM_ID}"
echo "  Pool PDA:         ${POOL_PDA}"
echo "  Local wallet:     ${LOCAL_PUBKEY}"
echo "  Mock USDC mint:   ${MOCK_USDC_MINT}"
echo ""
echo "Next steps:"
echo "  Run probe:  cd ${REPO_ROOT}"
echo "              npx tsx scripts/probe-localnet.ts"
echo ""
echo "Stop validator:   pkill -f solana-test-validator"
echo "Logs:             tail -f ${SCRIPT_DIR}/validator.log"
