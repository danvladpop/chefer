import React from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { C, CLAMP, EASE_ENTER, EASE_EXIT, GENTLE, SNAPPY, sp } from "../theme";

/** Interpolated count-up between two numbers, entrance easing. */
export const countUp = (
  frame: number,
  at: number,
  duration: number,
  from: number,
  to: number,
) =>
  interpolate(frame, [at, at + duration], [from, to], {
    ...CLAMP,
    easing: EASE_ENTER,
  });

/**
 * Biscuit's giant paw coming in from the bottom-right to tap a point, like a
 * finger in an app demo. (x, y) is where the toe tip lands.
 */
export const TapPaw: React.FC<{
  x: number;
  y: number;
  enterAt: number;
  tapAt: number;
  exitAt: number;
}> = ({ x, y, enterAt, tapAt, exitAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = sp(frame, fps, enterAt, GENTLE);
  const exit = interpolate(frame, [exitAt, exitAt + 12], [0, 1], {
    ...CLAMP,
    easing: EASE_EXIT,
  });
  const away = 1 - enter + exit;
  const press =
    sp(frame, fps, tapAt - 2, SNAPPY) - sp(frame, fps, tapAt + 2, SNAPPY);
  if (frame < enterAt || exit >= 1) return null;

  const tipX = 120;
  const tipY = 40;
  return (
    <div
      style={{
        position: "absolute",
        left: x - tipX,
        top: y - tipY,
        width: 240,
        height: 640,
        transformOrigin: `${tipX}px ${tipY}px`,
        translate: `${away * 380}px ${away * 820}px`,
        rotate: "-24deg",
        scale: String(1 - 0.08 * press),
      }}
    >
      <svg
        width={240}
        height={640}
        viewBox="0 0 240 640"
        style={{ overflow: "visible" }}
      >
        <rect x={62} y={110} width={116} height={560} rx={58} fill="#E0883A" />
        <rect
          x={62}
          y={150}
          width={116}
          height={30}
          fill="#D27B30"
          opacity={0.5}
        />
        <ellipse cx={120} cy={118} rx={84} ry={78} fill={C.cream} />
        <ellipse cx={120} cy={146} rx={38} ry={30} fill="#F3C08F" />
        <ellipse cx={66} cy={92} rx={15} ry={18} fill="#F3C08F" />
        <ellipse cx={100} cy={66} rx={15} ry={18} fill="#F3C08F" />
        <ellipse cx={140} cy={66} rx={15} ry={18} fill="#F3C08F" />
        <ellipse cx={174} cy={92} rx={15} ry={18} fill="#F3C08F" />
      </svg>
    </div>
  );
};

/** Tap ripple: a ring that expands and fades from the tap point. */
export const Ripple: React.FC<{
  x: number;
  y: number;
  at: number;
  color?: string;
  size?: number;
}> = ({ x, y, at, color = C.brand, size = 140 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 14], [0, 1], {
    ...CLAMP,
    easing: EASE_ENTER,
  });
  if (frame < at || p >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        border: `6px solid ${color}`,
        opacity: 1 - p,
        scale: String(0.3 + 0.9 * p),
      }}
    />
  );
};

/** Small celebratory burst: rays shoot out and fade (transform + opacity only). */
export const Burst: React.FC<{
  x: number;
  y: number;
  at: number;
  color?: string;
  rays?: number;
  radius?: number;
}> = ({ x, y, at, color = C.positive, rays = 10, radius = 90 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 16], [0, 1], {
    ...CLAMP,
    easing: EASE_ENTER,
  });
  if (frame < at || p >= 1) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y }}>
      {Array.from({ length: rays }).map((_, i) => {
        const a = (i / rays) * 360;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: -5,
              top: -14,
              width: 10,
              height: 28,
              borderRadius: 5,
              background: i % 2 ? color : C.ring,
              transformOrigin: "50% 50%",
              rotate: `${a}deg`,
              translate: `${Math.sin((a * Math.PI) / 180) * radius * p}px ${-Math.cos((a * Math.PI) / 180) * radius * p}px`,
              opacity: 1 - p,
              scale: String(1 - 0.5 * p),
            }}
          />
        );
      })}
    </div>
  );
};

/** Progress ring in the app's style (track + brand arc, round caps). */
export const ProgressRing: React.FC<{
  size: number;
  stroke: number;
  progress: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({
  size,
  stroke,
  progress,
  color = C.brand,
  track = C.surfaceSunken,
  children,
  style,
}) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <svg
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0, rotate: "-90deg" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        {p > 0.001 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - p)}
          />
        ) : null}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
};

const KIBBLE_COLORS = [C.brand, C.attention, "#C46F27", C.ring, "#7E3E00"];

/** Kibble-shaped confetti falling over the whole frame from `at`. */
export const KibbleConfetti: React.FC<{ at: number; count?: number }> = ({
  at,
  count = 44,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame - at;
  if (t < 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const delay = random(`d${i}`) * 10;
        const tt = t - delay;
        if (tt < 0) return null;
        const x0 = random(`x${i}`) * width;
        const vy = (0.016 + 0.012 * random(`v${i}`)) * height;
        const y =
          -80 -
          random(`y${i}`) * height * 0.4 +
          vy * tt +
          0.0006 * height * tt * tt;
        const drift = Math.sin(tt * 0.18 + i) * 30;
        const rot = random(`r${i}`) * 360 + tt * (random(`s${i}`) - 0.5) * 24;
        const shape = i % 3;
        const color = KIBBLE_COLORS[i % KIBBLE_COLORS.length];
        const s = 26 + random(`z${i}`) * 22;
        if (y > height + 80) return null;
        return (
          <svg
            key={i}
            width={s}
            height={s}
            viewBox="0 0 40 40"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              translate: `${x0 + drift}px ${y}px`,
              rotate: `${rot}deg`,
            }}
          >
            {shape === 0 ? (
              <path
                d="M20 4 L36 32 Q38 36 33 36 L7 36 Q2 36 4 32 Z"
                fill={color}
              />
            ) : null}
            {shape === 1 ? (
              <g fill={color}>
                <circle cx="20" cy="20" r="15" />
                <circle cx="20" cy="20" r="5" fill={C.canvas} />
              </g>
            ) : null}
            {shape === 2 ? (
              <g fill={color}>
                <rect x="9" y="15" width="22" height="10" rx="4" />
                <circle cx="8" cy="14" r="6" />
                <circle cx="8" cy="26" r="6" />
                <circle cx="32" cy="14" r="6" />
                <circle cx="32" cy="26" r="6" />
              </g>
            ) : null}
          </svg>
        );
      })}
    </div>
  );
};
