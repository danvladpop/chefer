import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function run(path: string, { ua, signedIn = false }: { ua: string; signedIn?: boolean }) {
  const headers = new Headers({ 'user-agent': ua });
  if (signedIn) headers.set('cookie', 'chefer_session=abc');
  return middleware(new NextRequest(`https://chefer.test${path}`, { headers }));
}

const rewrittenTo = (res: Response) => res.headers.get('x-middleware-rewrite');
const redirectedTo = (res: Response) => res.headers.get('location');

describe('middleware: coaching invite links', () => {
  it.each([IPHONE, ANDROID])('signed out on a phone: the app page, same address', (ua) => {
    const res = run('/coaching/join/AbC-123', { ua });
    expect(redirectedTo(res)).toBeNull();
    expect(rewrittenTo(res)).toBe('https://chefer.test/coaching-invite/AbC-123');
  });

  it('signed out on a desktop: sign in, then back to the invite', () => {
    const res = run('/coaching/join/AbC-123', { ua: DESKTOP });
    expect(rewrittenTo(res)).toBeNull();
    expect(redirectedTo(res)).toBe('https://chefer.test/login?next=%2Fcoaching%2Fjoin%2FAbC-123');
  });

  it('a malformed code on a phone is not rewritten', () => {
    const res = run('/coaching/join/bad%20code', { ua: IPHONE });
    expect(rewrittenTo(res)).toBeNull();
    expect(redirectedTo(res)).toContain('/login?next=');
  });

  it('signed in on a phone: the normal join page', () => {
    const res = run('/coaching/join/AbC-123', { ua: IPHONE, signedIn: true });
    expect(rewrittenTo(res)).toBeNull();
    expect(redirectedTo(res)).toBeNull();
  });

  it('other protected pages on a phone still go to sign in', () => {
    const res = run('/coaching/find', { ua: IPHONE });
    expect(redirectedTo(res)).toBe('https://chefer.test/login?from=%2Fcoaching%2Ffind');
  });
});
