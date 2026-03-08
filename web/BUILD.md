# MGO Web - Build Guide

## Prerequisites

- Node.js 18+
- npm or yarn

## Setup

```bash
cd web
npm install
```

## Development

```bash
npm run dev
```

Opens at http://localhost:5173

## Production Build

```bash
npm run build
npm run preview
```

Build output goes to `web/dist/`.

## How it works

- Uses `viem` to directly call public RPCs for Ethereum, Base, Arbitrum, Optimism
- EIP-1559 gas price: baseFee (from latest block) + priorityFee (estimated)
- Polls every 3 seconds (safe for public RPCs; change `POLL_INTERVAL` in `src/useGasPrices.js`)
- No backend server required

## File structure

```
web/
  index.html          # HTML entry
  vite.config.js      # Vite config
  package.json        # Dependencies
  src/
    main.jsx          # React mount
    App.jsx           # UI component
    useGasPrices.js   # Gas price fetching hook (viem + polling)
```
