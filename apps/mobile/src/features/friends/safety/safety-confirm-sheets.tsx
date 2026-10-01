import { FRIENDS_COPY } from '@chefer/types';
import { useSnackbar } from '@chefer/ui-mobile';
import { track } from '../../../lib/analytics';
import { FRIENDS_CONFIRMS, FriendsConfirmSheet } from './confirm-copy';
import { useBlock, useUnblock } from './use-block';
import { useRemoveFollower } from './use-remove-follower';

// ─── Following: the wired safety confirms (UX §11.4, §11.6) ───────────────────
// Ready-to-use sheets for the profile `…`, the Followers row `…` and Blocked
// people: confirm → server → snackbar, with the follow-up (back out of the
// profile, focus return) in `onDone` / `onExited`, after the sheet is gone.

type Person = { id: string; firstName: string };

type SafetySheetProps = {
  visible: boolean;
  person: Person;
  onClose: () => void;
  /** Success, after the sheet has exited (e.g. `router.back()` off a profile). */
  onDone?: () => void;
  onExited?: () => void;
  testID?: string;
};

/** `Block {first}?` → block (not optimistic) → snackbar `{first} blocked`. */
export function BlockConfirmSheet({
  from,
  visible,
  person,
  onClose,
  onDone,
  onExited,
  testID = 'friends-block-confirm',
}: SafetySheetProps & { from: 'profile' | 'followers' }) {
  const { block } = useBlock();
  const snackbar = useSnackbar();
  return (
    <FriendsConfirmSheet
      testID={testID}
      visible={visible}
      copy={FRIENDS_CONFIRMS.block(person.firstName)}
      errorMessage={FRIENDS_COPY.relation.error}
      onClose={onClose}
      onConfirm={async () => {
        const result = await block(person.id);
        if (result.ok) track('friend_blocked', { from });
        return result.ok;
      }}
      onDone={() => {
        snackbar.show({ message: FRIENDS_COPY.block.done(person.firstName), tone: 'success' });
        onDone?.();
      }}
      {...(onExited ? { onExited } : {})}
    />
  );
}

/** `Remove {first} as a follower?` → optimistic remove → snackbar `{first} removed`. */
export function RemoveFollowerConfirmSheet({
  visible,
  person,
  onClose,
  onDone,
  onExited,
  testID = 'friends-remove-confirm',
}: SafetySheetProps) {
  const { removeFollower } = useRemoveFollower();
  const snackbar = useSnackbar();
  return (
    <FriendsConfirmSheet
      testID={testID}
      visible={visible}
      copy={FRIENDS_CONFIRMS.removeFollower(person.firstName)}
      onClose={onClose}
      onConfirm={async () => {
        const result = await removeFollower(person.id);
        if (result.ok) track('follower_removed', {});
        return result.ok;
      }}
      onDone={() => {
        snackbar.show({ message: FRIENDS_COPY.remove.done(person.firstName), tone: 'success' });
        onDone?.();
      }}
      {...(onExited ? { onExited } : {})}
    />
  );
}

/** `Unblock {first}?` → unblock → the Blocked people row exits. */
export function UnblockConfirmSheet({
  visible,
  person,
  onClose,
  onDone,
  onExited,
  testID = 'friends-unblock-confirm',
}: SafetySheetProps) {
  const { unblock } = useUnblock();
  return (
    <FriendsConfirmSheet
      testID={testID}
      visible={visible}
      copy={FRIENDS_CONFIRMS.unblock(person.firstName)}
      onClose={onClose}
      onConfirm={async () => (await unblock(person.id)).ok}
      {...(onDone ? { onDone } : {})}
      {...(onExited ? { onExited } : {})}
    />
  );
}
