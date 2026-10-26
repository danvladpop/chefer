import type { EventMap } from '@chefer/types';

// ─── "Download my data" (G1): one copy and one size rule for web and mobile ───

export const DATA_EXPORT_COPY = {
  button: 'Download my data',
  busy: 'Preparing…',
  intro:
    'Download everything Chefer stores about you, as a ZIP with spreadsheet files, or delete your account for good.',
  ready: 'Your export is ready.',
  failed: "Couldn't prepare your data. Please try again.",
  tooSoon: "You've downloaded your data a few times just now. Try again in 15 minutes.",
} as const;

export type ExportSizeBucket = EventMap['data_export_downloaded']['sizeBucket'];

/** A coarse size bucket for the `data_export_downloaded` event — never the exact size. */
export function exportSizeBucket(bytes: number): ExportSizeBucket {
  if (bytes < 100 * 1024) return '<100kb';
  if (bytes < 1024 * 1024) return '100kb-1mb';
  return '1mb+';
}

/** The line to show when "Download my data" fails: the rate limit gets its own wording. */
export function exportErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: { code?: unknown } | null }).data?.code
      : undefined;
  return code === 'TOO_MANY_REQUESTS' ? DATA_EXPORT_COPY.tooSoon : DATA_EXPORT_COPY.failed;
}
