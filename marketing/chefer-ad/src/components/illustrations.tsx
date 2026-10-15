import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, CLAMP, EASE_EXIT } from "../theme";

/** Couch with cushions, 1000×470. Neutral tones so orange Biscuit pops. */
export const Couch: React.FC = () => (
  <svg
    width={1000}
    height={470}
    viewBox="0 0 1000 470"
    style={{ display: "block", overflow: "visible" }}
  >
    <rect x={60} y={0} width={880} height={250} rx={64} fill="#E6DED3" />
    <rect x={120} y={40} width={360} height={190} rx={44} fill="#EDE6DC" />
    <rect x={520} y={40} width={360} height={190} rx={44} fill="#EDE6DC" />
    <rect
      x={150}
      y={110}
      width={150}
      height={120}
      rx={36}
      fill={C.brandTint}
      transform="rotate(-10 225 170)"
    />
    <path
      d="M168 150 H290 M172 180 H294"
      stroke={C.ring}
      strokeWidth={8}
      strokeLinecap="round"
      transform="rotate(-10 225 170)"
    />
    <rect x={40} y={318} width={920} height={112} rx={32} fill="#D6CABB" />
    <rect x={120} y={226} width={384} height={116} rx={38} fill="#F2ECE4" />
    <rect x={496} y={226} width={384} height={116} rx={38} fill="#F2ECE4" />
    <rect x={0} y={120} width={150} height={300} rx={64} fill="#DCD1C3" />
    <rect x={850} y={120} width={150} height={300} rx={64} fill="#DCD1C3" />
    <rect
      x={110}
      y={428}
      width={26}
      height={42}
      rx={8}
      fill={C.labelSecondary}
    />
    <rect
      x={864}
      y={428}
      width={26}
      height={42}
      rx={8}
      fill={C.labelSecondary}
    />
  </svg>
);

export const PizzaBox: React.FC = () => (
  <svg
    width={250}
    height={140}
    viewBox="0 0 250 140"
    style={{ display: "block" }}
  >
    <path d="M22 8 L224 0 L234 78 L12 82 Z" fill="#E2C9A6" />
    <path d="M34 18 L214 12 L222 70 L26 74 Z" fill="#D9BC94" />
    <circle cx={90} cy={40} r={14} fill="#C9A27A" opacity={0.6} />
    <circle cx={160} cy={50} r={10} fill="#C9A27A" opacity={0.6} />
    <circle cx={128} cy={30} r={6} fill="#C9A27A" opacity={0.6} />
    <rect x={0} y={78} width={250} height={56} rx={8} fill="#E8D3B4" />
    <rect x={10} y={76} width={230} height={14} rx={4} fill="#D7B58A" />
    <circle cx={60} cy={83} r={4} fill={C.attention} />
    <circle cx={150} cy={82} r={3} fill={C.attention} />
    <circle cx={190} cy={84} r={4} fill="#E9B44C" />
  </svg>
);

export const Crisp: React.FC<{ size?: number }> = ({ size = 80 }) => (
  <svg
    width={size}
    height={size * 0.7}
    viewBox="0 0 80 56"
    style={{ display: "block" }}
  >
    <path
      d="M6 30 Q14 6 40 8 Q68 6 74 28 Q70 50 42 48 Q12 52 6 30 Z"
      fill="#F0B94A"
    />
    <path
      d="M18 26 Q30 18 42 24 Q54 30 64 24"
      stroke="#D99A2B"
      strokeWidth={4}
      fill="none"
      strokeLinecap="round"
    />
    <circle cx={28} cy={36} r={3} fill="#D99A2B" />
    <circle cx={52} cy={38} r={2.5} fill="#D99A2B" />
  </svg>
);

/**
 * Lunch bowl, 280×140. `dropAt` gives the local frame each layer of food
 * lands (rice, chicken, broccoli); omit it for a finished bowl.
 */
export const Bowl: React.FC<{
  width?: number;
  dropAt?: [number, number, number];
}> = ({ width = 280, dropAt }) => {
  const frame = useCurrentFrame();
  const drop = (i: number) =>
    dropAt
      ? interpolate(frame, [dropAt[i], dropAt[i] + 8], [-240, 0], {
          ...CLAMP,
          easing: EASE_EXIT,
        })
      : 0;
  const seen = (i: number) => (dropAt ? (frame >= dropAt[i] ? 1 : 0) : 1);
  return (
    <svg
      width={width}
      height={width / 2}
      viewBox="0 0 280 140"
      style={{ display: "block", overflow: "visible" }}
    >
      <g transform={`translate(0 ${drop(0)})`} opacity={seen(0)}>
        <ellipse cx={140} cy={60} rx={112} ry={40} fill="#FFFDF8" />
        <g fill="#EFE7DC">
          <ellipse cx={92} cy={46} rx={6} ry={3} />
          <ellipse cx={118} cy={36} rx={6} ry={3} />
          <ellipse cx={176} cy={40} rx={6} ry={3} />
          <ellipse cx={200} cy={54} rx={6} ry={3} />
        </g>
      </g>
      <g transform={`translate(0 ${drop(1)})`} opacity={seen(1)}>
        <rect
          x={70}
          y={34}
          width={52}
          height={30}
          rx={12}
          fill="#E3A462"
          transform="rotate(-12 96 49)"
        />
        <rect
          x={112}
          y={26}
          width={52}
          height={30}
          rx={12}
          fill="#D8924E"
          transform="rotate(8 138 41)"
        />
        <rect
          x={98}
          y={50}
          width={48}
          height={26}
          rx={11}
          fill="#E9B272"
          transform="rotate(-4 122 63)"
        />
        <path
          d="M80 44 L112 40 M122 34 L152 40"
          stroke="#B86F2E"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.5}
        />
      </g>
      <g transform={`translate(0 ${drop(2)})`} opacity={seen(2)}>
        <rect x={184} y={44} width={10} height={26} rx={5} fill="#8DB36A" />
        <rect x={206} y={46} width={10} height={24} rx={5} fill="#8DB36A" />
        <circle cx={182} cy={40} r={16} fill="#5E8F3E" />
        <circle cx={198} cy={30} r={18} fill="#6B9A4B" />
        <circle cx={214} cy={42} r={15} fill="#5E8F3E" />
        <circle cx={150} cy={58} r={3} fill="#FFF4E6" />
        <circle cx={162} cy={50} r={3} fill="#FFF4E6" />
      </g>
      <path
        d="M8 64 H272 Q264 136 140 138 Q16 136 8 64 Z"
        fill="#FFFFFF"
        stroke={C.separator}
        strokeWidth={3}
      />
      <path
        d="M22 84 H258"
        stroke={C.brandTint}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d="M26 92 H254"
        stroke={C.ring}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  );
};

export type GroceryKind = "chicken" | "rice" | "broccoli" | "oats" | "yogurt";

export const GroceryIcon: React.FC<{ kind: GroceryKind; size?: number }> = ({
  kind,
  size = 72,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    style={{ display: "block", overflow: "visible" }}
  >
    {kind === "chicken" ? (
      <g>
        <rect
          x={4}
          y={28}
          width={56}
          height={28}
          rx={8}
          fill="#FFFFFF"
          stroke={C.separator}
          strokeWidth={2}
        />
        <path
          d="M12 38 Q16 20 34 22 Q54 22 52 36 Q50 48 32 48 Q14 48 12 38 Z"
          fill="#F2B9A0"
        />
        <path
          d="M22 34 Q32 30 44 34"
          stroke="#E39A80"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    ) : null}
    {kind === "rice" ? (
      <g>
        <path
          d="M14 10 H50 L54 56 Q54 60 50 60 H14 Q10 60 10 56 Z"
          fill={C.cream}
          stroke={C.ring}
          strokeWidth={2}
        />
        <path
          d="M14 10 Q32 4 50 10"
          stroke={C.ring}
          strokeWidth={4}
          fill="none"
        />
        <rect x={16} y={28} width={32} height={18} rx={4} fill={C.brand} />
        <ellipse cx={26} cy={37} rx={3} ry={1.6} fill={C.cream} />
        <ellipse cx={34} cy={35} rx={3} ry={1.6} fill={C.cream} />
        <ellipse cx={40} cy={39} rx={3} ry={1.6} fill={C.cream} />
      </g>
    ) : null}
    {kind === "broccoli" ? (
      <g>
        <rect x={26} y={34} width={12} height={26} rx={6} fill="#8DB36A" />
        <circle cx={20} cy={30} r={13} fill="#5E8F3E" />
        <circle cx={44} cy={30} r={13} fill="#5E8F3E" />
        <circle cx={32} cy={18} r={15} fill="#6B9A4B" />
      </g>
    ) : null}
    {kind === "oats" ? (
      <g>
        <rect
          x={12}
          y={6}
          width={40}
          height={54}
          rx={6}
          fill={C.brandTint}
          stroke={C.ring}
          strokeWidth={2}
        />
        <rect x={12} y={20} width={40} height={16} fill={C.attention} />
        <ellipse cx={32} cy={48} rx={8} ry={4} fill="#D9B48A" />
      </g>
    ) : null}
    {kind === "yogurt" ? (
      <g>
        <path
          d="M12 18 H52 L47 58 Q46 60 44 60 H20 Q18 60 17 58 Z"
          fill="#FFFFFF"
          stroke={C.separator}
          strokeWidth={2}
        />
        <rect x={9} y={10} width={46} height={10} rx={4} fill={C.brand} />
        <path
          d="M20 38 Q32 30 44 38"
          stroke={C.ring}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    ) : null}
  </svg>
);

const PILE = [
  [72, 40],
  [122, 32],
  [172, 40],
  [222, 32],
  [146, 10],
];

/** Shopping trolley, 320×230. Handle grip at (0, 60) — that's where Biscuit's paws go. */
export const Trolley: React.FC<{ items: GroceryKind[] }> = ({ items }) => (
  <svg
    width={320}
    height={230}
    viewBox="0 0 320 230"
    style={{ display: "block", overflow: "visible" }}
  >
    <path
      d="M-4 56 L52 72"
      stroke={C.labelSecondary}
      strokeWidth={9}
      strokeLinecap="round"
    />
    <rect x={-14} y={48} width={28} height={18} rx={8} fill={C.brand} />
    {items.map((k, i) => (
      <g
        key={k}
        transform={`translate(${PILE[i % PILE.length][0]} ${PILE[i % PILE.length][1]})`}
      >
        <GroceryIcon kind={k} size={64} />
      </g>
    ))}
    <path
      d="M50 70 H310 L286 172 H76 Z"
      fill="rgba(255,255,255,0.55)"
      stroke={C.labelSecondary}
      strokeWidth={6}
      strokeLinejoin="round"
    />
    <g stroke={C.labelSecondary} strokeWidth={3} opacity={0.5}>
      <path d="M58 104 H302 M66 138 H294" />
      <path d="M115 70 L120 172 M180 70 L181 172 M245 70 L240 172" />
    </g>
    <path
      d="M80 172 L72 194 H286"
      stroke={C.labelSecondary}
      strokeWidth={6}
      fill="none"
      strokeLinejoin="round"
    />
    <circle cx={98} cy={210} r={16} fill={C.label} />
    <circle cx={264} cy={210} r={16} fill={C.label} />
    <circle cx={98} cy={210} r={5} fill={C.separator} />
    <circle cx={264} cy={210} r={5} fill={C.separator} />
  </svg>
);

/** Muted brandTint shelving that bleeds past the stage on both sides. */
export const Shelves: React.FC<{ left?: number }> = ({ left = -410 }) => {
  const palette = [
    "#E6DED3",
    "#F2ECE4",
    C.ring,
    "#D9B48A",
    "#FFFFFF",
    "#C9A27A",
    C.cream,
  ];
  const rows = [250, 520, 790];
  return (
    <svg
      width={1900}
      height={900}
      viewBox="0 0 1900 900"
      style={{ position: "absolute", left, top: 0, overflow: "visible" }}
    >
      {rows.map((y, r) => (
        <g key={y}>
          {Array.from({ length: 26 }).map((_, i) => {
            const seed = (i * 7 + r * 13) % 11;
            const h = 70 + (seed % 4) * 18;
            const w = 44 + (seed % 3) * 12;
            const x = 20 + i * 72;
            const color = palette[(i + r * 3) % palette.length];
            const jar = seed % 3 === 0;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y - h}
                  width={w}
                  height={h}
                  rx={jar ? 12 : 4}
                  fill={color}
                  stroke="#E6DED3"
                  strokeWidth={2}
                />
                {jar ? (
                  <rect
                    x={x + 4}
                    y={y - h - 10}
                    width={w - 8}
                    height={12}
                    rx={4}
                    fill={C.brand}
                    opacity={0.55}
                  />
                ) : null}
                {!jar ? (
                  <rect
                    x={x}
                    y={y - h * 0.6}
                    width={w}
                    height={h * 0.22}
                    fill={C.brandTint}
                    opacity={0.9}
                  />
                ) : null}
              </g>
            );
          })}
          <rect x={0} y={y} width={1900} height={18} fill={C.ring} />
          <rect x={0} y={y + 18} width={1900} height={10} fill="#E6DED3" />
        </g>
      ))}
    </svg>
  );
};
