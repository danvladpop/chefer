import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Biscuit } from "../components/Biscuit";
import { Logo } from "../components/Logo";
import { SfxCue } from "../components/Sfx";
import { useLayout } from "../layout";
import { BOUNCY, C, fontFamily, GENTLE, sp } from "../theme";

const LOGO_AT = 2;
const BISCUIT_AT = 26;
const WINK_AT = 38;

/** Generic store pill — drawn, not the official badge artwork. */
const StorePill: React.FC<{
  top: string;
  bottom: string;
  icon: "phone" | "play";
  muted?: boolean;
  scale: number;
  s: number;
}> = ({ top, bottom, icon, muted = false, scale, s }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18 * scale,
      height: 104 * scale,
      padding: `0 ${40 * scale}px 0 ${30 * scale}px`,
      borderRadius: 999,
      background: muted ? "transparent" : C.label,
      border: muted
        ? `${3 * scale}px dashed rgba(255,244,230,0.7)`
        : `${3 * scale}px solid ${C.label}`,
      color: C.cream,
      opacity: Math.min(1, s * 1.5),
      translate: `0 ${(1 - s) * 40}px`,
      whiteSpace: "nowrap",
    }}
  >
    <svg
      width={44 * scale}
      height={44 * scale}
      viewBox="0 0 24 24"
      fill="none"
      stroke={C.cream}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon === "phone" ? (
        <>
          <rect x="6" y="2.5" width="12" height="19" rx="3" />
          <path d="M12 7v7M9 11.5l3 3 3-3" />
        </>
      ) : (
        <path d="M7 4.5v15l12-7.5z" />
      )}
    </svg>
    <div style={{ lineHeight: 1.1 }}>
      <div style={{ fontSize: 22 * scale, fontWeight: 600, opacity: 0.85 }}>
        {top}
      </div>
      <div style={{ fontSize: 34 * scale, fontWeight: 800 }}>{bottom}</div>
    </div>
  </div>
);

export const EndCard: React.FC<{ subline: string; playStoreLive: boolean }> = ({
  subline,
  playStoreLive,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { landscape, width, height } = useLayout();

  const logo = sp(frame, fps, LOGO_AT, BOUNCY);
  const word = sp(frame, fps, 8, GENTLE);
  const sub = sp(frame, fps, 12, GENTLE);
  const pill1 = sp(frame, fps, 16, GENTLE);
  const pill2 = sp(frame, fps, 19, GENTLE);
  const pop = sp(frame, fps, BISCUIT_AT, BOUNCY);

  const k = landscape ? 0.78 : 1;
  const logoSize = landscape ? 250 : 340;
  const biscuit = landscape
    ? { size: 440, left: width - 90 - 400, top: height - 300 }
    : { size: 560, left: (width - 560) / 2, top: height - 420 };

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${C.logoFrom}, ${C.logoTo})`,
        fontFamily,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: landscape ? 240 : 530,
          width: 900,
          height: 900,
          marginLeft: -450,
          marginTop: -450,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,244,230,0.22), rgba(255,244,230,0) 65%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: landscape ? 100 : 360,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            borderRadius: logoSize * 0.22,
            boxShadow:
              "0 24px 60px rgba(40,18,0,0.45), 0 0 0 4px rgba(233,207,174,0.35)",
            scale: String(logo),
            opacity: Math.min(1, logo * 2),
          }}
        >
          <Logo size={logoSize} />
        </div>
        <div
          style={{
            marginTop: 34 * k,
            fontSize: 150 * k,
            fontWeight: 800,
            letterSpacing: -4 * k,
            lineHeight: 1,
            color: C.cream,
            opacity: word,
            translate: `0 ${(1 - word) * 40}px`,
          }}
        >
          Chefer
        </div>
        <div
          style={{
            marginTop: 18 * k,
            fontSize: 44 * k,
            fontWeight: 600,
            color: C.cream,
            opacity: 0.9 * sub,
            translate: `0 ${(1 - sub) * 30}px`,
          }}
        >
          {subline}
        </div>
        <div
          style={{
            marginTop: 50 * k,
            display: "flex",
            flexDirection: landscape ? "row" : "column",
            alignItems: "center",
            gap: 24 * k,
          }}
        >
          <StorePill
            top="Download on the"
            bottom="App Store"
            icon="phone"
            scale={k}
            s={pill1}
          />
          {playStoreLive ? (
            <StorePill
              top="Get it on"
              bottom="Google Play"
              icon="play"
              scale={k}
              s={pill2}
            />
          ) : (
            <StorePill
              top="Coming soon on"
              bottom="Google Play"
              icon="play"
              muted
              scale={k}
              s={pill2}
            />
          )}
        </div>
      </div>

      {/* Biscuit pops up from the bottom edge and winks. */}
      <div
        style={{
          position: "absolute",
          left: biscuit.left,
          top: biscuit.top,
          translate: `0 ${(1 - pop) * biscuit.size}px`,
          opacity: frame >= BISCUIT_AT ? 1 : 0,
        }}
      >
        <Biscuit
          pose={frame >= WINK_AT ? "wink" : "stand"}
          mood="happy"
          size={biscuit.size}
          bodyWidth={0.8}
          tailWag={1}
          blink={false}
        />
      </div>
      <SfxCue at={LOGO_AT} kind="chime" />
      <SfxCue at={BISCUIT_AT} kind="whoosh" />
    </AbsoluteFill>
  );
};
