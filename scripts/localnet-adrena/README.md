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

## Oracle Staleness

**Situation**: Cloned Pyth oracle accounts are frozen snapshots from clone time. The Adrena
program has a staleness guard — if oracle data is too old, open/close instructions fail.

**Adrena oracle architecture**: The program uses a custom Oracle PDA
(`GEm9TZP7BL8rTz1JDy6X74PL595zr1putA9BXC8ehDmU`, seeds `["oracle"]`) that aggregates
prices from multiple feeds. The on-chain Pyth feed accounts (7UVim..., Axaxy...) are
inputs to this aggregation. The staleness check may be on the Oracle PDA data, not
directly on the Pyth feed timestamps.

**Mitigation A** — Re-run setup.sh before each session (fresh clone, newer timestamps):
```bash
pkill -f solana-test-validator && rm -rf test-ledger
bash scripts/localnet-adrena/setup.sh
```

**Mitigation B** — Warp the validator clock forward:
```bash
# After validator starts, fast-forward clock to bypass staleness window
# Note: --warp-slot only works at validator startup, not post-start
solana-test-validator ... --warp-slot 350000000  # current mainnet slot range
```

**Mitigation C** — Override oracle in test (advanced):
Clone the Oracle PDA account, patch its timestamp field to the current time,
and inject via `--account`. Requires understanding the Oracle PDA binary layout.

**If all else fails**: Document the exact error code (0x1XX program error) in the
findings section below and proceed to the mainnet dust run.

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
| Oracle staleness (frozen snapshot) | Open/close instructions may be rejected | Mitigation A: re-run setup.sh |
| Real USDC not mintable locally | Open tx needs real USDC collateral | Mitigation: whale ATA injection |
| No keeper infrastructure | SL/TP orders accepted but never executed | Expected — mainnet dust run validates |
| Jito required for SDK high-level API | Must use low-level instruction builders | Documented — send path implemented |
| Single position per (owner, market, side) | One JITOSOL long at a time per keypair | Protocol constraint, not a bug |

## What Works

- `solana-test-validator` with real Adrena program + cloned mainnet state
- Pool, custody, and oracle accounts readable via RPC
- `fetchPoolUtil("main-pool", ...)` decodes pool account correctly
- All PDAs derivable deterministically
- Instruction building (open, SL, TP, cancel, close) — SDK functions work
- `rpc.sendTransaction()` as Jito bypass for localnet
- Reproducible one-command startup + teardown

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
