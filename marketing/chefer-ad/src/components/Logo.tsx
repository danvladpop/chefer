import React, { useId } from "react";
import { C } from "../theme";

/**
 * The Chefer app icon (apps/web/src/app/icon.svg): cream plate between a fork
 * and a knife on a 135° #A9570A → #7E3E00 gradient with rounded-square corners.
 */
export const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({
  size,
  style,
}) => {
  const id = `logo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      style={{ display: "block", ...style }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.logoFrom} />
          <stop offset="1" stopColor={C.logoTo} />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill={`url(#${id})`} />
      <g transform="translate(512 512) scale(0.92) translate(-512 -512)">
        <circle cx="512" cy="512" r="228" fill={C.cream} />
        <circle
          cx="512"
          cy="512"
          r="162"
          fill="none"
          stroke={C.ring}
          strokeWidth="16"
        />
        <g fill={C.cream}>
          <rect x="176" y="296" width="16" height="150" rx="8" />
          <rect x="208" y="296" width="16" height="150" rx="8" />
          <rect x="240" y="296" width="16" height="150" rx="8" />
          <path d="M176 430 H256 V446 Q256 492 232 504 V712 Q232 732 216 732 Q200 732 200 712 V504 Q176 492 176 446 Z" />
        </g>
        <g fill={C.cream}>
          <path d="M800 296 V520 H852 V470 Q852 330 800 296 Z" />
          <rect x="806" y="500" width="36" height="232" rx="18" />
        </g>
      </g>
    </svg>
  );
};
