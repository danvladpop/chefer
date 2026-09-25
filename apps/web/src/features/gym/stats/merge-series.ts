// Combines several date-keyed numeric channels (e.g. one exercise's e1RM line
// plus its rolling-max trend, repeated per selected exercise, plus a
// bodyweight overlay) into one row-per-date array recharts can plot.
export interface SeriesPoint {
  localDate: string;
  value: number | null;
}

export interface NamedChannel {
  key: string;
  points: SeriesPoint[];
}

export type MergedRow = Record<string, string | number | null>;

/**
 * One row per distinct date across all channels, sorted ascending. A channel
 * with no point on a given date gets `null` there (recharts skips a null with
 * `connectNulls={false}`, which is what a real gap in training should show).
 */
export function mergeByDate(channels: NamedChannel[]): MergedRow[] {
  const dates = new Set<string>();
  for (const channel of channels) {
    for (const point of channel.points) dates.add(point.localDate);
  }
  const lookups = channels.map((c) => new Map(c.points.map((p) => [p.localDate, p.value])));
  return [...dates].sort().map((date) => {
    const row: MergedRow = { date };
    channels.forEach((channel, i) => {
      row[channel.key] = lookups[i]?.get(date) ?? null;
    });
    return row;
  });
}
