const crypto = require("crypto");

const sessions = new Map();
const SESSION_LIMIT = 10;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1시간

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    remaining: SESSION_LIMIT,
    createdAt: Date.now(),
    lastUsed: Date.now()
  });
  return token;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

function sessionMiddleware(req, res, next) {
  if (req.query.demo === "true") {
    req.sessionMode = "demo";
    return next();
  }

  const token = req.headers["x-session-token"];

  if (!token) {
    return res.status(402).json({
      error: "Payment Required",
      protocol: "x402",
      payment: {
        currency: "USDC",
        network: "Base",
        amount: "0.01",
        description: "Pay $0.01 USDC for 10 API calls",
        receiver: process.env.WALLET_ADDRESS || "YOUR_WALLET_ADDRESS",
      },
      instructions: {
        step1: "Send 0.01 USDC on Base to the receiver address",
        step2: "POST /session with { txHash: '0x...' } to get a session token",
        step3: "Include X-Session-Token header in subsequent requests"
      },
      demo: "Add ?demo=true for free trial"
    });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({
      error: "Invalid or expired session token",
      action: "Request a new session by paying $0.01 USDC"
    });
  }

  if (session.remaining <= 0) {
    sessions.delete(token);
    return res.status(402).json({
      error: "Session exhausted",
      used: SESSION_LIMIT,
      action: "Pay $0.01 USDC for 10 more calls"
    });
  }

  session.remaining -= 1;
  session.lastUsed = Date.now();
  req.sessionMode = "paid";
  req.sessionRemaining = session.remaining;
  res.setHeader("X-Session-Remaining", session.remaining);
  next();
}

module.exports = { sessionMiddleware, createSession, sessions };
