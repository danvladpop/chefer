import Link from 'next/link';

// UX-PLAN-12: with household members, "Cooking for" is a read-only
// "You + 2 — Edit table" instead of a stale "Just me / Two of us" choice (a
// household of three used to read "Cooking for: Just me"). Shared by the Plan
// settings sheet and the onboarding step; mirror of apps/mobile's
// how-you-cook-form.

export function HouseholdTableSummary({
  table,
  testId,
}: {
  table: { text: string; names: string };
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{table.text}</p>
        {table.names && <p className="truncate text-xs text-gray-500">{table.names}</p>}
      </div>
      <Link
        href="/preferences#household"
        data-testid={`${testId}-edit`}
        className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-[#944a00] hover:underline"
      >
        Edit table
      </Link>
    </div>
  );
}
