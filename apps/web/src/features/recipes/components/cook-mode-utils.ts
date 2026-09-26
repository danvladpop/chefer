// Moved to @chefer/utils (shared with apps/mobile — Platform Parity,
// shared-first). This shim keeps existing web imports stable.
export { guessMealType, parseStepDuration } from '@chefer/utils';

// ── Keyboard shortcuts (web only, audit F-REC-6-5) ────────────────────────────

const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]';
// Space activates these natively — never hijack it there.
const SPACE_ACTIVATED_SELECTOR =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"]';

function targetMatches(e: KeyboardEvent, selector: string): boolean {
  const t = e.target;
  return t instanceof Element && t.closest(selector) !== null;
}

/** A cook-mode shortcut must not fire with a modifier held or while the user types. */
export function shouldIgnoreCookModeKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return true;
  return targetMatches(e, TEXT_ENTRY_SELECTOR);
}

/** True when Space should keep its native meaning (focus is on a button, link, …). */
export function isSpaceOwnedByTarget(e: KeyboardEvent): boolean {
  return targetMatches(e, SPACE_ACTIVATED_SELECTOR);
}
