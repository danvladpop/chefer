import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { z } from "zod";
import { C, fontFamily } from "../theme";
import { CalloutCard, deviceMetrics, StoreDevice } from "./StoreDevice";

const screenName = z.enum([
  "plan",
  "shopping",
  "cook",
  "today",
  "gym-summary",
  "gym-workout",
  "gym-routine",
]);
const crop = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const screenshotSchema = z.object({
  caption: z.string(),
  subline: z.string().optional(),
  tone: z.enum(["cream", "brand"]),
  device: z.enum(["play", "ios"]),
  screens: z.array(screenName).min(1).max(3),
  callout: crop.optional(),
});

export type ScreenshotProps = z.infer<typeof screenshotSchema>;

const TONES = {
  cream: {
    background: `linear-gradient(180deg, ${C.cream} 0%, ${C.canvas} 70%)`,
    glow: C.brandTint,
    text: C.label,
    accent: C.brand,
    sub: C.labelSecondary,
    ring: C.brand,
  },
  brand: {
    background: `linear-gradient(165deg, ${C.logoFrom} 0%, ${C.logoTo} 100%)`,
    glow: "rgba(255,244,230,0.12)",
    text: C.cream,
    accent: "#FFC98A",
    sub: C.ring,
    ring: "#FFC98A",
  },
} as const;

/** "A week of meals, *planned by AI*" → the starred part in the accent colour. */
export const Caption: React.FC<{ text: string; accent: string }> = ({
  text,
  accent,
}) => (
  <>
    {text.split("*").map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} style={{ color: accent }}>
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

// Phone top as a share of the canvas height. Fixed, so the phones line up
// across a set whatever the caption's line count.
const PHONE_TOP = 0.27;
const PHONE_WIDTH = 0.78;

export const Screenshot: React.FC<ScreenshotProps> = ({
  caption,
  subline,
  tone,
  device,
  screens,
  callout,
}) => {
  const { width: W, height: H } = useVideoConfig();
  const t = TONES[tone];
  const phoneTop = H * PHONE_TOP;
  const phoneW = W * PHONE_WIDTH;
  const collage = screens.length > 1;
  const m = deviceMetrics(device, phoneW);

  return (
    <AbsoluteFill style={{ background: t.background, fontFamily }}>
      {/* Soft disc behind the phone. */}
      <div
        style={{
          position: "absolute",
          width: W * 1.3,
          height: W * 1.3,
          left: -W * 0.15,
          top: phoneTop + W * 0.1,
          borderRadius: "50%",
          background: t.glow,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: W * 0.07,
          right: W * 0.07,
          top: 0,
          height: phoneTop - W * 0.05,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          gap: W * 0.025,
        }}
      >
        <div
          style={{
            fontSize: W * 0.084,
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: "-0.025em",
            color: t.text,
            textWrap: "balance",
          }}
        >
          <Caption text={caption} accent={t.accent} />
        </div>
        {subline ? (
          <div
            style={{
              fontSize: W * 0.04,
              fontWeight: 600,
              lineHeight: 1.3,
              color: t.sub,
              textWrap: "balance",
            }}
          >
            {subline}
          </div>
        ) : null}
      </div>

      {collage ? (
        <>
          {/* Side phones first so the centre one sits on top. */}
          {[
            { screen: screens[0], x: -0.3, rot: -7 },
            { screen: screens[2], x: 0.3, rot: 7 },
          ].map(({ screen, x, rot }) =>
            screen ? (
              <StoreDevice
                key={`${screen}${x}`}
                device={device}
                screen={screen}
                width={phoneW * 0.8}
                style={{
                  position: "absolute",
                  left: (W - phoneW * 0.8) / 2 + x * W,
                  top: phoneTop + W * 0.12,
                  transform: `rotate(${rot}deg)`,
                }}
              />
            ) : null,
          )}
          <StoreDevice
            device={device}
            screen={screens[1]}
            width={phoneW * 0.86}
            style={{
              position: "absolute",
              left: (W - phoneW * 0.86) / 2,
              top: phoneTop + W * 0.03,
            }}
          />
        </>
      ) : (
        <StoreDevice
          device={device}
          screen={screens[0]}
          width={phoneW}
          style={{
            position: "absolute",
            left: (W - phoneW) / 2,
            top: phoneTop,
          }}
        />
      )}

      {callout && !collage ? (
        <CalloutCard
          device={device}
          screen={screens[0]}
          crop={callout}
          width={W * 0.9}
          ring={t.ring}
          style={{
            position: "absolute",
            left: W * 0.05 - W * 0.9 * 0.012,
            // Centred on the spot it magnifies.
            top:
              phoneTop +
              m.bezel +
              m.strip +
              (callout.y + callout.h / 2) * m.imageH -
              (W * 0.9 * (callout.h / callout.w) * (m.imageH / m.screenW)) / 2,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
