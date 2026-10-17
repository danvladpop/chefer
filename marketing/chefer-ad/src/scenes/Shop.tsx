import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Biscuit } from "../components/Biscuit";
import { countUp } from "../components/fx";
import { Headline } from "../components/Headline";
import {
  GroceryIcon,
  GroceryKind,
  Shelves,
  Trolley,
} from "../components/illustrations";
import { BEZEL, Card, CONTENT_TOP, Phone } from "../components/Phone";
import { SfxCue } from "../components/Sfx";
import { At, Stage, useLayout } from "../layout";
import { BOUNCY, C, CLAMP, EASE_EXIT, fontFamily, SNAPPY, sp } from "../theme";

const ITEMS: { name: string; qty: string; price: number; kind: GroceryKind }[] =
  [
    { name: "Chicken breast", qty: "500 g", price: 6.4, kind: "chicken" },
    { name: "Brown rice", qty: "1 kg", price: 2.1, kind: "rice" },
    { name: "Broccoli", qty: "2 heads", price: 1.8, kind: "broccoli" },
    { name: "Oats", qty: "500 g", price: 2.3, kind: "oats" },
    { name: "Greek yogurt", qty: "500 g", price: 3.2, kind: "yogurt" },
  ];
const TICKS = [20, 32, 44, 56, 68];
const FLIGHT = 12;
const ROW_H = 90;

const FLOOR_Y = 1180;
const PHONE = { x: 540, y: 0, scale: 0.82 };
const BISCUIT_SIZE = 380;
const BISCUIT_TOP = 841;
/** Where Biscuit's push-pose paws meet the handle, relative to his box. */
const HANDLE = { x: 331, y: 224 };
const TROLLEY_GRIP_Y = 60;

const Check: React.FC<{ s: number }> = ({ s }) => (
  <svg width={26} height={26} viewBox="0 0 24 24" style={{ scale: String(s) }}>
    <path
      d="M5 12.5 L10 17 L19 7"
      stroke="#FFFFFF"
      strokeWidth={3.4}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ShopScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = ITEMS.reduce(
    (sum, it, i) => sum + countUp(frame, TICKS[i] + 4, 10, 0, it.price),
    0,
  );

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
      <Card style={{ overflow: "hidden" }}>
        {ITEMS.map((it, i) => {
          const fill = sp(frame, fps, TICKS[i], SNAPPY);
          const tick = sp(frame, fps, TICKS[i] + 1, BOUNCY);
          return (
            <div
              key={it.name}
              style={{
                height: ROW_H,
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "0 22px 0 24px",
                borderTop: i ? `2px solid ${C.separator}` : "none",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  border: `3px solid ${C.separator}`,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: -3,
                    borderRadius: 22,
                    background: C.positive,
                    scale: String(fill),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check s={tick} />
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  fontSize: 30,
                  fontWeight: 600,
                  opacity: 1 - 0.45 * fill,
                  whiteSpace: "nowrap",
                }}
              >
                {it.name}
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: C.labelSecondary,
                }}
              >
                {it.qty}
              </div>
            </div>
          );
        })}
      </Card>
      <Card
        style={{
          marginTop: 18,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{ fontSize: 24, fontWeight: 600, color: C.labelSecondary }}
          >
            Estimated total
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.positive }}>
            {TICKS.filter((t) => frame >= t).length} of {ITEMS.length} in
            trolley
          </div>
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: C.label,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          €{total.toFixed(2)}
        </div>
      </Card>
    </div>
  );
};

export const Shop: React.FC<{ headline: string }> = ({ headline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { absY, landscape } = useLayout();

  const biscuitXAt = (f: number) => interpolate(f, [2, 96], [-90, 250], CLAMP);
  const trolleyAt = (f: number) => ({
    x: biscuitXAt(f) + HANDLE.x,
    y: BISCUIT_TOP + HANDLE.y - TROLLEY_GRIP_Y,
  });
  const trolley = trolleyAt(frame);
  const landed = ITEMS.filter((_, i) => frame >= TICKS[i] + FLIGHT).map(
    (it) => it.kind,
  );
  const bump = TICKS.reduce(
    (acc, t) =>
      acc +
      sp(frame, fps, t + FLIGHT, SNAPPY) -
      sp(frame, fps, t + FLIGHT + 3, SNAPPY),
    0,
  );

  return (
    <AbsoluteFill style={{ background: C.brandTint, fontFamily }}>
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
          top: absY(FLOOR_Y) - 8,
          height: 8,
          background: C.ring,
        }}
      />
      <Stage>
        <Shelves left={landscape ? -60 : -410} />
        <div
          style={{
            position: "absolute",
            left: PHONE.x,
            top: PHONE.y,
            scale: String(PHONE.scale),
            transformOrigin: "0 0",
          }}
        >
          <Phone
            active="shop"
            title="Shop"
            subtitle="This week · 5 items"
            style={{ left: 0, top: 0 }}
          >
            <ShopScreen />
          </Phone>
        </div>

        <At
          x={trolley.x}
          y={trolley.y}
          style={{ transformOrigin: "50% 100%", scale: `1 ${1 - 0.04 * bump}` }}
        >
          <Trolley items={landed} />
        </At>
        <At x={biscuitXAt(frame)} y={BISCUIT_TOP}>
          <Biscuit
            pose="push"
            walk
            size={BISCUIT_SIZE}
            tailWag={0.7}
            mood={frame > 72 ? "excited" : "happy"}
          />
        </At>

        {/* Each ticked item flies from its row into the trolley. */}
        {ITEMS.map((it, i) => {
          const t0 = TICKS[i];
          if (frame < t0 || frame >= t0 + FLIGHT) return null;
          const p = interpolate(frame, [t0, t0 + FLIGHT], [0, 1], {
            ...CLAMP,
            easing: EASE_EXIT,
          });
          const from = {
            x: PHONE.x + (BEZEL + 20 + 24 + 22) * PHONE.scale,
            y:
              PHONE.y +
              (BEZEL + CONTENT_TOP + ROW_H * i + ROW_H / 2) * PHONE.scale,
          };
          const dest = trolleyAt(t0 + FLIGHT);
          const to = { x: dest.x + 170, y: dest.y + 80 };
          return (
            <At
              key={it.kind}
              x={-40}
              y={-40}
              style={{
                translate: `${from.x + (to.x - from.x) * p}px ${from.y + (to.y - from.y) * p - 180 * Math.sin(Math.PI * p)}px`,
                rotate: `${p * 200}deg`,
                scale: String(0.7 + 0.5 * p),
              }}
            >
              <GroceryIcon kind={it.kind} size={80} />
            </At>
          );
        })}
      </Stage>
      <Headline text={headline} />
      <SfxCue at={0} kind="whoosh" />
      {TICKS.map((t) => (
        <SfxCue key={t} at={t} kind="tick" />
      ))}
    </AbsoluteFill>
  );
};
