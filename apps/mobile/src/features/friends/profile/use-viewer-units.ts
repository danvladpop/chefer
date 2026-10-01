import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { weightUnitForSystem } from '@chefer/utils';
import { useUnitSystem } from '../../../hooks/use-unit-system';
import { trpc } from '../../../lib/trpc';

// ─── The VIEWER's units for another person's workouts (UX §10, PRD FR-19.1) ───
// Weights and distances are shown in the viewer's own units: their gym unit
// when the app already knows it, else their food units (`preferredUnits`).
//
// The gym unit is a one-off PEEK at the viewer's own `gym.bootstrap` in the
// in-memory query cache (`getQueryData`): no gym query is created, observed,
// fetched or written from a Following screen (INV-7, UX §10 "nothing reads or
// writes the gym offline store"), and nothing about the other person goes
// near it. A viewer who never opened Gym has nothing cached → food units.

export type ViewerUnits = {
  weight: 'KG' | 'LB';
  distance: 'KM' | 'MI';
};

type CachedGymProfile = {
  profile?: { unit?: 'KG' | 'LB'; distanceUnit?: 'KM' | 'MI' | null } | null;
};

export function useViewerUnits(): ViewerUnits {
  const queryClient = useQueryClient();
  const system = useUnitSystem();
  const cached = queryClient.getQueryData<CachedGymProfile>(
    getQueryKey(trpc.gym.bootstrap, undefined, 'query'),
  );
  const weight = cached?.profile?.unit ?? weightUnitForSystem(system);
  const distance = cached?.profile?.distanceUnit ?? (weight === 'LB' ? 'MI' : 'KM');
  return { weight, distance };
}
