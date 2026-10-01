import { useRef, useState } from 'react';
import { View } from 'react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { Button, haptics, Sheet, Text } from '@chefer/ui-mobile';

// ─── The Public → Private confirm (UX §11.2) ───────────────────────────────────
// `Make your profile private?` — Make private / Review followers / Cancel.
// It is the kit Sheet (not FriendsConfirmSheet) because it has the extra
// `Review followers` link: tapping it closes the sheet and ONLY THEN, from
// `onExited`, navigates to the Followers list (iOS freezes if a route changes
// while a Modal is dismissing). The Public confirm needs nothing extra and
// uses FriendsConfirmSheet directly (visibility-section.tsx).

export type PrivateConfirmSheetProps = {
  visible: boolean;
  /** Current followers (the body states how many keep seeing what's shared). */
  followers: number;
  /** Resolve true once the server saved; false keeps the sheet open with the error. */
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
  /** `Review followers`: runs after the sheet is gone. */
  onReview: () => void;
  testID?: string;
};

export function PrivateConfirmSheet({
  visible,
  followers,
  onConfirm,
  onClose,
  onReview,
  testID = 'friends-settings-private-confirm',
}: PrivateConfirmSheetProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reviewing = useRef(false);

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
    if (ok) onClose();
    else {
      setFailed(true);
      haptics.error();
    }
  };

  const close = () => {
    if (busy) return;
    setFailed(false);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      onExited={() => {
        setFailed(false);
        if (reviewing.current) {
          reviewing.current = false;
          onReview();
        }
      }}
      title={FRIENDS_COPY.private.confirm.title}
      testID={testID}
    >
      <Text testID={`${testID}-body`}>{FRIENDS_COPY.private.confirm.body(followers)}</Text>
      {failed ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {FRIENDS_COPY.settings.saveError}
        </Text>
      ) : null}
      <View className="gap-2 pt-2">
        <Button
          testID={`${testID}-confirm`}
          size="lg"
          loading={busy}
          onPress={() => void confirm()}
        >
          {FRIENDS_COPY.private.confirm.cta}
        </Button>
        <Button
          testID={`${testID}-review`}
          size="lg"
          variant="ghost"
          disabled={busy}
          onPress={() => {
            reviewing.current = true;
            close();
          }}
        >
          {FRIENDS_COPY.private.confirm.reviewFollowers}
        </Button>
        <Button
          testID={`${testID}-cancel`}
          size="lg"
          variant="outline"
          disabled={busy}
          onPress={close}
        >
          {FRIENDS_COPY.common.cancel}
        </Button>
      </View>
    </Sheet>
  );
}
