// What a web feedback submission carries besides the message (UX-PO-05): the
// screen (pathname), the browser/OS and a build label, as the optional
// `route` / `os` / `build` fields of `feedback.submit` (mobile sends its
// version line, iOS/Android version and expo-router path).

/** "Chrome on macOS" from a user-agent string; falls back to a short raw prefix. */
export function describeBrowser(userAgent: string): string {
  const ua = userAgent;
  const has = (...needles: string[]) => needles.some((needle) => ua.includes(needle));
  const browser = has('Edg/')
    ? 'Edge'
    : has('OPR/', 'Opera')
      ? 'Opera'
      : has('Firefox/')
        ? 'Firefox'
        : has('Chrome/', 'CriOS/')
          ? 'Chrome'
          : has('Safari/')
            ? 'Safari'
            : null;
  const os = has('iPhone', 'iPad', 'iPod')
    ? 'iOS'
    : has('Android')
      ? 'Android'
      : has('Mac OS X', 'Macintosh')
        ? 'macOS'
        : has('Windows')
          ? 'Windows'
          : has('Linux', 'X11')
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return (browser ?? os ?? ua.slice(0, 40)) || 'unknown';
}

export function webFeedbackContext(pathname: string | null, userAgent: string) {
  return {
    build: 'Chefer web',
    os: describeBrowser(userAgent),
    ...(pathname ? { route: pathname } : {}),
  };
}
