// Navigation guards for the in-app WebViews (App Review R-01). The app's two
// web views each show ONE fixed piece of content; anything else the user can
// tap inside them (YouTube logo/title links, "Open App", the site's own nav,
// outside links such as the data-protection authority, mailto:) must leave
// the WebView and open in the system browser, so neither view can become a
// general-purpose browser ("Unrestricted Web Access").

/** Sub-resources of an inline-HTML page; never a navigation the user caused. */
const INERT_SCHEMES = ['about:', 'data:', 'blob:'];

function isInert(url: string): boolean {
  return INERT_SCHEMES.some((scheme) => url.startsWith(scheme));
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Legal pages: allow the requested page itself (with its query string or
 * #anchors, e.g. `/privacy#analytics`) and nothing else. `/privacy-foo` or
 * `/privacy/../login` do not match.
 */
export function shouldLoadLegalUrl(url: string, pageUrl: string): boolean {
  if (isInert(url)) return true;
  const base = stripTrailingSlash(pageUrl);
  if (!url.startsWith(base)) return false;
  const rest = url.slice(base.length);
  return rest === '' || rest === '/' || /^[?#]/.test(rest) || /^\/[?#]/.test(rest);
}

/**
 * Video sheet: the WebView hosts our own inline HTML (baseUrl = the API
 * origin) holding one youtube-nocookie `/embed/<id>` iframe. Allowed: the
 * document itself, inert schemes, and, for the iframe only, the embed host
 * (the player's own frames). Top-frame navigation to anything else, including
 * the same YouTube host's watch page, is refused, as is any tapped link.
 * `isTopFrame` and `navigationType` are only reported by iOS; Android omits
 * them (treated as top frame, which is the strict reading).
 */
export function shouldLoadEmbedUrl(
  url: string,
  opts: {
    baseOrigin: string;
    embedHost: string;
    isTopFrame?: boolean | undefined;
    /** iOS only. A tapped link is `click`; the player's own frame loads are `other`. */
    navigationType?: string | undefined;
  },
): boolean {
  if (isInert(url)) return true;
  // A link the user tapped (logo, title, "Watch on YouTube") never loads in
  // here, whichever frame it targets.
  if (opts.navigationType === 'click') return false;
  const isTopFrame = opts.isTopFrame ?? true;
  // The initial html load is reported with the baseUrl.
  if (url === opts.baseOrigin || url === `${opts.baseOrigin}/`) return true;
  const embedPrefix = `https://${opts.embedHost}/embed/`;
  if (url.startsWith(embedPrefix)) return true;
  // Player-internal frames (ads/consent/analytics iframes inside the embed)
  // load as sub-frames; they are not navigation the user can browse with.
  if (!isTopFrame && url.startsWith('https://')) return true;
  return false;
}
