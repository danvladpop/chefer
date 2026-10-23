import { Users } from 'lucide-react';
import { HOUSEHOLD_SHARING_COPY as COPY } from '@chefer/types';
import { cn } from '@chefer/utils';

// "You're sharing Dan's week and shopping list." (ADR 0002), with an optional
// second line — the Meals screen says which week actions stay with the owner.

export function PartnerBanner({
  ownerName,
  note,
  className,
}: {
  ownerName: string;
  note?: string | null;
  className?: string;
}) {
  return (
    <div
      data-testid="household-partner-banner"
      className={cn(
        'flex items-start gap-2 rounded-xl border border-[#944a00]/20 bg-[#fff3e8] px-4 py-2.5',
        className,
      )}
    >
      <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#944a00]">{COPY.partnerBanner(ownerName)}</p>
        {note && <p className="mt-0.5 text-xs text-gray-700">{note}</p>}
      </div>
    </div>
  );
}
