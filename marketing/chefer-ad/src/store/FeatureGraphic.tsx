import React from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { Logo } from "../components/Logo";
import { C, fontFamily } from "../theme";
import { Caption } from "./Screenshot";
import { StoreDevice } from "./StoreDevice";

export const featureGraphicSchema = z.object({
  /** One line per array entry; `*word*` renders in the accent colour. */
  lines: z.array(z.string()).min(1).max(3),
});

const ACCENT = "#FFC98A";

/** Play feature graphic (aso-plan.md §4.3), 1024×500. */
export const FeatureGraphic: React.FC<z.infer<typeof featureGraphicSchema>> = ({
  lines,
}) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(120deg, ${C.logoFrom} 0%, ${C.logoTo} 100%)`,
      fontFamily,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        width: 620,
        height: 620,
        right: -120,
        top: -40,
        borderRadius: "50%",
        background: "rgba(255,244,230,0.10)",
      }}
    />

    <div
      style={{
        position: "absolute",
        left: 64,
        top: 0,
        bottom: 0,
        width: 520,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo
          size={48}
          style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.25)", borderRadius: 11 }}
        />
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: C.cream,
            letterSpacing: "-0.02em",
          }}
        >
          Chefer
        </div>
      </div>
      {lines.map((line) => (
        <div
          key={line}
          style={{
            fontSize: 46,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
            color: C.cream,
            textWrap: "balance",
          }}
        >
          <Caption text={line} accent={ACCENT} />
        </div>
      ))}
    </div>

    <StoreDevice
      device="play"
      screen="gym-summary"
      width={225}
      style={{
        position: "absolute",
        left: 790,
        top: 70,
        transform: "rotate(9deg)",
      }}
    />
    <StoreDevice
      device="play"
      screen="plan"
      width={235}
      style={{
        position: "absolute",
        left: 600,
        top: 48,
        transform: "rotate(-7deg)",
      }}
    />
  </AbsoluteFill>
);
