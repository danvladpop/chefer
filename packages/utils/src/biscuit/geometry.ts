// Biscuit, the Chefer corgi — the drawing as pure data.
//
// One source for every platform: `biscuitShapes(props, frame)` returns a tree
// of plain SVG shapes in a 400×400 box (feet at y≈388). The web renderer
// (@chefer/ui `Biscuit`) maps it to DOM <svg>, the mobile one
// (@chefer/ui-mobile `Biscuit`) to react-native-svg — so the character is
// identical everywhere and stays in step with the ad
// (marketing/chefer-ad/src/components/Biscuit.tsx, which this was ported from).
//
// Everything that moves is frame maths (breathing, blinks, tail wag), so a
// renderer only has to supply a frame number. With `loop` set, every periodic
// motion snaps to a whole number of cycles per loop (seamless clips).

export type BiscuitPose = 'lie' | 'stand' | 'push' | 'squat' | 'proud' | 'wink';
export type BiscuitAccessory = 'chefHat' | 'headband' | 'crown' | 'none';
export type BiscuitMood = 'happy' | 'sad' | 'excited' | 'proud' | 'focused';
export type BiscuitHolding = 'none' | 'dumbbell' | 'phone' | 'carrot';

export interface BiscuitDrawProps {
  pose: BiscuitPose;
  accessory?: BiscuitAccessory;
  /** 0.75–1. Only the body narrows; the head stays the same. */
  bodyWidth?: number;
  /** 0–1: amplitude and speed of the tail wag. */
  tailWag?: number;
  /** Automatic blink every 45 frames. */
  blink?: boolean;
  mood?: BiscuitMood;
  /** 0–1, eyes grow ~35%. */
  eyesWide?: number;
  /** 0–1, right paw reaches out (lie: toward the floor, stand: to the right). */
  reach?: number;
  /** 0–1, right arm goes up (holding / waving / catching). */
  armRaise?: number;
  /** 0–1 squat depth. */
  squatDepth?: number;
  /** Degrees; negative = chin up. */
  headTilt?: number;
  holding?: BiscuitHolding;
  /** Loop length in frames (seamless loops). */
  loop?: number;
}

export interface BiscuitPaint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'round';
  strokeLinejoin?: 'round';
  opacity?: number;
  /** An SVG transform string ("translate(1 2) rotate(3)"), valid on web and react-native-svg. */
  transform?: string;
}

export type BiscuitNode =
  | ({ t: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & BiscuitPaint)
  | ({ t: 'circle'; cx: number; cy: number; r: number } & BiscuitPaint)
  | ({ t: 'rect'; x: number; y: number; width: number; height: number; rx?: number } & BiscuitPaint)
  | ({ t: 'path'; d: string } & BiscuitPaint)
  | ({ t: 'polygon'; points: string } & BiscuitPaint)
  | ({ t: 'g'; children: BiscuitNode[]; clip?: string } & BiscuitPaint)
  /** A clip path definition; `id` is local — renderers prefix it per instance. */
  | { t: 'clip'; id: string; children: BiscuitNode[] };

export const BISCUIT_COLORS = {
  fur: '#E0883A',
  furMid: '#D27B30',
  furShade: '#BE6A22',
  cream: '#FFF4E6',
  ear: '#F3C08F',
  ink: '#1C1917',
  blush: '#EE9873',
  tongue: '#E58275',
  brand: '#944A00',
} as const;

const C = BISCUIT_COLORS;
const RAISED_DEG = -136;
const RAISED_LEN = 96;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** End of an arm hanging down (0°) from (x, y), rotated by `deg` (SVG rotate). */
const armEnd = (x: number, y: number, deg: number, len: number) => ({
  x: x - Math.sin(rad(deg)) * len,
  y: y + Math.cos(rad(deg)) * len,
});
const r1 = (n: number) => Math.round(n * 100) / 100;

const arm = (x: number, y: number, deg: number, len: number): BiscuitNode => ({
  t: 'g',
  transform: `translate(${r1(x)} ${r1(y)}) rotate(${r1(deg)})`,
  children: [
    { t: 'rect', x: -17, y: -12, width: 34, height: r1(len + 12), rx: 17, fill: C.fur },
    { t: 'ellipse', cx: 0, cy: r1(len), rx: 19, ry: 18, fill: C.cream },
  ],
});

const tail = (x: number, y: number, deg: number): BiscuitNode => ({
  t: 'g',
  transform: `translate(${r1(x)} ${r1(y)}) rotate(${r1(deg)})`,
  children: [
    {
      t: 'ellipse',
      cx: -22,
      cy: -44,
      rx: 25,
      ry: 52,
      fill: C.fur,
      transform: 'rotate(-28 -22 -44)',
    },
    {
      t: 'ellipse',
      cx: -14,
      cy: -28,
      rx: 14,
      ry: 30,
      fill: C.furMid,
      transform: 'rotate(-28 -14 -28)',
    },
    {
      t: 'ellipse',
      cx: -44,
      cy: -84,
      rx: 16,
      ry: 19,
      fill: C.cream,
      transform: 'rotate(-28 -44 -84)',
    },
  ],
});

function eye(x: number, y: number, open: number, wide: number, happy: boolean): BiscuitNode {
  const line = { stroke: C.ink, strokeLinecap: 'round' as const, fill: 'none' };
  if (happy)
    return {
      t: 'path',
      d: `M${x - 13} ${y + 4} Q${x} ${y - 12} ${x + 13} ${y + 4}`,
      strokeWidth: 5.5,
      ...line,
    };
  if (open < 0.25)
    return {
      t: 'path',
      d: `M${x - 12} ${y} Q${x} ${y + 6} ${x + 12} ${y}`,
      strokeWidth: 5,
      ...line,
    };
  return {
    t: 'g',
    transform: `translate(${x} ${y}) scale(${r1(wide)} ${r1(wide * open)})`,
    children: [
      { t: 'ellipse', cx: 0, cy: 0, rx: 12, ry: 13.5, fill: C.ink },
      { t: 'circle', cx: 4, cy: -5, r: 4.4, fill: '#FFFFFF' },
      { t: 'circle', cx: -4, cy: 5, r: 1.9, fill: '#FFFFFF', opacity: 0.7 },
    ],
  };
}

function head(
  hx: number,
  hy: number,
  o: {
    mood: BiscuitMood;
    eyeOpen: number;
    eyesWide: number;
    wink: boolean;
    accessory: BiscuitAccessory;
    earDroop: number;
    earTwitch: number;
  },
): BiscuitNode {
  const wide = 1 + 0.35 * o.eyesWide;
  const happyEyes = o.mood === 'proud';
  const open = o.eyeOpen * (o.mood === 'sad' ? 0.78 : 1);
  const earL = -o.earDroop * 32 - o.earTwitch;
  const earR = o.earDroop * 32 + o.earTwitch;
  const round = { strokeLinejoin: 'round' as const };
  const ear = (side: 1 | -1, deg: number): BiscuitNode => ({
    t: 'g',
    transform: `rotate(${r1(deg)} ${hx + side * 46} ${hy - 50})`,
    children: [
      {
        t: 'polygon',
        points: `${hx + side * 72},${hy - 28} ${hx + side * 82},${hy - 114} ${hx + side * 14},${hy - 66}`,
        fill: C.fur,
        stroke: C.fur,
        strokeWidth: 16,
        ...round,
      },
      {
        t: 'polygon',
        points: `${hx + side * 62},${hy - 44} ${hx + side * 70},${hy - 94} ${hx + side * 30},${hy - 64}`,
        fill: C.ear,
        stroke: C.ear,
        strokeWidth: 6,
        ...round,
      },
    ],
  });

  const nodes: BiscuitNode[] = [
    ear(-1, earL),
    ear(1, earR),
    { t: 'clip', id: 'head', children: [{ t: 'ellipse', cx: hx, cy: hy, rx: 86, ry: 74 }] },
    { t: 'ellipse', cx: hx, cy: hy, rx: 86, ry: 74, fill: C.fur },
    {
      t: 'g',
      clip: 'head',
      children: [
        { t: 'ellipse', cx: hx, cy: hy + 52, rx: 82, ry: 42, fill: C.cream },
        {
          t: 'path',
          d: `M${hx - 8} ${hy - 76} Q${hx} ${hy - 82} ${hx + 8} ${hy - 76} L${hx + 19} ${hy + 8} L${hx - 19} ${hy + 8} Z`,
          fill: C.cream,
        },
        ...(o.accessory === 'headband'
          ? ([
              { t: 'rect', x: hx - 92, y: hy - 54, width: 184, height: 22, fill: C.brand },
              {
                t: 'rect',
                x: hx - 92,
                y: hy - 46,
                width: 184,
                height: 5,
                fill: C.cream,
                opacity: 0.9,
              },
            ] as BiscuitNode[])
          : []),
      ],
    },
    { t: 'ellipse', cx: hx, cy: hy + 26, rx: 44, ry: 29, fill: C.cream },
  ];

  if (o.mood === 'sad' || o.mood === 'focused') {
    const sad = o.mood === 'sad';
    nodes.push({
      t: 'g',
      stroke: C.ink,
      strokeWidth: sad ? 4.5 : 5,
      strokeLinecap: 'round',
      opacity: sad ? 0.75 : 0.8,
      children: sad
        ? [
            { t: 'path', d: `M${hx - 48} ${hy - 24} L${hx - 24} ${hy - 34}` },
            { t: 'path', d: `M${hx + 48} ${hy - 24} L${hx + 24} ${hy - 34}` },
          ]
        : [
            { t: 'path', d: `M${hx - 48} ${hy - 36} L${hx - 22} ${hy - 27}` },
            { t: 'path', d: `M${hx + 48} ${hy - 36} L${hx + 22} ${hy - 27}` },
          ],
    });
  }

  nodes.push(
    eye(hx - 34, hy - 6, open, wide, happyEyes),
    eye(hx + 34, hy - 6, open, wide, happyEyes || o.wink),
    { t: 'circle', cx: hx - 56, cy: hy + 20, r: 12, fill: C.blush, opacity: 0.45 },
    { t: 'circle', cx: hx + 56, cy: hy + 20, r: 12, fill: C.blush, opacity: 0.45 },
  );

  if (o.mood === 'excited') {
    const mouth = `M${hx - 19} ${hy + 26} Q${hx} ${hy + 64} ${hx + 19} ${hy + 26} Z`;
    nodes.push(
      { t: 'clip', id: 'mouth', children: [{ t: 'path', d: mouth }] },
      { t: 'path', d: mouth, fill: C.ink },
      {
        t: 'g',
        clip: 'mouth',
        children: [{ t: 'ellipse', cx: hx, cy: hy + 46, rx: 11, ry: 9, fill: C.tongue }],
      },
    );
  } else {
    const d =
      o.mood === 'sad'
        ? `M${hx} ${hy + 20} V${hy + 28} M${hx - 15} ${hy + 39} Q${hx} ${hy + 28} ${hx + 15} ${hy + 39}`
        : o.mood === 'focused'
          ? `M${hx} ${hy + 20} V${hy + 30} M${hx - 13} ${hy + 33} Q${hx} ${hy + 29} ${hx + 13} ${hy + 33}`
          : o.mood === 'proud'
            ? `M${hx} ${hy + 20} V${hy + 28} M${hx - 22} ${hy + 28} Q${hx - 11} ${hy + 42} ${hx} ${hy + 28} Q${hx + 11} ${hy + 42} ${hx + 22} ${hy + 28}`
            : `M${hx} ${hy + 20} V${hy + 27} M${hx - 17} ${hy + 29} Q${hx - 8} ${hy + 38} ${hx} ${hy + 27} Q${hx + 8} ${hy + 38} ${hx + 17} ${hy + 29}`;
    nodes.push({
      t: 'path',
      d,
      stroke: C.ink,
      strokeWidth: 4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      fill: 'none',
    });
  }
  nodes.push(
    { t: 'ellipse', cx: hx, cy: hy + 12, rx: 14, ry: 9.5, fill: C.ink },
    { t: 'ellipse', cx: hx - 4, cy: hy + 9, rx: 4, ry: 2.4, fill: '#FFFFFF', opacity: 0.55 },
  );

  if (o.accessory === 'chefHat') {
    nodes.push({
      t: 'g',
      children: [
        { t: 'circle', cx: hx - 40, cy: hy - 118, r: 38, fill: '#FFFFFF' },
        { t: 'circle', cx: hx + 40, cy: hy - 118, r: 38, fill: '#FFFFFF' },
        { t: 'circle', cx: hx, cy: hy - 146, r: 46, fill: '#FFFFFF' },
        {
          t: 'path',
          d: `M${hx - 18} ${hy - 150} Q${hx - 10} ${hy - 126} ${hx - 14} ${hy - 104} M${hx + 18} ${hy - 150} Q${hx + 10} ${hy - 126} ${hx + 14} ${hy - 104}`,
          stroke: '#E6DED3',
          strokeWidth: 4,
          fill: 'none',
          strokeLinecap: 'round',
        },
        {
          t: 'rect',
          x: hx - 62,
          y: hy - 108,
          width: 124,
          height: 40,
          rx: 12,
          fill: '#FFFFFF',
          stroke: '#E6DED3',
          strokeWidth: 3,
        },
      ],
    });
  } else if (o.accessory === 'crown') {
    nodes.push({
      t: 'g',
      transform: `translate(${hx} ${hy - 78}) rotate(-6)`,
      children: [
        {
          t: 'path',
          d: 'M-46 14 L-50 -30 L-24 -8 L0 -40 L24 -8 L50 -30 L46 14 Z',
          fill: '#F2B640',
          stroke: '#C98A12',
          strokeWidth: 4,
          strokeLinejoin: 'round',
        },
        { t: 'rect', x: -48, y: 8, width: 96, height: 14, rx: 6, fill: '#E3A12A' },
        { t: 'circle', cx: 0, cy: -14, r: 7, fill: C.brand },
        { t: 'circle', cx: -30, cy: 0, r: 5, fill: C.cream },
        { t: 'circle', cx: 30, cy: 0, r: 5, fill: C.cream },
      ],
    });
  } else if (o.accessory === 'headband') {
    nodes.push({
      t: 'g',
      transform: `translate(${hx + 82} ${hy - 44})`,
      children: [
        {
          t: 'rect',
          x: 0,
          y: -6,
          width: 34,
          height: 13,
          rx: 6,
          fill: C.brand,
          transform: 'rotate(28)',
        },
        {
          t: 'rect',
          x: 0,
          y: -6,
          width: 30,
          height: 13,
          rx: 6,
          fill: C.brand,
          transform: 'rotate(62)',
        },
      ],
    });
  }
  return { t: 'g', children: nodes };
}

function held(x: number, y: number, what: BiscuitHolding): BiscuitNode | null {
  if (what === 'phone') {
    return {
      t: 'g',
      transform: `translate(${r1(x)} ${r1(y - 30)}) rotate(-12)`,
      children: [
        { t: 'rect', x: -20, y: -34, width: 40, height: 68, rx: 9, fill: C.ink },
        { t: 'rect', x: -15, y: -28, width: 30, height: 56, rx: 5, fill: '#FAF7F2' },
        {
          t: 'rect',
          x: -9,
          y: -8,
          width: 18,
          height: 18,
          rx: 3,
          fill: 'none',
          stroke: C.brand,
          strokeWidth: 3,
        },
      ],
    };
  }
  if (what === 'carrot') {
    return {
      t: 'g',
      transform: `translate(${r1(x)} ${r1(y - 6)}) rotate(-24)`,
      children: [
        {
          t: 'ellipse',
          cx: -8,
          cy: -58,
          rx: 7,
          ry: 20,
          fill: '#5E8F3E',
          transform: 'rotate(-20 -8 -58)',
        },
        {
          t: 'ellipse',
          cx: 8,
          cy: -58,
          rx: 7,
          ry: 20,
          fill: '#6B9A4B',
          transform: 'rotate(20 8 -58)',
        },
        { t: 'path', d: 'M-15 -42 Q0 -50 15 -42 L3 40 Q0 46 -3 40 Z', fill: '#EF7B1E' },
        {
          t: 'path',
          d: 'M-9 -20 L-2 -18 M5 0 L11 2 M-7 16 L-1 18',
          stroke: '#C25E10',
          strokeWidth: 3,
          strokeLinecap: 'round',
        },
      ],
    };
  }
  return null;
}

/** The whole character for one frame, in a 400×400 box. */
export function biscuitShapes(props: BiscuitDrawProps, frame: number): BiscuitNode[] {
  const {
    pose,
    accessory = 'none',
    tailWag = 0.4,
    blink = true,
    mood = 'happy',
    eyesWide = 0,
    reach = 0,
    armRaise = 0,
    squatDepth = 0,
    headTilt = 0,
    holding = 'none',
    loop,
  } = props;
  const f = frame;
  const bw = Math.max(0.75, Math.min(1, props.bodyWidth ?? 1));

  const snap = (speed: number) =>
    loop ? (2 * Math.PI * Math.max(1, Math.round((speed * loop) / (2 * Math.PI)))) / loop : speed;
  const breathPeriod = loop ? loop / Math.max(1, Math.round(loop / 48)) : 48;
  const breathe = 1 + 0.015 * Math.sin((f * 2 * Math.PI) / breathPeriod);
  const bphase = (((f + 17) % 45) + 45) % 45;
  const eyeOpen = blink
    ? bphase < 2
      ? 1 - 0.95 * (bphase / 2)
      : bphase < 4
        ? 0.05 + 0.95 * ((bphase - 2) / 2)
        : 1
    : 1;
  const tailDeg = (8 + 26 * tailWag) * Math.sin(f * snap(0.22 + 0.6 * tailWag));
  const earDroop = mood === 'sad' ? 1 : 0;
  const earTwitch = mood === 'excited' ? 4 * Math.sin(f * snap(0.9)) : 0;
  const headOpts = { mood, eyeOpen, eyesWide: clamp01(eyesWide), accessory, earDroop, earTwitch };

  if (pose === 'lie') {
    return [
      { t: 'ellipse', cx: 196, cy: 392, rx: r1(170 * bw), ry: 12, fill: 'rgba(28,25,23,0.12)' },
      {
        t: 'g',
        transform: `translate(0 390) scale(1 ${r1(breathe * 1000) / 1000}) translate(0 -390)`,
        children: [
          tail(190 - 136 * bw, 330, tailDeg - 34),
          {
            t: 'clip',
            id: 'loaf',
            children: [{ t: 'ellipse', cx: 190, cy: 328, rx: r1(150 * bw), ry: 62 }],
          },
          { t: 'ellipse', cx: 190, cy: 328, rx: r1(150 * bw), ry: 62, fill: C.fur },
          {
            t: 'g',
            clip: 'loaf',
            children: [
              { t: 'ellipse', cx: r1(190 - 92 * bw), cy: 346, rx: 52, ry: 42, fill: C.furMid },
              { t: 'ellipse', cx: 190, cy: 386, rx: r1(140 * bw), ry: 24, fill: C.cream },
            ],
          },
          { t: 'ellipse', cx: r1(190 - 58 * bw), cy: 386, rx: 26, ry: 10, fill: C.cream },
          { t: 'ellipse', cx: 330, cy: 382, rx: 30, ry: 13, fill: C.cream },
          arm(296, 352, mix(-92, -38, reach), mix(30, 122, reach)),
          {
            t: 'g',
            transform: `rotate(${r1(headTilt - 4)} 300 330)`,
            children: [head(300, 266, { ...headOpts, wink: false })],
          },
        ],
      },
    ];
  }

  const d = clamp01(squatDepth);
  const drop = 30 * d;
  const torsoY = 272 + drop;
  const spread = 48 * (0.8 + 0.2 * bw) + 14 * d;
  const chestPuff = pose === 'proud' ? 6 : 0;
  const walk = pose === 'push';
  const stepPhase = Math.sin(f * snap(0.55));
  const stepL = walk ? 9 * Math.max(0, stepPhase) : 0;
  const stepR = walk ? 9 * Math.max(0, -stepPhase) : 0;
  const bob = walk ? -3 * Math.abs(stepPhase) : 0;

  let degL = 16;
  let degR = -16;
  let lenL = 62;
  let lenR = 62;
  if (pose === 'stand') {
    degR = mix(-16, -88, reach);
    lenR = 62 + 26 * reach;
  } else if (pose === 'push') {
    degL = -70;
    degR = -82;
    lenL = 84;
    lenR = 84;
  } else if (pose === 'squat') {
    degL = -28;
    degR = 28;
  } else if (pose === 'proud') {
    degL = 26;
    degR = -26;
  } else {
    // wink: the waving paw
    degR = -132 + 12 * Math.sin(f * snap(0.45));
    lenR = 92;
  }
  degR = mix(degR, RAISED_DEG, armRaise);
  lenR = mix(lenR, RAISED_LEN, armRaise);

  const shL = { x: 200 - 64 * bw, y: 220 + drop };
  const shR = { x: 200 + 64 * bw, y: 220 + drop };
  const endL = armEnd(shL.x, shL.y, degL, lenL);
  const endR = armEnd(shR.x, shR.y, degR, lenR);
  const dbY = (endL.y + endR.y) / 2;
  const dumbbell = holding === 'dumbbell';
  const heldNode =
    holding === 'phone' || holding === 'carrot' ? held(endR.x, endR.y, holding) : null;

  return [
    {
      t: 'ellipse',
      cx: 200,
      cy: 390,
      rx: r1(120 * bw + 10 * d),
      ry: 12,
      fill: 'rgba(28,25,23,0.12)',
    },
    {
      t: 'g',
      transform: `rotate(${pose === 'push' ? 7 : 0} 200 388) translate(0 ${r1(bob)}) translate(0 388) scale(1 ${r1(breathe * 1000) / 1000}) translate(0 -388)`,
      children: [
        tail(200 - 62 * bw, 334 + drop, tailDeg - 8),
        {
          t: 'rect',
          x: r1(200 - spread - 19),
          y: r1(326 + drop * 0.6 - stepL),
          width: 38,
          height: r1(52 - drop * 0.6),
          rx: 19,
          fill: C.furShade,
        },
        {
          t: 'rect',
          x: r1(200 + spread - 19),
          y: r1(326 + drop * 0.6 - stepR),
          width: 38,
          height: r1(52 - drop * 0.6),
          rx: 19,
          fill: C.furShade,
        },
        {
          t: 'ellipse',
          cx: r1(200 - spread - 4),
          cy: r1(378 - stepL),
          rx: 30,
          ry: 14,
          fill: C.cream,
        },
        {
          t: 'ellipse',
          cx: r1(200 + spread + 4),
          cy: r1(378 - stepR),
          rx: 30,
          ry: 14,
          fill: C.cream,
        },
        {
          t: 'ellipse',
          cx: r1(200 - 56 * bw - 8 * d),
          cy: r1(334 + drop),
          rx: r1(38 + 6 * d),
          ry: 30,
          fill: C.furMid,
        },
        {
          t: 'ellipse',
          cx: r1(200 + 56 * bw + 8 * d),
          cy: r1(334 + drop),
          rx: r1(38 + 6 * d),
          ry: 30,
          fill: C.furMid,
        },
        {
          t: 'ellipse',
          cx: 200,
          cy: r1(torsoY - chestPuff / 2),
          rx: r1(92 * bw),
          ry: r1(96 - 8 * d + chestPuff),
          fill: C.fur,
        },
        {
          t: 'ellipse',
          cx: 200,
          cy: r1(torsoY + 20),
          rx: r1(62 * bw + chestPuff),
          ry: r1(70 - 6 * d),
          fill: C.cream,
        },
        { t: 'circle', cx: 174, cy: r1(204 + drop), r: 26, fill: C.cream },
        { t: 'circle', cx: 200, cy: r1(212 + drop), r: 29, fill: C.cream },
        { t: 'circle', cx: 226, cy: r1(204 + drop), r: 26, fill: C.cream },
        ...(dumbbell
          ? ([
              {
                t: 'rect',
                x: r1(endL.x - 34),
                y: r1(dbY - 6),
                width: r1(endR.x - endL.x + 68),
                height: 12,
                rx: 6,
                fill: '#57534E',
              },
            ] as BiscuitNode[])
          : []),
        arm(shL.x, shL.y, degL, lenL),
        arm(shR.x, shR.y, degR, lenR),
        ...(dumbbell
          ? ([
              {
                t: 'g',
                fill: C.brand,
                children: [
                  { t: 'rect', x: r1(endL.x - 44), y: r1(dbY - 28), width: 20, height: 56, rx: 7 },
                  { t: 'rect', x: r1(endR.x + 24), y: r1(dbY - 28), width: 20, height: 56, rx: 7 },
                ],
              },
            ] as BiscuitNode[])
          : []),
        {
          t: 'g',
          transform: `rotate(${r1(headTilt)} 200 ${r1(200 + drop)})`,
          children: [head(200, 136 + drop, { ...headOpts, wink: pose === 'wink' })],
        },
        ...(heldNode ? [heldNode] : []),
      ],
    },
  ];
}
