import type { Catalog } from '../../types';
import { todayEngagement } from './today/engagement';
import { todayHome } from './today/home';
import { todayProgress } from './today/progress';
import { todaySettings } from './today/settings';
import { todayShare } from './today/share';
import { todayShared } from './today/shared';
import { todayShell } from './today/shell';

export const today: Catalog['today'] = {
  ...todayShared,
  home: todayHome,
  shell: todayShell,
  progress: todayProgress,
  engagement: todayEngagement,
  settings: todaySettings,
  share: todayShare,
};
