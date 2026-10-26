import { z } from 'zod';
import { inviteCodeSchema } from './coaching/schemas';

// ─── Household sharing (ADR 0003, market review MUST 5) ──────────────────────
// A partner with their own account joins the household owner's household by
// claiming one member profile. Inputs, DTOs, limits and copy shared by the API,
// web and mobile. Additive only once mobile binaries ship.

export const HOUSEHOLD_SHARING_LIMITS = {
  /** Same generator and alphabet as coaching invites. */
  inviteCodeLength: 10,
  inviteTtlDays: 14,
  /** Open (unused, unrevoked, unexpired) invites one owner may hold. */
  maxOpenInvites: 10,
  invitesPerDay: 20,
  previewPerHour: 60,
  joinPerHour: 20,
  /** Expired invites are pruned this long after expiry. */
  inviteAfterExpiryDays: 30,
  /** Shop screen: how often a shared list asks "anything new?" while focused. */
  listPollMs: 4_000,
  /** Meals screen: the same for the shared week. */
  planPollMs: 15_000,
  /** Ended links and their notices are shown this long. */
  noticeDays: 30,
} as const;

export const householdRoleSchema = z.enum(['SOLO', 'OWNER', 'PARTNER']);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

const safetyTermList = (max: number) => z.array(z.string().trim().min(1).max(60)).max(max);

export const createHouseholdInviteInputSchema = z.object({ memberId: z.string().cuid() });
export const householdInviteCodeInputSchema = z.object({ code: inviteCodeSchema });

/**
 * The join screen's confirmation: the claimed profile's safety terms as the
 * partner confirmed (and possibly edited) them. Written to the profile and
 * unioned into the partner's own preferences.
 */
export const joinHouseholdInputSchema = z.object({
  code: inviteCodeSchema,
  allergies: safetyTermList(20).default([]),
  dietaryRestrictions: safetyTermList(20).default([]),
  dislikedIngredients: safetyTermList(30).default([]),
});
export type JoinHouseholdInput = z.infer<typeof joinHouseholdInputSchema>;

export const removeHouseholdPartnerInputSchema = z.object({ linkId: z.string().cuid() });

/** The invite as the person opening the link sees it. */
export const HOUSEHOLD_INVITE_STATES = [
  'OK',
  'NOT_FOUND',
  'SELF',
  /** Already this household's partner. */
  'ALREADY_JOINED',
  /** A partner in another household: leave it first. */
  'IN_OTHER_HOUSEHOLD',
  /** Owns a household with partners: cannot also join one. */
  'HAS_PARTNERS',
  /** Someone else already claimed this profile. */
  'PROFILE_TAKEN',
  'USED',
  'REVOKED',
  'EXPIRED',
] as const;
export type HouseholdInviteState = (typeof HOUSEHOLD_INVITE_STATES)[number];

export type HouseholdInvitePreview = {
  state: HouseholdInviteState;
  /** Only for OK and ALREADY_JOINED: the owner's first name and the profile. */
  ownerName?: string;
  profile?: {
    name: string;
    portionFactor: number;
    isKid: boolean;
    allergies: string[];
    dietaryRestrictions: string[];
    dislikedIngredients: string[];
  };
  /** IN_OTHER_HOUSEHOLD: whose household they are in now. */
  currentOwnerName?: string;
};

export type HouseholdPartnerDto = {
  linkId: string;
  memberId: string | null;
  name: string;
  since: string;
};

export type HouseholdOpenInviteDto = {
  code: string;
  memberId: string;
  url: string;
  expiresAt: string;
};

/** `household.sharing` — everything the Household screen needs about sharing. */
export type HouseholdSharingStatus = {
  /** The `householdSharing` flag for this user; false hides every entry point. */
  enabled: boolean;
  role: HouseholdRole;
  /** OWNER: may another partner be invited (the one entitlement check). */
  canInvite: boolean;
  /** PARTNER: whose household this is, and the claimed profile. */
  owner?: { name: string };
  myProfile?: { memberId: string; name: string; portionFactor: number };
  /** OWNER: the active partners. PARTNER: empty. */
  partners: HouseholdPartnerDto[];
  /** OWNER: open invites by profile. */
  invites: HouseholdOpenInviteDto[];
};

export const HOUSEHOLD_NOTICE_KINDS = [
  'HOUSEHOLD_PARTNER_JOINED',
  'HOUSEHOLD_PARTNER_LEFT',
  'HOUSEHOLD_REMOVED',
  'HOUSEHOLD_ENDED',
] as const;
export type HouseholdNoticeKind = (typeof HOUSEHOLD_NOTICE_KINDS)[number];

export type HouseholdNoticeDto = {
  id: string;
  kind: HouseholdNoticeKind;
  /** The other person's first name. */
  name: string;
  createdAt: string;
  read: boolean;
};

/** `shoppingList.sync` — the shared list's cheap "anything new?" answer. */
export type ShoppingListSyncDto = {
  planId: string | null;
  /** Changes when the list's ITEMS change (a meal swap, a custom item): refetch the list. */
  revision: string;
  checkedKeys: string[];
  /** Who last ticked each checked key, when the household has a partner. */
  checkedBy: Record<string, ListPersonDto>;
};

/** "Ticked by Maria" / "Added by you". */
export type ListPersonDto = { name: string; isYou: boolean };

/** One toggle as sent by a client; `at` is the device's time (ISO) for offline reconcile. */
export const listToggleAtSchema = z.string().datetime({ offset: true });

/** Builds the invite URL the owner shares. */
export function householdInviteUrl(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/$/, '')}/household/join/${code}`;
}

/** The path a web or app link opens. */
export const HOUSEHOLD_JOIN_PATH = /^\/household\/join\/[0-9A-Za-z-]{1,40}$/;

// ─── Copy (web + mobile) ──────────────────────────────────────────────────────

export const HOUSEHOLD_SHARING_COPY = {
  inviteButton: 'Invite to Chefer',
  inviteSheetTitle: (name: string) => `Invite ${name}`,
  inviteSheetBody: (name: string) =>
    `${name} gets their own Chefer account, sees this week's meals and ticks the shopping list with you. ` +
    'Their food log, weight and targets stay private, and so do yours.',
  inviteExpires: 'The link works once and expires in 14 days.',
  shareMessage: (ownerName: string) =>
    `${ownerName} invited you to share meal plans and the shopping list on Chefer: `,
  copyLink: 'Copy link',
  shareLink: 'Share link',
  revoke: 'Cancel invite',
  invitePending: 'Invite sent',
  joinedBadge: 'Has Chefer',
  joinTitle: (ownerName: string) => `Join ${ownerName}'s household`,
  joinLede: (ownerName: string, profileName: string) =>
    `${ownerName} added you as ${profileName}. Join to plan the week together and share one shopping list.`,
  joinShares: [
    'You both see and change the same week of meals.',
    'Ticks on the shopping list show up for both of you within seconds.',
    'Your allergies, diet and dislikes below are shared with the household, so every meal is safe for you.',
  ],
  joinPrivate: 'Your food log, weight and targets stay private. Nobody in the household sees them.',
  joinSafetyTitle: 'Check your allergies and diet',
  joinSafetyHint: 'These came from the household. Fix anything that is wrong before you join.',
  joinPortion: (portion: string) => `You eat ${portion} of each meal. You can change it later.`,
  joinAllow: 'Join household',
  joinDecline: 'Not now',
  joinOwnPlansNote: 'Your own meal plans are kept. They come back if you leave.',
  /** The join page's tab title and the heading of its one-sentence states. */
  joinPageTitle: 'Join a household',
  /** The join screen's three editable safety lists and their add / remove controls. */
  joinSafetyLists: {
    allergies: 'Allergies',
    dietaryRestrictions: 'Diet',
    dislikedIngredients: 'Dislikes',
  },
  joinSafetyNone: 'None',
  joinSafetyAdd: 'Add',
  joinSafetyAddLabel: (list: string) => `Add to ${list.toLowerCase()}`,
  joinSafetyRemove: (term: string) => `Remove ${term}`,
  /** A signed-out phone opening the invite link (web, before any sign-in). */
  signedOutTitle: 'Join a household on Chefer',
  signedOutBody:
    'Someone you cook with sent you this invite. Open it in the Chefer app to see whose household it is and join.',
  signedOutNoApp: 'No app yet? Get it free, then open your invite link again.',
  openInApp: 'Open in the Chefer app',
  continueOnWeb: 'Continue on the web',
  copied: 'Link copied',
  copyFailed: 'Couldn’t copy the link. Select it and copy it yourself.',
  /** The invite sheet when `household.invites.create` failed. */
  inviteLoadFailed: 'Couldn’t make the invite link. Try again.',
  tryAgain: 'Try again',
  you: 'You',
  dismissNotice: 'Dismiss',
  cancel: 'Cancel',
  goToMeals: 'Go to Meals',
  inviteState: {
    NOT_FOUND: "This invite link doesn't work. Ask for a new one.",
    SELF: "That's your own invite. Send it to the person you cook for.",
    ALREADY_JOINED: "You're already in this household.",
    IN_OTHER_HOUSEHOLD: (owner: string) =>
      `You're in ${owner}'s household. Leave it first, then open this link again.`,
    HAS_PARTNERS:
      'People have joined your own household. Remove them first if you want to join this one.',
    PROFILE_TAKEN: 'Someone has already joined with this invite. Ask for a new one.',
    USED: 'This invite has already been used. Ask for a new one.',
    REVOKED: 'This invite was cancelled. Ask for a new one.',
    EXPIRED: 'This invite has expired. Ask for a new one.',
  },
  partnerBanner: (ownerName: string) => `You're sharing ${ownerName}'s week and shopping list.`,
  ownerOnly: (ownerName: string) =>
    `Only ${ownerName} can do this, because the week is planned on their goals. You can swap, replace and pin meals.`,
  leave: 'Leave household',
  leaveConfirm: (ownerName: string) =>
    `Leave ${ownerName}'s household? You'll stop seeing the shared week and list, and your own plans come back. ` +
    'Your profile, with your allergies, stays in the household so meals stay safe for you.',
  remove: 'Remove from household',
  removeConfirm: (name: string) =>
    `Remove ${name}? They stop seeing your week and list. Their profile and allergies stay; you can delete the profile afterwards.`,
  claimedProfileNote: (name: string) => `${name} manages their own allergies and diet.`,
  conflict: (name: string) => `${name} changed this meal a moment ago. Here's the latest week.`,
  conflictSomeone: 'This meal changed a moment ago. Here’s the latest week.',
  checkedBy: (p: ListPersonDto) => (p.isYou ? 'Ticked by you' : `Ticked by ${p.name}`),
  addedBy: (p: ListPersonDto) => (p.isYou ? 'Added by you' : `Added by ${p.name}`),
  notice: {
    HOUSEHOLD_PARTNER_JOINED: (name: string) => `${name} joined your household.`,
    HOUSEHOLD_PARTNER_LEFT: (name: string) => `${name} left your household.`,
    HOUSEHOLD_REMOVED: (name: string) =>
      `${name} removed you from their household. Your own plans are back.`,
    HOUSEHOLD_ENDED: (name: string) => `${name} stopped using Chefer. Your plan is your own again.`,
  } satisfies Record<HouseholdNoticeKind, (name: string) => string>,
} as const;
