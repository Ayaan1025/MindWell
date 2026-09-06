/* ==========================================================================
   MindWell — Companion engine

   Wraps WebLLM so chat.html can stay focused on UI and Firestore. The model
   runs entirely on the user's GPU via WebGPU: no API key, no backend, no
   request ever leaves the device. For a mood journal that privacy property
   is the main reason to prefer in-browser inference over a hosted API.

   Exports:
     isSupported()                    -> bool
     availableModels()                -> [{ id, vram, label }]
     loadModel(id, onProgress)        -> Promise<void>
     streamReply(messages, onToken)   -> Promise<string>
     buildSystemPrompt(entries)       -> string
     detectCrisis(text)               -> bool
   ========================================================================== */

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

let webllm = null;
let engine = null;
let loadedModelId = null;

/* WebGPU is the hard requirement. Chrome and Edge are reliable; Safari 18+
   works; Firefox support is uneven. */
export function isSupported() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

async function lib() {
  if (!webllm) webllm = await import(WEBLLM_URL);
  return webllm;
}

/* Preference order, smallest first. These are resolved against the live
   prebuilt list rather than trusted blindly, so a model being renamed or
   dropped upstream degrades to "fewer choices" instead of a hard failure. */
const PREFERRED = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",  label: "Light" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",  label: "Light+" },
  { id: "gemma-2-2b-it-q4f16_1-MLC",          label: "Balanced" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",  label: "Balanced" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC",  label: "Deeper" }
];

export async function availableModels() {
  const w = await lib();
  const list = (w.prebuiltAppConfig && w.prebuiltAppConfig.model_list) || [];
  const byId = new Map(list.map(m => [m.model_id, m]));

  const matched = PREFERRED
    .filter(p => byId.has(p.id))
    .map(p => ({
      id: p.id,
      label: p.label,
      vram: Math.round(byId.get(p.id).vram_required_MB || 0)
    }));

  if (matched.length) return matched;

  // Nothing from the preference list survived upstream — fall back to the
  // two smallest models flagged as low-resource.
  return list
    .filter(m => m.low_resource_required && m.vram_required_MB)
    .sort((a, b) => a.vram_required_MB - b.vram_required_MB)
    .slice(0, 2)
    .map(m => ({
      id: m.model_id,
      label: "Available",
      vram: Math.round(m.vram_required_MB)
    }));
}

export async function loadModel(modelId, onProgress) {
  if (engine && loadedModelId === modelId) return;
  const w = await lib();

  if (engine) {
    await engine.reload(modelId);
  } else {
    engine = await w.CreateMLCEngine(modelId, {
      initProgressCallback: report => {
        if (onProgress) onProgress(report);
      }
    });
  }
  loadedModelId = modelId;
}

export function isLoaded() {
  return !!engine;
}

/* Streams a reply token by token. Returns the assembled text so the caller
   can push it onto the transcript. */
export async function streamReply(messages, onToken) {
  if (!engine) throw new Error("Model not loaded");

  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 420
  });

  let full = "";
  for await (const chunk of chunks) {
    const bit = (chunk.choices &&
                 chunk.choices[0] &&
                 chunk.choices[0].delta &&
                 chunk.choices[0].delta.content) || "";
    if (bit) {
      full += bit;
      if (onToken) onToken(bit, full);
    }
  }
  return full.trim();
}

export async function interrupt() {
  if (engine && engine.interruptGenerate) await engine.interruptGenerate();
}

/* --------------------------------------------------------------------------
   System prompt
   -------------------------------------------------------------------------- */

const BASE_PROMPT = [
  "You are a warm, grounded listening companion inside MindWell, a personal mood journal.",
  "",
  "How you talk:",
  "- Listen first. Reflect back what you heard before offering anything.",
  "- Keep replies short: two to four sentences.",
  "- Ask at most one open question per reply.",
  "- Validate the feeling without minimising it and without rushing to fix it.",
  "- Suggest a simple grounding or breathing step only when it genuinely fits.",
  "",
  "Firm boundaries:",
  "- You are not a therapist, doctor, or crisis service, and you never imply otherwise.",
  "- Never diagnose. Never discuss medication. Never give medical advice.",
  "- If someone may be in danger, warmly and directly point them to 988 (US Suicide & Crisis Lifeline, call or text) or local emergency services. Do not try to counsel them through it alone.",
  "- Never claim to remember conversations beyond what is written here."
].join("\n");

/* Recent entries give the companion enough continuity to notice a pattern
   without handing it the entire journal. */
export function buildSystemPrompt(entries) {
  if (!entries || !entries.length) return BASE_PROMPT;

  const lines = entries.map(e => {
    const note = (e.reflection || "").replace(/\s+/g, " ").slice(0, 160);
    return "  " + e.date + "  " + e.mood + (note ? ' - "' + note + '"' : "");
  });

  return BASE_PROMPT +
    "\n\nThe person's recent check-ins, newest last. Reference these only if " +
    "it is natural to; do not recite them back.\n" +
    lines.join("\n");
}

/* --------------------------------------------------------------------------
   Crisis detection

   Deliberately high-recall and dumb. It only ever *adds* a banner pointing at
   real help — it never blocks the conversation, and it never suppresses or
   replaces the model's reply. A false positive costs a visible resource card;
   a false negative costs much more.
   -------------------------------------------------------------------------- */

const CRISIS_PATTERNS = [
  /\bkill(?:ing)?\s+(?:my\s*self|myself)\b/i,
  /\b(?:end|ending)\s+(?:my|it)\s+(?:life|all)\b/i,
  /\bend\s+it\s+all\b/i,
  /\bwant(?:ing)?\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(?:be\s+here|live|wake\s+up)\b/i,
  /\bbetter\s+off\s+(?:dead|without\s+me)\b/i,
  /\bno\s+(?:reason|point)\s+(?:to|in)\s+living\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\b(?:hurt|harm|cut)(?:ting)?\s+my\s*self\b/i,
  /\bself[-\s]?harm\b/i,
  /\boverdos(?:e|ing)\b/i,
  /\bnot\s+worth\s+living\b/i
];

export function detectCrisis(text) {
  if (!text) return false;
  return CRISIS_PATTERNS.some(re => re.test(text));
}
