import React from "react";
import { C, CARD_SHADOW, fontFamily, PHONE_SHADOW } from "../theme";

export type Tab = "today" | "meals" | "shop" | "train" | "you";

export const PHONE_W = 560;
export const PHONE_H = 1160;
export const BEZEL = 14;
export const SCREEN_W = PHONE_W - BEZEL * 2;
export const SCREEN_H = PHONE_H - BEZEL * 2;
export const TABBAR_H = 120;
/** Content area starts here (screen coords) when the phone has a title. */
export const CONTENT_TOP = 176;
export const CONTENT_PAD = 20;

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "meals", label: "Meals" },
  { id: "shop", label: "Shop" },
  { id: "train", label: "Train" },
  { id: "you", label: "You" },
];

const TabIcon: React.FC<{ id: Tab; color: string }> = ({ id, color }) => (
  <svg
    width={38}
    height={38}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {id === "today" ? (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
      </>
    ) : null}
    {id === "meals" ? (
      <>
        <path d="M3 11.5h18a9 9 0 0 1-18 0z" />
        <path d="M9 3.5c-.9 1.4.9 2.4 0 4M14.5 3.5c-.9 1.4.9 2.4 0 4" />
      </>
    ) : null}
    {id === "shop" ? (
      <>
        <path d="M5 8h14l-1.2 12.5H6.2z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </>
    ) : null}
    {id === "train" ? (
      <path d="M6.5 7v10M17.5 7v10M3.5 10v4M20.5 10v4M6.5 12h11" />
    ) : null}
    {id === "you" ? (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ) : null}
  </svg>
);

export const TabBar: React.FC<{ active: Tab }> = ({ active }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: TABBAR_H,
      background: C.surface,
      borderTop: `2px solid ${C.separator}`,
      display: "flex",
      paddingTop: 12,
    }}
  >
    {TABS.map((t) => {
      const on = t.id === active;
      const color = on ? C.brand : C.labelSecondary;
      return (
        <div
          key={t.id}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              width: 76,
              height: 44,
              borderRadius: 22,
              background: on ? C.brandTint : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TabIcon id={t.id} color={color} />
          </div>
          <div style={{ fontSize: 24, fontWeight: on ? 700 : 600, color }}>
            {t.label}
          </div>
        </div>
      );
    })}
    <div
      style={{
        position: "absolute",
        bottom: 8,
        left: "50%",
        width: 160,
        height: 6,
        marginLeft: -80,
        borderRadius: 3,
        background: C.label,
        opacity: 0.85,
      }}
    />
  </div>
);

/**
 * Simplified phone: 64px outer radius, #FAF7F2 canvas, optional large title,
 * the app's five-tab bar. Children render in screen coordinates.
 */
export const Phone: React.FC<{
  active?: Tab;
  title?: string;
  subtitle?: string;
  dark?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ active, title, subtitle, dark = false, children, style }) => (
  <div
    style={{
      position: "absolute",
      width: PHONE_W,
      height: PHONE_H,
      borderRadius: 64,
      background: C.label,
      padding: BEZEL,
      boxShadow: PHONE_SHADOW,
      fontFamily,
      ...style,
    }}
  >
    <div
      style={{
        position: "relative",
        width: SCREEN_W,
        height: SCREEN_H,
        borderRadius: 50,
        overflow: "hidden",
        background: dark ? "#141210" : C.canvas,
        color: C.label,
      }}
    >
      {/* Status bar + island */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 40,
          fontSize: 24,
          fontWeight: 700,
          color: dark ? C.cream : C.label,
        }}
      >
        9:41
      </div>
      <div
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          width: 150,
          height: 40,
          marginLeft: -75,
          borderRadius: 20,
          background: "#000",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 36,
          display: "flex",
          gap: 4,
          alignItems: "flex-end",
        }}
      >
        {[8, 12, 16, 20].map((h) => (
          <div
            key={h}
            style={{
              width: 5,
              height: h,
              borderRadius: 2,
              background: dark ? C.cream : C.label,
            }}
          />
        ))}
        <div
          style={{
            marginLeft: 6,
            width: 36,
            height: 18,
            borderRadius: 5,
            border: `2.5px solid ${dark ? C.cream : C.label}`,
            padding: 2,
          }}
        >
          <div
            style={{
              width: "75%",
              height: "100%",
              borderRadius: 2,
              background: dark ? C.cream : C.label,
            }}
          />
        </div>
      </div>

      {title ? (
        <div style={{ position: "absolute", top: 70, left: 28, right: 28 }}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 24,
                fontWeight: 600,
                color: C.labelSecondary,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      ) : null}

      {children}
      {active ? <TabBar active={active} /> : null}
    </div>
  </div>
);

export const Card: React.FC<{
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ style, children }) => (
  <div
    style={{
      background: C.surface,
      borderRadius: 24,
      boxShadow: CARD_SHADOW,
      ...style,
    }}
  >
    {children}
  </div>
);
