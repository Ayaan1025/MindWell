# MindWell companion proxy

A Cloudflare Worker that holds the LLM API key so the browser never sees it,
and only answers requests carrying a valid Firebase ID token from this project.

Total cost: **$0**. Cloudflare's free plan allows 100k requests/day with no
credit card. Groq's free tier serves Llama 3.3 70B.

---

## 1. Get an API key

Pick one (all have free tiers, all OpenAI-compatible):

| Provider | Key from | `UPSTREAM_URL` |
|---|---|---|
| **Groq** (recommended) | [console.groq.com/keys](https://console.groq.com/keys) | `https://api.groq.com/openai/v1/chat/completions` |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | `https://openrouter.ai/api/v1/chat/completions` |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai) | `https://api.cerebras.ai/v1/chat/completions` |
| Google AI Studio | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |

Copy the key somewhere temporary. **Do not paste it into any file in this repo.**

## 2. Install wrangler and log in

```bash
npm install -g wrangler
wrangler login
```

## 3. Store the key as a secret

From inside `worker/`:

```bash
wrangler secret put API_KEY
```

It prompts, you paste, and the value is stored encrypted on Cloudflare. It is
never written to disk, never appears in `wrangler.toml`, and never enters git.
This is the whole reason the Worker exists.

## 4. Deploy

```bash
wrangler deploy
```

You get a URL like `https://mindwell-companion.<subdomain>.workers.dev`.

## 5. Point the app at it

In `../config.js`:

```js
export const REMOTE_ENDPOINT = "https://mindwell-companion.<subdomain>.workers.dev";
```

That URL is public and safe to commit — the Worker rejects any request
without a valid Firebase ID token.

The Companion page now offers a **Cloud** option next to the on-device ones.

## 6. Lock the origin before going public

While testing, `ALLOWED_ORIGIN = "*"` is fine. Once deployed, set it in
`wrangler.toml` to your real origin and redeploy:

```toml
ALLOWED_ORIGIN = "https://ayaan1025.github.io"
```

---

## What the Worker checks

Every request must carry `Authorization: Bearer <firebase-id-token>`. The
Worker verifies:

- the RS256 signature against Google's published JWKS
- `aud` matches `FIREBASE_PROJECT_ID`
- `iss` is `https://securetoken.google.com/<project>`
- the token has not expired

It also caps messages per request (24), total characters (12k), and
`max_tokens` (420), and forwards only the fields it chose — the client cannot
pick its own model and spend your quota on something expensive.

## Local development

```bash
echo "API_KEY=your_key_here" > .dev.vars
wrangler dev
```

`.dev.vars` is gitignored. Verify with `git check-ignore -v worker/.dev.vars`
before committing anything.

## Cost control

The free tiers are per-account, not per-user, so every visitor to your
deployed app shares them. If it ever gets real traffic, add per-user rate
limiting with a [KV namespace](https://developers.cloudflare.com/kv/) or a
Durable Object keyed on the token's `sub` claim.
