'use client';

import { Sheet } from '@chefer/ui';

// UX-36 (4), T-36.4/T-36.7: the `How this works` sheet — the same four rows the
// phone's ExplainSheet shows (kind mechanics, CI-51), so both platforms teach
// the streak the same way.

const ROWS = [
  {
    label: 'Weeks, not days',
    value: 'Hit your weekly goal and your streak grows. Missing a session changes nothing.',
  },
  {
    label: 'Flex weeks',
    value: 'Every 4 weeks you earn a flex week — a short week won’t break your streak.',
  },
  {
    label: 'Pause',
    value: 'Going away or ill? Pause training and nothing counts against you.',
  },
  {
    label: 'Half sessions count',
    value: 'Any finished workout counts toward the week.',
  },
] as const;

export function HowThisWorksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How this works" size="sm">
      <dl className="space-y-3 px-5 pb-5" data-testid="gym-how-this-works">
        {ROWS.map((row) => (
          <div key={row.label}>
            <dt className="text-sm font-semibold text-gray-900">{row.label}</dt>
            <dd className="text-sm text-gray-600">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
