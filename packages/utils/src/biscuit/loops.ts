// Biscuit's short loops — one per onboarding beat, reused across the app
// (loaders, celebrations, empty states). Each is BISCUIT_LOOP_FRAMES long at
// 30 fps and loops seamlessly (every motion is a whole number of cycles), so a
// renderer just plays `frame % BISCUIT_LOOP_FRAMES`. Reduced motion: renderers
// draw `biscuitLoopFrame(name, BISCUIT_STILL_FRAME)` once.
//
// Ported from marketing/chefer-ad/src/onboarding/OnboardingLoops.tsx. Extras
// (bubble, scale, bowl, sparkles…) are shapes in the same coordinate space as
// the body, so renderers stay dumb.

import type { BiscuitDrawProps, BiscuitNode } from './geometry';

export const BISCUIT_LOOP_FRAMES = 90;
export const BISCUIT_LOOP_FPS = 30;
/** The frame drawn when motion is reduced: a calm, readable pose for every loop. */
export const BISCUIT_STILL_FRAME = 0;
/** The loop canvas around the 400×400 body: room for hats, bubbles and props. */
export const BISCUIT_VIEWBOX = { x: -50, y: -70, width: 520, height: 490 } as const;

export const BISCUIT_LOOPS = [
  'welcome',
  'curious',
  'goalLose',
  'goalMuscle',
  'goalHealthy',
  'goalFood',
  'scale',
  'sniff',
  'cooking',
  'ready',
  'premium',
  'allSet',
  'loaf',
] as const;
export type BiscuitLoop = (typeof BISCUIT_LOOPS)[number];

export interface BiscuitLoopFrame {
  props: BiscuitDrawProps;
  /** Vertical offset of the body (hops), in viewBox units. */
  dy: number;
  /** Horizontal squash for the happy spin (1 = normal). */
  scaleX: number;
  /** Props drawn behind the body. */
  behind: BiscuitNode[];
  /** Props drawn in front of the body. */
  front: BiscuitNode[];
}

const L = BISCUIT_LOOP_FRAMES;
const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const r1 = (n: number) => Math.round(n * 100) / 100;
/** sin with `k` whole cycles per loop. */
const wave = (f: number, k = 1, offset = 0) => Math.sin((TAU * k * f) / L + offset);
/** 0 → 1 → 0 between two frames. */
const hump = (f: number, from: number, to: number) =>
  Math.sin(Math.PI * clamp01((f - from) / (to - from)));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Piecewise-linear 0→1→1→0 between four frames, eased. */
const plateau = (f: number, a: number, b: number, c: number, d: number) =>
  f <= a || f >= d ? 0 : f < b ? ease((f - a) / (b - a)) : f <= c ? 1 : ease(1 - (f - c) / (d - c));

const BRAND = '#944A00';
const RING = '#E9CFAE';
const SEP = '#E6DED3';
const POSITIVE = '#2D7A4B';

const scaled = (s: number, cx: number, cy: number, children: BiscuitNode[]): BiscuitNode => ({
  t: 'g',
  transform: `translate(${cx} ${cy}) scale(${r1(Math.max(0.001, s))}) translate(${-cx} ${-cy})`,
  opacity: r1(clamp01(s)),
  children,
});

const sparkle = (x: number, y: number, s: number, fill = '#F2B640'): BiscuitNode =>
  scaled(s, x, y, [
    {
      t: 'path',
      d: `M${x} ${y - 26} L${x + 6} ${y - 6} L${x + 26} ${y} L${x + 6} ${y + 6} L${x} ${y + 26} L${x - 6} ${y + 6} L${x - 26} ${y} L${x - 6} ${y - 6} Z`,
      fill,
    },
  ]);

const bowl = (x: number, y: number, w: number): BiscuitNode => {
  const k = w / 280;
  return {
    t: 'g',
    transform: `translate(${x} ${y}) scale(${r1(k)})`,
    children: [
      {
        t: 'path',
        d: 'M8 64 H272 Q264 136 140 138 Q16 136 8 64 Z',
        fill: '#FFFFFF',
        stroke: SEP,
        strokeWidth: 4,
      },
      { t: 'path', d: 'M22 84 H258', stroke: '#F6EADB', strokeWidth: 10, strokeLinecap: 'round' },
    ],
  };
};

function empty(props: BiscuitDrawProps): BiscuitLoopFrame {
  return { props, dy: 0, scaleX: 1, behind: [], front: [] };
}

/** One frame of a named loop. `frame` may be any integer; it wraps. */
export function biscuitLoopFrame(loop: BiscuitLoop, frame: number): BiscuitLoopFrame {
  const f = ((Math.round(frame) % L) + L) % L;
  const base = { loop: L } as const;

  switch (loop) {
    case 'welcome':
      return {
        ...empty({ ...base, pose: 'wink', tailWag: 0.9, blink: false }),
        dy: -14 * Math.max(0, wave(f, 2)),
      };

    case 'curious': {
      const q = hump(f, 20, 70);
      return {
        ...empty({ ...base, pose: 'stand', headTilt: 10 * wave(f), eyesWide: 0.6, tailWag: 0.5 }),
        front: [
          scaled(q, 360, 0, [
            { t: 'circle', cx: 360, cy: 0, r: 40, fill: '#FFFFFF', stroke: SEP, strokeWidth: 3 },
            {
              t: 'path',
              d: 'M348 -12 Q348 -26 360 -26 Q373 -26 373 -13 Q373 -4 362 0 L362 9',
              stroke: BRAND,
              strokeWidth: 8,
              strokeLinecap: 'round',
              fill: 'none',
            },
            { t: 'circle', cx: 362, cy: 23, r: 5, fill: BRAND },
          ]),
        ],
      };
    }

    case 'goalLose': {
      const suck = plateau(f, 10, 22, 60, 72);
      return empty({
        ...base,
        pose: 'proud',
        bodyWidth: 1 - 0.22 * suck,
        eyesWide: suck,
        mood: suck > 0.5 ? 'focused' : 'happy',
        headTilt: -6 * suck,
      });
    }

    case 'goalMuscle':
      return empty({
        ...base,
        pose: 'squat',
        accessory: 'headband',
        holding: 'dumbbell',
        squatDepth: Math.max(0, wave(f, 2, -Math.PI / 2) * 0.5 + 0.5),
        mood: 'focused',
        tailWag: 0.3,
      });

    case 'goalHealthy':
      return {
        ...empty({
          ...base,
          pose: 'proud',
          armRaise: 0.75 + 0.1 * wave(f),
          holding: 'carrot',
          mood: 'proud',
          tailWag: 0.7,
        }),
        dy: -6 * Math.max(0, wave(f, 2)),
      };

    case 'goalFood':
      return {
        ...empty({
          ...base,
          pose: 'stand',
          accessory: 'chefHat',
          headTilt: 6 * wave(f),
          tailWag: 0.6,
        }),
        dy: -6 * Math.max(0, wave(f, 2)),
      };

    case 'scale': {
      const land = hump(f, 4, 22);
      const needle =
        f < 22
          ? -50
          : f < 34
            ? -50 + 80 * ((f - 22) / 12)
            : f < 44
              ? 30 - 42 * ((f - 34) / 10)
              : f < 52
                ? -12 + 20 * ((f - 44) / 8)
                : f < 80
                  ? 8
                  : 8 - 58 * ((f - 80) / 10);
      return {
        ...empty({ ...base, pose: 'stand', eyesWide: f > 24 && f < 56 ? 0.8 : 0, tailWag: 0.5 }),
        dy: -60 * land - 22,
        behind: [
          {
            t: 'rect',
            x: 80,
            y: 376,
            width: 240,
            height: 40,
            rx: 18,
            fill: '#FFFFFF',
            stroke: SEP,
            strokeWidth: 4,
          },
          { t: 'rect', x: 165, y: 384, width: 70, height: 24, rx: 8, fill: '#F6EADB' },
          {
            t: 'g',
            transform: `translate(200 404) rotate(${r1(needle + 3 * wave(f, 3))})`,
            children: [{ t: 'rect', x: -3, y: -20, width: 6, height: 20, rx: 3, fill: BRAND }],
          },
        ],
      };
    }

    case 'sniff': {
      const sniff = f < 50 ? 4 * Math.max(0, Math.sin((f * TAU) / 10)) : 0;
      const shield = hump(f, 46, 88);
      return {
        ...empty({
          ...base,
          pose: 'stand',
          headTilt: 12 + sniff,
          mood: f > 50 ? 'excited' : 'focused',
          tailWag: 0.4,
        }),
        front: [
          bowl(300, 300, 160),
          { t: 'ellipse', cx: 380, cy: 336, rx: 64, ry: 16, fill: '#FFFDF8' },
          { t: 'circle', cx: 356, cy: 330, r: 12, fill: '#E3A462' },
          { t: 'circle', cx: 400, cy: 328, r: 11, fill: '#6B9A4B' },
          scaled(shield, 390, 30, [
            {
              t: 'path',
              d: 'M390 -18 L432 -2 V28 Q432 64 390 84 Q348 64 348 28 V-2 Z',
              fill: POSITIVE,
            },
            {
              t: 'path',
              d: 'M370 32 L386 48 L412 18',
              stroke: '#FFFFFF',
              strokeWidth: 9,
              fill: 'none',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
          ]),
        ],
      };
    }

    case 'cooking': {
      const pieces = [
        { at: 8, x: 360, color: '#FFFDF8', r: 22, stroke: SEP },
        { at: 28, x: 330, color: '#E3A462', r: 17 },
        { at: 48, x: 392, color: '#6B9A4B', r: 15 },
      ];
      const fade = f >= 80 ? 1 - (f - 80) / 10 : 1;
      return {
        ...empty({
          ...base,
          pose: 'stand',
          accessory: 'chefHat',
          reach: 0.35 + 0.15 * wave(f, 3),
          tailWag: 0.6,
        }),
        dy: -4 * Math.max(0, wave(f, 3)),
        front: [
          ...pieces
            .filter((p) => f >= p.at)
            .map((p): BiscuitNode => {
              const t = clamp01((f - p.at) / 14);
              return {
                t: 'circle',
                cx: p.x,
                cy: r1(350 - 170 * (1 - t * t)),
                r: p.r,
                fill: p.color,
                ...(p.stroke ? { stroke: p.stroke, strokeWidth: 3 } : {}),
                opacity: r1(fade),
              };
            }),
          bowl(280, 300, 200),
          ...[0, 1, 2].map(
            (i): BiscuitNode => ({
              t: 'rect',
              x: 344 + i * 26,
              y: r1(250 - 12 * wave(f, 2, i * 2)),
              width: 10,
              height: 40,
              rx: 5,
              fill: RING,
              opacity: r1(0.35 + 0.35 * wave(f, 2, i * 2)),
            }),
          ),
        ],
      };
    }

    case 'ready': {
      const colors = [BRAND, '#A85100', '#C46F27', RING, '#7E3E00'];
      const confetti: BiscuitNode[] = Array.from({ length: 14 }, (_, i) => {
        // 6 viewBox units a frame × 90 frames = one full fall per loop: seamless.
        const y = ((f * 6 + i * 97) % 540) - 70;
        const x = -30 + ((i * 137) % 480);
        const c = colors[i % colors.length] ?? BRAND;
        return i % 2
          ? { t: 'circle', cx: x, cy: y, r: 9, fill: c }
          : {
              t: 'rect',
              x,
              y,
              width: 16,
              height: 16,
              rx: 4,
              fill: c,
              transform: `rotate(${(f * 8 + i * 40) % 360} ${x + 8} ${y + 8})`,
            };
      });
      return {
        ...empty({ ...base, pose: 'proud', mood: f < 30 ? 'excited' : 'proud', tailWag: 1 }),
        dy: -70 * hump(f, 6, 26),
        behind: confetti,
      };
    }

    case 'premium':
      return {
        ...empty({
          ...base,
          pose: 'proud',
          accessory: 'crown',
          armRaise: 1,
          mood: 'proud',
          tailWag: 0.8,
        }),
        dy: -8 * wave(f),
        behind: [
          sparkle(30, 60, wave(f, 2)),
          sparkle(410, 40, wave(f, 2, Math.PI)),
          sparkle(390, 230, wave(f, 2, Math.PI / 2), RING),
          sparkle(40, 260, wave(f, 2, -Math.PI / 2), RING),
        ],
      };

    case 'allSet': {
      const spin = ease(clamp01((f - 8) / 30));
      return {
        ...empty({ ...base, pose: f > 40 ? 'wink' : 'stand', mood: 'excited', tailWag: 1 }),
        dy: -50 * hump(f, 8, 38),
        scaleX: Math.cos(spin * TAU),
      };
    }

    case 'loaf':
      return empty({ ...base, pose: 'lie', mood: 'happy', tailWag: 0.3 });
  }
}
