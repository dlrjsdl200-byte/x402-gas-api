// Access logging -> Upstash Redis (REST). No extra dependencies.
//
// Why: Vercel Hobby keeps runtime logs ~1h and Web Analytics doesn't see API
// calls, so we had no way to tell "nobody came" from "came, saw 402, left".
//
// Env (either pair works; Vercel Marketplace Upstash integration injects KV_*):
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//   KV_REST_API_URL        / KV_REST_API_TOKEN
//   STATS_KEY   - secret for GET /stats?key=...
//   LOG_SALT    - optional salt for IP hashing
// If Redis env is missing, events are only console.log'd (no behavior change).

const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const SALT = process.env.LOG_SALT || "mgo";
const TTL = 60 * 60 * 24 * 120; // keep daily keys 120 days
const RECENT_MAX = 2000;
const SKIP = new Set(["/favicon.ico", "/robots.txt"]);
const KNOWN = /^\/(gas\/(demo|basic|premium)|mcp|llms\.txt|skill\.md|openapi\.json|health|stats|\.well-known\/[\w.-]+)?$/;

const enabled = () => Boolean(REDIS_URL && REDIS_TOKEN);

async function redis(commands) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: ctrl.signal,
    });
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// Pull the payer address out of an x402 payment header (v1 X-PAYMENT or v2 Payment-Signature).
function payerFrom(req) {
  const raw = req.headers["payment-signature"] || req.headers["x-payment"];
  if (!raw) return null;
  try {
    const j = JSON.parse(Buffer.from(String(raw), "base64").toString("utf8"));
    const from = j?.payload?.authorization?.from || j?.payload?.from || j?.authorization?.from;
    return from ? String(from).toLowerCase() : "unparsed";
  } catch {
    return "unparsed";
  }
}

function waitUntil(p) {
  try {
    const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
    if (ctx?.waitUntil) return ctx.waitUntil(p);
  } catch {}
  return p;
}

function record(ev) {
  console.log("[ACCESS]", JSON.stringify(ev));
  if (!enabled()) return;
  const day = ev.ts.slice(0, 10);
  const field = `${ev.method} ${ev.path} ${ev.status}${ev.payer ? " +pay" : ""}`;
  const cmds = [
    ["HINCRBY", `mgo:d:${day}`, field, 1],
    ["EXPIRE", `mgo:d:${day}`, TTL],
    ["PFADD", `mgo:ip:${day}`, ev.ip],
    ["EXPIRE", `mgo:ip:${day}`, TTL],
    ["HINCRBY", `mgo:ua:${day}`, ev.ua || "-", 1],
    ["EXPIRE", `mgo:ua:${day}`, TTL],
    ["LPUSH", "mgo:recent", JSON.stringify(ev)],
    ["LTRIM", "mgo:recent", 0, RECENT_MAX - 1],
  ];
  if (/^\/gas\/(basic|premium)$/.test(ev.path)) {
    cmds.push(["PFADD", `mgo:ippaid:${day}`, ev.ip], ["EXPIRE", `mgo:ippaid:${day}`, TTL]);
  }
  if (ev.payer) {
    cmds.push(["HINCRBY", `mgo:payer:${day}`, `${ev.payer} ${ev.status}`, 1], ["EXPIRE", `mgo:payer:${day}`, TTL]);
  }
  waitUntil(redis(cmds).catch((e) => console.error("[ACCESS] redis fail", e.message)));
}

function accessLog(req, res, next) {
  if (req.method === "OPTIONS") return next();
  const start = Date.now();
  const rawPath = (req.originalUrl || req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (SKIP.has(rawPath)) return next();

  res.on("finish", () => {
    if (rawPath === "/stats") return; // don't count our own stats reads
    const path = KNOWN.test(rawPath) ? rawPath : "(other)";
    record({
      ts: new Date().toISOString(),
      method: req.method,
      path,
      raw: path === "(other)" ? rawPath.slice(0, 80) : undefined,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: crypto.createHash("sha256").update(SALT + clientIp(req)).digest("hex").slice(0, 12),
      ua: String(req.headers["user-agent"] || "").slice(0, 120),
      ref: req.headers["referer"] ? String(req.headers["referer"]).slice(0, 120) : undefined,
      country: req.headers["x-vercel-ip-country"] || undefined,
      mcp: req.body?.method && rawPath === "/mcp" ? `${req.body.method}${req.body.params?.name ? ":" + req.body.params.name : ""}` : undefined,
      payer: payerFrom(req) || undefined,
    });
  });
  next();
}

// GET /stats?key=STATS_KEY&days=14&recent=50
async function statsHandler(req, res) {
  const key = process.env.STATS_KEY;
  if (!key || req.query.key !== key) return res.status(404).json({ error: "Not found" });
  if (!enabled()) return res.status(503).json({ error: "Redis not configured" });

  const days = Math.min(Number(req.query.days) || 14, 120);
  const recentN = Math.min(Number(req.query.recent) || 50, RECENT_MAX);
  const dates = [];
  for (let i = 0; i < days; i++) dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));

  const cmds = [];
  for (const d of dates) {
    cmds.push(["HGETALL", `mgo:d:${d}`], ["PFCOUNT", `mgo:ip:${d}`], ["PFCOUNT", `mgo:ippaid:${d}`], ["HGETALL", `mgo:ua:${d}`], ["HGETALL", `mgo:payer:${d}`]);
  }
  cmds.push(["LRANGE", "mgo:recent", 0, recentN - 1]);
  const out = await redis(cmds);
  const toObj = (arr) => {
    const o = {};
    for (let i = 0; arr && i < arr.length; i += 2) o[arr[i]] = Number(arr[i + 1]);
    return o;
  };

  const daily = dates.map((d, i) => {
    const b = i * 5;
    const hits = toObj(out[b]?.result);
    return {
      date: d,
      total: Object.values(hits).reduce((a, n) => a + n, 0),
      uniqueIps: out[b + 1]?.result || 0,
      uniqueIpsOnPaidEndpoints: out[b + 2]?.result || 0,
      hits,
      userAgents: toObj(out[b + 3]?.result),
      payers: toObj(out[b + 4]?.result),
    };
  });
  const recent = (out[out.length - 1]?.result || []).map((s) => {
    try { return JSON.parse(s); } catch { return s; }
  });
  res.json({ generatedAt: new Date().toISOString(), daily, recent });
}

module.exports = { accessLog, statsHandler };
