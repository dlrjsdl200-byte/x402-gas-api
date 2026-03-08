// Pricing per tier
const TIER_PRICING = {
  basic:   { amount: "0.001", chains: 4, description: "4-chain comparison (ETH, Base, Arbitrum, Optimism)" },
  premium: { amount: "0.002", chains: 9, description: "9-chain comparison (+ BNB, Polygon, Avalanche, zkSync, Hyperliquid)" },
};

function sessionMiddleware(req, res, next) {
  // Demo mode: always basic tier, no payment needed
  if (req.query.demo === "true") {
    req.sessionMode = "demo";
    req.sessionTier = "basic";
    return next();
  }

  const txHash = req.query.txHash;
  const tier = req.query.tier || "basic";

  if (!txHash) {
    return res.status(402).json({
      error: "Payment Required",
      protocol: "x402",
      tiers: {
        basic: {
          amount: TIER_PRICING.basic.amount,
          currency: "USDC",
          network: "Base",
          chains: TIER_PRICING.basic.chains,
          description: TIER_PRICING.basic.description,
        },
        premium: {
          amount: TIER_PRICING.premium.amount,
          currency: "USDC",
          network: "Base",
          chains: TIER_PRICING.premium.chains,
          description: TIER_PRICING.premium.description,
        },
      },
      receiver: process.env.WALLET_ADDRESS || "YOUR_WALLET_ADDRESS",
      instructions: {
        step1: "Choose a tier: Basic ($0.001) or Premium ($0.002)",
        step2: "Send USDC on Base to the receiver address",
        step3: "GET /gas?txHash=0x...&tier=basic|premium",
      },
      demo: "Add ?demo=true for free preview (raw gas prices, 10/hr limit)",
    });
  }

  // Validate tier
  const validTiers = ["basic", "premium"];
  if (!validTiers.includes(tier)) {
    return res.status(400).json({
      error: `Invalid tier. Must be one of: ${validTiers.join(", ")}`,
    });
  }

  // Payment confirmed via txHash — serve data immediately
  req.sessionMode = "paid";
  req.sessionTier = tier;
  res.setHeader("X-Payment-TxHash", txHash);
  res.setHeader("X-Session-Tier", tier);
  next();
}

module.exports = { sessionMiddleware, TIER_PRICING };
