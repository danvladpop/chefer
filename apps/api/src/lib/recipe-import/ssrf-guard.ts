import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { TRPCError } from '@trpc/server';

// ─── SSRF guard for recipe imports (F5) ───────────────────────────────────────
// The import feature fetches arbitrary user-supplied URLs from the API server,
// which sits next to the database and (in prod) cloud metadata endpoints. The
// guard is deliberately strict: http(s) only, default ports only, and every
// hostname is resolved BEFORE fetching with every returned address checked
// against private/loopback/link-local/metadata/reserved ranges. Redirect hops
// are re-validated by the fetcher (fetch-page.ts), so a public host cannot
// bounce us into a private one.

/** Parses an IPv4 dotted quad into its 32-bit value, or null. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function inCidr4(ip: number, base: string, prefixBits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = prefixBits === 0 ? 0 : (0xffffffff << (32 - prefixBits)) >>> 0;
  return (ip & mask) >>> 0 === (baseInt & mask) >>> 0;
}

// Everything an internal fetch must never reach. Over-blocking is fine;
// under-blocking is not (mirrors the safety.ts philosophy).
const FORBIDDEN_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this network" (0.0.0.0 hits localhost on Linux)
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

/**
 * True when the resolved address must never be fetched (private, loopback,
 * link-local, metadata, ULA, multicast, reserved). Pure — unit-tested directly.
 */
export function isForbiddenAddress(rawIp: string): boolean {
  // Strip a zone index ("fe80::1%eth0") before classification.
  const ip = rawIp.split('%')[0]?.trim().toLowerCase() ?? '';
  const version = isIP(ip);

  if (version === 4) {
    const value = ipv4ToInt(ip);
    if (value === null) return true; // unparseable → fail closed
    return FORBIDDEN_V4.some(([base, bits]) => inCidr4(value, base, bits));
  }

  if (version === 6) {
    if (ip === '::' || ip === '::1') return true; // unspecified + loopback
    // IPv4-mapped/compatible (::ffff:10.0.0.1 or trailing dotted quad) —
    // classify by the embedded IPv4 address.
    const dottedMatch = /^(?:.*:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(ip);
    if (dottedMatch?.[1]) return isForbiddenAddress(dottedMatch[1]);
    const hextet = ip.split(':')[0] ?? '';
    const first = hextet === '' ? 0 : Number.parseInt(hextet, 16);
    if (Number.isNaN(first)) return true;
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }

  return true; // not an IP at all → fail closed
}

const importBlocked = (message: string): TRPCError =>
  new TRPCError({ code: 'BAD_REQUEST', message });

/**
 * Validates a user-supplied URL for server-side fetching and resolves its
 * hostname. Throws BAD_REQUEST for anything that is not a plain public
 * http(s) URL on a default port. Returns the parsed URL.
 */
export async function assertSafeRemoteUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw importBlocked('That does not look like a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw importBlocked('Only http(s) links can be imported.');
  }
  if (url.username || url.password) {
    throw importBlocked('URLs with embedded credentials are not allowed.');
  }
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw importBlocked('Only standard web ports are allowed.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw importBlocked('That address cannot be imported.');
  }

  // Literal IP in the URL — no DNS involved.
  if (isIP(hostname)) {
    if (isForbiddenAddress(hostname)) throw importBlocked('That address cannot be imported.');
    return url;
  }

  // Resolve and check EVERY returned address — an attacker-controlled DNS
  // name may mix a public A record with a private one.
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw importBlocked('That host could not be found.');
  }
  if (addresses.length === 0) throw importBlocked('That host could not be found.');
  for (const { address } of addresses) {
    if (isForbiddenAddress(address)) throw importBlocked('That address cannot be imported.');
  }

  return url;
}
