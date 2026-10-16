import React, { useId } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { CLAMP } from "../theme";

export type BiscuitPose = "lie" | "stand" | "push" | "squat" | "proud" | "wink";
export type BiscuitAccessory = "chefHat" | "headband" | "crown" | "none";
export type BiscuitMood = "happy" | "sad" | "excited" | "proud" | "focused";
export type BiscuitHolding = "none" | "dumbbell" | "phone" | "carrot";

export type BiscuitProps = {
  pose: BiscuitPose;
  accessory?: BiscuitAccessory;
  /** 0.75–1.0. Only the body narrows; the head stays the same so he stays recognisable. */
  bodyWidth?: number;
  /** 0–1. Drives both amplitude and speed of the wag. */
  tailWag?: number;
  /** Automatic blink every ~45 frames. */
  blink?: boolean;
  /** Rendered width/height in px (the drawing is a 400×400 box, feet at y≈388). */
  size?: number;
  mood?: BiscuitMood;
  /** 0–1, eyes grow ~35%. */
  eyesWide?: number;
  /** 0–1, right paw reaches out (lie: down toward the floor, stand: to the right). */
  reach?: number;
  /** 0–1, right arm goes straight up (holding/catching). */
  armRaise?: number;
  /** 0–1, squat depth. */
  squatDepth?: number;
  /** Feet alternate (for push). */
  walk?: boolean;
  /** Degrees; negative = chin up. */
  headTilt?: number;
  holding?: BiscuitHolding;
  /** Lie pose: 0–1 of a pizza slice left in his paw, held up to his mouth (0 = no slice). */
  slice?: number;
  /** Frame offset so blinks/wags of several instances don't sync up. */
  phase?: number;
  /** Loop length in frames: breathing and wag snap to whole cycles so the clip loops seamlessly. */
  loop?: number;
  style?: React.CSSProperties;
};

const FUR = "#E0883A";
const FUR_MID = "#D27B30";
const FUR_SHADE = "#BE6A22";
const CREAM = "#FFF4E6";
const EAR = "#F3C08F";
const INK = "#1C1917";
const BLUSH = "#EE9873";
const TONGUE = "#E58275";

const RAISED_DEG = -136;
const RAISED_LEN = 96;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** End point of an arm that hangs down (0°) from (x, y) rotated by `deg` (SVG rotate). */
const armEnd = (x: number, y: number, deg: number, len: number) => ({
  x: x - Math.sin(rad(deg)) * len,
  y: y + Math.cos(rad(deg)) * len,
});

const Arm: React.FC<{ x: number; y: number; deg: number; len: number }> = ({
  x,
  y,
  deg,
  len,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${deg})`}>
    <rect x={-17} y={-12} width={34} height={len + 12} rx={17} fill={FUR} />
    <ellipse cx={0} cy={len} rx={19} ry={18} fill={CREAM} />
  </g>
);

const Tail: React.FC<{ x: number; y: number; deg: number }> = ({
  x,
  y,
  deg,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${deg})`}>
    <ellipse
      cx={-22}
      cy={-44}
      rx={25}
      ry={52}
      fill={FUR}
      transform="rotate(-28 -22 -44)"
    />
    <ellipse
      cx={-14}
      cy={-28}
      rx={14}
      ry={30}
      fill={FUR_MID}
      transform="rotate(-28 -14 -28)"
    />
    <ellipse
      cx={-44}
      cy={-84}
      rx={16}
      ry={19}
      fill={CREAM}
      transform="rotate(-28 -44 -84)"
    />
  </g>
);

const Eye: React.FC<{
  x: number;
  y: number;
  open: number;
  wide: number;
  happy: boolean;
}> = ({ x, y, open, wide, happy }) => {
  if (happy) {
    return (
      <path
        d={`M${x - 13} ${y + 4} Q${x} ${y - 12} ${x + 13} ${y + 4}`}
        stroke={INK}
        strokeWidth={5.5}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  if (open < 0.25) {
    return (
      <path
        d={`M${x - 12} ${y} Q${x} ${y + 6} ${x + 12} ${y}`}
        stroke={INK}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${wide} ${wide * open})`}>
      <ellipse rx={12} ry={13.5} fill={INK} />
      <circle cx={4} cy={-5} r={4.4} fill="#FFFFFF" />
      <circle cx={-4} cy={5} r={1.9} fill="#FFFFFF" opacity={0.7} />
    </g>
  );
};

const Head: React.FC<{
  hx: number;
  hy: number;
  uid: string;
  mood: BiscuitMood;
  eyeOpen: number;
  eyesWide: number;
  wink: boolean;
  accessory: BiscuitAccessory;
  earDroop: number;
  earTwitch: number;
}> = ({
  hx,
  hy,
  uid,
  mood,
  eyeOpen,
  eyesWide,
  wink,
  accessory,
  earDroop,
  earTwitch,
}) => {
  const wide = 1 + 0.35 * eyesWide;
  const happyEyes = mood === "proud";
  const sadOpen = mood === "sad" ? 0.78 : 1;
  const earL = -earDroop * 32 - earTwitch;
  const earR = earDroop * 32 + earTwitch;
  const mouthOpen = mood === "excited";

  return (
    <g>
      {/* Ears (behind the head). */}
      <g transform={`rotate(${earL} ${hx - 46} ${hy - 50})`}>
        <polygon
          points={`${hx - 72},${hy - 28} ${hx - 82},${hy - 114} ${hx - 14},${hy - 66}`}
          fill={FUR}
          stroke={FUR}
          strokeWidth={16}
          strokeLinejoin="round"
        />
        <polygon
          points={`${hx - 62},${hy - 44} ${hx - 70},${hy - 94} ${hx - 30},${hy - 64}`}
          fill={EAR}
          stroke={EAR}
          strokeWidth={6}
          strokeLinejoin="round"
        />
      </g>
      <g transform={`rotate(${earR} ${hx + 46} ${hy - 50})`}>
        <polygon
          points={`${hx + 72},${hy - 28} ${hx + 82},${hy - 114} ${hx + 14},${hy - 66}`}
          fill={FUR}
          stroke={FUR}
          strokeWidth={16}
          strokeLinejoin="round"
        />
        <polygon
          points={`${hx + 62},${hy - 44} ${hx + 70},${hy - 94} ${hx + 30},${hy - 64}`}
          fill={EAR}
          stroke={EAR}
          strokeWidth={6}
          strokeLinejoin="round"
        />
      </g>

      <clipPath id={`${uid}-head`}>
        <ellipse cx={hx} cy={hy} rx={86} ry={74} />
      </clipPath>
      <ellipse cx={hx} cy={hy} rx={86} ry={74} fill={FUR} />
      <g clipPath={`url(#${uid}-head)`}>
        <ellipse cx={hx} cy={hy + 52} rx={82} ry={42} fill={CREAM} />
        <path
          d={`M${hx - 8} ${hy - 76} Q${hx} ${hy - 82} ${hx + 8} ${hy - 76} L${hx + 19} ${hy + 8} L${hx - 19} ${hy + 8} Z`}
          fill={CREAM}
        />
        {accessory === "headband" ? (
          <g>
            <rect
              x={hx - 92}
              y={hy - 54}
              width={184}
              height={22}
              fill="#944A00"
            />
            <rect
              x={hx - 92}
              y={hy - 46}
              width={184}
              height={5}
              fill={CREAM}
              opacity={0.9}
            />
          </g>
        ) : null}
      </g>
      <ellipse cx={hx} cy={hy + 26} rx={44} ry={29} fill={CREAM} />

      {/* Brows only when they carry an emotion. */}
      {mood === "sad" ? (
        <g stroke={INK} strokeWidth={4.5} strokeLinecap="round" opacity={0.75}>
          <path d={`M${hx - 48} ${hy - 24} L${hx - 24} ${hy - 34}`} />
          <path d={`M${hx + 48} ${hy - 24} L${hx + 24} ${hy - 34}`} />
        </g>
      ) : null}
      {mood === "focused" ? (
        <g stroke={INK} strokeWidth={5} strokeLinecap="round" opacity={0.8}>
          <path d={`M${hx - 48} ${hy - 36} L${hx - 22} ${hy - 27}`} />
          <path d={`M${hx + 48} ${hy - 36} L${hx + 22} ${hy - 27}`} />
        </g>
      ) : null}

      <Eye
        x={hx - 34}
        y={hy - 6}
        open={eyeOpen * sadOpen}
        wide={wide}
        happy={happyEyes}
      />
      <Eye
        x={hx + 34}
        y={hy - 6}
        open={eyeOpen * sadOpen}
        wide={wide}
        happy={happyEyes || wink}
      />

      <circle cx={hx - 56} cy={hy + 20} r={12} fill={BLUSH} opacity={0.45} />
      <circle cx={hx + 56} cy={hy + 20} r={12} fill={BLUSH} opacity={0.45} />

      {/* Mouth */}
      {mouthOpen ? (
        <g>
          <clipPath id={`${uid}-mouth`}>
            <path
              d={`M${hx - 19} ${hy + 26} Q${hx} ${hy + 64} ${hx + 19} ${hy + 26} Z`}
            />
          </clipPath>
          <path
            d={`M${hx - 19} ${hy + 26} Q${hx} ${hy + 64} ${hx + 19} ${hy + 26} Z`}
            fill={INK}
          />
          <ellipse
            cx={hx}
            cy={hy + 46}
            rx={11}
            ry={9}
            fill={TONGUE}
            clipPath={`url(#${uid}-mouth)`}
          />
        </g>
      ) : (
        <path
          d={
            mood === "sad"
              ? `M${hx} ${hy + 20} V${hy + 28} M${hx - 15} ${hy + 39} Q${hx} ${hy + 28} ${hx + 15} ${hy + 39}`
              : mood === "focused"
                ? `M${hx} ${hy + 20} V${hy + 30} M${hx - 13} ${hy + 33} Q${hx} ${hy + 29} ${hx + 13} ${hy + 33}`
                : mood === "proud"
                  ? `M${hx} ${hy + 20} V${hy + 28} M${hx - 22} ${hy + 28} Q${hx - 11} ${hy + 42} ${hx} ${hy + 28} Q${hx + 11} ${hy + 42} ${hx + 22} ${hy + 28}`
                  : `M${hx} ${hy + 20} V${hy + 27} M${hx - 17} ${hy + 29} Q${hx - 8} ${hy + 38} ${hx} ${hy + 27} Q${hx + 8} ${hy + 38} ${hx + 17} ${hy + 29}`
          }
          stroke={INK}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      <ellipse cx={hx} cy={hy + 12} rx={14} ry={9.5} fill={INK} />
      <ellipse
        cx={hx - 4}
        cy={hy + 9}
        rx={4}
        ry={2.4}
        fill="#FFFFFF"
        opacity={0.55}
      />

      {accessory === "chefHat" ? (
        <g>
          <circle cx={hx - 40} cy={hy - 118} r={38} fill="#FFFFFF" />
          <circle cx={hx + 40} cy={hy - 118} r={38} fill="#FFFFFF" />
          <circle cx={hx} cy={hy - 146} r={46} fill="#FFFFFF" />
          <path
            d={`M${hx - 18} ${hy - 150} Q${hx - 10} ${hy - 126} ${hx - 14} ${hy - 104} M${hx + 18} ${hy - 150} Q${hx + 10} ${hy - 126} ${hx + 14} ${hy - 104}`}
            stroke="#E6DED3"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
          />
          <rect
            x={hx - 62}
            y={hy - 108}
            width={124}
            height={40}
            rx={12}
            fill="#FFFFFF"
            stroke="#E6DED3"
            strokeWidth={3}
          />
        </g>
      ) : null}
      {accessory === "crown" ? (
        <g transform={`translate(${hx} ${hy - 78}) rotate(-6)`}>
          <path
            d="M-46 14 L-50 -30 L-24 -8 L0 -40 L24 -8 L50 -30 L46 14 Z"
            fill="#F2B640"
            stroke="#C98A12"
            strokeWidth={4}
            strokeLinejoin="round"
          />
          <rect x={-48} y={8} width={96} height={14} rx={6} fill="#E3A12A" />
          <circle cx={0} cy={-14} r={7} fill="#944A00" />
          <circle cx={-30} cy={0} r={5} fill="#FFF4E6" />
          <circle cx={30} cy={0} r={5} fill="#FFF4E6" />
        </g>
      ) : null}
      {accessory === "headband" ? (
        <g transform={`translate(${hx + 82} ${hy - 44})`}>
          <rect
            x={0}
            y={-6}
            width={34}
            height={13}
            rx={6}
            fill="#944A00"
            transform="rotate(28)"
          />
          <rect
            x={0}
            y={-6}
            width={30}
            height={13}
            rx={6}
            fill="#944A00"
            transform="rotate(62)"
          />
        </g>
      ) : null}
    </g>
  );
};

const Dumbbell: React.FC<{
  x1: number;
  x2: number;
  y: number;
  part: "bar" | "plates";
}> = ({ x1, x2, y, part }) =>
  part === "bar" ? (
    <rect
      x={x1 - 34}
      y={y - 6}
      width={x2 - x1 + 68}
      height={12}
      rx={6}
      fill="#57534E"
    />
  ) : (
    <g fill="#944A00">
      <rect x={x1 - 44} y={y - 28} width={20} height={56} rx={7} />
      <rect x={x2 + 24} y={y - 28} width={20} height={56} rx={7} />
    </g>
  );

/** A pizza slice held at (x, y), tip toward his mouth; `left` shrinks it bite by bite from the tip. */
const PizzaSlice: React.FC<{ x: number; y: number; left: number }> = ({
  x,
  y,
  left,
}) => (
  <g transform={`translate(${x} ${y}) rotate(-50)`}>
    <g transform={`scale(1 ${Math.max(0.2, left)})`}>
      <path d="M-22 0 L0 -64 L22 0 Z" fill="#F5C451" />
      <circle cx={-6} cy={-18} r={6} fill="#C8553D" />
      <circle cx={7} cy={-34} r={5} fill="#C8553D" />
    </g>
    <rect x={-26} y={-6} width={52} height={14} rx={7} fill="#D9963F" />
    <ellipse cx={0} cy={6} rx={19} ry={17} fill={CREAM} />
  </g>
);

const Held: React.FC<{ x: number; y: number; what: BiscuitHolding }> = ({
  x,
  y,
  what,
}) => {
  if (what === "phone") {
    return (
      <g transform={`translate(${x} ${y - 30}) rotate(-12)`}>
        <rect x={-20} y={-34} width={40} height={68} rx={9} fill={INK} />
        <rect x={-15} y={-28} width={30} height={56} rx={5} fill="#FAF7F2" />
        <rect
          x={-9}
          y={-8}
          width={18}
          height={18}
          rx={3}
          fill="none"
          stroke="#944A00"
          strokeWidth={3}
        />
      </g>
    );
  }
  if (what === "carrot") {
    return (
      <g transform={`translate(${x} ${y - 6}) rotate(-24)`}>
        <ellipse
          cx={-8}
          cy={-58}
          rx={7}
          ry={20}
          fill="#5E8F3E"
          transform="rotate(-20 -8 -58)"
        />
        <ellipse
          cx={8}
          cy={-58}
          rx={7}
          ry={20}
          fill="#6B9A4B"
          transform="rotate(20 8 -58)"
        />
        <path d="M-15 -42 Q0 -50 15 -42 L3 40 Q0 46 -3 40 Z" fill="#EF7B1E" />
        <path
          d="M-9 -20 L-2 -18 M5 0 L11 2 M-7 16 L-1 18"
          stroke="#C25E10"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    );
  }
  return null;
};

export const Biscuit: React.FC<BiscuitProps> = ({
  pose,
  accessory = "none",
  bodyWidth = 1,
  tailWag = 0.4,
  blink = true,
  size = 400,
  mood = "happy",
  eyesWide = 0,
  reach = 0,
  armRaise = 0,
  squatDepth = 0,
  walk = false,
  headTilt = 0,
  holding = "none",
  slice = 0,
  phase = 0,
  loop,
  style,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const f = useCurrentFrame() + phase;
  const bw = Math.max(0.75, Math.min(1, bodyWidth));

  // Frame-math life: breathing (≈1.5% scaleY), blink every 45 frames, tail wag via sin(frame).
  const breathPeriod = loop ? loop / Math.max(1, Math.round(loop / 48)) : 48;
  const breathe = 1 + 0.015 * Math.sin((f * 2 * Math.PI) / breathPeriod);
  const bphase = (f + 17) % 45;
  const eyeOpen = blink
    ? interpolate(bphase, [0, 2, 4], [1, 0.05, 1], CLAMP)
    : 1;
  const wagAmp = 8 + 26 * tailWag;
  // With `loop`, every periodic motion snaps to a whole number of cycles per loop.
  const snap = (speed: number) =>
    loop
      ? (2 *
          Math.PI *
          Math.max(1, Math.round((speed * loop) / (2 * Math.PI)))) /
        loop
      : speed;
  const rawWagSpeed = 0.22 + 0.6 * tailWag;
  const wagSpeed = snap(rawWagSpeed);
  const tailDeg = wagAmp * Math.sin(f * wagSpeed);
  const earDroop = mood === "sad" ? 1 : 0;
  const earTwitch = mood === "excited" ? 4 * Math.sin(f * snap(0.9)) : 0;

  const svgProps = {
    width: size,
    height: size,
    viewBox: "0 0 400 400",
    style: { overflow: "visible" as const, display: "block", ...style },
  };

  if (pose === "lie") {
    const reachDeg = mix(-92, -38, reach);
    const reachLen = mix(30, 122, reach);
    return (
      <svg {...svgProps}>
        <ellipse
          cx={196}
          cy={392}
          rx={170 * bw}
          ry={12}
          fill="rgba(28,25,23,0.12)"
        />
        <g transform={`translate(0 390) scale(1 ${breathe}) translate(0 -390)`}>
          <Tail x={190 - 136 * bw} y={330} deg={tailDeg - 34} />
          <clipPath id={`${uid}-loaf`}>
            <ellipse cx={190} cy={328} rx={150 * bw} ry={62} />
          </clipPath>
          <ellipse cx={190} cy={328} rx={150 * bw} ry={62} fill={FUR} />
          <g clipPath={`url(#${uid}-loaf)`}>
            <ellipse
              cx={190 - 92 * bw}
              cy={346}
              rx={52}
              ry={42}
              fill={FUR_MID}
            />
            <ellipse cx={190} cy={386} rx={140 * bw} ry={24} fill={CREAM} />
          </g>
          <ellipse cx={190 - 58 * bw} cy={386} rx={26} ry={10} fill={CREAM} />
          <ellipse cx={330} cy={382} rx={30} ry={13} fill={CREAM} />
          {slice > 0 ? null : (
            <Arm x={296} y={352} deg={reachDeg} len={reachLen} />
          )}
          <g transform={`rotate(${headTilt - 4} 300 330)`}>
            <Head
              hx={300}
              hy={266}
              uid={uid}
              mood={mood}
              eyeOpen={eyeOpen}
              eyesWide={eyesWide}
              wink={false}
              accessory={accessory}
              earDroop={earDroop}
              earTwitch={earTwitch}
            />
          </g>
          {slice > 0 ? (
            <>
              <Arm x={296} y={352} deg={-114} len={54} />
              <PizzaSlice x={345} y={330} left={slice} />
            </>
          ) : null}
        </g>
      </svg>
    );
  }

  // Upright cartoon poses share one skeleton.
  const d = squatDepth;
  const drop = 30 * d;
  const torsoY = 272 + drop;
  const spread = 48 * (0.8 + 0.2 * bw) + 14 * d;
  const stepL = walk ? 9 * Math.max(0, Math.sin(f * snap(0.55))) : 0;
  const stepR = walk ? 9 * Math.max(0, -Math.sin(f * snap(0.55))) : 0;
  const bob = walk ? -3 * Math.abs(Math.sin(f * snap(0.55))) : 0;
  const lean = pose === "push" ? 7 : 0;
  const chestPuff = pose === "proud" ? 6 : 0;

  let degL = 16;
  let degR = -16;
  let lenL = 62;
  let lenR = 62;
  if (pose === "stand") {
    degR = mix(-16, -88, reach);
    lenR = 62 + 26 * reach;
  } else if (pose === "push") {
    degL = -70;
    degR = -82;
    lenL = 84;
    lenR = 84;
  } else if (pose === "squat") {
    degL = -28;
    degR = 28;
  } else if (pose === "proud") {
    degL = 26;
    degR = -26;
  } else if (pose === "wink") {
    degR = -132 + 12 * Math.sin(f * snap(0.45));
    lenR = 92;
  }
  degR = mix(degR, RAISED_DEG, armRaise);
  lenR = mix(lenR, RAISED_LEN, armRaise);

  const shL = { x: 200 - 64 * bw, y: 220 + drop };
  const shR = { x: 200 + 64 * bw, y: 220 + drop };
  const endL = armEnd(shL.x, shL.y, degL, lenL);
  const endR = armEnd(shR.x, shR.y, degR, lenR);
  const dumbbell = holding === "dumbbell";
  const dbY = (endL.y + endR.y) / 2;

  return (
    <svg {...svgProps}>
      <ellipse
        cx={200}
        cy={390}
        rx={120 * bw + 10 * d}
        ry={12}
        fill="rgba(28,25,23,0.12)"
      />
      <g
        transform={`rotate(${lean} 200 388) translate(0 ${bob}) translate(0 388) scale(1 ${breathe}) translate(0 -388)`}
      >
        <Tail x={200 - 62 * bw} y={334 + drop} deg={tailDeg - 8} />

        {/* Stubby legs + cream feet */}
        <rect
          x={200 - spread - 19}
          y={326 + drop * 0.6 - stepL}
          width={38}
          height={52 - drop * 0.6}
          rx={19}
          fill={FUR_SHADE}
        />
        <rect
          x={200 + spread - 19}
          y={326 + drop * 0.6 - stepR}
          width={38}
          height={52 - drop * 0.6}
          rx={19}
          fill={FUR_SHADE}
        />
        <ellipse
          cx={200 - spread - 4}
          cy={378 - stepL}
          rx={30}
          ry={14}
          fill={CREAM}
        />
        <ellipse
          cx={200 + spread + 4}
          cy={378 - stepR}
          rx={30}
          ry={14}
          fill={CREAM}
        />
        <ellipse
          cx={200 - 56 * bw - 8 * d}
          cy={334 + drop}
          rx={38 + 6 * d}
          ry={30}
          fill={FUR_MID}
        />
        <ellipse
          cx={200 + 56 * bw + 8 * d}
          cy={334 + drop}
          rx={38 + 6 * d}
          ry={30}
          fill={FUR_MID}
        />

        {/* Torso: chubby → slim via bodyWidth */}
        <ellipse
          cx={200}
          cy={torsoY - chestPuff / 2}
          rx={92 * bw}
          ry={96 - 8 * d + chestPuff}
          fill={FUR}
        />
        <ellipse
          cx={200}
          cy={torsoY + 20}
          rx={62 * bw + chestPuff}
          ry={70 - 6 * d}
          fill={CREAM}
        />
        <circle cx={200 - 26} cy={204 + drop} r={26} fill={CREAM} />
        <circle cx={200} cy={212 + drop} r={29} fill={CREAM} />
        <circle cx={200 + 26} cy={204 + drop} r={26} fill={CREAM} />

        {dumbbell ? (
          <Dumbbell x1={endL.x} x2={endR.x} y={dbY} part="bar" />
        ) : null}
        <Arm x={shL.x} y={shL.y} deg={degL} len={lenL} />
        <Arm x={shR.x} y={shR.y} deg={degR} len={lenR} />
        {dumbbell ? (
          <Dumbbell x1={endL.x} x2={endR.x} y={dbY} part="plates" />
        ) : null}

        <g transform={`rotate(${headTilt} 200 ${200 + drop})`}>
          <Head
            hx={200}
            hy={136 + drop}
            uid={uid}
            mood={mood}
            eyeOpen={eyeOpen}
            eyesWide={eyesWide}
            wink={pose === "wink"}
            accessory={accessory}
            earDroop={earDroop}
            earTwitch={earTwitch}
          />
        </g>
        {holding === "phone" || holding === "carrot" ? (
          <Held x={endR.x} y={endR.y} what={holding} />
        ) : null}
      </g>
    </svg>
  );
};

/** Where Biscuit's raised right paw ends up (viewBox units), for things he catches. */
export const raisedPawPoint = (bodyWidth: number) =>
  armEnd(200 + 64 * bodyWidth, 220, RAISED_DEG, RAISED_LEN);
