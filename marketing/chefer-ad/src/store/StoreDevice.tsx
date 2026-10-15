import React from "react";
import { Img, staticFile } from "remotion";
import type { Callout, Device, ScreenName } from "./frames";

// Raw capture sizes. iOS captures include the status bar; the Play ones are
// cropped below it, so the Play frame draws its own strip with a punch-hole.
export const CAPTURE = {
  ios: { width: 1320, height: 2868 },
  play: { width: 1320, height: 2640 },
} as const;

/** The Play crops keep the bottom edge of the Dynamic Island in their top rows. */
const PLAY_TRIM_TOP = 8;

export const screenSrc = (device: Device, screen: ScreenName) =>
  staticFile(`store/${device}/${screen}.jpg`);

const BODY = "#1C1917";

/** Geometry of a phone `width` px wide showing one capture. */
export const deviceMetrics = (device: Device, width: number) => {
  const bezel = Math.round(width * 0.024);
  const screenW = width - bezel * 2;
  const strip = device === "play" ? Math.round(screenW * 0.06) : 0;
  const imageH = Math.round(
    (screenW * CAPTURE[device].height) / CAPTURE[device].width,
  );
  const screenH = imageH + strip;
  return {
    bezel,
    screenW,
    strip,
    imageH,
    screenH,
    height: screenH + bezel * 2,
    radius: Math.round(width * 0.14),
  };
};

export const StoreDevice: React.FC<{
  device: Device;
  screen: ScreenName;
  width: number;
  style?: React.CSSProperties;
}> = ({ device, screen, width, style }) => {
  const m = deviceMetrics(device, width);
  return (
    <div
      style={{
        width,
        height: m.height,
        padding: m.bezel,
        borderRadius: m.radius,
        background: BODY,
        boxShadow: `0 ${width * 0.04}px ${width * 0.09}px rgba(28,25,23,0.28), 0 ${width * 0.01}px ${width * 0.02}px rgba(28,25,23,0.18), inset 0 0 0 ${Math.max(2, width * 0.003)}px #3A3430`,
        ...style,
      }}
    >
      <div
        style={{
          width: m.screenW,
          height: m.screenH,
          borderRadius: m.radius - m.bezel,
          overflow: "hidden",
          background: "#FFFFFF",
          position: "relative",
        }}
      >
        {m.strip > 0 ? (
          <div
            style={{
              height: m.strip,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: m.strip * 0.42,
                height: m.strip * 0.42,
                borderRadius: "50%",
                background: BODY,
              }}
            />
          </div>
        ) : null}
        <div style={{ height: m.imageH, overflow: "hidden" }}>
          <Img
            src={screenSrc(device, screen)}
            style={{
              width: m.screenW,
              height: m.imageH,
              display: "block",
              marginTop:
                device === "play"
                  ? (-PLAY_TRIM_TOP * m.screenW) / CAPTURE.play.width
                  : 0,
            }}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * A magnified crop of the capture, floated over the phone so one detail (the
 * allergy check, the next-lift advice) reads from the store grid.
 */
export const CalloutCard: React.FC<{
  device: Device;
  screen: ScreenName;
  crop: Callout;
  /** Width of the card in px. */
  width: number;
  ring: string;
  style?: React.CSSProperties;
}> = ({ device, screen, crop, width, ring, style }) => {
  const cap = CAPTURE[device];
  const scale = width / (crop.w * cap.width);
  const height = crop.h * cap.height * scale;
  const pad = width * 0.012;
  return (
    <div
      style={{
        width: width + pad * 2,
        height: height + pad * 2,
        padding: pad,
        borderRadius: width * 0.06,
        background: "#FFFFFF",
        boxShadow: `0 0 0 ${width * 0.008}px ${ring}, 0 ${width * 0.04}px ${width * 0.1}px rgba(28,25,23,0.3)`,
        ...style,
      }}
    >
      <div
        style={{
          width,
          height,
          overflow: "hidden",
          borderRadius: width * 0.05,
          position: "relative",
        }}
      >
        <Img
          src={screenSrc(device, screen)}
          style={{
            position: "absolute",
            width: cap.width * scale,
            height: cap.height * scale,
            left: -crop.x * cap.width * scale,
            top: -crop.y * cap.height * scale,
            maxWidth: "none",
          }}
        />
      </div>
    </div>
  );
};
