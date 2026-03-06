const crypto = require("crypto");

const sessions = new Map();
const SESSION_LIMIT = 10;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Pricing per tier
const TIER_PRICING = {
  basic:   { amount: "0.01", chains: 4, description: "4-chain comparison (ETH, Base, Arbitrum, Optimism)" },
  premium: { amount: "0.02", chains: 9, description: "9-chain comparison (+ BNB, Polygon, Avalanche, zkSync, Hyperliquid)" },
};

function createSession(tier = "basic") {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    remaining: SESSION_LIMIT,
    tier,                      // "basic" | "premium"
    createdAt: Date.now(),
    lastUsed: Date.now(),
  });
  return token;
}

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

function sessionMiddleware(req, res, next) {
  // Demo mode: always basic tier, no payment needed
  if (req.query.demo === "true") {
    req.sessionMode = "demo";
    req.sessionTier = "basic";
    return next();
  }

  const token = req.headers["x-session-token"];

  if (!token) {
    return res.status(402).json({
      error: "Payment Required",
      protocol: "x402",
      tiers: {
        basic: {
          amount: TIER_PRICING.basic.amount,
          currency: "USDC",
          network: "Base",
          calls: SESSION_LIMIT,
          chains: TIER_PRICING.basic.chains,
          description: TIER_PRICING.basic.description,
        },
        premium: {
          amount: TIER_PRICING.premium.amount,
          currency: "USDC",
          network: "Base",
          calls: SESSION_LIMIT,
          chains: TIER_PRICING.premium.chains,
          description: TIER_PRICING.premium.description,
        },
      },
      receiver: process.env.WALLET_ADDRESS || "YOUR_WALLET_ADDRESS",
      instructions: {
        step1: "Choose a tier: Basic ($0.01) or Premium ($0.02)",
        step2: "Send USDC on Base to the receiver address",
        step3: "POST /session with { txHash: '0x...', tier: 'basic'|'premium' } to get a session token",
        step4: "Include X-Session-Token header in subsequent requests",
      },
      demo: "Add ?demo=true for free Basic tier preview",
    });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({
      error: "Invalid or expired session token",
      action: "Request a new session by paying $0.01 (Basic) or $0.02 (Premium) USDC",
    });
  }

  if (session.remaining <= 0) {
    sessions.delete(token);
    return res.status(402).json({
      error: "Session exhausted",
      tier: session.tier,
      used: SESSION_LIMIT,
      action: `Pay $${TIER_PRICING[session.tier]?.amount || "0.01"} USDC for 10 more calls`,
    });
  }

  session.remaining -= 1;
  session.lastUsed = Date.now();
  req.sessionMode = "paid";
  req.sessionTier = session.tier;   // pass tier to route handler
  req.sessionRemaining = session.remaining;
  res.setHeader("X-Session-Remaining", session.remaining);
  res.setHeader("X-Session-Tier", session.tier);
  next();
}

module.exports = { sessionMiddleware, createSession, sessions, TIER_PRICING };
