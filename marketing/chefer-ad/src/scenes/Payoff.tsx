import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Biscuit, raisedPawPoint } from "../components/Biscuit";
import { Burst, KibbleConfetti, ProgressRing } from "../components/fx";
import { Headline } from "../components/Headline";
import { SfxCue } from "../components/Sfx";
import { At, Stage } from "../layout";
import {
  BOUNCY,
  C,
  CARD_SHADOW,
  CLAMP,
  EASE_EXIT,
  fontFamily,
  GENTLE,
  SNAPPY,
  sp,
} from "../theme";

const BEATS = [0, 26, 50];
const WEEKS = ["Week 1", "Week 4", "Week 8"];
const WIDTHS = [1, 0.88, 0.78];
const GOAL = 72;
const CARROT = [68, 82];

const RING = { cx: 540, cy: 560, size: 740 };
const BISCUIT = { x: 290, y: 330, size: 500 };

const CalendarIcon: React.FC = () => (
  <svg
    width={38}
    height={38}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.brand}
    strokeWidth={2.2}
    strokeLinecap="round"
  >
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const Payoff: React.FC<{ headline: string }> = ({ headline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Each beat: chip flips, body steps slimmer (bouncy), posture prouder, ring advances.
  const beatS = BEATS.map((b) => (b === 0 ? 1 : sp(frame, fps, b, BOUNCY)));
  const bodyWidth =
    WIDTHS[0] +
    (WIDTHS[1] - WIDTHS[0]) * beatS[1] +
    (WIDTHS[2] - WIDTHS[1]) * beatS[2];
  const beat = BEATS.filter((b) => frame >= b).length - 1;
  const ring =
    sp(frame, fps, 4, GENTLE) * 0.33 +
    sp(frame, fps, BEATS[1] + 2, GENTLE) * 0.33 +
    sp(frame, fps, BEATS[2] + 2, GENTLE) * 0.34;
  const squash = BEATS.slice(1).reduce(
    (acc, b) => acc + sp(frame, fps, b, SNAPPY) - sp(frame, fps, b + 4, SNAPPY),
    0,
  );

  const raise = sp(frame, fps, CARROT[1] - 8, SNAPPY);
  const caught = frame >= CARROT[1];
  const paw = raisedPawPoint(bodyWidth);
  const scale = BISCUIT.size / 400;
  const catchAt = {
    x: BISCUIT.x + paw.x * scale,
    y: BISCUIT.y + paw.y * scale,
  };
  const carrotY = interpolate(frame, CARROT, [-900, catchAt.y], {
    ...CLAMP,
    easing: EASE_EXIT,
  });
  const goal = sp(frame, fps, GOAL, BOUNCY);

  return (
    <AbsoluteFill style={{ background: C.canvas, fontFamily }}>
      <Stage>
        <At
          x={RING.cx - RING.size / 2 - 60}
          y={RING.cy - RING.size / 2 - 60}
          w={RING.size + 120}
          h={RING.size + 120}
          style={{ borderRadius: "50%", background: C.brandTint }}
        />
        <At x={RING.cx - RING.size / 2} y={RING.cy - RING.size / 2}>
          <ProgressRing
            size={RING.size}
            stroke={34}
            progress={ring}
            track={C.surface}
          />
        </At>

        {/* Week chips flip on each beat */}
        {WEEKS.map((w, i) => {
          const inS =
            i === 0
              ? sp(frame, fps, 0, SNAPPY)
              : sp(frame, fps, BEATS[i], SNAPPY);
          const outS =
            i < WEEKS.length - 1 ? sp(frame, fps, BEATS[i + 1], SNAPPY) : 0;
          return (
            <At
              key={w}
              x={RING.cx - 150}
              y={70}
              w={300}
              style={{
                display: "flex",
                justifyContent: "center",
                opacity: Math.max(0, inS - outS),
                translate: `0 ${(1 - inS) * 50 - outS * 50}px`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 30px",
                  borderRadius: 999,
                  background: C.surface,
                  boxShadow: CARD_SHADOW,
                  fontSize: 36,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                <CalendarIcon />
                {w}
              </div>
            </At>
          );
        })}

        <At
          x={BISCUIT.x}
          y={BISCUIT.y}
          style={{
            transformOrigin: "50% 100%",
            scale: `${1 + 0.05 * squash} ${1 - 0.06 * squash}`,
          }}
        >
          <Biscuit
            pose={beat === 0 ? "stand" : "proud"}
            mood={caught ? "excited" : beat === 0 ? "happy" : "proud"}
            size={BISCUIT.size}
            bodyWidth={bodyWidth}
            headTilt={-4 * beatS[1] - 4 * beatS[2]}
            tailWag={0.4 + 0.3 * beat}
            armRaise={raise}
            holding={caught ? "carrot" : "none"}
          />
        </At>

        {!caught && frame >= CARROT[0] ? (
          <At
            x={catchAt.x - 30}
            y={carrotY - 60}
            style={{ rotate: `${frame * 22}deg`, transformOrigin: "30px 60px" }}
          >
            <svg width={60} height={120} viewBox="-30 -70 60 120">
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
              <path
                d="M-15 -42 Q0 -50 15 -42 L3 40 Q0 46 -3 40 Z"
                fill="#EF7B1E"
              />
            </svg>
          </At>
        ) : null}
        <Burst
          x={catchAt.x}
          y={catchAt.y}
          at={CARROT[1]}
          color={C.attention}
          radius={80}
        />

        <At
          x={RING.cx - 200}
          y={RING.cy + RING.size / 2 + 40}
          w={400}
          style={{
            display: "flex",
            justifyContent: "center",
            opacity: Math.min(1, goal * 2),
            scale: String(goal),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 30px 14px 16px",
              borderRadius: 999,
              background: C.surface,
              boxShadow: CARD_SHADOW,
              fontSize: 34,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: C.positive,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24">
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
            Goal reached
          </div>
        </At>
      </Stage>
      <KibbleConfetti at={GOAL - 4} />
      <Headline text={headline} />
      {BEATS.slice(1).map((b) => (
        <SfxCue key={b} at={b} kind="whoosh" />
      ))}
      <SfxCue at={GOAL} kind="chime" />
      <SfxCue at={CARROT[1]} kind="tap" />
    </AbsoluteFill>
  );
};
