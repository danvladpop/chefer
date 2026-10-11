// ─── Usage guardrails (Phase 1, 2026-10-11) ───────────────────────────────────
// Hard limits that protect the 1 GB production VM, shared by the API (which
// enforces them) and the web + mobile clients (which mirror them so the user
// hears about a limit before the request is sent). Per-tier DAILY limits live
// in PLAN_FEATURES (plan-features.ts); these are size/shape limits, plus the
// photo storage quota, which is a running total and not a daily limit (so it
// cannot be a PLAN_FEATURES entry: every number there reads as "per day").

const MB = 1024 * 1024;

export const CHAT_LIMITS = {
  /** Longest chat message a user may send (characters). Enforced server-side. */
  maxMessageChars: 500,
  /** Clients show a character counter from here on. */
  counterFromChars: 400,
  /** How many of the newest thread messages the model sees (and clients send). */
  historyMessages: 12,
  /**
   * Earlier messages in the history are cut to this length server-side (a
   * long assistant reply is normal; a tampered client is not).
   */
  maxHistoryMessageChars: 4000,
  /** JSON body limit of POST /api/chat. */
  maxBodyBytes: 64 * 1024,
} as const;

export const CHAT_MESSAGE_TOO_LONG_MESSAGE = `That message is too long. Keep it under ${CHAT_LIMITS.maxMessageChars.toLocaleString('en-US')} characters.`;

export const UPLOAD_LIMITS = {
  /** Largest upload body POST /api/uploads/image accepts. */
  maxBytes: 5 * MB,
  /**
   * Long edge, in px, photos are resized to (client before upload, server
   * after). 1080 is sharp on a phone screen and keeps a photo ~100–250 KB
   * (owner decision 2026-10-11).
   */
  maxLongEdgePx: 1080,
  /** JPEG quality the clients re-encode at (0–1); the server uses the same. */
  jpegQuality: 0.75,
  /** Uploads per user per rolling 24 h. */
  uploadsPerDay: 60,
  /** Total stored photo bytes per user, by tier. */
  storageBytes: { free: 200 * MB, premium: 1024 * MB },
} as const;
