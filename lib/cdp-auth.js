// CDP facilitator auth helper
// Uses dynamic import() to avoid ESM/CJS conflict with jose in Vercel serverless
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
const FACILITATOR_HOST = "api.cdp.coinbase.com";

function createCdpFacilitatorConfig(apiKeyId, apiKeySecret) {
  return {
    url: FACILITATOR_URL,
    createAuthHeaders: createCdpAuthHeaders(apiKeyId, apiKeySecret),
  };
}

function createCdpAuthHeaders(apiKeyId, apiKeySecret) {
  return async () => {
    const headers = {};
    if (!apiKeyId || !apiKeySecret) {
      console.error("[cdp] CDP_API_KEY_ID / CDP_API_KEY_SECRET missing; sending unauthenticated facilitator requests");
    }
    if (apiKeyId && apiKeySecret) {
      const authVerify = await createAuthHeader(apiKeyId, apiKeySecret, "POST", FACILITATOR_HOST, "/platform/v2/x402/verify");
      const authSettle = await createAuthHeader(apiKeyId, apiKeySecret, "POST", FACILITATOR_HOST, "/platform/v2/x402/settle");
      const authSupported = await createAuthHeader(apiKeyId, apiKeySecret, "GET", FACILITATOR_HOST, "/platform/v2/x402/supported");
      headers.verify = { Authorization: authVerify };
      headers.settle = { Authorization: authSettle };
      headers.supported = { Authorization: authSupported };
      headers.list = { Authorization: await createAuthHeader(apiKeyId, apiKeySecret, "GET", FACILITATOR_HOST, "/platform/v2/x402/discovery/resources") };
    }
    return headers;
  };
}

async function createAuthHeader(apiKeyId, apiKeySecret, method, host, path) {
  // Dynamic import to avoid ESM/CJS conflict
  const { SignJWT, importPKCS8, base64url } = await import("jose");
  const crypto = require("crypto");

  // Back-date iat/nbf by 30s so a slightly fast serverless clock cannot make
  // CDP reject the token as "not yet valid" (one suspected cause of cold-start 401s).
  const now = Math.floor(Date.now() / 1000) - 30;
  const nonce = crypto.randomBytes(16).toString("hex");

  const claims = {
    sub: apiKeyId,
    iss: "cdp",
    uris: [`${method} ${host}${path}`],
  };

  // Try EC (PEM) key first, then Ed25519
  let jwt;
  if (apiKeySecret.includes("PRIVATE KEY")) {
    // Accepts both SEC1 ("BEGIN EC PRIVATE KEY") and PKCS#8 ("BEGIN PRIVATE KEY") PEM.
    const key = crypto.createPrivateKey(apiKeySecret.replace(/\\n/g, "\n"));
    jwt = await new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: apiKeyId, nonce, typ: "JWT" })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 150)
      .sign(key);
  } else {
    // Ed25519 key (base64)
    const keyBytes = Buffer.from(apiKeySecret, "base64");
    // Ed25519 seed is 32 bytes, full key is 64 bytes
    const seed = keyBytes.length === 64 ? keyBytes.slice(0, 32) : keyBytes;
    const pkcs8 = Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]);
    const key = await importPKCS8(
      `-----BEGIN PRIVATE KEY-----\n${pkcs8.toString("base64")}\n-----END PRIVATE KEY-----`,
      "EdDSA"
    );
    jwt = await new SignJWT(claims)
      .setProtectedHeader({ alg: "EdDSA", kid: apiKeyId, nonce, typ: "JWT" })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 150)
      .sign(key);
  }

  return `Bearer ${jwt}`;
}

module.exports = { createCdpFacilitatorConfig };
