import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Biscuit } from "../components/Biscuit";
import { Ripple, TapPaw } from "../components/fx";
import { Headline } from "../components/Headline";
import { BEZEL, Card, CONTENT_TOP, Phone, SCREEN_W } from "../components/Phone";
import { SfxCue } from "../components/Sfx";
import { At, Stage } from "../layout";
import { BOUNCY, C, CLAMP, fontFamily, GENTLE, SNAPPY, sp } from "../theme";

const WEEK = [
  { day: "Mon", name: "Chicken rice bowl", kcal: 520 },
  { day: "Tue", name: "Salmon and greens", kcal: 480 },
  { day: "Wed", name: "Turkey chilli", kcal: 560 },
  { day: "Thu", name: "Tofu stir-fry", kcal: 450 },
  { day: "Fri", name: "Prawn tacos", kcal: 510 },
  { day: "Sat", name: "Beef burrito bowl", kcal: 590 },
  { day: "Sun", name: "Pesto pasta", kcal: 540 },
];

const BUTTON_H = 80;
/** Centre of "Plan my week" in phone coordinates (incl. bezel). */
export const PLAN_BUTTON = {
  x: BEZEL + SCREEN_W / 2,
  y: BEZEL + CONTENT_TOP + BUTTON_H / 2,
};

const Sparkle: React.FC<{ color: string }> = ({ color }) => (
  <svg width={30} height={30} viewBox="0 0 24 24">
    <path
      d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z"
      fill={color}
    />
  </svg>
);

/** Meals tab: "Plan my week" + the seven day cards that stagger in after the tap. */
export const MealsScreen: React.FC<{ pressAt?: number; cardsAt?: number }> = ({
  pressAt = 1e6,
  cardsAt = 1e6,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Snappy press: scale to 0.96 and back.
  const press =
    sp(frame, fps, pressAt, SNAPPY) - sp(frame, fps, pressAt + 4, SNAPPY);

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
      <div
        style={{
          height: BUTTON_H,
          borderRadius: BUTTON_H / 2,
          background: C.brand,
          color: C.cream,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontSize: 30,
          fontWeight: 700,
          scale: String(1 - 0.04 * press),
        }}
      >
        <Sparkle color={C.cream} />
        Plan my week
      </div>
      <div
        style={{
          marginTop: 20,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {WEEK.map((d, i) => {
          // Gentle spring, 4 frames apart.
          const s = sp(frame, fps, cardsAt + i * 4, GENTLE);
          return (
            <Card
              key={d.day}
              style={{
                height: 84,
                padding: "0 18px 0 22px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: Math.min(1, s * 1.4),
                translate: `0 ${(1 - s) * 70}px`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: C.brand,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                  }}
                >
                  {d.day}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {d.name}
                </div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: C.brandTint,
                  color: C.brand,
                  fontSize: 24,
                  fontWeight: 700,
                }}
              >
                {d.kcal} kcal
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export const PHONE_AT = { x: 470, y: 50 };

export const MealPlan: React.FC<{ headline: string }> = ({ headline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const TAP = 18;
  const CARDS = 24;
  const WOW = 40;
  const tap = { x: PHONE_AT.x + PLAN_BUTTON.x, y: PHONE_AT.y + PLAN_BUTTON.y };
  const wow = sp(frame, fps, WOW, BOUNCY);
  const hop = Math.sin(
    Math.PI * interpolate(frame, [WOW, WOW + 12], [0, 1], CLAMP),
  );

  return (
    <AbsoluteFill style={{ background: C.canvas, fontFamily }}>
      <Stage>
        <At
          x={180}
          y={-40}
          w={900}
          h={900}
          style={{ borderRadius: "50%", background: C.brandTint, opacity: 0.8 }}
        />
        <Phone
          active="meals"
          title="Meals"
          subtitle="Week of 13 Oct"
          style={{ left: PHONE_AT.x, top: PHONE_AT.y }}
        >
          <MealsScreen pressAt={TAP} cardsAt={CARDS} />
        </Phone>
        <At x={10} y={760} style={{ translate: `0 ${-48 * hop}px` }}>
          <Biscuit
            pose="stand"
            size={460}
            mood={frame >= WOW ? "excited" : "happy"}
            eyesWide={wow}
            tailWag={frame >= WOW ? 1 : 0.35}
            reach={interpolate(frame, [WOW + 6, WOW + 16], [0, 0.75], CLAMP)}
          />
        </At>
        <Ripple x={tap.x} y={tap.y} at={TAP} color={C.cream} />
        <TapPaw x={tap.x} y={tap.y} enterAt={4} tapAt={TAP} exitAt={TAP + 6} />
      </Stage>
      <Headline text={headline} />
      <SfxCue at={TAP} kind="tap" />
      <SfxCue at={CARDS} kind="whoosh" />
    </AbsoluteFill>
  );
};
