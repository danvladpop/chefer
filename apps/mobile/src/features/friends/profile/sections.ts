import type { Ionicons } from '@expo/vector-icons';
import {
  FRIENDS_COPY,
  type FriendProfileDto,
  type FriendsMeDto,
  type SectionAccess,
} from '@chefer/types';

// ─── Following profile: what each section shows (UX §8.2, §8.3) ──────────────
// Pure, so the locked / not-shared / preview rules are unit-testable without
// rendering. The server's `access` is the truth for another person
// (`visible` | `locked` | `not_shared`). For my own profile the server says
// `visible` for everything (I can always read my own data), so the preview
// uses my sharing switches instead: an unshared section reads `Hidden from
// followers`, exactly what a follower would get.

export type ProfileSection = 'plan' | 'recipes' | 'workouts';

export type SectionPanel = {
  icon: keyof typeof Ionicons.glyphMap;
  title?: string;
  body: string;
};

export type SectionView = { kind: 'visible' } | { kind: 'panel'; panel: SectionPanel };

const VISIBLE: SectionView = { kind: 'visible' };

/** The non-follower panel (header only, both tabs): private, request sent, or public. */
export function lockedPanel(profile: FriendProfileDto): SectionPanel {
  const first = profile.user.firstName;
  if (profile.user.relation === 'requested') {
    return {
      icon: 'lock-closed-outline',
      title: FRIENDS_COPY.locked.requested.title,
      body: FRIENDS_COPY.locked.requested.body(first),
    };
  }
  if (profile.visibility === 'PRIVATE') {
    return {
      icon: 'lock-closed-outline',
      title: FRIENDS_COPY.locked.private.title,
      body: FRIENDS_COPY.locked.private.body(first),
    };
  }
  return { icon: 'people-outline', body: FRIENDS_COPY.locked.public.body(first) };
}

/** True when the viewer sees only the header (they don't follow, or haven't been accepted). */
export function isLocked(profile: FriendProfileDto): boolean {
  if (profile.isSelf) return false;
  const { plan, recipes, workouts } = profile.access;
  return plan === 'locked' && recipes === 'locked' && workouts === 'locked';
}

const SHARE_KEY = {
  plan: 'sharePlan',
  recipes: 'shareRecipes',
  workouts: 'shareWorkouts',
} as const satisfies Record<ProfileSection, string>;

export function sectionView(
  profile: FriendProfileDto,
  section: ProfileSection,
  me?: FriendsMeDto,
): SectionView {
  if (profile.isSelf) {
    const settings = me?.settings;
    if (settings && !settings[SHARE_KEY[section]]) {
      return {
        kind: 'panel',
        panel: { icon: 'eye-off-outline', body: FRIENDS_COPY.preview.hidden },
      };
    }
    return VISIBLE;
  }
  const access: SectionAccess = profile.access[section];
  if (access === 'visible') return VISIBLE;
  if (access === 'locked') return { kind: 'panel', panel: lockedPanel(profile) };
  return {
    kind: 'panel',
    panel: {
      icon: 'eye-off-outline',
      body: FRIENDS_COPY.notShared[section](profile.user.firstName),
    },
  };
}

/** Whether the profile's own preview should show the shared targets line. */
export function showsTargets(profile: FriendProfileDto, me?: FriendsMeDto): boolean {
  if (!profile.isSelf) return true; // the server only sends targets when shared
  return me?.settings?.shareTargets === true;
}
