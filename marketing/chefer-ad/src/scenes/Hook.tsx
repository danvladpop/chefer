import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Biscuit } from "../components/Biscuit";
import { Headline } from "../components/Headline";
import { Couch, Crisp, PizzaBox } from "../components/illustrations";
import { Logo } from "../components/Logo";
import { Phone } from "../components/Phone";
import { SfxCue } from "../components/Sfx";
import { At, Stage, useLayout } from "../layout";
import {
  BOUNCY,
  C,
  CARD_SHADOW,
  CLAMP,
  EASE_ENTER,
  EASE_EXIT,
  fontFamily,
  GENTLE,
  SNAPPY,
  sp,
} from "../theme";
import { MealsScreen } from "./MealPlan";

const FLOOR_Y = 1160;

/*
 * 0–180 (6 s), timed to the narration in scripts/voiceover-lines.json:
 *   6   "Meet Biscuit. Professional couch potato."  — he finishes a pizza slice
 *   94  "Biscuit needed a plan."                    — reaches for the crisp, "had" → "needed"
 *   140 "Not another pizza."                        — pizza thought bubble gets crossed out
 *   164 the phone slides up into the Meals scene.
 */
const INTRO_OUT = 82;
const HOOK_IN = 88;
const STRIKE = 107; // the spoken "needed"
const BITES = [14, 30, 46, 62];
const REACH = 96;
const BUBBLE = 138;
const CROSS = 156;
const PHONE_IN = 164;

/** "Professional couch potato" tag under the intro headline. */
const IntroTag: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { headline } = useLayout();
  const pop = sp(frame, fps, at, BOUNCY);
  return (
    <div
      style={{
        position: "absolute",
        left: headline.left,
        width: headline.width,
        top: headline.top + headline.height / 2 + headline.fontSize * 0.75,
        display: "flex",
        justifyContent: headline.align === "center" ? "center" : "flex-start",
      }}
    >
      <div
        style={{
          padding: "14px 30px",
          borderRadius: 999,
          background: C.brandTint,
          color: C.brand,
          fontSize: 40,
          fontWeight: 700,
          whiteSpace: "nowrap",
          opacity: Math.min(1, pop * 2),
          scale: String(0.7 + 0.3 * pop),
          rotate: "-2deg",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Thought bubble with a pizza that gets crossed out ("Not another pizza."). */
const PizzaThought: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = sp(frame, fps, BUBBLE, BOUNCY);
  const cross = sp(frame, fps, CROSS, SNAPPY);
  const out = interpolate(frame, [PHONE_IN + 4, PHONE_IN + 12], [0, 1], {
    ...CLAMP,
    easing: EASE_EXIT,
  });
  if (frame < BUBBLE) return null;
  return (
    <div style={{ opacity: 1 - out }}>
      <At
        x={612}
        y={676}
        w={26}
        h={26}
        style={{
          borderRadius: "50%",
          background: C.surface,
          boxShadow: CARD_SHADOW,
          scale: String(pop),
        }}
      />
      <At
        x={644}
        y={628}
        w={40}
        h={40}
        style={{
          borderRadius: "50%",
          background: C.surface,
          boxShadow: CARD_SHADOW,
          scale: String(pop),
        }}
      />
      <At
        x={640}
        y={400}
        w={250}
        h={210}
        style={{
          borderRadius: "50%",
          background: C.surface,
          boxShadow: CARD_SHADOW,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transformOrigin: "10% 100%",
          scale: String(pop),
        }}
      >
        <svg
          width={150}
          height={150}
          viewBox="-75 -75 150 150"
          style={{ overflow: "visible" }}
        >
          <g transform="rotate(-20)">
            <path d="M-46 30 L0 -58 L46 30 Z" fill="#F5C451" />
            <rect
              x={-52}
              y={24}
              width={104}
              height={20}
              rx={10}
              fill="#D9963F"
            />
            <circle cx={-12} cy={6} r={10} fill="#C8553D" />
            <circle cx={14} cy={-16} r={8} fill="#C8553D" />
            <circle cx={16} cy={18} r={7} fill="#C8553D" />
          </g>
          {/* Crossed out — attention colour, never red */}
          <g
            stroke={C.attention}
            strokeWidth={14}
            strokeLinecap="round"
            style={{ scale: String(cross) }}
          >
            <path d="M-56 -56 L56 56" />
            <path d="M56 -56 L-56 56" />
          </g>
        </svg>
      </At>
    </div>
  );
};

export const Hook: React.FC<{
  intro: string;
  introTag: string;
  headline: string;
  struck: string;
  replacement: string;
  petName: string;
}> = ({ intro, introTag, headline, struck, replacement, petName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { absY } = useLayout();

  // Intro: munching the last slice, a bite at a time, chewing between bites.
  const sliceLeft = 1 - BITES.filter((b) => frame >= b).length / BITES.length;
  const chewing = frame < BITES[BITES.length - 1] + 8;
  const chompOpen = chewing && Math.floor(frame / 5) % 2 === 0;

  // Hook: reach for the crisp, strain (tremble), give up and droop.
  const strain =
    frame > REACH + 16 && frame < REACH + 36
      ? 0.035 * Math.sin(frame * 1.7)
      : 0;
  const reach =
    interpolate(
      frame,
      [REACH, REACH + 16, REACH + 36, REACH + 48],
      [0, 1, 1, 0.3],
      {
        ...CLAMP,
        easing: EASE_ENTER,
      },
    ) + strain;
  const hooked = frame >= HOOK_IN;
  const phoneIn = sp(frame, fps, PHONE_IN, GENTLE);
  const introOut = interpolate(frame, [INTRO_OUT, INTRO_OUT + 8], [0, 1], {
    ...CLAMP,
    easing: EASE_EXIT,
  });

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
        {/* Ironic wall art: a framed dumbbell nobody has lifted. */}
        <At
          x={130}
          y={340}
          w={280}
          h={200}
          style={{
            borderRadius: 18,
            background: C.surface,
            border: `10px solid ${C.ring}`,
          }}
        >
          <svg width={260} height={180} viewBox="0 0 260 180">
            <path
              d="M70 90 H190"
              stroke={C.labelSecondary}
              strokeWidth={10}
              strokeLinecap="round"
            />
            <rect
              x={52}
              y={58}
              width={22}
              height={64}
              rx={6}
              fill={C.brand}
              opacity={0.7}
            />
            <rect
              x={186}
              y={58}
              width={22}
              height={64}
              rx={6}
              fill={C.brand}
              opacity={0.7}
            />
            <path
              d="M40 44 Q60 30 80 44 M180 140 Q200 154 220 140"
              stroke={C.separator}
              strokeWidth={4}
              fill="none"
            />
          </svg>
        </At>
        <At x={40} y={690}>
          <Couch />
        </At>
        <At x={680} y={810}>
          <PizzaBox />
        </At>
        <At x={760} y={1150}>
          <Crisp size={86} />
        </At>
        <At x={110} y={425}>
          <Biscuit
            pose="lie"
            size={520}
            mood={hooked ? "sad" : chompOpen ? "excited" : "happy"}
            slice={hooked ? 0 : sliceLeft}
            reach={hooked ? reach : 0}
            tailWag={hooked ? 0.08 : 0.35}
          />
        </At>
        <PizzaThought />

        {/* The phone slides up at the end and hands over to the Meals scene. */}
        <At
          x={600}
          y={700}
          style={{
            translate: `0 ${(1 - phoneIn) * 760}px`,
            rotate: `${-9 + 3 * phoneIn}deg`,
            opacity: frame >= PHONE_IN ? 1 : 0,
          }}
        >
          <Phone
            active="meals"
            title="Meals"
            subtitle="Week of 13 Oct"
            style={{ left: 0, top: 0 }}
          >
            <MealsScreen />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 380,
                display: "flex",
                justifyContent: "center",
                opacity: 0.25,
              }}
            >
              <Logo size={160} />
            </div>
          </Phone>
        </At>
      </Stage>

      <Sequence
        name="Intro title"
        durationInFrames={INTRO_OUT + 8}
        layout="none"
      >
        <AbsoluteFill
          style={{ opacity: 1 - introOut, translate: `0 ${-30 * introOut}px` }}
        >
          <Headline text={intro.replace("{pet}", petName)} delay={4} />
          <IntroTag text={introTag} at={34} />
        </AbsoluteFill>
      </Sequence>
      <Sequence name="Hook title" from={HOOK_IN} layout="none">
        <Headline
          text={headline.replace("{pet}", petName)}
          delay={2}
          strike={{ word: struck, replacement, at: STRIKE - HOOK_IN }}
        />
      </Sequence>

      {BITES.map((b) => (
        <SfxCue key={b} at={b} kind="tap" volume={0.4} />
      ))}
      <SfxCue at={STRIKE} kind="tick" />
      <SfxCue at={CROSS} kind="tick" />
      <SfxCue at={PHONE_IN} kind="whoosh" />
    </AbsoluteFill>
  );
};
