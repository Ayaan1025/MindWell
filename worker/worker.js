/* ==========================================================================
   MindWell — companion proxy Worker

   Holds the upstream API key so it never reaches the browser, and only
   forwards requests that carry a valid Firebase ID token from this project.
   Without that check the endpoint URL — which IS public, it ships in the
   client bundle — would let anyone spend the quota.

   Upstream is any OpenAI-compatible /chat/completions endpoint:
     Groq        https://api.groq.com/openai/v1/chat/completions
     OpenRouter  https://openrouter.ai/api/v1/chat/completions
     Cerebras    https://api.cerebras.ai/v1/chat/completions
     Gemini      https://generativelanguage.googleapis.com/v1beta/openai/chat/completions

   Bindings (see wrangler.toml):
     API_KEY              secret  — set with `wrangler secret put API_KEY`
     UPSTREAM_URL         var
     MODEL                var
     FIREBASE_PROJECT_ID  var
     ALLOWED_ORIGIN       var     — exact origin, or * while developing
   ========================================================================== */

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const MAX_MESSAGES = 24;
const MAX_CHARS = 12000;
const MAX_TOKENS = 420;

/* JWKS rarely rotates; cache per isolate so we aren't refetching every turn. */
let jwksCache = null;
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks() {
  const now = Date.now();
  if (jwksCache && now - jwksFetchedAt < JWKS_TTL_MS) return jwksCache;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("Could not fetch Google signing keys");
  const data = await res.json();
  jwksCache = data.keys || [];
  jwksFetchedAt = now;
  return jwksCache;
}

function b64urlToBytes(str) {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(str) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(str)));
}

/* Full RS256 verification: signature against Google's JWKS, then the
   issuer/audience/expiry claims. All of it matters — checking the claims
   without checking the signature would accept a forged token. */
async function verifyFirebaseToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    // Don't surface decoder internals to the caller.
    throw new Error("Malformed token");
  }

  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");

  const keys = await getJwks();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error("Unknown signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.n ? "RSA" : jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), signed
  );
  if (!ok) throw new Error("Bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error("Token expired");
  if (payload.iat > now + 300) throw new Error("Token issued in the future");
  if (payload.aud !== projectId) throw new Error("Wrong audience");
  if (payload.iss !== "https://securetoken.google.com/" + projectId) {
    throw new Error("Wrong issuer");
  }
  if (!payload.sub) throw new Error("Missing subject");

  return payload;
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonError(message, status, env) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== "POST") {
      return jsonError("Use POST", 405, env);
    }

    // --- auth ---
    const authz = request.headers.get("Authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return jsonError("Missing bearer token", 401, env);

    try {
      await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    } catch (e) {
      return jsonError("Not signed in: " + e.message, 401, env);
    }

    // --- validate payload ---
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("Body must be JSON", 400, env);
    }

    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || !messages.length) {
      return jsonError("messages[] required", 400, env);
    }
    if (messages.length > MAX_MESSAGES) {
      return jsonError("Too many messages", 413, env);
    }

    const totalChars = messages.reduce(
      (n, m) => n + String((m && m.content) || "").length, 0);
    if (totalChars > MAX_CHARS) {
      return jsonError("Conversation too long", 413, env);
    }

    // Only the fields we intend to forward — never spread the client body,
    // or a caller could set their own model and burn quota on it.
    const upstreamBody = {
      model: env.MODEL,
      messages: messages.map(m => ({
        role: String(m.role || "user"),
        content: String(m.content || "")
      })),
      stream: true,
      temperature: 0.7,
      max_tokens: MAX_TOKENS
    };

    // --- forward ---
    let upstream;
    try {
      upstream = await fetch(env.UPSTREAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + env.API_KEY
        },
        body: JSON.stringify(upstreamBody)
      });
    } catch (e) {
      return jsonError("Upstream unreachable", 502, env);
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      // Don't echo the upstream body verbatim; it can carry key hints.
      console.log("upstream error", upstream.status, detail.slice(0, 400));
      return jsonError("Upstream error " + upstream.status, 502, env);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders(env)
      }
    });
  }
};
