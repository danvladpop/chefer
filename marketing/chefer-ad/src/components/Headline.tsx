import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "../layout";
import { BOUNCY, C, CLAMP, EASE_ENTER, fontFamily, GENTLE, sp } from "../theme";

type Strike = {
  /** Word that gets struck through (first occurrence). */
  word: string;
  /** Word that replaces it, written above like an editor's correction. */
  replacement: string;
  /** Local frame at which the replacement lands. */
  at: number;
};

/**
 * Scene headline. Words rise in on the gentle spring, 2 frames apart. Text
 * after the first ", " or ". " is set in brand colour ("Scan it. *Check it
 * off.*"), which gives every headline one accent without extra props.
 */
export const Headline: React.FC<{
  text: string;
  delay?: number;
  strike?: Strike;
}> = ({ text, delay = 6, strike }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { headline } = useLayout();

  const words = text.split(/\s+/).filter(Boolean);
  const accentFrom = words.findIndex(
    (w, i) => i < words.length - 1 && /[.,]$/.test(w),
  );
  const strikeIndex = strike
    ? words.findIndex((w) => w.replace(/[.,!?]/g, "") === strike.word)
    : -1;

  return (
    <div
      style={{
        position: "absolute",
        left: headline.left,
        top: headline.top,
        width: headline.width,
        height: headline.height,
        display: "flex",
        alignItems: "center",
        justifyContent: headline.align === "center" ? "center" : "flex-start",
        textAlign: headline.align,
        fontFamily,
        fontWeight: 800,
        fontSize: headline.fontSize,
        lineHeight: 1.12,
        letterSpacing: -1.5,
        color: C.label,
      }}
    >
      <div style={{ paddingTop: strike ? headline.fontSize * 0.7 : 0 }}>
        {words.map((word, i) => {
          const s = sp(frame, fps, delay + i * 2, GENTLE);
          const accent = accentFrom >= 0 && i > accentFrom;
          const isStruck = i === strikeIndex && strike;
          return (
            <React.Fragment key={i}>
              <span
                style={{
                  display: "inline-block",
                  position: "relative",
                  opacity: s,
                  translate: `0 ${(1 - s) * 40}px`,
                  color: accent ? C.brand : C.label,
                }}
              >
                {isStruck ? <StruckWord word={word} strike={strike} /> : word}
              </span>
              {i < words.length - 1 ? " " : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const StruckWord: React.FC<{ word: string; strike: Strike }> = ({
  word,
  strike,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lineIn = strike.at - 8;
  const pop = sp(frame, fps, strike.at, BOUNCY);

  return (
    <>
      <span
        style={{
          opacity: interpolate(
            frame,
            [strike.at - 2, strike.at + 4],
            [1, 0.4],
            CLAMP,
          ),
        }}
      >
        {word}
      </span>
      {/* Strike line draws left → right (scaleX), attention colour — never red. */}
      <span
        style={{
          position: "absolute",
          left: -6,
          right: -6,
          top: "52%",
          height: 9,
          borderRadius: 9,
          background: C.attention,
          transformOrigin: "0 50%",
          scale: `${interpolate(frame, [lineIn, lineIn + 7], [0, 1], { ...CLAMP, easing: EASE_ENTER })} 1`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "50%",
          bottom: "82%",
          color: C.brand,
          whiteSpace: "nowrap",
          fontSize: "0.86em",
          translate: "-50% 0",
          rotate: "-5deg",
          transformOrigin: "50% 100%",
          opacity: Math.min(1, pop * 2),
          scale: String(pop),
        }}
      >
        {strike.replacement}
      </span>
    </>
  );
};
