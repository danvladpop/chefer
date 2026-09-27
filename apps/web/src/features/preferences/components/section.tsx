// Shared card wrapper for a preferences section — split out of
// preferences-form.tsx (T-00.13, no behaviour change) so SafetySection,
// TargetsSection, BudgetSection and UnitsSection all render the same card
// chrome the form used inline before the split.
export function Section({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">{children}</section>;
}
