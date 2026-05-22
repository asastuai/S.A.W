#!/usr/bin/env python3
"""Sanity check: top Solana USDC SAFE yield pools (same filter as our LLM tool)."""
import json, urllib.request

r = urllib.request.urlopen("https://yields.llama.fi/pools").read()
d = json.loads(r)["data"]

# Match what our server-side safeOnly filter does
def is_safe(p):
    return (
        p["chain"] == "Solana"
        and "USDC" in p["symbol"].upper()
        and p.get("exposure") == "single"
        and p.get("ilRisk") == "no"
        and (p.get("tvlUsd") or 0) >= 5_000_000
    )

safe = [p for p in d if is_safe(p)]
safe.sort(key=lambda x: -(x.get("apy") or 0))

print(f"Safe Solana USDC pools (TVL>$5M, single, no-IL): {len(safe)}")
print()
print(f"{'project':<28}{'symbol':<22}{'apy %':>8}{'tvl $':>14}")
print("-" * 72)
for p in safe[:10]:
    print(
        f"{p['project'][:28]:<28}{p['symbol'][:22]:<22}{(p.get('apy') or 0):>8.2f}{(p.get('tvlUsd') or 0)/1e6:>12.1f}M"
    )
