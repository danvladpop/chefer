import { useState } from 'react';
import { View } from 'react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui-mobile';
import { BlockConfirmSheet, RemoveFollowerConfirmSheet } from '../safety/safety-confirm-sheets';

// ─── The Followers row `…` (UX §5.1, §11.4) ───────────────────────────────────
// One menu for the whole Followers list (not one idle Modal per row): `…` on a
// row picks the person; the menu offers `Remove` and `Block`, each of which
// opens its confirm from the menu's `onExited` (iOS never presents a sheet
// while another is dismissing — program rule 7). Removing a follower exits the
// row (MO-04) and shows `{first} removed`; blocking removes the person from
// every list and shows `{first} blocked` (core's safety sheets do both).

export type FollowerTarget = { id: string; firstName: string; displayName: string };

type Step = 'menu' | 'remove' | 'block';
type State = { person: FollowerTarget; step: Step; open: boolean; next: Step | null };

export type FollowerActions = {
  /** Open the menu for this person. */
  open: (person: FollowerTarget) => void;
  /** Mount this once, anywhere in the screen. */
  sheets: React.ReactNode;
};

export function useFollowerActions(): FollowerActions {
  const [state, setState] = useState<State | null>(null);

  const close = () => setState((s) => (s ? { ...s, open: false } : s));
  const exited = () =>
    setState((s) => {
      if (!s) return s;
      // Chain: the menu is fully gone, now the confirm it picked.
      if (s.step === 'menu' && s.next) return { ...s, step: s.next, open: true, next: null };
      return null;
    });
  const pick = (next: 'remove' | 'block') => setState((s) => (s ? { ...s, open: false, next } : s));

  const sheets = state ? (
    <>
      {state.step === 'menu' ? (
        <Sheet
          testID="friends-follower-menu"
          visible={state.open}
          onClose={close}
          onExited={exited}
          title={state.person.displayName}
        >
          <View className="gap-2 pb-2">
            <Button
              testID="friends-follower-menu-remove"
              size="lg"
              variant="outline"
              onPress={() => pick('remove')}
            >
              {FRIENDS_COPY.remove.cta}
            </Button>
            <Button
              testID="friends-follower-menu-block"
              size="lg"
              variant="outline"
              onPress={() => pick('block')}
            >
              {FRIENDS_COPY.block.cta}
            </Button>
          </View>
        </Sheet>
      ) : null}
      {state.step === 'remove' ? (
        <RemoveFollowerConfirmSheet
          visible={state.open}
          person={state.person}
          onClose={close}
          onExited={exited}
        />
      ) : null}
      {state.step === 'block' ? (
        <BlockConfirmSheet
          from="followers"
          visible={state.open}
          person={state.person}
          onClose={close}
          onExited={exited}
        />
      ) : null}
    </>
  ) : null;

  return {
    open: (person) => setState({ person, step: 'menu', open: true, next: null }),
    sheets,
  };
}
