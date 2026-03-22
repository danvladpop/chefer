type AvailabilityStatus = 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';

const BADGE_STYLES: Record<AvailabilityStatus, string> = {
  IN_STOCK: 'bg-green-100 text-green-700',
  LIMITED: 'bg-amber-100 text-amber-700',
  OUT_OF_STOCK: 'bg-red-100 text-red-700',
};

const BADGE_LABELS: Record<AvailabilityStatus, string> = {
  IN_STOCK: 'In Stock',
  LIMITED: 'Limited',
  OUT_OF_STOCK: 'Not Available',
};

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[status]}`}>
      {BADGE_LABELS[status]}
    </span>
  );
}
