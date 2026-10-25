/* ==========================================================================
   MindWell — companion transport

   Streams replies from the Cloudflare Worker in worker/, which holds the
   upstream API key so it never reaches the browser. The prompt and crisis
   layer live in prompt.js.

   Conversations leave the device on this path. An earlier in-browser WebLLM
   provider kept them local; it was removed for speed and quality, and is
   recoverable from git history if that trade-off ever needs revisiting.
   ========================================================================== */

import { auth } from "./firebase-config.js";
import { REMOTE_ENDPOINT } from "./config.js";

/* False only when config.js has no endpoint set. */
export function isConfigured() {
  return !!REMOTE_ENDPOINT;
}

async function idToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return user.getIdToken();
}

/* Reads the SSE stream the Worker pipes back from the upstream provider and
   hands tokens to the caller as they arrive. */
export async function streamReply(messages, onToken) {
  const token = await idToken();

  const res = await fetch(REMOTE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify({ messages })
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error || "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || "Request failed (" + res.status + ")");
  }
  if (!res.body) throw new Error("No response stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line.
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const evt of events) {
      for (const line of evt.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return full.trim();

        try {
          const json = JSON.parse(payload);
          const bit =
            (json.choices &&
             json.choices[0] &&
             json.choices[0].delta &&
             json.choices[0].delta.content) || "";
          if (bit) {
            full += bit;
            if (onToken) onToken(bit, full);
          }
        } catch {
          /* keep-alive comments and partial frames — skip */
        }
      }
    }
  }

  return full.trim();
}
