/* ==========================================================================
   MindWell — remote companion provider

   Same interface as companion.js, so chat.html can swap between them without
   knowing which is active. Instead of running a model locally this streams
   from the Cloudflare Worker in worker/, which holds the upstream API key.

   Trade-off, stated plainly: conversations leave the device on this path.
   The local provider is the private one.
   ========================================================================== */

import { auth } from "./firebase-config.js";
import { REMOTE_ENDPOINT } from "./config.js";

/* No WebGPU requirement — this works anywhere fetch does. */
export function isSupported() {
  return !!REMOTE_ENDPOINT;
}

export async function availableModels() {
  return [{ id: "remote", label: "Cloud", vram: 0 }];
}

/* Nothing to download; resolve immediately so the gate can hand straight
   over to the chat panel. */
export async function loadModel(_modelId, onProgress) {
  if (!REMOTE_ENDPOINT) throw new Error("No companion endpoint configured");
  if (onProgress) onProgress({ progress: 1, text: "Connecting…" });
}

export function isLoaded() {
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

export async function interrupt() {
  /* The fetch stream ends on its own; nothing to cancel here. */
}
