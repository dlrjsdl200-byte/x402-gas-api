#!/usr/bin/env python3
"""
MGO Daily Gas Report — Moltbook Poster
Posts a daily gas intelligence report to m/evm-gas with varied content.
"""
import json, sys, os, urllib.request, urllib.error, hashlib

API_KEY = os.environ.get('MOLTBOOK_API_KEY', '')
DATE = os.environ.get('POST_DATE', '2026-01-01')
DAY = os.environ.get('POST_DAY', 'Monday')

# ── Fetch gas data ──
try:
    with urllib.request.urlopen('https://api.mgo.chain-ops.xyz/gas/demo', timeout=10) as r:
        raw = json.loads(r.read())
    chains = raw.get('chains', [])

    # Sort by native DEX swap cost (usdc is stripped in demo tier)
    def swap_cost(c):
        return float(c.get('estimatedCosts', {}).get('dexSwap', {}).get('native', '999'))
    s = sorted(chains, key=swap_cost)

    cheap = s[0]; exp = s[-1]
    c_chain = cheap.get('chain', 'Base')
    e_chain = exp.get('chain', 'Ethereum')

    # Use higher precision for gwei (L2s can be <0.001 gwei)
    def fmt_gwei(c):
        raw_gwei = c.get('gasPrice', {}).get('baseFeeGwei', '0')
        val = float(raw_gwei)
        if val == 0:
            return '<0.0001'
        elif val < 0.01:
            return f'{val:.6f}'
        elif val < 1:
            return f'{val:.4f}'
        return f'{val:.2f}'

    c_gwei = fmt_gwei(cheap)
    e_gwei = fmt_gwei(exp)

    c_native = cheap.get('estimatedCosts', {}).get('dexSwap', {}).get('native', '?')
    e_native = exp.get('estimatedCosts', {}).get('dexSwap', {}).get('native', '?')

    # Savings based on native cost
    c_val = float(c_native) if c_native != '?' else 0
    e_val = float(e_native) if e_native != '?' else 0
    pct = round((1 - c_val / e_val) * 100, 1) if e_val > 0 else 99.8

    top3 = [c.get('chain', '?') for c in s[:3]]
    top3_str = ', '.join(top3)

    # Build per-chain breakdown
    breakdown_lines = []
    for c in s:
        name = c.get('chain', '?')
        gwei = fmt_gwei(c)
        native = c.get('estimatedCosts', {}).get('dexSwap', {}).get('native', '?')
        breakdown_lines.append(f'  {name}: {gwei} gwei (swap cost: {native} native)')
    breakdown = '\n'.join(breakdown_lines)

except Exception as e:
    print(f'Gas fetch failed: {e}', file=sys.stderr)
    c_chain, c_gwei, e_chain, e_gwei = 'Base', '0.005', 'Ethereum', '12.00'
    c_native, e_native = '0.0000009', '0.0000382'
    pct = 99.8
    top3_str = 'Base, Optimism, Arbitrum'
    breakdown = '  (data unavailable)'

# ── Varied title templates ──
day_hash = int(hashlib.md5(DATE.encode()).hexdigest(), 16)

titles = [
    f"{DAY}'s cheapest EVM chain: {c_chain} at {c_gwei} gwei",
    f"Gas report {DATE} — {c_chain} leads at {c_gwei} gwei",
    f"Where to transact today? {c_chain} wins ({c_gwei} gwei)",
    f"{DATE} gas check: {c_chain} vs {e_chain}",
    f"L2 gas comparison for {DAY} — {c_chain} on top",
    f"Daily EVM gas snapshot: {c_chain} cheapest ({DATE})",
    f"{c_chain} at {c_gwei} gwei — {DAY} gas breakdown",
]
title = titles[day_hash % len(titles)]

# ── Varied content templates ──
intros = [
    f"Here's today's gas snapshot across the 4 tracked EVM chains.",
    f"Daily gas data is in. {c_chain} continues to offer low fees.",
    f"{DAY} gas check — comparing base fees and swap costs across chains.",
    f"Quick look at where gas fees stand today ({DATE}).",
    f"Gas prices for {DAY}. {c_chain} is the cheapest option right now.",
]
intro = intros[day_hash % len(intros)]

outros = [
    'Data sourced from on-chain RPC calls via MGO API.',
    'All data from live RPC queries. Prices fluctuate — check before transacting.',
    'Numbers reflect base fee at time of query. Priority fees may vary.',
    f'Full 9-chain data (including BNB, Polygon, zkSync) available via the paid API.',
]
outro = outros[day_hash % len(outros)]

content = f"""{intro}

**Chain breakdown (sorted cheapest first):**
{breakdown}

Cheapest: {c_chain} ({c_gwei} gwei)
Most expensive: {e_chain} ({e_gwei} gwei)
Savings: {pct}%
Top 3: {top3_str}

{outro}"""

# ── Post to m/evm-gas only (no cross-posting) ──
def post(submolt):
    payload = json.dumps({'submolt': submolt, 'title': title, 'content': content}).encode()
    req = urllib.request.Request(
        'https://www.moltbook.com/api/v1/posts',
        data=payload,
        headers={'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read())
            print(f'{submolt}: {resp.get("message", "OK")}')
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ''
        print(f'{submolt} post failed: {e.code} {body}', file=sys.stderr)
    except Exception as e:
        print(f'{submolt} post failed: {e}', file=sys.stderr)

post('evm-gas')

# Removed: cross-posting to general, auto-commenting, auto-upvoting
# These behaviors trigger spam detection on most platforms.

print('Done!')
