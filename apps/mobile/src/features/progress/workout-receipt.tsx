import { trpc } from '../../lib/trpc';
import { KitchenReceipt } from './kitchen-receipt';
import { useProgressEnabled, useProgressSummary } from './use-progress';

// The workout summary's Kitchen receipt (mockup 03): what this session earned,
// from `progress.receiptFor({ kind: 'WORKOUT', sourceId })`. A workout finished
// offline has no receipt until it syncs: the answer is null and nothing shows;
// the gym sync (gym-sync-provider.tsx onSynced) invalidates `progress.*`, so it
// appears by itself. Hidden when Kitchen progress is off or "Show XP & levels" is.

export function WorkoutReceipt({ id }: { id: string }) {
  const enabled = useProgressEnabled();
  const { summary } = useProgressSummary();
  const { data } = trpc.progress.receiptFor.useQuery(
    { kind: 'WORKOUT', sourceId: id },
    { enabled },
  );
  if (!enabled || !data || summary?.settings.showXp === false) return null;
  return <KitchenReceipt testID="workout-receipt" receipt={data} xp={summary?.xp} />;
}
