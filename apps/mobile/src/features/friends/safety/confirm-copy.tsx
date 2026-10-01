import { useRef, useState } from 'react';
import { View } from 'react-native';
import { FRIENDS_COPY, type ProfileVisibility } from '@chefer/types';
import { Button, haptics, Sheet, Text } from '@chefer/ui-mobile';

// ─── Following: confirmation copy + the confirm sheet (UX §3.3, §11.4) ────────
// Every destructive Following confirm, worded from FRIENDS_COPY in one place,
// and one sheet to show them. It's the kit `Sheet` (not `ConfirmSheet`)
// because these confirms need three things ConfirmSheet doesn't have:
//   • `onExited` — the follow-up (navigate back, the next sheet) must wait
//     until the sheet is fully gone; iOS freezes if a Modal is presented or a
//     route pops while another Modal is dismissing (UX §3.2, binding);
//   • an async confirm that keeps the sheet open, busy, and shows an inline
//     error when the server says no ("Nothing is blocked until the server
//     confirms", UX §11.4);
//   • an optional body (cancelling a request has a title only).

export type ConfirmCopy = {
  title: string;
  body: string | null;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
};

export const FRIENDS_CONFIRMS = {
  /** RelationButton `Following` → unfollow. The "ask again" line only applies to a private profile. */
  unfollow: (first: string, visibility?: ProfileVisibility): ConfirmCopy => ({
    title: FRIENDS_COPY.confirm.unfollow.title(first),
    body: visibility === 'PUBLIC' ? null : FRIENDS_COPY.confirm.unfollow.bodyPrivate,
    confirmLabel: FRIENDS_COPY.confirm.unfollow.cta,
    cancelLabel: FRIENDS_COPY.common.cancel,
    destructive: false,
  }),
  /** RelationButton `Requested` → cancel the request. */
  cancelRequest: (): ConfirmCopy => ({
    title: FRIENDS_COPY.confirm.cancelRequest.title,
    body: null,
    confirmLabel: FRIENDS_COPY.confirm.cancelRequest.cta,
    cancelLabel: FRIENDS_COPY.confirm.cancelRequest.keep,
    destructive: false,
  }),
  removeFollower: (first: string): ConfirmCopy => ({
    title: FRIENDS_COPY.remove.title(first),
    body: FRIENDS_COPY.remove.body,
    confirmLabel: FRIENDS_COPY.remove.cta,
    cancelLabel: FRIENDS_COPY.common.cancel,
    destructive: true,
  }),
  block: (first: string): ConfirmCopy => ({
    title: FRIENDS_COPY.block.title(first),
    body: FRIENDS_COPY.block.body,
    confirmLabel: FRIENDS_COPY.block.cta,
    cancelLabel: FRIENDS_COPY.common.cancel,
    destructive: true,
  }),
  unblock: (first: string): ConfirmCopy => ({
    title: FRIENDS_COPY.unblock.title(first),
    body: FRIENDS_COPY.unblock.body,
    confirmLabel: FRIENDS_COPY.unblock.cta,
    cancelLabel: FRIENDS_COPY.common.cancel,
    destructive: false,
  }),
} as const;

export type FriendsConfirmSheetProps = {
  visible: boolean;
  copy: ConfirmCopy;
  /**
   * Run the action. Resolve `true` to close the sheet (then `onDone` fires
   * once it's gone), `false` to keep it open with `errorMessage`. A plain
   * synchronous confirm (no server call) just returns `true`.
   */
  onConfirm: () => boolean | Promise<boolean>;
  /** Hide the sheet (Cancel, ✕, backdrop, or after a successful confirm). */
  onClose: () => void;
  /** After a SUCCESSFUL confirm, once the sheet has fully exited: navigate, chain. */
  onDone?: () => void;
  /** After every exit (success or cancel): e.g. return VoiceOver focus to the trigger. */
  onExited?: () => void;
  /** Shown under the body when `onConfirm` resolves false. */
  errorMessage?: string;
  testID: string;
};

export function FriendsConfirmSheet({
  visible,
  copy,
  onConfirm,
  onClose,
  onDone,
  onExited,
  errorMessage = FRIENDS_COPY.relation.error,
  testID,
}: FriendsConfirmSheetProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const succeeded = useRef(false);

  const confirm = async () => {
    if (busy) return;
    setFailed(false);
    setBusy(true);
    let ok = false;
    try {
      ok = await onConfirm();
    } catch {
      ok = false;
    }
    setBusy(false);
    if (ok) {
      succeeded.current = true;
      onClose();
    } else {
      setFailed(true);
      haptics.error();
    }
  };

  const close = () => {
    if (busy) return;
    setFailed(false);
    onClose();
  };

  const exited = () => {
    const done = succeeded.current;
    succeeded.current = false;
    setFailed(false);
    if (done) onDone?.();
    onExited?.();
  };

  return (
    <Sheet visible={visible} onClose={close} onExited={exited} title={copy.title} testID={testID}>
      {copy.body ? <Text testID={`${testID}-body`}>{copy.body}</Text> : null}
      {failed ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {errorMessage}
        </Text>
      ) : null}
      <View className="gap-2 pt-2">
        <Button
          testID={`${testID}-confirm`}
          size="lg"
          variant={copy.destructive ? 'destructive' : 'default'}
          loading={busy}
          onPress={() => void confirm()}
        >
          {copy.confirmLabel}
        </Button>
        <Button
          testID={`${testID}-cancel`}
          size="lg"
          variant="outline"
          disabled={busy}
          onPress={close}
        >
          {copy.cancelLabel}
        </Button>
      </View>
    </Sheet>
  );
}
