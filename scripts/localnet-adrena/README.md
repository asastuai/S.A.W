# Adrena Localnet — Mainnet-Clone Validator

Local Solana test environment with the real Adrena mainnet program for e2e testing
of open/close/read perp positions without spending real funds (Task 1d).

## Quick Start

```bash
cd <repo-root>

# 1. Start the validator (clones from mainnet, ~60s, needs internet)
bash scripts/localnet-adrena/setup.sh

# 2. Run the probe
npx tsx scripts/probe-localnet.ts

# 3. Stop when done
pkill -f solana-test-validator && rm -rf test-ledger
```

## SDK Build (one-time, outside repo)

The published `adrena-sdk-ts@1.0.0-beta.14` ships without compiled JS
(`emitDeclarationOnly: true` in tsconfig). Build from source:

```bash
git clone https://github.com/AdrenaFoundation/adrena-sdk-ts ~/vendor/adrena-sdk-ts
cd ~/vendor/adrena-sdk-ts
pnpm install
npx tsc --emitDeclarationOnly false   # override the tsconfig flag
# Verify:
node -e "const x = require('./dist/src/index.js'); console.log(Object.keys(x)[0])"
```

**Workspace link** (already done — recorded here for reference):
```bash
cd <repo-root>/worker
pnpm add file:/home/asastu/vendor/adrena-sdk-ts
# This adds "adrena-sdk": "file:/home/asastu/vendor/adrena-sdk-ts" to worker/package.json
# The package name in vendor is "adrena-sdk" (renamed from "adrena-sdk-ts" in main branch)
```

**Unwiring when beta.15+ ships with dist/**:
```bash
cd <repo-root>/worker
pnpm remove adrena-sdk
pnpm add adrena-sdk-ts@beta   # or whatever the new package name/version is
# Update imports in probe-localnet.ts and venue.ts from "adrena-sdk" to new name
```

The vendor clone lives at `~/vendor/adrena-sdk-ts` — outside the repo, not committed.

## What Gets Cloned vs Mocked

### Cloned from mainnet (frozen snapshots)

| Account | Address | Purpose |
|---------|---------|---------|
| Pool PDA | `4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34` | Main pool state (custodies, params) |
| Cortex PDA | `Dhz8Ta79hgyUbaRcu7qHMnqMfY47kQHfHt2s42D9dC4e` | Protocol state / cortex |
| Transfer Authority | `4o3qAErcapJ6gRLh1m1x4saoLLieWDu7Rx3wpwLc7Zk9` | PDA owning vault tokens |
| USDC Custody | `Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk` | USDC custody account |
| JITOSOL Custody | `GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71` | JITOSOL custody account |
| USDC Custody Token Acct | `3VqjUCorytnU29iPTavgHE69iAh617NgWMEtBWtMrkZv` | Vault for USDC |
| JITOSOL Custody Token Acct | `C7PiLKkDHq4q3w7n8BehcyCVYVAfH1jGEKLS3xRVxrab` | Vault for JITOSOL |
| USDC Mint (mainnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Real USDC mint (read-only) |
| JITOSOL Mint (mainnet) | `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` | Jito staked SOL mint |
| SOL Pyth oracle | `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE` | Pyth SOL/USD price feed v2 |
| JITOSOL Pyth oracle | `AxaxyeDT8JnWERSaTKvFXvPKkEdxnamKSqpWbsSjYg1g` | Pyth JITOSOL/USD |
| USDC Pyth oracle | `Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX` | Pyth USDC/USD |
| Adrena LUT | `4PZaPEXPzMLuBSKgZUvpzLi3zGXJ1pSz6NTKrtoXUd4q` | Address lookup table |

### Injected (real program at real address)

| Item | Details |
|------|---------|
| Adrena program | `13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet` from `adrena.so` (4.2 MB) |

### Created locally

| Item | Details |
|------|---------|
| Throwaway wallet | `.keys/local-wallet.json` — gitignored, controls nothing real |
| Mock USDC mint | `.keys/mock-usdc-mint.json` — 6-decimal SPL token, local authority |

## PDA Derivation

All PDAs derived from `ADRENA_PROGRAM_ID = 13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet`:

```
Pool PDA:      seeds=["pool", "main-pool"]         → 4bQRutg...
Cortex PDA:    seeds=["cortex"]                    → Dhz8Ta7...
Transfer Auth: seeds=["transfer_authority"]        → 4o3qAEr...
USDC Custody:  seeds=["custody", poolPDA, USDCmint] → Dk523LZ...
JITO Custody:  seeds=["custody", poolPDA, JITOmint] → GZ9XfWw...
Oracle PDA:    seeds=["oracle"]                    → GEm9TZP...
ALP Mint:      seeds=["lp_token_mint"]             → D6KCFHz...
```

Verified with `PublicKey.findProgramAddressSync` (web3.js v1).

## Mock Collateral Flow

**Problem**: The real USDC mint has Centre multisig mint authority — not locally controllable.
Without real USDC in the test wallet's ATA, the open instruction fails with InsufficientCollateral.

**What setup.sh does**: Creates a fresh SPL Token mint (`mock-usdc-mint.json`) with local
authority and mints 10,000 tokens. This is a *different* mint from the real USDC — useful for
local token operations but the Adrena program reads the USDC *custody* which references the real mint.

**Path A (recommended for probe success)** — Whale account injection:

Find a mainnet account holding real USDC, download its JSON, patch the owner to the local
wallet, and inject at startup:

```bash
# 1. Download a USDC-rich ATA from mainnet
WHALE_ATA="<mainnet ATA with USDC>"  # e.g. from Solana explorer
solana account $WHALE_ATA --url mainnet-beta --output json-compact > /tmp/whale-usdc.json

# 2. Patch the owner field in the token account data to your local wallet pubkey
#    (binary: SPL Token AccountState layout — offset 32 for owner pubkey)

# 3. Add to setup.sh validator args:
#    --account $WHALE_ATA /tmp/whale-usdc.json

# 4. Restart: bash scripts/localnet-adrena/setup.sh
```

**Path B** — Skip USDC entirely, test with a minimal Jito SOL open:
Swap collateral token to JITOSOL (also in custody), use a non-zero JITOSOL balance.
The local wallet gets JITOSOL if JITOSOL ATA injection is done similarly.

**Path C** — Accept DONE_WITH_CONCERNS:
Instructions build correctly, pool/custody readable, position PDA derivable.
The collateral gap is a funding issue, not an architectural issue. The mainnet dust run
(Task 1d final step, out of scope here) validates end-to-end with real funds.

## Oracle Staleness — RESOLVED

**Root cause (found)**: The Adrena program checks oracle freshness as:
  `block_time - oracle.prices[i].timestamp < staleness_threshold`
The validator's block clock starts at current wall-clock and advances normally.
The oracle timestamps in the cloned account are old, so `block_time - ts` quickly
exceeds the threshold → error 6088 `MissingOraclePrice`.

**Solution (implemented in setup.sh)**: Patch the Oracle PDA (`GEm9TZP7BL8rTz1JDy6X74PL595zr1putA9BXC8ehDmU`)
with timestamps set **4 hours in the future** before injecting it via `--account`:

```
block_time - (now + 4h) = -(4h - elapsed) < 0   → always "fresh"
```

This way oracle prices remain fresh for 4 hours of validator runtime. The Pyth feed
accounts (7UVim..., Axaxy..., Dpw1E...) are still cloned but the program only reads
the aggregated Oracle PDA — individual Pyth accounts are not checked for staleness.

**Important**: Do NOT use `--warp-slot` — it advances the validator's block clock by
N slots × 0.4s, which would make wall-clock-patched oracle timestamps appear old.

**Collateral injection**: The Oracle PDA patch gives us oracle access. Collateral is
provided by injecting a pre-funded USDC ATA (`test-wallet-usdc-ata.json`) owned by the
local test wallet. This bypasses the real USDC mint's Centre multisig authority.

Both fixes are applied automatically by `bash scripts/localnet-adrena/setup.sh`.

## Jito / Transaction Send

The Adrena SDK's high-level functions (`openMarketLong`, `closeLong`, `cancelSLTP`)
all call `sendTransactionWithJito()` which POSTs to `mainnet.block-engine.jito.wtf`.
On localnet there is no Jito infrastructure.

**Our solution**: Use the lower-level instruction builders (`getOpenLongIxs`,
`getSetStopLossLongIx`, `getTakeProfitLongIx`, etc.) directly, assemble all instructions
into one array, and send via `rpc.sendTransaction()`.

**Atomicity preserved**: On mainnet, all ixs go in one Jito "bundle" — but a Jito bundle
for a single transaction is just one transaction. On localnet, it's also one transaction.
The atomic semantics are identical: either all ixs succeed or all fail.

**Implication for VenueAdapter (Task 4)**:
The adapter `openPerp()` will also need to use the low-level builders + `rpc.sendTransaction()`
unless Adrena adds a non-Jito send path in a future release. This is the correct approach —
the Jito tip instruction can simply be omitted for non-mainnet environments.

## Known Limitations

| Limitation | Impact | Status |
|------------|--------|--------|
| Oracle staleness (frozen snapshot) | Open/close instructions may be rejected | RESOLVED — timestamps patched +4h in setup.sh |
| Real USDC not mintable locally | Open tx needs real USDC collateral | RESOLVED — whale ATA injection (`test-wallet-usdc-ata.json`) |
| No keeper infrastructure | SL/TP orders accepted but never executed | Expected — keepers run on mainnet; localnet just tests acceptance |
| Jito required for SDK high-level API | Must use low-level instruction builders | RESOLVED — low-level builders + `rpc.sendTransaction()` implemented |
| PositionTooYoung (6070) on immediate close | Must wait ~30s between open and close | Expected — probe includes 30s delay before closeLong |
| Single position per (owner, market, side) | One JITOSOL long at a time per keypair | Protocol constraint, not a bug |
| Oracle freshness window | Timestamps expire after ~4h of validator uptime | Restart validator with `setup.sh` after 4h |

## What Works — Full E2E Green

All four lifecycle steps execute with real on-chain transactions against the localnet validator:

1. **Open long + SL + TP** — `getOpenLongIxs` + `getSetStopLossLongIx` + `getTakeProfitLongIx` bundled in one tx; SL/TP metadata confirmed set on-chain
2. **Read position state** — `getPositionStatus` returns `entryPrice`, `sizeUsd`, `stopLossIsSet=1`, `takeProfitIsSet=1`
3. **Cancel SL/TP** — `getCancelSLTPLongIxs` accepted on-chain, clears the SL/TP metadata
4. **Close long** — `getClosePositionLongIxs` accepted on-chain (after 30s PositionTooYoung delay)

Other infrastructure that works:
- `solana-test-validator` with real Adrena program + cloned mainnet state
- Pool, custody, and oracle accounts readable via RPC
- `fetchPoolUtil("main-pool", ...)` decodes pool account correctly
- All PDAs derivable deterministically
- `rpc.sendTransaction()` as Jito bypass for localnet
- Confirmation polling via `getSignatureStatuses` (avoids race conditions)
- Reproducible one-command startup + teardown (`bash scripts/localnet-adrena/setup.sh`)

## File Structure

```
scripts/localnet-adrena/
├── setup.sh              ← One-command validator startup (run first)
├── README.md             ← This file
├── .gitignore            ← Ignores .keys/, adrena.so, *.log, .localnet-config.json
├── adrena.so             ← GITIGNORED — cached program bytecode (4.2 MB)
├── .keys/                ← GITIGNORED — ephemeral localnet-only keypairs
│   ├── local-wallet.json
│   └── mock-usdc-mint.json
├── .localnet-config.json ← GITIGNORED — generated by setup.sh (addresses + paths)
└── validator.log         ← GITIGNORED — validator stdout
scripts/
└── probe-localnet.ts     ← E2e probe (run after setup.sh)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAINNET_RPC_URL` | `https://api.mainnet-beta.solana.com` | RPC for cloning accounts |

For a paid RPC to avoid rate limiting during setup:
```bash
MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<key> bash scripts/localnet-adrena/setup.sh
```

## Relevant Addresses (Reference)

```
Adrena program:    13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet
Pool PDA:          4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34
Cortex PDA:        Dhz8Ta79hgyUbaRcu7qHMnqMfY47kQHfHt2s42D9dC4e
USDC Mint:         EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
JITOSOL Mint:      J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn
USDC Custody:      Dk523LZeDQbZtUwPEBjFXCd2Au1tD7mWZBJJmcgHktNk
JITOSOL Custody:   GZ9XfWwgTRhkma2Y91Q9r1XKotNXYjBnKKabj19rhT71
LUT:               4PZaPEXPzMLuBSKgZUvpzLi3zGXJ1pSz6NTKrtoXUd4q
```
