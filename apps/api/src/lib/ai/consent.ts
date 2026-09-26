// ─── AI data consent hook (App Store 5.1.2(i)) ───────────────────────────────
// Shadow mode sends a user's request to a SECOND provider, so it must only run
// for users who consented to AI data sharing. The consent column
// (users.aiDataConsentAt) arrives with PR #45, which is not in this branch's
// base yet — until it is, this hook answers "no" for everyone, so shadow mode
// is fail-closed and never runs.
//
// TODO(PR #45): once users.aiDataConsentAt exists, replace the body with:
//   const row = await prisma.user.findUnique({
//     where: { id: userId },
//     select: { aiDataConsentAt: true },
//   });
//   return row?.aiDataConsentAt != null;
// (import { prisma } from '@chefer/database'), and add a test for both cases.

export function hasAiDataConsent(_userId: string): Promise<boolean> {
  return Promise.resolve(false);
}
