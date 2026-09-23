/**
 * One-line description of the running build for the More screen, e.g.
 * "Chefer 0.0.1 · production · update 3f2a9c1e" — how you tell on-device
 * which OTA update (if any) is live. Pure, so it's testable without the
 * expo-updates native module.
 */
export type BuildInfoInput = {
  appVersion: string | null | undefined;
  variant: string | null | undefined;
  updatesEnabled: boolean;
  /** JS served by Metro (dev client) — expo-updates state is meaningless then. */
  isDevServer: boolean;
  channel: string | null | undefined;
  updateId: string | null | undefined;
  isEmbeddedLaunch: boolean;
};

export function formatBuildInfo(info: BuildInfoInput): string {
  const variant = info.variant ?? 'development';
  const parts = [`Chefer ${info.appVersion ?? '?'}`, variant];
  if (info.isDevServer || !info.updatesEnabled) {
    parts.push('dev server');
    return parts.join(' · ');
  }
  // Channel normally equals the variant; only call it out when it doesn't.
  const channel = info.channel === '' ? null : (info.channel ?? null);
  if (channel !== variant) parts.push(`channel ${channel ?? 'none'}`);
  parts.push(
    info.isEmbeddedLaunch || !info.updateId
      ? 'built-in bundle'
      : `update ${info.updateId.slice(0, 8)}`,
  );
  return parts.join(' · ');
}
