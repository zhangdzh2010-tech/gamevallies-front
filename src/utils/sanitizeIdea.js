// src/utils/sanitizeIdea.js
//
// Frontend safety-net for H.5.1: the backend currently stores the full LLM prompt
// (user idea + English spec template) into `game.description`. Before we finish
// the backend schema split, the frontend must strip the template tail so users
// never see raw prompt scaffolding like "Game Type: ..." / "Core Mechanic: ...".
//
// Always run raw descriptions through `sanitizeUserIdea` before rendering them
// on iterate / fork / detail pages.

const TEMPLATE_TAIL_PATTERNS = [
  // Chinese instruction that precedes the English spec block.
  /\s*请把这条想法整理成[\s\S]*$/,
  // First English spec field marker - everything from here is prompt template.
  /\s*(?:\n|^)?\s*(?:Game Type|Core Mechanic|Theme|Input Method|Win Condition|Difficulty Ramp|Scoring\s*\/\s*Rewards|Visual Direction|Special Rules[^:\n]*)\s*[:：][\s\S]*$/i,
];

const PREFIX_PATTERNS = [
  /^\s*原始想法\s*[:：]\s*/,
  /^\s*用户想法\s*[:：]\s*/,
  /^\s*User\s*Idea\s*[:：]\s*/i,
];

/**
 * Strip LLM prompt-template boilerplate from a description that is meant to be
 * shown directly to end users (e.g. on iterate / fork / detail pages).
 *
 * Keeps the user-authored portion intact. Safe to call on already-clean text.
 *
 * @param {string} raw - The raw description string, possibly polluted.
 * @returns {string} The cleaned, user-facing idea.
 */
export function sanitizeUserIdea(raw = '') {
  if (raw == null) return '';
  let text = String(raw);

  for (const pattern of PREFIX_PATTERNS) {
    text = text.replace(pattern, '');
  }

  for (const pattern of TEMPLATE_TAIL_PATTERNS) {
    text = text.replace(pattern, '');
  }

  return text.trim();
}

export default sanitizeUserIdea;
