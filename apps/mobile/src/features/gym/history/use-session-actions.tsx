import { useCallback, useContext, useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, Text as RNText } from 'react-native';
import { QueryClientContext } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap, SessionSummaryDto, StreakInfo } from '@chefer/types';
import { ConfirmSheet, haptics, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { sessionDeletePreview, weekdayDateLabel } from '@chefer/utils';
import { localDate } from '../offline/ids';
import { deleteSessionWithUndo, type DeleteSource } from '../offline/session-corrections';

// Correct a past workout from wherever it is listed (UX-44, T-44.1): Gym Today
// `Recent`, Stats › History and the session detail all share this hook. It owns
// the `⋯` menu (`Edit workout` · `Delete workout`), the delete confirm that
// names what changes, and — through `deleteSessionWithUndo` — the 8 s Undo. No
// native `Alert` anywhere (AC7): the kit sheets only.

/** iOS can't present a Modal while another is still dismissing (same delay the workout screen uses). */
const SHEET_SWAP_DELAY_MS = 380;
/** Long enough for a sheet's exit animation to finish before it unmounts. */
const UNMOUNT_AFTER_CLOSE_MS = 700;

/** Completed working sets — the confirm's "{n} sets". */
export function completedWorkingSets(session: SessionSummaryDto): number {
  return session.exercises.reduce(
    (n, ex) => (ex.skipped ? n : n + ex.sets.filter((s) => !s.isWarmup && s.completed).length),
    0,
  );
}

const NO_STREAK: StreakInfo = {
  current: 0,
  best: 0,
  flexTokens: 0,
  thisWeekSessions: 0,
  thisWeekGoal: 1,
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The confirm's body — only the lines that change (AC4): the workout and its
 * sets, this week's count, the streak, and that targets are worked out again.
 */
export function deleteConfirmBody(
  session: SessionSummaryDto,
  bootstrap: GymBootstrap | undefined,
): string {
  const preview = sessionDeletePreview({
    weeks: bootstrap?.weeks ?? [],
    streak: bootstrap?.streak ?? NO_STREAK,
    sessionLocalDate: session.localDate,
    sessionStatus: session.status,
    setsCount: completedWorkingSets(session),
    today: localDate(),
  });
  const lines = [
    `${session.name} on ${weekdayDateLabel(session.localDate)}: ${plural(preview.setsCount, 'set', 'sets')}.`,
  ];
  if (preview.weekChanged) {
    lines.push(
      `This week goes from ${preview.thisWeekBefore} to ${plural(preview.thisWeekAfter, 'session', 'sessions')}.`,
    );
  }
  if (preview.streakChanged) {
    lines.push(
      `Your streak goes from ${plural(preview.streakBefore, 'week', 'weeks')} to ${preview.streakAfter}.`,
    );
  }
  lines.push('Next time targets for its exercises are worked out again.');
  return lines.join('\n');
}

/** The row's `⋯` — 44 pt, labelled `Options for {name}, {weekday d Mon}`. */
export function SessionOptionsButton({
  session,
  onPress,
  testID,
}: {
  session: SessionSummaryDto;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Options for ${session.name}, ${weekdayDateLabel(session.localDate)}`}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
    >
      <RNText className="text-xl font-bold text-foreground">⋯</RNText>
    </Pressable>
  );
}

/** Row `accessibilityActions` (PAT-16) — `Edit` and `Delete` beside the default activate. */
export function sessionRowAccessibilityActions(
  actions: SessionActions,
  session: SessionSummaryDto,
) {
  return {
    accessibilityActions: [
      { name: 'activate' as const },
      { name: 'edit', label: 'Edit' },
      { name: 'delete', label: 'Delete' },
    ],
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'edit') actions.edit(session);
      else if (event.nativeEvent.actionName === 'delete') actions.askDelete(session);
    },
  };
}

export interface SessionActions {
  /** Open the `⋯` menu for a row. */
  openMenu: (session: SessionSummaryDto) => void;
  /** Open edit mode directly (the detail's header `Edit`). */
  edit: (session: SessionSummaryDto) => void;
  /** Open the delete confirm directly (accessibility action, the detail's `⋯`). */
  askDelete: (session: SessionSummaryDto) => void;
  /** Render once per screen. */
  sheets: ReactElement;
}

export function useSessionActions(input: {
  bootstrap: GymBootstrap | undefined;
  source: DeleteSource;
  /** After the delete was confirmed (the detail screen leaves itself). */
  onDeleted?: () => void;
  testIDPrefix?: string;
}): SessionActions {
  const { bootstrap, source, onDeleted, testIDPrefix = 'session' } = input;
  // Optional on purpose: list components render in isolation in unit tests
  // with no QueryClientProvider; the app always has one (root layout).
  const queryClient = useContext(QueryClientContext);
  const snackbar = useSnackbar();
  const [menuFor, setMenuFor] = useState<SessionSummaryDto | null>(null);
  const [confirmFor, setConfirmFor] = useState<SessionSummaryDto | null>(null);
  // The sheets keep the last session while they animate out.
  const [shown, setShown] = useState<SessionSummaryDto | null>(null);
  const pendingSwap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pendingSwap.current) clearTimeout(pendingSwap.current);
    },
    [],
  );

  // The sheets mount only once something opened them (a list of rows should not
  // each pay for two Modals) and stay through the exit animation.
  const open = menuFor !== null || confirmFor !== null;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), UNMOUNT_AFTER_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const edit = useCallback((session: SessionSummaryDto) => {
    setMenuFor(null);
    router.push({ pathname: '/gym/workout', params: { edit: session.id } });
  }, []);

  const askDelete = useCallback((session: SessionSummaryDto) => {
    setShown(session);
    setConfirmFor(session);
  }, []);

  const openMenu = useCallback((session: SessionSummaryDto) => {
    setShown(session);
    setMenuFor(session);
  }, []);

  const onMenuDelete = () => {
    const session = menuFor;
    if (!session) return;
    setMenuFor(null);
    if (pendingSwap.current) clearTimeout(pendingSwap.current);
    pendingSwap.current = setTimeout(() => setConfirmFor(session), SHEET_SWAP_DELAY_MS);
  };

  const onConfirmDelete = () => {
    const session = confirmFor;
    setConfirmFor(null);
    if (!session || !queryClient) return;
    haptics.warning();
    void deleteSessionWithUndo({
      queryClient,
      session,
      source,
      show: snackbar.show,
    });
    onDeleted?.();
  };

  const sheets =
    mounted || open ? (
      <>
        <Sheet
          visible={menuFor !== null}
          onClose={() => setMenuFor(null)}
          title={shown?.name ?? 'Workout'}
          eyebrow={shown ? weekdayDateLabel(shown.localDate) : undefined}
          testID={`${testIDPrefix}-menu`}
        >
          <Pressable
            testID={`${testIDPrefix}-menu-edit`}
            accessibilityRole="button"
            onPress={() => {
              if (menuFor) edit(menuFor);
            }}
            className="min-h-12 justify-center border-b border-border px-1 py-2 active:bg-muted"
          >
            <Text className="text-base font-medium">Edit workout</Text>
          </Pressable>
          <Pressable
            testID={`${testIDPrefix}-menu-delete`}
            accessibilityRole="button"
            onPress={onMenuDelete}
            className="min-h-12 justify-center px-1 py-2 active:bg-muted"
          >
            <Text className="text-base font-medium text-destructive">Delete workout</Text>
          </Pressable>
        </Sheet>
        <ConfirmSheet
          visible={confirmFor !== null}
          onClose={() => setConfirmFor(null)}
          testID={`${testIDPrefix}-delete-confirm`}
          title="Delete this workout?"
          body={shown ? deleteConfirmBody(shown, bootstrap) : ''}
          confirmLabel="Delete workout"
          cancelLabel="Keep it"
          destructive
          onConfirm={onConfirmDelete}
        />
      </>
    ) : (
      <></>
    );

  return { openMenu, edit, askDelete, sheets };
}
