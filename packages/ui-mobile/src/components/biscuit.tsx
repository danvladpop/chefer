/* eslint-disable @typescript-eslint/no-deprecated -- react-native-svg's types mark <Rect x/y> deprecated (they mean the transform shorthands); here they are the rectangle's SVG geometry, as in the chart components. */
import { useEffect, useId, useState, type ReactNode } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';
import {
  BISCUIT_LOOP_FPS,
  BISCUIT_LOOP_FRAMES,
  BISCUIT_STILL_FRAME,
  BISCUIT_VIEWBOX,
  biscuitLoopFrame,
  biscuitShapes,
  type BiscuitLoop,
  type BiscuitNode,
} from '@chefer/utils';
import { useReducedMotion } from '../motion/use-reduced-motion';

// Biscuit, the Chefer corgi, drawn live from the shared shape data in
// @chefer/utils (biscuit/geometry.ts + loops.ts) — the mobile twin of
// @chefer/ui Biscuit. Pure JS (react-native-svg), so it ships over the air.
// Plays the 3 s seamless loop at 20 renders a second (the art is 30 fps; the
// clock skips frames rather than slowing down). Reduce Motion → the still pose.

const RENDER_INTERVAL_MS = 50;

const PAINT_KEYS = [
  'fill',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'opacity',
  'transform',
] as const;

/** Only the paint props a shape sets (exactOptionalPropertyTypes: no `undefined` values). */
function paint(n: Exclude<BiscuitNode, { t: 'clip' }>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of PAINT_KEYS) {
    const value = n[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** react-native-svg wants clip paths in <Defs>: hoist them (their user space is the referencing group's). */
function collectClips(nodes: BiscuitNode[], out: Extract<BiscuitNode, { t: 'clip' }>[]) {
  for (const n of nodes) {
    if (n.t === 'clip') out.push(n);
    else if (n.t === 'g') collectClips(n.children, out);
  }
  return out;
}

function renderNodes(nodes: BiscuitNode[], uid: string, keyPrefix = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.t) {
      case 'ellipse':
        return <Ellipse key={key} cx={n.cx} cy={n.cy} rx={n.rx} ry={n.ry} {...paint(n)} />;
      case 'circle':
        return <Circle key={key} cx={n.cx} cy={n.cy} r={n.r} {...paint(n)} />;
      case 'rect':
        return (
          <Rect
            key={key}
            x={n.x}
            y={n.y}
            width={n.width}
            height={n.height}
            {...(n.rx !== undefined && { rx: n.rx })}
            {...paint(n)}
          />
        );
      case 'path':
        return <Path key={key} d={n.d} {...paint(n)} />;
      case 'polygon':
        return <Polygon key={key} points={n.points} {...paint(n)} />;
      case 'clip':
        return null;
      case 'g':
        return (
          <G key={key} {...paint(n)} {...(n.clip && { clipPath: `url(#${uid}-${n.clip})` })}>
            {renderNodes(n.children, uid, `${key}.`)}
          </G>
        );
    }
  });
}

export interface BiscuitProps {
  /** Which beat to play (see BISCUIT_LOOPS). */
  loop: BiscuitLoop;
  /** Rendered width in points; height follows the loop canvas's aspect. */
  size?: number;
  /** Pause on the still pose (e.g. while a sheet covers him). */
  playing?: boolean;
  /** Accessible name; `null` hides him from screen readers (decorative). */
  label?: string | null;
  testID?: string;
}

export function Biscuit({
  loop,
  size = 160,
  playing = true,
  label = 'Biscuit the corgi',
  testID,
}: BiscuitProps) {
  const reduced = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [frame, setFrame] = useState(BISCUIT_STILL_FRAME);
  const animate = playing && !reduced;

  useEffect(() => {
    if (!animate) {
      setFrame(BISCUIT_STILL_FRAME);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setFrame(Math.floor(((Date.now() - start) / 1000) * BISCUIT_LOOP_FPS) % BISCUIT_LOOP_FRAMES);
    }, RENDER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [animate, loop]);

  const lf = biscuitLoopFrame(loop, frame);
  const body = biscuitShapes(lf.props, frame);
  const vb = BISCUIT_VIEWBOX;
  const sx = Math.abs(lf.scaleX) < 0.02 ? 0.02 : lf.scaleX;
  const clips = [
    ...collectClips(lf.behind, []).map((c) => ({ c, uid: `${uid}b` })),
    ...collectClips(body, []).map((c) => ({ c, uid })),
    ...collectClips(lf.front, []).map((c) => ({ c, uid: `${uid}f` })),
  ];

  return (
    <Svg
      width={size}
      height={Math.round((size * vb.height) / vb.width)}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      {...(testID !== undefined && { testID })}
      accessible={label !== null}
      {...(label !== null && { accessibilityRole: 'image' as const })}
      {...(label !== null && { accessibilityLabel: label })}
      importantForAccessibility={label === null ? 'no-hide-descendants' : 'auto'}
    >
      <Defs>
        {clips.map(({ c, uid: id }) => (
          <ClipPath key={`${id}-${c.id}`} id={`${id}-${c.id}`}>
            {renderNodes(c.children, id, `clip-${c.id}-`)}
          </ClipPath>
        ))}
      </Defs>
      {renderNodes(lf.behind, `${uid}b`, 'b')}
      <G transform={`translate(0 ${lf.dy}) translate(200 0) scale(${sx} 1) translate(-200 0)`}>
        {renderNodes(body, uid, 'm')}
      </G>
      {renderNodes(lf.front, `${uid}f`, 'f')}
    </Svg>
  );
}
