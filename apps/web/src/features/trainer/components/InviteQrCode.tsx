'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { COACHING_COPY } from '@chefer/types';
import { cn } from '@chefer/utils';

// ─── The invite as a QR code (PRD 2026-10 §4.1, S5) ───────────────────────────
// For in-person sign-ups on the gym floor: the client points their phone camera
// at the trainer's screen. Rendered as one SVG path (crisp at any size, no
// canvas), black on white with the standard 4-module quiet zone so phone
// cameras read it in dark mode too.

const QUIET_ZONE = 4;

/** The dark modules of `text` as an SVG path in module units, plus the full size. */
export function qrPath(text: string): { d: string; size: number } {
  // Type 0 = the smallest version that fits; M = 15% error correction.
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { d, size: count + QUIET_ZONE * 2 };
}

export function InviteQrCode({ url, className }: { url: string; className?: string }) {
  const { d, size } = useMemo(() => qrPath(url), [url]);
  return (
    <svg
      role="img"
      aria-label={COACHING_COPY.trainer.qr.label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('h-auto w-full max-w-56 rounded-lg', className)}
      data-testid="invite-qr"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
