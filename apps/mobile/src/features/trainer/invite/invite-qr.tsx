import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';
import { colorsFor } from '@chefer/tokens';
import { COACHING_COPY } from '@chefer/types';

// ─── The invite as a QR code (PRD 2026-10 §4.1, S5) ───────────────────────────
// For in-person sign-ups: the client points their phone camera at it and the invite link opens. Encoded
// in pure JS (`qrcode-generator`, no native module, so it ships over the air) and drawn with
// react-native-svg (already in the binary) as ONE path of dark modules. Always dark on light, whatever the
// theme: a scanner needs the contrast, so the colours are the light palette's label and surface.

// drift-ok: a QR code must stay dark on light at night, or scanners cannot read it
const QR_COLORS = colorsFor('light');
/** The quiet zone the QR spec asks for, in modules. */
const QUIET_ZONE = 4;

/** The dark modules of `text` as an SVG path in module units, and the side length with the quiet zone. */
export function qrPath(text: string): { d: string; size: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { d, size: count + QUIET_ZONE * 2 };
}

export function InviteQr({
  url,
  size = 240,
  testID = 'trainer-invite-qr',
}: {
  url: string;
  size?: number;
  testID?: string;
}) {
  const { d, size: modules } = useMemo(() => qrPath(url), [url]);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={COACHING_COPY.trainer.qr.label}
      className="self-center overflow-hidden rounded-inner"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`}>
        <Rect width={modules} height={modules} fill={QR_COLORS.surface} />
        <Path d={d} fill={QR_COLORS.label} />
      </Svg>
    </View>
  );
}
