// Demo rate limit: IP-based + global server limit
const ipHourly = new Map();   // IP -> { count, resetAt }
const ipDaily = new Map();    // IP -> { count, resetAt }
let serverHourly = { count: 0, resetAt: Date.now() + 3600_000 };

const LIMITS = {
  ipPerHour: 10,
  ipPerDay: 100,
  serverPerHour: 500,
};

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.connection?.remoteAddress
    || "unknown";
}

function checkAndIncrement(map, key, limit, windowMs) {
  const now = Date.now();
  let entry = map.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    map.set(key, entry);
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

function demoRateLimit(req, res, next) {
  // Only apply to demo requests
  if (req.query.demo !== "true") return next();

  const ip = getClientIp(req);
  const now = Date.now();

  // Server-wide hourly limit
  if (now >= serverHourly.resetAt) {
    serverHourly = { count: 0, resetAt: now + 3600_000 };
  }
  if (serverHourly.count >= LIMITS.serverPerHour) {
    return res.status(429).json({
      error: "Server demo limit reached. Try again later or upgrade to a paid tier.",
      upgrade: {
        basic: "$0.001 USDC / call — unlimited, 4 chains with recommendations",
        premium: "$0.002 USDC / call — unlimited, 9 chains full features",
      },
      retryAfter: Math.ceil((serverHourly.resetAt - now) / 1000),
    });
  }
  serverHourly.count++;

  // IP hourly limit
  const hourly = checkAndIncrement(ipHourly, ip, LIMITS.ipPerHour, 3600_000);
  if (!hourly.allowed) {
    res.setHeader("X-RateLimit-Limit", LIMITS.ipPerHour);
    res.setHeader("X-RateLimit-Remaining", 0);
    res.setHeader("X-RateLimit-Reset", Math.ceil(hourly.resetAt / 1000));
    return res.status(429).json({
      error: "Demo hourly limit reached (10/hr). Upgrade for unlimited access.",
      upgrade: {
        basic: "$0.001 USDC / call — unlimited, 4 chains with recommendations",
        premium: "$0.002 USDC / call — unlimited, 9 chains full features",
      },
      retryAfter: Math.ceil((hourly.resetAt - now) / 1000),
    });
  }

  // IP daily limit
  const daily = checkAndIncrement(ipDaily, ip, LIMITS.ipPerDay, 86400_000);
  if (!daily.allowed) {
    res.setHeader("X-RateLimit-Limit", LIMITS.ipPerDay);
    res.setHeader("X-RateLimit-Remaining", 0);
    res.setHeader("X-RateLimit-Reset", Math.ceil(daily.resetAt / 1000));
    return res.status(429).json({
      error: "Demo daily limit reached (100/day). Upgrade for unlimited access.",
      upgrade: {
        basic: "$0.001 USDC / call — unlimited, 4 chains with recommendations",
        premium: "$0.002 USDC / call — unlimited, 9 chains full features",
      },
      retryAfter: Math.ceil((daily.resetAt - now) / 1000),
    });
  }

  // Set rate limit headers
  res.setHeader("X-RateLimit-Limit", LIMITS.ipPerHour);
  res.setHeader("X-RateLimit-Remaining", hourly.remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(hourly.resetAt / 1000));

  next();
}

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipHourly) {
    if (now >= entry.resetAt) ipHourly.delete(key);
  }
  for (const [key, entry] of ipDaily) {
    if (now >= entry.resetAt) ipDaily.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = { demoRateLimit };
