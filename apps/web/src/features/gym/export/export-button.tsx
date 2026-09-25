'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Download } from 'lucide-react';
import { Button } from '@chefer/ui';
import { CardLabel, GymCard } from '../shared/gym-card';

// ─── Gym data export (gym_plan.md §4.2 gym.export.csv, research §5.2 #5) ─────
// "Offer CSV export of the full history from day one." A small, self-contained
// card so it can be dropped into the settings page with a one-line insertion
// while another agent edits the rest of that screen.

type Status = 'idle' | 'loading' | 'error';

/** Downloads a Blob as `filename` via a throwaway anchor (no server round trip). */
function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function GymExportCard() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<Status>('idle');

  const handleExport = async () => {
    setStatus('loading');
    try {
      const { filename, csv } = await utils.gym.export.csv.fetch();
      downloadCsv(filename, csv);
      setStatus('idle');
    } catch (err) {
      console.error('[gym] export failed', err);
      setStatus('error');
    }
  };

  return (
    <GymCard>
      <CardLabel>Your data</CardLabel>
      <p className="mt-1 text-xs text-gray-500">
        Every set you&apos;ve logged, as a CSV you can open in a spreadsheet.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3"
        disabled={status === 'loading'}
        onClick={() => void handleExport()}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {status === 'loading' ? 'Preparing…' : 'Export my training data (CSV)'}
      </Button>
      {status === 'error' && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          Couldn&apos;t export right now — try again in a minute.
        </p>
      )}
    </GymCard>
  );
}
