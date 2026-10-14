// Demo rate limit: per-IP hourly/daily + global hourly.
// Counters live in Upstash Redis when available (shared across serverless
// instances and cold starts); otherwise fall back to per-instance memory.
const crypto = require("crypto");
const redis = require("../lib/redis");

const LIMITS = {
  ipPerHour: 10,
  ipPerDay: 100,
  serverPerHour: 500,
};

const UPGRADE = {
  basic: "$0.001 USDC / call — unlimited, 4 chains with recommendations",
  premium: "$0.002 USDC / call — unlimited, 9 chains full features",
};

function getClientIp(req) {
  return req.headers["x-real-ip"] || req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// ── memory fallback ──
const mem = new Map(); // key -> { count, resetAt }
function memIncr(key, windowSec) {
  const now = Date.now();
  let e = mem.get(key);
  if (!e || now >= e.resetAt) { e = { count: 0, resetAt: now + windowSec * 1000 }; mem.set(key, e); }
  e.count++;
  return { count: e.count, resetAt: e.resetAt };
}
setInterval(() => { const now = Date.now(); for (const [k, e] of mem) if (now >= e.resetAt) mem.delete(k); }, 10 * 60 * 1000).unref?.();

// Increment three counters atomically-ish; returns counts after increment.
async function incrAll(ipHash) {
  const hour = Math.floor(Date.now() / 3600_000);
  const day = Math.floor(Date.now() / 86400_000);
  const kIpH = `mgo:rl:iph:${ipHash}:${hour}`, kIpD = `mgo:rl:ipd:${ipHash}:${day}`, kSrv = `mgo:rl:srv:${hour}`;
  if (redis.enabled()) {
    const out = await redis.pipeline([
      ["INCR", kIpH], ["EXPIRE", kIpH, 3600],
      ["INCR", kIpD], ["EXPIRE", kIpD, 86400],
      ["INCR", kSrv], ["EXPIRE", kSrv, 3600],
    ]);
    if (out && out[0]?.result !== undefined) {
      return {
        ipHour: { count: Number(out[0].result), resetAt: (hour + 1) * 3600_000 },
        ipDay: { count: Number(out[2].result), resetAt: (day + 1) * 86400_000 },
        server: { count: Number(out[4].result), resetAt: (hour + 1) * 3600_000 },
        backend: "redis",
      };
    }
  }
  return { ipHour: memIncr(kIpH, 3600), ipDay: memIncr(kIpD, 86400), server: memIncr(kSrv, 3600), backend: "memory" };
}

function reject(res, limit, resetAt, msg) {
  const retry = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", 0);
  res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));
  res.setHeader("Retry-After", retry);
  return res.status(429).json({ error: msg, upgrade: UPGRADE, retryAfter: retry });
}

async function demoRateLimit(req, res, next) {
  try {
    const ipHash = crypto.createHash("sha256").update(getClientIp(req)).digest("hex").slice(0, 16);
    const c = await incrAll(ipHash);
    // Per-IP checks first, so an abusive IP cannot burn the global budget for everyone.
    if (c.ipHour.count > LIMITS.ipPerHour) return reject(res, LIMITS.ipPerHour, c.ipHour.resetAt, "Demo hourly limit reached (10/hr). Upgrade for unlimited access.");
    if (c.ipDay.count > LIMITS.ipPerDay) return reject(res, LIMITS.ipPerDay, c.ipDay.resetAt, "Demo daily limit reached (100/day). Upgrade for unlimited access.");
    if (c.server.count > LIMITS.serverPerHour) return reject(res, LIMITS.serverPerHour, c.server.resetAt, "Server demo limit reached. Try again later or upgrade to a paid tier.");
    res.setHeader("X-RateLimit-Limit", LIMITS.ipPerHour);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, LIMITS.ipPerHour - c.ipHour.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(c.ipHour.resetAt / 1000));
    next();
  } catch (err) {
    console.error("[rateLimit]", err.message);
    next(); // fail open: a limiter outage must not take the free demo down
  }
}

module.exports = { demoRateLimit, LIMITS };
