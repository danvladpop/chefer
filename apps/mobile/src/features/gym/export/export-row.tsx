import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, ConfirmSheet, Text } from '@chefer/ui-mobile';
import { CSV_MIME, shareExportFile } from '../../../lib/share-file';
import { trpc } from '../../../lib/trpc';

// ─── Gym data export (gym_plan.md §4.2 gym.export.csv, research §5.2 #5) ─────
// "Offer CSV export of the full history from day one." Shared as a named
// `text/csv` file through the shared shareExportFile helper (T-39.5, UX-39
// AC5) — the same path as the account-data export; binaries without the
// expo-sharing native module fall back to a titled text share there.
// A large history shares fine, but the OS share sheet gets unwieldy past a few
// thousand lines in some target apps (Mail, Notes), so we nudge the user
// toward the web export instead of silently truncating data.

const LARGE_EXPORT_ROW_THRESHOLD = 2000;

type Status = 'idle' | 'loading' | 'error';

function countDataRows(csv: string): number {
  // Trailing newline (there is none here, but be defensive) shouldn't count
  // as an extra row; the header row is excluded from the count.
  const lines = csv.split('\r\n').filter((line) => line.length > 0);
  return Math.max(0, lines.length - 1);
}

export function GymExportRow() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<Status>('idle');
  // UX-X-13: the large-export prompt is a ConfirmSheet (not a native Alert), so
  // it matches every other confirm in the app and has an accessible name.
  const [largeExport, setLargeExport] = useState<{ filename: string; csv: string } | null>(null);

  const share = async (filename: string, csv: string) => {
    try {
      await shareExportFile(filename, csv, CSV_MIME);
    } catch {
      // The user dismissing the share sheet also lands here on some OSes —
      // not worth surfacing as an error.
    }
  };

  const handleExport = async () => {
    setStatus('loading');
    try {
      const { filename, csv } = await utils.gym.export.csv.fetch();
      setStatus('idle');
      if (countDataRows(csv) > LARGE_EXPORT_ROW_THRESHOLD) {
        setLargeExport({ filename, csv });
        return;
      }
      await share(filename, csv);
    } catch (err) {
      setStatus('error');
      console.error('[gym] export failed', err);
      Alert.alert('Export failed', "Couldn't export your training data — try again in a minute.");
    }
  };

  return (
    <Card testID="gym-settings-export" className="min-w-0 gap-2">
      <Text className="font-medium">Export training data</Text>
      <Text testID="gym-settings-export-copy" variant="muted" className="w-full min-w-0 text-xs">
        Every set you&apos;ve logged, as a CSV you can open in a spreadsheet. Large histories export
        best from chefer.duckdns.org.
      </Text>
      <Button
        testID="gym-settings-export-button"
        variant="outline"
        size="sm"
        loading={status === 'loading'}
        onPress={() => void handleExport()}
      >
        Export training data
      </Button>
      <ConfirmSheet
        visible={largeExport !== null}
        onClose={() => setLargeExport(null)}
        title="Large export"
        body="Large histories export best from chefer.duckdns.org (Gym settings → Export). Share it from here anyway?"
        confirmLabel="Share anyway"
        cancelLabel="Cancel"
        onConfirm={() => {
          const pending = largeExport;
          setLargeExport(null);
          if (pending) void share(pending.filename, pending.csv);
        }}
        testID="gym-settings-export-large"
      />
    </Card>
  );
}
