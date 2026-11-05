import type { IconName } from '../../components/icon';
import type { TrainerTab } from '../shell/shell-routes';

// Trainer mode's tab bar (trainer-mode.md §5.2, owner Q2): Today sits in the
// middle and is the initial route, the same as personal mode.

export const TRAINER_TABS: readonly {
  name: TrainerTab;
  /** The tab's name, translated where the tab bar is drawn. */
  titleKey: `trainer.tabs.${TrainerTab}`;
  icon: IconName;
  activeIcon: IconName;
}[] = [
  {
    name: 'schedule',
    titleKey: 'trainer.tabs.schedule',
    icon: 'schedule',
    activeIcon: 'scheduleActive',
  },
  {
    name: 'clients',
    titleKey: 'trainer.tabs.clients',
    icon: 'clients',
    activeIcon: 'clientsActive',
  },
  { name: 'today', titleKey: 'trainer.tabs.today', icon: 'today', activeIcon: 'todayActive' },
  {
    name: 'workouts',
    titleKey: 'trainer.tabs.workouts',
    icon: 'workouts',
    activeIcon: 'workoutsActive',
  },
  { name: 'you', titleKey: 'trainer.tabs.you', icon: 'you', activeIcon: 'youActive' },
];
