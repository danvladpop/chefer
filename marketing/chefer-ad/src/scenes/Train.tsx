import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Biscuit } from "../components/Biscuit";
import { Burst, ProgressRing } from "../components/fx";
import { Headline } from "../components/Headline";
import { Card, CONTENT_TOP, Phone } from "../components/Phone";
import { SfxCue } from "../components/Sfx";
import { At, Stage, useLayout } from "../layout";
import { BOUNCY, C, CLAMP, fontFamily, GENTLE, SNAPPY, sp } from "../theme";
import { PHONE_AT } from "./MealPlan";

const FLOOR_Y = 1180;
const CARD_IN = 6;
const SQUATS = [22, 38, 54];
const SQUAT_LEN = 16;
const REST = [72, 96];
const PR = 96;
const SPIN = [100, 116];

const ROUTINE = [
  { name: "Goblet squat", sets: "3 × 10" },
  { name: "Romanian deadlift", sets: "3 × 8" },
  { name: "Walking lunge", sets: "3 × 12" },
  { name: "Calf raise", sets: "3 × 15" },
];

const ACTIVE_TOP = CONTENT_TOP + 330 + 20;

const TrainScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = sp(frame, fps, CARD_IN, GENTLE);
  const panel = sp(frame, fps, CARD_IN + 6, GENTLE);
  // Each squat's rep lands at the bottom of the bob: 7 → 8 → 9 → 10.
  const done = SQUATS.filter((s) => frame >= s + SQUAT_LEN / 2).length;
  const lastRep = SQUATS[done - 1] ?? -100;
  const repPop =
    sp(frame, fps, lastRep + SQUAT_LEN / 2, SNAPPY) -
    sp(frame, fps, lastRep + SQUAT_LEN / 2 + 4, SNAPPY);
  const rest = interpolate(frame, REST, [0, 1], CLAMP);
  const restLeft = Math.round(45 * (1 - rest));

  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        right: 20,
        top: CONTENT_TOP,
        fontFamily,
      }}
    >
      <Card
        style={{
          height: 330,
          padding: "22px 24px",
          opacity: Math.min(1, card * 1.5),
          translate: `0 ${(1 - card) * 320}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 800 }}>Leg day</div>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              background: C.brandTint,
              color: C.brand,
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            4 exercises
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          {ROUTINE.map((r, i) => (
            <div
              key={r.name}
              style={{
                height: 60,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: i === 0 ? C.brand : C.separator,
                }}
              />
              <div style={{ flex: 1, fontSize: 26, fontWeight: 600 }}>
                {r.name}
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: C.labelSecondary,
                }}
              >
                {r.sets}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card
        style={{
          marginTop: 20,
          height: 300,
          padding: "22px 24px",
          opacity: Math.min(1, panel * 1.5),
          translate: `0 ${(1 - panel) * 320}px`,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800 }}>Goblet squat</div>
        <div style={{ fontSize: 24, fontWeight: 600, color: C.labelSecondary }}>
          Set 2 of 3 · 24 kg
        </div>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div
              style={{
                fontSize: 120,
                fontWeight: 800,
                lineHeight: 1,
                color: C.label,
                scale: String(1 + 0.18 * repPop),
                transformOrigin: "50% 80%",
              }}
            >
              {7 + done}
            </div>
            <div
              style={{ fontSize: 28, fontWeight: 600, color: C.labelSecondary }}
            >
              reps
            </div>
          </div>
          <ProgressRing size={150} stroke={16} progress={rest}>
            <div
              style={{ fontSize: 22, fontWeight: 600, color: C.labelSecondary }}
            >
              Rest
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              0:{String(restLeft).padStart(2, "0")}
            </div>
          </ProgressRing>
        </div>
      </Card>
    </div>
  );
};

const Trophy: React.FC = () => (
  <svg
    width={36}
    height={36}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.cream}
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" fill={C.cream} />
    <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" />
  </svg>
);

export const Train: React.FC<{ headline: string }> = ({ headline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { absY } = useLayout();

  // Three squat bobs via interpolate.
  const depth = SQUATS.reduce(
    (acc, s) =>
      acc +
      interpolate(frame, [s, s + SQUAT_LEN / 2, s + SQUAT_LEN], [0, 1, 0], {
        ...CLAMP,
        easing: Easing.inOut(Easing.sin),
      }),
    0,
  );
  const spin = interpolate(frame, SPIN, [0, 1], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });
  const pr = sp(frame, fps, PR, BOUNCY);
  const happy = frame >= PR;
  const badge = { x: PHONE_AT.x + 300, y: PHONE_AT.y + 14 + ACTIVE_TOP - 40 };

  return (
    <AbsoluteFill style={{ background: C.canvas, fontFamily }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: absY(FLOOR_Y),
          bottom: 0,
          background: C.surfaceSunken,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: absY(FLOOR_Y) - 10,
          height: 10,
          background: C.separator,
        }}
      />
      <Stage>
        {/* Wall mirror + wall bars */}
        <At
          x={30}
          y={330}
          w={400}
          h={560}
          style={{
            borderRadius: 28,
            background: `linear-gradient(160deg, #FFFFFF, ${C.surfaceSunken})`,
            border: `10px solid ${C.separator}`,
          }}
        />
        <At
          x={60}
          y={380}
          w={120}
          h={8}
          style={{
            background: "#FFFFFF",
            rotate: "-40deg",
            opacity: 0.9,
            borderRadius: 4,
          }}
        />
        {/* Gym mat */}
        <At
          x={-30}
          y={FLOOR_Y - 26}
          w={540}
          h={64}
          style={{ borderRadius: 32, background: C.brand }}
        />
        <At
          x={-10}
          y={FLOOR_Y - 18}
          w={500}
          h={10}
          style={{ borderRadius: 5, background: C.ring, opacity: 0.45 }}
        />
        {/* Kettlebell */}
        <At x={430} y={FLOOR_Y - 96}>
          <svg width={90} height={100} viewBox="0 0 90 100">
            <path
              d="M25 40 Q25 8 45 8 Q65 8 65 40"
              stroke={C.label}
              strokeWidth={12}
              fill="none"
            />
            <circle cx={45} cy={64} r={34} fill={C.label} />
            <rect x={30} y={56} width={30} height={14} rx={4} fill={C.ring} />
          </svg>
        </At>

        <Phone
          active="train"
          title="Train"
          subtitle="Week 3 · Day 2"
          style={{ left: PHONE_AT.x, top: PHONE_AT.y }}
        >
          <TrainScreen />
        </Phone>

        <At
          x={10}
          y={FLOOR_Y + 6 - 446}
          style={{
            transformOrigin: "50% 100%",
            scale: `${Math.cos(spin * 2 * Math.PI)} 1`,
            translate: `0 ${-70 * Math.sin(Math.PI * spin)}px`,
          }}
        >
          <Biscuit
            pose="squat"
            accessory="headband"
            holding="dumbbell"
            size={460}
            squatDepth={depth}
            mood={happy ? "excited" : "focused"}
            eyesWide={happy ? pr : 0}
            tailWag={happy ? 1 : 0.35}
          />
        </At>

        <Burst
          x={badge.x + 110}
          y={badge.y + 36}
          at={PR}
          color={C.brand}
          rays={12}
          radius={150}
        />
        <At
          x={badge.x}
          y={badge.y}
          style={{
            opacity: Math.min(1, pr * 2),
            scale: String(pr),
            rotate: "-6deg",
            transformOrigin: "50% 50%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 26px",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${C.logoFrom}, ${C.logoTo})`,
              color: C.cream,
              fontSize: 34,
              fontWeight: 800,
              whiteSpace: "nowrap",
              boxShadow: "0 12px 30px rgba(126,62,0,0.35)",
            }}
          >
            <Trophy />
            New PR
          </div>
        </At>
      </Stage>
      <Headline text={headline} />
      <SfxCue at={CARD_IN} kind="whoosh" />
      {SQUATS.map((s) => (
        <SfxCue key={s} at={s + SQUAT_LEN / 2} kind="tick" volume={0.5} />
      ))}
      <SfxCue at={PR} kind="chime" />
    </AbsoluteFill>
  );
};
