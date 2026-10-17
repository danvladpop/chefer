import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Biscuit } from "../components/Biscuit";
import { KibbleConfetti } from "../components/fx";
import { C, CLAMP, fontFamily } from "../theme";

/**
 * Onboarding loops (proposal, 2026-10-15): one short Biscuit beat per
 * onboarding step. Each is a 600×600 transparent clip of LOOP frames that
 * loops seamlessly — every motion is a whole number of cycles per loop.
 */
export const LOOP = 90;
export const LOOP_SIZE = 600;

const TAU = Math.PI * 2;
/** sin with `k` whole cycles per loop. */
const wave = (f: number, k = 1, offset = 0) =>
  Math.sin((TAU * k * f) / LOOP + offset);
/** 0→1→0 hump between two loop frames (for hops and pops). */
const hump = (f: number, from: number, to: number) =>
  Math.sin(Math.PI * interpolate(f, [from, to], [0, 1], CLAMP));

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ fontFamily }}>{children}</AbsoluteFill>
);

const Shadowless: React.FC<{
  y?: number;
  size?: number;
  children: React.ReactNode;
}> = ({ y = 0, size = 440, children }) => (
  <div
    style={{
      position: "absolute",
      left: (LOOP_SIZE - size) / 2,
      top: LOOP_SIZE - size - 30,
      translate: `0 ${y}px`,
    }}
  >
    {children}
  </div>
);

const Sparkle: React.FC<{
  x: number;
  y: number;
  s: number;
  color?: string;
}> = ({ x, y, s, color = "#F2B640" }) => (
  <svg
    width={60}
    height={60}
    viewBox="-30 -30 60 60"
    style={{
      position: "absolute",
      left: x - 30,
      top: y - 30,
      scale: String(Math.max(0, s)),
      opacity: Math.max(0, s),
    }}
  >
    <path
      d="M0 -26 L6 -6 L26 0 L6 6 L0 26 L-6 6 L-26 0 L-6 -6 Z"
      fill={color}
    />
  </svg>
);

/** 1 · Welcome — hello wave with two little hops. */
export const LoopWelcome: React.FC = () => {
  const f = useCurrentFrame();
  const hop = Math.max(0, wave(f, 2)) * -14;
  return (
    <Stage>
      <Shadowless y={hop}>
        <Biscuit
          pose="wink"
          size={440}
          tailWag={0.9}
          loop={LOOP}
          mood="happy"
          blink={false}
        />
      </Shadowless>
    </Stage>
  );
};

/** 2 · What should Chefer help with? — curious head tilt, a "?" pops. */
export const LoopCurious: React.FC = () => {
  const f = useCurrentFrame();
  const q = hump(f, 20, 70);
  return (
    <Stage>
      <Shadowless>
        <Biscuit
          pose="stand"
          size={440}
          headTilt={10 * wave(f, 1)}
          eyesWide={0.6}
          tailWag={0.5}
          loop={LOOP}
        />
      </Shadowless>
      <div
        style={{
          position: "absolute",
          left: 400,
          top: 70,
          width: 96,
          height: 96,
          borderRadius: 48,
          background: C.surface,
          boxShadow: "0 8px 24px rgba(28,25,23,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 60,
          fontWeight: 800,
          color: C.brand,
          scale: String(q),
          opacity: q,
        }}
      >
        ?
      </div>
    </Stage>
  );
};

/** 3a · Goal: lose weight — sucks in the belly, holds, lets go. */
export const LoopGoalLose: React.FC = () => {
  const f = useCurrentFrame();
  const suck = interpolate(f, [10, 22, 60, 72], [0, 1, 1, 0], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <Stage>
      <Shadowless>
        <Biscuit
          pose="proud"
          size={440}
          bodyWidth={1 - 0.22 * suck}
          eyesWide={suck}
          mood={suck > 0.5 ? "focused" : "happy"}
          headTilt={-6 * suck}
          tailWag={0.4}
          loop={LOOP}
        />
      </Shadowless>
    </Stage>
  );
};

/** 3b · Goal: build muscle — two goblet-squat bobs. */
export const LoopGoalMuscle: React.FC = () => {
  const f = useCurrentFrame();
  const depth = Math.max(0, wave(f, 2, -Math.PI / 2) * 0.5 + 0.5);
  return (
    <Stage>
      <Shadowless>
        <Biscuit
          pose="squat"
          accessory="headband"
          holding="dumbbell"
          size={440}
          squatDepth={depth}
          mood="focused"
          tailWag={0.3}
          loop={LOOP}
        />
      </Shadowless>
    </Stage>
  );
};

/** 3c · Goal: eat healthier / just good food — proud with a carrot. */
export const LoopGoalHealthy: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Shadowless y={-6 * Math.max(0, wave(f, 2))}>
        <Biscuit
          pose="proud"
          size={440}
          armRaise={0.75 + 0.1 * wave(f, 1)}
          holding="carrot"
          mood="proud"
          tailWag={0.7}
          loop={LOOP}
        />
      </Shadowless>
    </Stage>
  );
};

/** 4 · About you — hops on a scale, the needle wobbles and settles. */
export const LoopScale: React.FC = () => {
  const f = useCurrentFrame();
  const land = hump(f, 4, 22);
  const needle =
    interpolate(f, [22, 34, 44, 52, 80, 88], [-50, 30, -12, 8, 8, -50], CLAMP) +
    3 * wave(f, 3);
  return (
    <Stage>
      <svg
        width={300}
        height={70}
        viewBox="0 0 300 70"
        style={{ position: "absolute", left: 150, top: 505 }}
      >
        <rect
          x={0}
          y={10}
          width={300}
          height={56}
          rx={22}
          fill={C.surface}
          stroke={C.separator}
          strokeWidth={4}
        />
        <rect
          x={110}
          y={20}
          width={80}
          height={34}
          rx={10}
          fill={C.brandTint}
        />
        <g transform={`translate(150 52) rotate(${needle})`}>
          <rect x={-3} y={-28} width={6} height={28} rx={3} fill={C.brand} />
        </g>
      </svg>
      <Shadowless y={-60 * land - 20}>
        <Biscuit
          pose="stand"
          size={420}
          eyesWide={f > 24 && f < 56 ? 0.8 : 0}
          tailWag={0.5}
          loop={LOOP}
        />
      </Shadowless>
    </Stage>
  );
};

/** 5 · Anything you can't eat? — sniffs the bowl, a safety shield pops. */
export const LoopSniff: React.FC = () => {
  const f = useCurrentFrame();
  const sniff = f < 50 ? 4 * Math.max(0, Math.sin((f * TAU) / 10)) : 0;
  const shield = hump(f, 46, 88);
  return (
    <Stage>
      <Shadowless y={0}>
        <Biscuit
          pose="stand"
          size={440}
          headTilt={12 + sniff}
          mood={f > 50 ? "excited" : "focused"}
          tailWag={0.4}
          loop={LOOP}
        />
      </Shadowless>
      <svg
        width={200}
        height={100}
        viewBox="0 0 280 140"
        style={{ position: "absolute", left: 330, top: 470 }}
      >
        <path
          d="M8 64 H272 Q264 136 140 138 Q16 136 8 64 Z"
          fill="#FFFFFF"
          stroke={C.separator}
          strokeWidth={4}
        />
        <ellipse cx={140} cy={62} rx={112} ry={30} fill="#FFFDF8" />
        <circle cx={100} cy={52} r={18} fill="#E3A462" />
        <circle cx={170} cy={50} r={16} fill="#6B9A4B" />
        <path
          d="M22 84 H258"
          stroke={C.brandTint}
          strokeWidth={10}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 420,
          top: 80,
          scale: String(shield),
          opacity: shield,
        }}
      >
        <svg width={120} height={140} viewBox="0 0 24 28">
          <path
            d="M12 1 L22 5 V13 Q22 22 12 27 Q2 22 2 13 V5 Z"
            fill={C.positive}
          />
          <path
            d="M7 14 L11 18 L17 10"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Stage>
  );
};

/** 6 · Building your week (loader) — chef Biscuit, food drops into the bowl. */
export const LoopCooking: React.FC = () => {
  const f = useCurrentFrame();
  const drop = (start: number) => {
    const t = interpolate(f, [start, start + 14], [0, 1], {
      ...CLAMP,
      easing: Easing.in(Easing.quad),
    });
    const fade = interpolate(f, [80, 89], [1, 0], CLAMP);
    return { y: -170 * (1 - t), o: f >= start ? fade : 0 };
  };
  const pieces = [
    { at: 8, x: 300, color: "#FFFDF8", r: 26 },
    { at: 28, x: 270, color: "#E3A462", r: 20 },
    { at: 48, x: 330, color: "#6B9A4B", r: 18 },
  ];
  return (
    <Stage>
      <Shadowless y={-4 * Math.max(0, wave(f, 3))}>
        <Biscuit
          pose="stand"
          accessory="chefHat"
          size={430}
          reach={0.35 + 0.15 * wave(f, 3)}
          mood="happy"
          tailWag={0.6}
          loop={LOOP}
        />
      </Shadowless>
      {pieces.map((p) => {
        const d = drop(p.at);
        return (
          <div
            key={p.at}
            style={{
              position: "absolute",
              left: p.x + 60 - p.r,
              top: 505 - p.r,
              width: p.r * 2,
              height: p.r * 2,
              borderRadius: p.r,
              background: p.color,
              border:
                p.color === "#FFFDF8" ? `3px solid ${C.separator}` : "none",
              translate: `0 ${d.y}px`,
              opacity: d.o,
            }}
          />
        );
      })}
      <svg
        width={240}
        height={120}
        viewBox="0 0 280 140"
        style={{ position: "absolute", left: 240, top: 450 }}
      >
        <path
          d="M8 64 H272 Q264 136 140 138 Q16 136 8 64 Z"
          fill="#FFFFFF"
          stroke={C.separator}
          strokeWidth={4}
        />
        <path
          d="M22 84 H258"
          stroke={C.brandTint}
          strokeWidth={10}
          strokeLinecap="round"
        />
      </svg>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 330 + i * 40,
            top: 420,
            width: 14,
            height: 50,
            borderRadius: 7,
            background: C.ring,
            opacity: 0.35 + 0.35 * wave(f, 2, i * 2),
            translate: `0 ${-20 - 14 * wave(f, 2, i * 2)}px`,
          }}
        />
      ))}
    </Stage>
  );
};

/** 7 · Your week is ready (one-shot) — proud hop + kibble confetti. */
export const LoopReady: React.FC = () => {
  const f = useCurrentFrame();
  const hop = hump(f, 6, 26) * -70;
  return (
    <Stage>
      <KibbleConfetti
        at={8}
        count={26}
        area={{ width: LOOP_SIZE, height: LOOP_SIZE }}
      />
      <Shadowless y={hop}>
        <Biscuit
          pose="proud"
          size={440}
          mood={f < 30 ? "excited" : "proud"}
          tailWag={1}
          loop={LOOP}
        />
      </Shadowless>
    </Stage>
  );
};

/** 8 · Premium — Biscuit in a crown, paw up, sparkles twinkle. */
export const LoopPremium: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Sparkle x={110} y={150} s={wave(f, 2)} />
      <Sparkle x={500} y={130} s={wave(f, 2, Math.PI)} />
      <Sparkle x={470} y={320} s={wave(f, 2, Math.PI / 2)} color={C.ring} />
      <Sparkle x={130} y={360} s={wave(f, 2, -Math.PI / 2)} color={C.ring} />
      <Shadowless y={-8 * wave(f, 1)}>
        <Biscuit
          pose="proud"
          accessory="crown"
          size={440}
          armRaise={1}
          mood="proud"
          tailWag={0.8}
          loop={LOOP}
        />
      </Shadowless>
    </Stage>
  );
};

/** 9 · Training setup — two squat bobs in a headband. */
export const LoopTraining = LoopGoalMuscle;

/** 10 · You're all set — a happy spin and a wink. */
export const LoopAllSet: React.FC = () => {
  const f = useCurrentFrame();
  const spin = interpolate(f, [8, 38], [0, 1], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <Stage>
      <Shadowless y={hump(f, 8, 38) * -50}>
        <div style={{ scale: `${Math.cos(spin * TAU)} 1` }}>
          <Biscuit
            pose={f > 40 ? "wink" : "stand"}
            size={440}
            mood="excited"
            tailWag={1}
            loop={LOOP}
          />
        </div>
      </Shadowless>
    </Stage>
  );
};

export const ONBOARDING_LOOPS = [
  { id: "Onb-01-Welcome", label: "Welcome", component: LoopWelcome },
  {
    id: "Onb-02-Curious",
    label: "What do you want help with?",
    component: LoopCurious,
  },
  {
    id: "Onb-03a-GoalLose",
    label: "Goal · lose weight",
    component: LoopGoalLose,
  },
  {
    id: "Onb-03b-GoalMuscle",
    label: "Goal · build muscle / training",
    component: LoopGoalMuscle,
  },
  {
    id: "Onb-03c-GoalHealthy",
    label: "Goal · eat healthier",
    component: LoopGoalHealthy,
  },
  { id: "Onb-04-Scale", label: "About you", component: LoopScale },
  {
    id: "Onb-05-Sniff",
    label: "Anything you can't eat?",
    component: LoopSniff,
  },
  {
    id: "Onb-06-Cooking",
    label: "Building your week…",
    component: LoopCooking,
  },
  { id: "Onb-07-Ready", label: "Your week is ready", component: LoopReady },
  { id: "Onb-08-Premium", label: "Premium", component: LoopPremium },
  { id: "Onb-10-AllSet", label: "You're all set", component: LoopAllSet },
] as const;

/** Preview sheet: every loop in a labelled grid on the app canvas. */
export const OnboardingLoopsSheet: React.FC = () => {
  const { width } = useVideoConfig();
  const cols = 4;
  const cell = width / cols;
  return (
    <AbsoluteFill style={{ background: C.canvas, fontFamily }}>
      {ONBOARDING_LOOPS.map((l, i) => {
        const Comp = l.component;
        return (
          <div
            key={l.id}
            style={{
              position: "absolute",
              left: (i % cols) * cell,
              top: Math.floor(i / cols) * (cell + 60),
              width: cell,
              height: cell + 60,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: LOOP_SIZE,
                height: LOOP_SIZE,
                scale: String(cell / LOOP_SIZE),
                transformOrigin: "0 0",
              }}
            >
              <Comp />
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: cell,
                textAlign: "center",
                fontSize: 26,
                fontWeight: 700,
                color: C.label,
              }}
            >
              {i + 1}. {l.label}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
