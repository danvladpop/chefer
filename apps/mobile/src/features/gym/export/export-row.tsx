import { useState } from 'react';
import { Alert, Share } from 'react-native';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';

// ─── Gym data export (gym_plan.md §4.2 gym.export.csv, research §5.2 #5) ─────
// "Offer CSV export of the full history from day one." Shared through the
// OS share sheet (Share.share) — no new native module, no file-system write.
// A large history shares fine (it is just text), but the OS share sheet gets
// unwieldy past a few thousand lines in some target apps (Mail, Notes), so we
// nudge the user toward the web export instead of silently truncating data.

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

  const share = async (filename: string, csv: string) => {
    try {
      await Share.share({ message: csv, title: filename });
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
        Alert.alert(
          'Large export',
          'Large histories export best from chefer.duckdns.org (Gym settings → Export). Share it from here anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share anyway', onPress: () => void share(filename, csv) },
          ],
        );
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
    <Card testID="gym-settings-export" className="gap-2">
      <Text className="font-medium">Export training data</Text>
      <Text variant="muted" className="text-xs">
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
    </Card>
  );
}
