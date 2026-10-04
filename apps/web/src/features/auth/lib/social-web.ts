import type { SocialAvailability, SocialCredential } from '@chefer/types';

// ─── Sign in with Google / Apple on the web (WP-22) ──────────────────────────
// Both providers hand the browser an OIDC ID token which the API verifies
// (`auth.socialSignIn`). Google: Google Identity Services' own button (its
// iframe is what yields an ID token). Apple: the Sign in with Apple JS popup.
// Neither SDK loads until a button is actually rendered — and only when the API
// says the provider is configured (`auth.socialAvailability`).
//
// CSP: next.config.ts sets no script-src/frame-src today, so these scripts and
// Google's button iframe load. If an allowlist is ever added it needs
// accounts.google.com (script + frame), appleid.cdn-apple.com (script) and
// appleid.apple.com (popup/connect).

export const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
export const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

/** The user closed the provider's popup — not an error to show. */
export class SocialCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'SocialCancelledError';
  }
}

/** The provider's SDK could not be loaded or returned something unusable. */
export class SocialSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialSdkError';
  }
}

/** Everything the API needs from one provider sign-in (a superset of `SocialCredential`). */
export type SocialSignInPayload = SocialCredential & {
  authorizationCode?: string;
  givenName?: string;
  familyName?: string;
};

/** What the web UI may offer, derived from `auth.socialAvailability`. */
export type WebSocialProviders = {
  google: { clientId: string } | null;
  apple: { servicesId: string; redirectUri: string } | null;
};

export function webProvidersFrom(availability: SocialAvailability | undefined): WebSocialProviders {
  const { google, apple } = availability ?? {};
  return {
    google: google?.enabled && google.webClientId ? { clientId: google.webClientId } : null,
    apple:
      apple?.enabled && apple.servicesId && apple.redirectUri
        ? { servicesId: apple.servicesId, redirectUri: apple.redirectUri }
        : null,
  };
}

// ─── Nonce ───────────────────────────────────────────────────────────────────

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh random nonce: `raw` goes to the API, `hashed` (SHA-256 hex) to the provider. */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed: await sha256Hex(raw) };
}

// ─── Script loading ──────────────────────────────────────────────────────────

const scriptPromises = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromises.delete(src); // allow a retry
      el.remove();
      reject(new SocialSdkError(`Could not load ${src}`));
    };
    document.head.appendChild(el);
  });
  scriptPromises.set(src, promise);
  return promise;
}

// ─── Google Identity Services ────────────────────────────────────────────────

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ) => void;
};

type AppleSignInResponse = {
  authorization?: { code?: string; id_token?: string; state?: string };
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
};

type AppleIdAuth = {
  init: (config: {
    clientId: string;
    scope: string;
    redirectURI: string;
    state?: string;
    nonce?: string;
    usePopup: boolean;
  }) => void;
  signIn: () => Promise<AppleSignInResponse>;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
    AppleID?: { auth?: AppleIdAuth };
  }
}

/**
 * Renders Google's own "Continue with Google" button into `parent` and calls
 * `onCredential` with the ID token + the raw nonce when the user finishes.
 * (Google only yields an ID token through its button/One Tap iframe.)
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  options: {
    clientId: string;
    onCredential: (payload: SocialSignInPayload) => void;
    onError: (error: Error) => void;
    width?: number;
    text?: 'signin_with' | 'signup_with' | 'continue_with';
  },
): Promise<void> {
  await loadScript(GOOGLE_GSI_SRC);
  const gsi = window.google?.accounts?.id;
  if (!gsi) throw new SocialSdkError('Google Identity Services is unavailable');
  const nonce = await createNonce();
  gsi.initialize({
    client_id: options.clientId,
    nonce: nonce.hashed,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: ({ credential }) => {
      if (!credential) {
        options.onError(new SocialSdkError('Google returned no credential'));
        return;
      }
      options.onCredential({ provider: 'GOOGLE', idToken: credential, nonce: nonce.raw });
    },
  });
  parent.replaceChildren();
  gsi.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: options.text ?? 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    ...(options.width && { width: Math.min(400, Math.max(200, Math.floor(options.width))) }),
  });
}

// ─── Sign in with Apple JS ───────────────────────────────────────────────────

/** Opens Apple's popup and resolves with the payload for `auth.socialSignIn`. */
export async function requestAppleCredential(config: {
  servicesId: string;
  redirectUri: string;
}): Promise<SocialSignInPayload> {
  await loadScript(APPLE_JS_SRC);
  const auth = window.AppleID?.auth;
  if (!auth) throw new SocialSdkError('Sign in with Apple is unavailable');
  const nonce = await createNonce();
  auth.init({
    clientId: config.servicesId,
    scope: 'name email',
    redirectURI: config.redirectUri,
    nonce: nonce.hashed,
    usePopup: true,
  });
  let response: AppleSignInResponse;
  try {
    response = await auth.signIn();
  } catch (error) {
    // Apple rejects with { error: 'popup_closed_by_user' | 'user_cancelled_authorize' | … }.
    const code =
      typeof error === 'object' && error !== null && 'error' in error ? String(error.error) : '';
    if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') {
      throw new SocialCancelledError();
    }
    throw new SocialSdkError(code || 'Sign in with Apple failed');
  }
  const idToken = response.authorization?.id_token;
  if (!idToken) throw new SocialSdkError('Apple returned no identity token');
  // Apple sends the name only on the very first authorization, outside the token.
  const name = response.user?.name;
  const code = response.authorization?.code;
  return {
    provider: 'APPLE',
    idToken,
    nonce: nonce.raw,
    ...(code && { authorizationCode: code }),
    ...(name?.firstName && { givenName: name.firstName }),
    ...(name?.lastName && { familyName: name.lastName }),
  };
}
