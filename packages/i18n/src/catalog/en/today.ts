// Lane J phase 4. Today, stats, progress and body, reminders, the weekly recap, share cards and Hide numbers (lanes D and E).
// The namespace is split by area (./today/*.ts); `shared` holds the copy
// objects moved from @chefer/utils that several screens read.
import { todayEngagement } from './today/engagement';
import { todayHome } from './today/home';
import { todayProgress } from './today/progress';
import { todaySettings } from './today/settings';
import { todayShare } from './today/share';
import { todayShared } from './today/shared';
import { todayShell } from './today/shell';

export const today = {
  ...todayShared,
  home: todayHome,
  shell: todayShell,
  progress: todayProgress,
  engagement: todayEngagement,
  settings: todaySettings,
  share: todayShare,
} as const;
