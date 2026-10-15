import React from "react";
import { useVideoConfig } from "remotion";

/**
 * Every scene is drawn on a fixed 1080×1320 "stage" (the area under the
 * headline in the vertical cut). The vertical layout places it below the top
 * third; the landscape layout scales it down into the right-hand column and
 * moves the headline to the left. Scenes never branch on orientation for the
 * stage contents — only full-bleed backgrounds and the headline do.
 */
export const STAGE_W = 1080;
export const STAGE_H = 1320;
export const SAFE = 90;

type Box = { left: number; top: number; width: number; height: number };

export type Layout = {
  landscape: boolean;
  width: number;
  height: number;
  headline: Box & { align: "center" | "left"; fontSize: number };
  stage: { left: number; top: number; scale: number };
  /** Stage y → absolute frame y (for full-bleed floors that must line up). */
  absY: (stageY: number) => number;
};

export const useLayout = (): Layout => {
  const { width, height } = useVideoConfig();
  const landscape = width > height;

  if (!landscape) {
    const stage = { left: 0, top: 600, scale: 1 };
    return {
      landscape,
      width,
      height,
      // Top third (0–640), inside the 90px safe margin.
      headline: {
        left: SAFE,
        top: 130,
        width: width - SAFE * 2,
        height: 450,
        align: "center",
        fontSize: 84,
      },
      stage,
      absY: (y) => stage.top + y * stage.scale,
    };
  }

  const region = {
    left: 900,
    top: SAFE,
    width: width - 900 - SAFE,
    height: height - SAFE * 2,
  };
  const scale = Math.min(region.width / STAGE_W, region.height / STAGE_H);
  const stage = {
    left: region.left + (region.width - STAGE_W * scale) / 2,
    top: region.top + (region.height - STAGE_H * scale) / 2,
    scale,
  };
  return {
    landscape,
    width,
    height,
    headline: {
      left: SAFE + 20,
      top: SAFE,
      width: 760,
      height: height - SAFE * 2,
      align: "left",
      fontSize: 80,
    },
    stage,
    absY: (y) => stage.top + y * stage.scale,
  };
};

/** Positions children in stage coordinates (1080×1320), scaled to the layout. */
export const Stage: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { stage } = useLayout();
  return (
    <div
      style={{
        position: "absolute",
        left: stage.left,
        top: stage.top,
        width: STAGE_W,
        height: STAGE_H,
        transformOrigin: "0 0",
        scale: String(stage.scale),
      }}
    >
      {children}
    </div>
  );
};

/** Absolutely positioned box in stage coordinates. */
export const At: React.FC<{
  x: number;
  y: number;
  w?: number;
  h?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ x, y, w, h, style, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      ...style,
    }}
  >
    {children}
  </div>
);
