import type { HealthPlatform, HealthSyncType } from '@chefer/types';

// "Connect health" screen copy (C2). Mobile only: web has no health store.

export const HEALTH_PLATFORM_NAME: Record<HealthPlatform, string> = {
  APPLE_HEALTH: 'Apple Health',
  HEALTH_CONNECT: 'Health Connect',
};

export interface HealthTypeCopy {
  title: string;
  description: string;
}

export const HEALTH_TYPE_COPY: Record<HealthSyncType, HealthTypeCopy> = {
  weight: {
    title: 'Weigh-ins',
    description: 'Weights from your scale or other apps join your weight history in Chefer.',
  },
  steps: {
    title: 'Steps',
    description: 'Shown on Today. Stays on this phone.',
  },
  activeEnergy: {
    title: 'Active energy',
    description: 'Shown on Today. Stays on this phone and never changes your food targets.',
  },
  workouts: {
    title: 'Workouts',
    description: 'Each workout you finish in Chefer, with its start and end time.',
  },
  nutrition: {
    title: 'Food',
    description: 'Each meal you log, with its calories and macros, at the meal’s usual time.',
  },
};

/** The two groups on the screen, in order. */
export const HEALTH_TYPE_GROUPS: readonly { title: string; types: readonly HealthSyncType[] }[] = [
  { title: 'Into Chefer', types: ['weight', 'steps', 'activeEnergy'] },
  { title: 'From Chefer', types: ['workouts', 'nutrition'] },
];

export function healthScreenCopy(platform: HealthPlatform) {
  const name = HEALTH_PLATFORM_NAME[platform];
  return {
    title: name,
    intro: `Choose what Chefer and ${name} share. Each switch asks ${name} for just that one thing, and you can turn it off here at any time.`,
    denied: `${name} didn’t allow it. You can change that in ${name}.`,
    openSettings: `Open ${name}`,
    saveError: 'Couldn’t save that. Check your connection and try again.',
    storeError: `${name} couldn’t turn that on. Try again in a moment.`,
    footer:
      platform === 'APPLE_HEALTH'
        ? 'Turning a switch off stops Chefer syncing it. To remove Chefer’s access completely, open the Health app › Sharing › Apps › Chefer.'
        : 'Turning a switch off stops Chefer syncing it. To remove Chefer’s access completely, open Health Connect › App permissions › Chefer.',
  };
}

/** The Settings / You row. */
export const HEALTH_ROW_COPY = {
  subtitle: 'Weight, steps, workouts, food',
};
