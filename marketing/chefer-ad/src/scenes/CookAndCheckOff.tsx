import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Biscuit } from "../components/Biscuit";
import { Burst, countUp, ProgressRing, TapPaw } from "../components/fx";
import { Headline } from "../components/Headline";
import { Bowl } from "../components/illustrations";
import { BEZEL, Card, CONTENT_TOP, Phone, SCREEN_W } from "../components/Phone";
import { SfxCue } from "../components/Sfx";
import { At, Stage, useLayout } from "../layout";
import {
  BOUNCY,
  C,
  CLAMP,
  EASE_ENTER,
  formatThousands,
  fontFamily,
  GENTLE,
  SNAPPY,
  sp,
} from "../theme";
import { PHONE_AT } from "./MealPlan";

/** Hard cut from the kitchen to the Today tab (≈ global frame 295). */
const CUT = 55;
const COUNTER_Y = 980;

const MACROS = [
  { label: "kcal", value: 540, unit: "" },
  { label: "Protein", value: 42, unit: " g" },
  { label: "Carbs", value: 55, unit: " g" },
  { label: "Fat", value: 14, unit: " g" },
];

const Corner: React.FC<{ rot: number; style: React.CSSProperties }> = ({
  rot,
  style,
}) => (
  <div
    style={{
      position: "absolute",
      width: 64,
      height: 64,
      borderTop: `8px solid ${C.cream}`,
      borderLeft: `8px solid ${C.cream}`,
      borderTopLeftRadius: 22,
      rotate: `${rot}deg`,
      ...style,
    }}
  />
);

const CameraScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const FRAME_IN = 18;
  const SWEEP = [20, 36];
  const CHIPS = 34;
  const frameIn = sp(frame, fps, FRAME_IN, SNAPPY);
  const box = { left: 46, top: 190, width: SCREEN_W - 92, height: 330 };

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily }}>
      <div
        style={{
          position: "absolute",
          top: 76,
          left: "50%",
          translate: "-50% 0",
          padding: "10px 24px",
          borderRadius: 999,
          background: "rgba(255,244,230,0.14)",
          color: C.cream,
          fontSize: 26,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        Scan meal
      </div>
      <div
        style={{ position: "absolute", left: (SCREEN_W - 420) / 2, top: 250 }}
      >
        <Bowl width={420} />
      </div>
      <div
        style={{
          position: "absolute",
          ...box,
          opacity: frameIn,
          scale: String(1.12 - 0.12 * frameIn),
        }}
      >
        <Corner rot={0} style={{ left: 0, top: 0 }} />
        <Corner rot={90} style={{ right: 0, top: 0 }} />
        <Corner rot={180} style={{ right: 0, bottom: 0 }} />
        <Corner rot={270} style={{ left: 0, bottom: 0 }} />
        {/* Scan line sweeps the plate (translateY only). */}
        <div
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            top: 0,
            height: 8,
            borderRadius: 4,
            background: C.ring,
            boxShadow: `0 0 28px 8px rgba(233,207,174,0.55)`,
            translate: `0 ${interpolate(frame, SWEEP, [10, box.height - 18], { ...CLAMP, easing: EASE_ENTER })}px`,
            opacity: interpolate(
              frame,
              [SWEEP[0], SWEEP[0] + 2, SWEEP[1], SWEEP[1] + 4],
              [0, 1, 1, 0],
              CLAMP,
            ),
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 28,
          right: 28,
          top: 580,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {MACROS.map((m, i) => {
          const at = CHIPS + i * 3;
          const pop = sp(frame, fps, at, BOUNCY);
          return (
            <div
              key={m.label}
              style={{
                background: C.surface,
                borderRadius: 24,
                padding: "16px 22px",
                opacity: Math.min(1, pop * 2),
                scale: String(0.6 + 0.4 * pop),
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: C.labelSecondary,
                }}
              >
                {m.label}
              </div>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  color: C.label,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(countUp(frame, at, 12, 0, m.value))}
                {m.unit}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 28,
          right: 28,
          bottom: 60,
          height: 84,
          borderRadius: 42,
          background: C.brand,
          color: C.cream,
          fontSize: 30,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: sp(frame, fps, 46, GENTLE),
          translate: `0 ${(1 - sp(frame, fps, 46, GENTLE)) * 40}px`,
        }}
      >
        Add to Lunch
      </div>
    </div>
  );
};

const Kitchen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { absY } = useLayout();
  const raise = sp(frame, fps, 16, GENTLE);

  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      {/* Tiles */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.separator} 2px, transparent 2px), linear-gradient(90deg, ${C.separator} 2px, transparent 2px)`,
          backgroundSize: "90px 90px",
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: absY(COUNTER_Y),
          bottom: 0,
          background: C.surfaceSunken,
        }}
      />
      <Stage>
        <At x={20} y={540}>
          <Biscuit
            pose="stand"
            accessory="chefHat"
            size={480}
            reach={interpolate(
              frame,
              [0, 6, 14, 18],
              [0.2, 0.45, 0.45, 0],
              CLAMP,
            )}
            armRaise={raise}
            holding={raise > 0.35 ? "phone" : "none"}
            mood={frame > 38 ? "excited" : "happy"}
            tailWag={0.6}
          />
        </At>
      </Stage>
      {/* Counter top drawn over Biscuit's legs */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: absY(COUNTER_Y),
          bottom: 0,
          background: C.surfaceSunken,
          borderTop: `28px solid ${C.surface}`,
          boxShadow: `inset 0 2px 0 ${C.separator}`,
        }}
      />
      <Stage>
        <At x={170} y={COUNTER_Y - 120}>
          <Bowl width={300} dropAt={[2, 6, 10]} />
        </At>
        <Phone dark style={{ left: PHONE_AT.x, top: PHONE_AT.y }}>
          <CameraScreen />
        </Phone>
      </Stage>
    </AbsoluteFill>
  );
};

const TODAY_MEALS = [
  { slot: "Breakfast", name: "Yogurt and oats", kcal: 380, done: true },
  { slot: "Lunch", name: "Chicken rice bowl", kcal: 540, done: false },
  { slot: "Dinner", name: "Salmon and greens", kcal: 480, done: false },
];
const SUMMARY_H = 170;
const MEAL_ROW_H = 100;
const MEALS_TOP = CONTENT_TOP + SUMMARY_H + 20;
const TAP = 14;
/** Lunch check circle, in phone coordinates. */
const LUNCH_CIRCLE = {
  x: BEZEL + 20 + 24 + 26,
  y: BEZEL + MEALS_TOP + MEAL_ROW_H * 1 + MEAL_ROW_H / 2,
};

const CheckCircle: React.FC<{ fill: number; check: number }> = ({
  fill,
  check,
}) => (
  <div
    style={{
      position: "relative",
      width: 52,
      height: 52,
      borderRadius: 26,
      border: `3px solid ${C.separator}`,
      flexShrink: 0,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: -3,
        borderRadius: 26,
        background: C.positive,
        scale: String(fill),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={30}
        height={30}
        viewBox="0 0 24 24"
        style={{ scale: String(check) }}
      >
        <path
          d="M5 12.5 L10 17 L19 7"
          stroke="#FFFFFF"
          strokeWidth={3.4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  </div>
);

const TodayScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fill = sp(frame, fps, TAP, SNAPPY);
  const check = sp(frame, fps, TAP + 1, BOUNCY);
  const eaten = countUp(frame, TAP + 2, 14, 1240, 1780);

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
          height: SUMMARY_H,
          padding: "0 26px",
          display: "flex",
          alignItems: "center",
          gap: 26,
        }}
      >
        <ProgressRing size={124} stroke={14} progress={eaten / 2100}>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.brand }}>
            {Math.round((eaten / 2100) * 100)}%
          </div>
        </ProgressRing>
        <div>
          <div
            style={{ fontSize: 24, fontWeight: 600, color: C.labelSecondary }}
          >
            Eaten today
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatThousands(eaten)}{" "}
            <span
              style={{ fontSize: 26, fontWeight: 600, color: C.labelSecondary }}
            >
              / 2,100 kcal
            </span>
          </div>
        </div>
      </Card>
      <Card style={{ marginTop: 20, overflow: "hidden" }}>
        {TODAY_MEALS.map((m, i) => {
          const isLunch = i === 1;
          return (
            <div
              key={m.slot}
              style={{
                height: MEAL_ROW_H,
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "0 24px",
                borderTop: i ? `2px solid ${C.separator}` : "none",
              }}
            >
              <CheckCircle
                fill={m.done ? 1 : isLunch ? fill : 0}
                check={m.done ? 1 : isLunch ? check : 0}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{m.slot}</div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: C.labelSecondary,
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.name} · {m.kcal} kcal
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

const CheckOff: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tap = {
    x: PHONE_AT.x + LUNCH_CIRCLE.x,
    y: PHONE_AT.y + LUNCH_CIRCLE.y,
  };
  const joy = frame >= TAP + 2;
  const hop = Math.sin(
    Math.PI * interpolate(frame, [TAP + 2, TAP + 14], [0, 1], CLAMP),
  );
  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      <Stage>
        <At
          x={180}
          y={-40}
          w={900}
          h={900}
          style={{ borderRadius: "50%", background: C.brandTint, opacity: 0.8 }}
        />
        <Phone
          active="today"
          title="Today"
          subtitle="Wednesday, 15 Oct"
          style={{ left: PHONE_AT.x, top: PHONE_AT.y }}
        >
          <TodayScreen />
        </Phone>
        <At x={10} y={720} style={{ translate: `0 ${-56 * hop}px` }}>
          <Biscuit
            pose="stand"
            accessory="chefHat"
            size={460}
            mood={joy ? "excited" : "happy"}
            eyesWide={sp(frame, fps, TAP + 2, BOUNCY)}
            tailWag={joy ? 1 : 0.5}
          />
        </At>
        <Burst
          x={tap.x}
          y={tap.y}
          at={TAP + 1}
          color={C.positive}
          radius={100}
        />
        <TapPaw x={tap.x} y={tap.y} enterAt={0} tapAt={TAP} exitAt={TAP + 6} />
      </Stage>
    </AbsoluteFill>
  );
};

export const CookAndCheckOff: React.FC<{ headline: string }> = ({
  headline,
}) => (
  <AbsoluteFill style={{ background: C.canvas, fontFamily }}>
    <Sequence name="Kitchen scan" durationInFrames={CUT}>
      <Kitchen />
    </Sequence>
    <Sequence name="Today check-off" from={CUT}>
      <CheckOff />
    </Sequence>
    <Headline text={headline} />
    <SfxCue at={20} kind="whoosh" />
    <SfxCue at={CUT + TAP} kind="tap" />
    <SfxCue at={CUT + TAP + 1} kind="tick" />
  </AbsoluteFill>
);
