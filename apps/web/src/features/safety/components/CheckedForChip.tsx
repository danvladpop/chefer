import { ShieldCheck } from 'lucide-react';
import { checkedForChipA11yLabel, checkedForChipText, cn } from '@chefer/utils';

// PAT-2 — "Checked for {n}" (UX-02 §3, T-02.2): the compact form for meal
// cards, hero cards, Replace-sheet rows and Discover cards. The caller only
// renders it when the table has ≥ 1 safety item.

export interface CheckedForChipProps {
  labels: readonly string[];
  className?: string;
}

export function CheckedForChip({ labels, className }: CheckedForChipProps) {
  if (labels.length === 0) return null;
  return (
    <span
      aria-label={checkedForChipA11yLabel(labels)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-medium text-[#944a00]',
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      <span aria-hidden="true">{checkedForChipText(labels.length)}</span>
    </span>
  );
}
