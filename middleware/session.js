// Pricing per tier
const TIER_PRICING = {
  basic:   { amount: "0.001", chains: 4, description: "4-chain comparison (ETH, Base, Arbitrum, Optimism)" },
  premium: { amount: "0.002", chains: 9, description: "9-chain comparison (+ BNB, Polygon, Avalanche, zkSync, Hyperliquid)" },
};

// Demo-only middleware: sets session info for free demo requests
function demoSessionMiddleware(req, res, next) {
  req.sessionMode = "demo";
  req.sessionTier = "basic";
  next();
}

// Paid tier middleware: sets session info based on route path
function paidSessionMiddleware(tier) {
  return (req, res, next) => {
    req.sessionMode = "paid";
    req.sessionTier = tier;
    next();
  };
}

module.exports = { demoSessionMiddleware, paidSessionMiddleware, TIER_PRICING };
