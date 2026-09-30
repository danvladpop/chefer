// The attribution domain for an imported recipe (Q-F-7): the hostname of its
// source URL without "www.". Parsed with a pattern, not `new URL()`: React
// Native's URL polyfill doesn't implement `hostname`, and this file is shared.

const HTTP_AUTHORITY = /^https?:\/\/([^/?#\s]+)/i;
const HOSTNAME =
  /^[\p{L}\p{N}]([\p{L}\p{N}-]*[\p{L}\p{N}])?(\.[\p{L}\p{N}]([\p{L}\p{N}-]*[\p{L}\p{N}])?)*$/u;

/** `https://www.bbcgoodfood.com/x` → `bbcgoodfood.com`; invalid or non-http(s) → `null`. */
export function sourceDomainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/\s/.test(trimmed)) return null;
  const match = HTTP_AUTHORITY.exec(trimmed);
  if (!match) return null;
  let authority = match[1] ?? '';
  // user:pass@host — the host is what follows the LAST "@".
  authority = authority.slice(authority.lastIndexOf('@') + 1);
  // Drop the port (IPv6 literals are not attributable domains).
  if (authority.startsWith('[')) return null;
  const host = authority.replace(/:\d*$/, '').replace(/\.$/, '').toLowerCase();
  if (!HOSTNAME.test(host)) return null;
  const domain = host.replace(/^www\./, '');
  // A bare label ("localhost", "www") isn't an attributable source.
  return domain.includes('.') ? domain : null;
}
