# Drift Localnet — Mainnet-Clone Validator

One-command local Drift environment using the real mainnet program bytecode.

## Quick Start

```bash
cd <repo-root>

# 1. Start the validator (clones from mainnet, ~30-60s)
bash scripts/localnet-drift/setup.sh

# 2. Initialize markets + create mock USDC
worker/node_modules/.bin/tsx scripts/localnet-drift/init-markets.ts

# 3. Run the probe against localnet
SOLANA_RPC_URL=http://127.0.0.1:8899 \
  worker/node_modules/.bin/tsx scripts/drift-probe.ts

# 4. Stop when done
pkill -f solana-test-validator
rm -rf test-ledger
```

## What Gets Cloned vs Initialized

### Cloned from mainnet (snapshots)

| Account | Address | Purpose |
|---------|---------|---------|
| Drift state PDA | `5zpq7DvB6UdFFvpmBPspGPNfUGoBRRCE2HHg5u3gxcsN` | Global protocol state |
| SOL-PERP market (idx 0) | `8UJgxaiQx5nTrdDgph5FiahMmzduuLTLf5WmsPegYA6W` | SOL perpetual market account |
| USDC spot market (idx 0) | `6gMq3mRCKf8aP3ttTyYhuijVZ2LGi14oDsBbkgubfLB3` | USDC collateral market |
| USDC spot vault | `GXWqPpjQpdz7KZw9p7f5PX2eGxHAhvpNXiviFkAB8zXg` | Program-owned USDC vault |
| Insurance fund vault | `2CqkQvYxp9Mq4PqLvAQ1eryYxebUh4Liyn5YMDtXsYci` | Insurance fund for USDC market |
| SOL spot market (idx 1) | `3x85u7SWkmmr7YQGYhtjARgxwegTLJgkSLRprfXod6rh` | SOL collateral market |
| SOL-PERP oracle | `3m6i4RFWEDw2Ft4tFHPJtYgmpPe21k56M3FHeWYrgGBz` | PythLazer SOL/USD price feed |
| USDC oracle | `9VCioxmni2gDLv11qufWzT3RDERhQE4iY5Gf7NTfYyAV` | PythLazer USDC/USD price feed |
| Pyth Lazer storage | `3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL` | Pyth Lazer internal state |
| Real USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Mainnet USDC (reference) |
| Market lookup table 1 | `Fpys8GRa5RBWfyeN7AaDUwFGD1zkDCA4z3t4CJLV8dfL` | Address lookup table for markets |
| Market lookup table 2 | `EiWSskK5HXnBTptiS5DH6gpAJRVNQ3cAhTKBGaiaysAb` | Address lookup table (extended) |

### Cloned programs (with upgradeable program data)

| Program | Address |
|---------|---------|
| Drift program | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` (injected from drift.so) |
| Drift oracle receiver | `G6EoTTTgpkNBtVXo96EQp2m6uwwVh2Kt6YidjkmQqoha` |
| Pyth Lazer program | `pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt` |
| Switchboard on-demand | `SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv` |

### Initialized locally

| Item | Details |
|------|---------|
| Local test wallet | `scripts/localnet-drift/.keys/local-wallet.json` — ephemeral, gitignored |
| Mock USDC mint keypair | `scripts/localnet-drift/.keys/mock-usdc-mint.json` — 6 decimals, local authority |
| Mock USDC ATA | Created by init-markets.ts for the local wallet |

## PDA Derivation

All Drift PDAs use `DRIFT_PROGRAM_ID = dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH`:

```
State:          PDA("drift_state")                    → 5zpq7DvB6UdFFvpmBPspGPNfUGoBRRCE2HHg5u3gxcsN
PerpMarket[i]:  PDA("perp_market", u16_le(i))
  index 0 (SOL) → 8UJgxaiQx5nTrdDgph5FiahMmzduuLTLf5WmsPegYA6W
SpotMarket[i]:  PDA("spot_market", u16_le(i))
  index 0 (USDC) → 6gMq3mRCKf8aP3ttTyYhuijVZ2LGi14oDsBbkgubfLB3
SpotVault[i]:   PDA("spot_market_vault", u16_le(i))
  index 0 (USDC) → GXWqPpjQpdz7KZw9p7f5PX2eGxHAhvpNXiviFkAB8zXg
```

Derived in Node.js:
```js
const [pda] = await PublicKey.findProgramAddress(
  [Buffer.from("drift_state")],
  new PublicKey("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH")
);
```

## Mock USDC Approach

**Problem**: The real mainnet USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) is
cloned but its mint authority is the Centre multisig — we cannot mint new tokens locally.

**Solution implemented (v1)**: `setup.sh` creates a fresh SPL Token mint with the local
wallet as mint authority. `init-markets.ts` mints 10,000 units to a local ATA.

**Known limitation**: The cloned `USDC_SPOT_MARKET` account on-chain stores the real
mainnet USDC mint address in its `mint` field. The Drift program validates that the
deposited token's mint matches the spot market's mint during `deposit()`. This means
`deposit()` with mock USDC fails with an invalid mint error.

### Unblocking deposit() — two paths

**Path A — Whale account clone (recommended for v1.1)**:

Find a mainnet account that holds a large USDC balance (use Solana explorer or RPC):
```bash
# Example whale: find a known USDC-rich account
solana account <WHALE_ATA> --url mainnet-beta --output json > whale-usdc-ata.json

# Edit whale-usdc-ata.json:
#   - Change "owner" field to your local wallet pubkey
#   - Keep the token data (it has the real USDC mint already)

# Inject into validator at startup (in setup.sh):
# --account <WHALE_ATA_ADDRESS> whale-usdc-ata.json
```
This gives you an ATA with real USDC mint that the SpotMarket accepts, with ownership
transferred to your local wallet.

**Path B — Fresh Drift state (most correct, highest effort)**:

Skip cloning entirely. Use `AdminClient.initialize()` to create:
1. A new State account
2. SpotMarket for mock USDC (points to mock mint)
3. PerpMarket for SOL-PERP
4. Oracle accounts (Prelaunch oracle, no external dependency)

See `drift-labs/protocol-v2/scripts/` for reference initialization scripts.
This approach eliminates ALL oracle staleness and mint-mismatch issues.
Estimated effort: 4-8h to adapt the admin scripts.

## Oracle Staleness

Cloned oracle accounts are **snapshots**. The price frozen at clone time may be
rejected by the Drift program's staleness guard if too much time passes.

**Staleness threshold**: Drift uses `MAX_ORACLE_TWAP_5MIN_PERCENT_DIVERGENCE` and
slot-based staleness checks. The exact threshold depends on the program version.
From empirical testing on devnet: oracles frozen >69 days caused full breakdown.

**For v1 localnet**: re-run `setup.sh` whenever the validator is restarted. Each
startup re-clones oracle accounts with the latest mainnet snapshot.

**Workaround if placeOrders fails with OracleInvalid**:

```bash
# Amend the validator clock to match the oracle's slot timestamp:
solana-clock-override --url http://127.0.0.1:8899 --unix-timestamp <oracle_ts>

# Or: fast-forward the clock to "now" so oracle appears fresh:
# This requires running a clock manipulation script — not implemented in v1.
# Drift's oracle staleness check: src/math/oracle.ts -> isOracleTooVolatile()
```

## File Structure

```
scripts/localnet-drift/
├── setup.sh              # One-command validator startup (run this first)
├── init-markets.ts       # Account bootstrapping (mock USDC, user init, deposit)
├── README.md             # This file
├── .gitignore            # Ignores .keys/, drift.so, .localnet-config.json, logs
├── .keys/                # GITIGNORED — ephemeral localnet-only keypairs
│   ├── local-wallet.json
│   └── mock-usdc-mint.json
├── drift.so              # GITIGNORED — cached Drift program bytecode
├── .localnet-config.json # GITIGNORED — generated by setup.sh
└── validator.log         # GITIGNORED — validator stdout
```

## Known Limitations (v1)

| Limitation | Impact | Workaround |
|------------|--------|-----------|
| Oracle prices frozen at clone time | placeOrders may reject stale oracle | Re-run setup.sh; or use Prelaunch oracle in fresh init |
| deposit() blocked by mint mismatch | Can't deposit mock USDC into Drift | Use whale account clone or fresh Drift init (paths A/B above) |
| No running keepers | Trigger orders never fill | For order placement tests, fills are not needed — orders placed = success |
| Cloned accounts lag mainnet by ~60s | Minor inconsistency | Acceptable for v1 |
| --clone-upgradeable-program may fail | If Drift oracle receiver is not cloneable | Remove from setup.sh and note in logs |

## What Works in v1

- `solana-test-validator` starts with real Drift program bytecode
- Drift state, market, and oracle accounts are readable on localnet
- `DriftClient.subscribe()` works against localnet
- `getOracleDataForPerpMarket()` returns cloned price (frozen snapshot)
- `initializeUserAccount()` creates user PDA on localnet
- `placeOrders()` can be sent — whether fills occur depends on oracle staleness
- Full environment is reproducible (one-command teardown + restart)

## What Does NOT Work in v1

- `deposit()` — mint mismatch between mock USDC and cloned SpotMarket
- Order fills / liquidations — no running keepers
- Fresh oracle prices — requires re-cloning or Prelaunch oracle

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAINNET_RPC_URL` | `https://api.mainnet-beta.solana.com` | Used by setup.sh to clone accounts |
| `SOLANA_RPC_URL` | `http://127.0.0.1:8899` | Used by drift-probe.ts to connect to localnet |

For a paid RPC (recommended for cloning — avoids rate limiting):
```bash
MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY \
  bash scripts/localnet-drift/setup.sh
```
