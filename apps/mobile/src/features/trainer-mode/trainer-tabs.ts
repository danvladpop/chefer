import { TRAINER_MODE_COPY } from '@chefer/types';
import type { IconName } from '../../components/icon';
import type { TrainerTab } from '../shell/shell-routes';

// Trainer mode's tab bar (trainer-mode.md §5.2, owner Q2): Today sits in the
// middle and is the initial route, the same as personal mode.

export const TRAINER_TABS: readonly {
  name: TrainerTab;
  title: string;
  icon: IconName;
  activeIcon: IconName;
}[] = [
  {
    name: 'schedule',
    title: TRAINER_MODE_COPY.tabs.schedule,
    icon: 'schedule',
    activeIcon: 'scheduleActive',
  },
  {
    name: 'clients',
    title: TRAINER_MODE_COPY.tabs.clients,
    icon: 'clients',
    activeIcon: 'clientsActive',
  },
  { name: 'today', title: TRAINER_MODE_COPY.tabs.today, icon: 'today', activeIcon: 'todayActive' },
  {
    name: 'workouts',
    title: TRAINER_MODE_COPY.tabs.workouts,
    icon: 'workouts',
    activeIcon: 'workoutsActive',
  },
  { name: 'you', title: TRAINER_MODE_COPY.tabs.you, icon: 'you', activeIcon: 'youActive' },
];
