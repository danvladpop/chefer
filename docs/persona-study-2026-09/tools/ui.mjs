// Compact element listing for drive.sh.
//   node ui.mjs ios <hierarchy.json> <udid>         -> "label @ (x%,y%)" lines
//   node ui.mjs android-list "" <serial>            -> same, from uiautomator
//   node ui.mjs android-find "<regex>" <serial>     -> "x y" pixel centre of first match
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const [mode, arg, dev] = process.argv.slice(2);
const ADB = `${homedir()}/Library/Android/sdk/platform-tools/adb`;
const NOISE = /scroll bar|^\s*$|battery|Mobile Service|^\d{1,2}:\d{2}$/i;

function parseBounds(b) {
  const m = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(b ?? '');
  return m ? m.slice(1).map(Number) : null;
}

if (mode === 'ios') {
  const root = JSON.parse(readFileSync(arg, 'utf8'));
  let W = 390,
    H = 844;
  const rootB = parseBounds(root.children?.[0]?.attributes?.bounds);
  if (rootB && rootB[2] > 0) [W, H] = [rootB[2], rootB[3]];
  const seen = new Set();
  const walk = (n) => {
    const a = n.attributes ?? {};
    const label = [a.text, a.accessibilityText, a.value, a.hintText]
      .filter(Boolean)
      .join(' | ')
      .trim();
    const b = parseBounds(a.bounds);
    if (label && b && !NOISE.test(label) && b[2] > b[0]) {
      const x = Math.round(((b[0] + b[2]) / 2 / W) * 100);
      const y = Math.round(((b[1] + b[3]) / 2 / H) * 100);
      const key = `${label}@${x},${y}`;
      if (!seen.has(key) && y >= 0 && y <= 100) {
        seen.add(key);
        console.log(
          `${label.slice(0, 120)} @ (${x}%,${y}%)${a.enabled === 'false' ? ' [disabled]' : ''}${a.selected === 'true' || a.checked === 'true' ? ' [selected]' : ''}`,
        );
      }
    }
    (n.children ?? []).forEach(walk);
  };
  walk(root);
} else {
  execFileSync(ADB, ['-s', dev, 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], {
    stdio: 'ignore',
  });
  const xml = execFileSync(ADB, ['-s', dev, 'exec-out', 'cat', '/sdcard/ui.xml']).toString();
  const nodes = [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const g = (k) => (new RegExp(`${k}="([^"]*)"`).exec(m[0]) ?? [])[1] ?? '';
    return {
      text: g('text'),
      desc: g('content-desc'),
      b: parseBounds(g('bounds')),
      enabled: g('enabled'),
      checked: g('checked'),
      selected: g('selected'),
    };
  });
  const W = 1080,
    H = 2400;
  if (mode === 'android-find') {
    const re = new RegExp(arg, 'i');
    const hit = nodes.find((n) => n.b && (re.test(n.text) || re.test(n.desc)));
    if (!hit) process.exit(1);
    console.log(
      `${Math.round((hit.b[0] + hit.b[2]) / 2)} ${Math.round((hit.b[1] + hit.b[3]) / 2)}`,
    );
  } else {
    for (const n of nodes) {
      const label = [n.text, n.desc].filter(Boolean).join(' | ').trim();
      if (!label || !n.b || NOISE.test(label)) continue;
      const x = Math.round(((n.b[0] + n.b[2]) / 2 / W) * 100);
      const y = Math.round(((n.b[1] + n.b[3]) / 2 / H) * 100);
      console.log(
        `${label.slice(0, 120)} @ (${x}%,${y}%)${n.enabled === 'false' ? ' [disabled]' : ''}${n.checked === 'true' || n.selected === 'true' ? ' [selected]' : ''}`,
      );
    }
  }
}
