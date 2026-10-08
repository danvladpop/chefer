'use client';

import { useEffect, useRef } from 'react';
import { renderGoogleButton, type SocialSignInPayload } from '../lib/social-web';

/**
 * Google's own button (Google Identity Services) — the only way a browser gets
 * an ID token from Google. Reserves a 44px-tall slot so the layout does not
 * jump when the script arrives. `onCredential`/`onError` may change identity
 * between renders without re-rendering Google's iframe.
 */
export function GoogleSignInButton({
  clientId,
  text = 'continue_with',
  onCredential,
  onError,
}: {
  clientId: string;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onCredential: (payload: SocialSignInPayload) => void;
  onError: (error: Error) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };

  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const controller = new AbortController();
    renderGoogleButton(el, {
      clientId,
      text,
      width: el.clientWidth,
      signal: controller.signal,
      onCredential: (payload) => handlers.current.onCredential(payload),
      onError: (error) => handlers.current.onError(error),
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        handlers.current.onError(error instanceof Error ? error : new Error('Google unavailable'));
      }
    });
    return () => {
      controller.abort();
      el.replaceChildren();
    };
  }, [clientId, text]);

  return (
    <div
      ref={slot}
      data-testid="google-sign-in-slot"
      className="flex min-h-11 w-full items-center justify-center overflow-hidden"
    />
  );
}
