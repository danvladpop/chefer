'use client';

import * as React from 'react';
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

// ─── Biscuit ──────────────────────────────────────────────────────────────────
// The Chefer corgi, drawn live from the shared shape data in @chefer/utils
// (biscuit/geometry.ts + loops.ts) — the web twin of @chefer/ui-mobile
// Biscuit. Plays a 3 s seamless loop at 30 fps; reduced motion draws the
// still pose. Transform/opacity-only motion inside one inline <svg>.

function paint(n: BiscuitNode) {
  if (n.t === 'clip') return {};
  return {
    fill: n.fill,
    stroke: n.stroke,
    strokeWidth: n.strokeWidth,
    strokeLinecap: n.strokeLinecap,
    strokeLinejoin: n.strokeLinejoin,
    opacity: n.opacity,
    transform: n.transform,
  };
}

function renderNodes(nodes: BiscuitNode[], uid: string): React.ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'ellipse':
        return <ellipse key={i} cx={n.cx} cy={n.cy} rx={n.rx} ry={n.ry} {...paint(n)} />;
      case 'circle':
        return <circle key={i} cx={n.cx} cy={n.cy} r={n.r} {...paint(n)} />;
      case 'rect':
        return (
          <rect key={i} x={n.x} y={n.y} width={n.width} height={n.height} rx={n.rx} {...paint(n)} />
        );
      case 'path':
        return <path key={i} d={n.d} {...paint(n)} />;
      case 'polygon':
        return <polygon key={i} points={n.points} {...paint(n)} />;
      case 'clip':
        return (
          <clipPath key={i} id={`${uid}-${n.id}`}>
            {renderNodes(n.children, uid)}
          </clipPath>
        );
      case 'g':
        return (
          <g key={i} {...paint(n)} clipPath={n.clip ? `url(#${uid}-${n.clip})` : undefined}>
            {renderNodes(n.children, uid)}
          </g>
        );
    }
  });
}

export interface BiscuitProps {
  /** Which beat to play (see BISCUIT_LOOPS). */
  loop: BiscuitLoop;
  /** Rendered width in px; height follows the loop canvas's aspect. */
  size?: number;
  /** Pause on the still pose (e.g. off-screen). */
  playing?: boolean;
  /** Accessible name; pass `null` when the surrounding text already says it. */
  label?: string | null;
  className?: string;
}

export function Biscuit({
  loop,
  size = 160,
  playing = true,
  label = 'Biscuit the corgi',
  className,
}: BiscuitProps) {
  const reduced = useReducedMotion();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const [frame, setFrame] = React.useState(BISCUIT_STILL_FRAME);
  const animate = playing && !reduced;

  React.useEffect(() => {
    if (!animate) {
      setFrame(BISCUIT_STILL_FRAME);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // Integer frames: React skips the re-render between them (60 Hz rAF, 30 fps art).
      setFrame(Math.floor(((now - start) / 1000) * BISCUIT_LOOP_FPS) % BISCUIT_LOOP_FRAMES);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, loop]);

  const lf = biscuitLoopFrame(loop, frame);
  const vb = BISCUIT_VIEWBOX;
  const sx = Math.abs(lf.scaleX) < 0.02 ? 0.02 : lf.scaleX;

  return (
    <svg
      width={size}
      height={Math.round((size * vb.height) / vb.width)}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {renderNodes(lf.behind, `${uid}b`)}
      <g transform={`translate(0 ${lf.dy}) translate(200 0) scale(${sx} 1) translate(-200 0)`}>
        {renderNodes(biscuitShapes(lf.props, frame), uid)}
      </g>
      {renderNodes(lf.front, `${uid}f`)}
    </svg>
  );
}
