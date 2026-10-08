import { TRPCError } from '@trpc/server';
import type { Response } from 'express';
import { userRepository } from '@chefer/database';
import {
  AI_CONSENT_REQUIRED_HEADER,
  AI_CONSENT_REQUIRED_MESSAGE,
  AI_CONSENT_REQUIRED_REASON,
} from '@chefer/types';

// ─── AI-data consent server gate (App Store 5.1.2(i), R-10) ───────────────────
// Until R-10 the consent (`User.aiDataConsentAt`) was enforced only by the
// clients' consent sheet: an old binary, a stale cache or a consent revoked on
// another device still sent the user's data to the AI provider. This is the
// server-side half. `AI_CONSENT_ENFORCE`:
//
//   on   (default) an AI action from a user with no consent on record is
//        refused with `AI_CONSENT_REQUIRED`
//   off  nothing is refused (the pre-R-10 behaviour; an emergency switch)
//
// A user who HAS consented is never refused. Every shipped client already asks
// before it calls the AI, so for them the gate is invisible; one that shows a
// generic error instead of the sheet still displays the message, which says
// where to switch AI on.
//
// Used three ways:
//   - `requireAiConsent()` (lib/trpc.ts) / `aiConsentProcedure` — procedures
//     that always call the AI
//   - `assertAiConsent()` — a service that only SOMETIMES reaches the AI (a
//     catalog hit needs none; free swaps are curated)
//   - `rejectWithoutAiConsent()` — the plain-HTTP endpoints (/api/chat,
//     /api/scan-meal), which answer 403 + `reason`

export type AiConsentEnforce = 'off' | 'on';

/** Marks the rejection so the errorFormatter can expose `data.reason`. */
export class AiConsentRequiredCause extends Error {
  constructor() {
    super(AI_CONSENT_REQUIRED_REASON);
  }
}

/**
 * `AI_CONSENT_ENFORCE` from the validated env, imported lazily for the same
 * reason as health-consent.ts: lib/env.ts validates (and throws on) the
 * process environment at import time and this module sits in lib/trpc.ts's
 * import graph. In the running server env.ts has long since loaded, so this
 * resolves from the module cache; where env can't load (a bare unit test) or
 * the key is absent (a test's partial env mock) nothing is enforced — the
 * shipped default (`on`) comes from env.ts's schema, not from here.
 */
async function configuredMode(): Promise<AiConsentEnforce> {
  try {
    const { env } = await import('./env.js');
    return env.AI_CONSENT_ENFORCE === 'on' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/**
 * True when this user must be refused: enforcement is on and no consent is on
 * record. Reads the consent cache column only when enforcement applies.
 */
export async function aiConsentMissing(params: {
  userId: string;
  /** Test seam; defaults to the validated env. */
  mode?: AiConsentEnforce;
}): Promise<boolean> {
  const mode = params.mode ?? (await configuredMode());
  if (mode !== 'on') return false;
  return (await userRepository.findAiDataConsentAt(params.userId)) === null;
}

/** The typed rejection: FORBIDDEN, `data.reason = 'AI_CONSENT_REQUIRED'`. */
export function aiConsentRequiredError(): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message: AI_CONSENT_REQUIRED_MESSAGE,
    cause: new AiConsentRequiredCause(),
  });
}

/** Throws the typed rejection when {@link aiConsentMissing}. */
export async function assertAiConsent(params: {
  userId: string;
  mode?: AiConsentEnforce;
}): Promise<void> {
  if (await aiConsentMissing(params)) throw aiConsentRequiredError();
}

/**
 * Plain-HTTP variant: answers `403 { error, reason }` + the
 * `X-AI-Consent-Required` header and returns true when the user must be
 * refused (the caller returns). `error` is a plain string so installed
 * binaries that show `data.error` verbatim display real copy.
 */
export async function rejectWithoutAiConsent(
  res: Response,
  params: { userId: string; mode?: AiConsentEnforce },
): Promise<boolean> {
  if (!(await aiConsentMissing(params))) return false;
  res.setHeader(AI_CONSENT_REQUIRED_HEADER, '1');
  res.status(403).json({ error: AI_CONSENT_REQUIRED_MESSAGE, reason: AI_CONSENT_REQUIRED_REASON });
  return true;
}
