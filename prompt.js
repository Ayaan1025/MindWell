/* ==========================================================================
   MindWell — companion prompt and safety layer

   Provider-agnostic: the system prompt the companion runs under, and the
   crisis detection that runs alongside it. Kept separate from the transport
   so swapping backends can never quietly drop the safety wording.
   ========================================================================== */

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
