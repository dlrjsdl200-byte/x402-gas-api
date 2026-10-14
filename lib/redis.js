// Minimal Upstash Redis REST client (no SDK dependency).
// Env: UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN (Vercel Marketplace).
// All helpers are best-effort: callers must tolerate `null` when Redis is absent or slow.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const enabled = () => Boolean(REDIS_URL && REDIS_TOKEN);

// Run a pipeline of commands. Returns array of { result } | { error }, or null on failure.
async function pipeline(commands, timeoutMs = 1500) {
  if (!enabled()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error("[redis]", e.message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function get(key) {
  const out = await pipeline([["GET", key]]);
  return out?.[0]?.result ?? null;
}

async function setex(key, ttlSec, value) {
  return pipeline([["SET", key, value, "EX", ttlSec]]);
}

module.exports = { enabled, pipeline, get, setex };
