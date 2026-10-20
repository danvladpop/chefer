import { COACHING_CONSENT_COPY_VERSION, LEGAL_VERSIONS } from '@chefer/types';

// ─── The coaching consent copy version (trainer mode M3, §10) ─────────────────
// A granted COACHING_SHARING event records which consent copy the client read:
// "<privacy version>+coaching-v<N>". Withdrawals keep the plain privacy version.

export const COACHING_CONSENT_DOCUMENT_VERSION = `${LEGAL_VERSIONS.privacy}+coaching-v${COACHING_CONSENT_COPY_VERSION}`;
