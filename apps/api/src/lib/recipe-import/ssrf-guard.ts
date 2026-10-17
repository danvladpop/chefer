import { lookup as lookupCallback, type LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { TRPCError } from '@trpc/server';

// ─── SSRF guard for recipe imports (F5) ───────────────────────────────────────
// The import feature fetches arbitrary user-supplied URLs from the API server,
// which sits next to the database and (in prod) cloud metadata endpoints. The
// guard is deliberately strict: http(s) only, default ports only, and every
// hostname is resolved BEFORE fetching with every returned address checked
// against private/loopback/link-local/metadata/reserved ranges. Redirect hops
// are re-validated by the fetcher (fetch-page.ts), so a public host cannot
// bounce us into a private one. That pre-check alone is a TOCTOU gap — the
// socket resolves the name again — so the fetcher also connects through
// `guardedLookup`, which re-checks the addresses the socket actually uses.

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
 * Parses any textual IPv6 form (compressed, full, or with a trailing dotted
 * quad) into its eight 16-bit groups, or null when it is not valid IPv6.
 */
function parseIpv6(ip: string): number[] | null {
  let head = ip;
  const tail: number[] = [];
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (dotted?.[1] && dotted[2]) {
    const v4 = ipv4ToInt(dotted[2]);
    if (v4 === null) return null;
    tail.push(v4 >>> 16, v4 & 0xffff);
    // "::ffff:" → "::ffff", but keep a bare "::" intact.
    head = dotted[1].endsWith('::') ? dotted[1] : dotted[1].slice(0, -1);
  }

  const halves = head.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string | undefined): number[] | null => {
    if (!part) return [];
    const groups: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };
  const left = toGroups(halves[0]);
  const right = toGroups(halves[1]);
  if (!left || !right) return null;

  const explicit = left.length + right.length + tail.length;
  if (halves.length === 1) return explicit === 8 ? [...left, ...tail] : null;
  if (explicit > 7) return null;
  return [...left, ...new Array<number>(8 - explicit).fill(0), ...right, ...tail];
}

function isForbiddenIpv4(ip: number): boolean {
  return FORBIDDEN_V4.some(([base, bits]) => inCidr4(ip, base, bits));
}

/**
 * True when the resolved address must never be fetched (private, loopback,
 * link-local, metadata, ULA, multicast, reserved, or an IPv6 form that embeds
 * or tunnels to an IPv4 address). Pure — unit-tested directly.
 */
export function isForbiddenAddress(rawIp: string): boolean {
  // Strip a zone index ("fe80::1%eth0") before classification.
  const ip = rawIp.split('%')[0]?.trim().toLowerCase() ?? '';
  const version = isIP(ip);

  if (version === 4) {
    const value = ipv4ToInt(ip);
    if (value === null) return true; // unparseable → fail closed
    return isForbiddenIpv4(value);
  }

  if (version === 6) {
    const g = parseIpv6(ip);
    if (!g) return true; // unparseable → fail closed
    const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
    const embeddedV4 = ((g6 << 16) | g7) >>> 0;
    const upperZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;

    // IPv4-mapped (::ffff:0:0/96), IPv4-translated (::ffff:0:0:0/96) and the
    // deprecated IPv4-compatible (::/96, which also covers :: and ::1) forms
    // all reach the embedded IPv4 address — classify by it, in any notation
    // (URL parsing turns ::ffff:127.0.0.1 into the hex form ::ffff:7f00:1).
    if (upperZero && g4 === 0 && (g5 === 0xffff || g5 === 0)) return isForbiddenIpv4(embeddedV4);
    if (upperZero && g4 === 0xffff && g5 === 0) return isForbiddenIpv4(embeddedV4);

    // Only global unicast (2000::/3) is ever fetchable. Everything else —
    // ULA fc00::/7, link-local fe80::/10, multicast ff00::/8, NAT64
    // 64:ff9b::/96 and 64:ff9b:1::/48, discard 100::/64 — is blocked.
    if ((g0 & 0xe000) !== 0x2000) return true;
    // Inside 2000::/3: tunnels and special-purpose space that can land on an
    // internal IPv4 address or are never legitimate destinations.
    if (g0 === 0x2002) return true; // 6to4 (2002::/16) embeds an IPv4 address
    if (g0 === 0x2001 && g1 < 0x0200) return true; // 2001::/23 IETF, incl. Teredo 2001::/32
    if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
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

/** Error code a blocked connect-time lookup fails with (see `guardedLookup`). */
export const SSRF_BLOCKED_CODE = 'ESSRFBLOCKED';

/**
 * A `net.connect` lookup that refuses to hand a forbidden address to the
 * socket. `assertSafeRemoteUrl` resolves a name before fetching, but the
 * socket resolves it again — a DNS-rebinding host can answer public first and
 * private second. Connecting through this lookup checks the addresses the
 * connection really uses. The hostname itself is untouched, so SNI and the
 * Host header still name the original host.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  lookupCallback(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    const first = addresses[0];
    if (!first) {
      callback(
        Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }),
        '',
        0,
      );
      return;
    }
    if (addresses.some(({ address }) => isForbiddenAddress(address))) {
      const blocked = Object.assign(new Error(`Blocked forbidden address for ${hostname}`), {
        code: SSRF_BLOCKED_CODE,
      });
      callback(blocked, '', 0);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
};
