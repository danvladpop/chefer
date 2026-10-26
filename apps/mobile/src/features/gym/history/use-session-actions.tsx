import { useCallback, useContext, useEffect, useRef, useState, type ReactElement } from 'react';
import { Pressable, Text as RNText } from 'react-native';
import { QueryClientContext } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap, SessionSummaryDto, StreakInfo } from '@chefer/types';
import { ConfirmSheet, haptics, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { sessionDeletePreview } from '@chefer/utils';
import { getTranslator, useT } from '../../../lib/i18n';
import { localDate } from '../offline/ids';
import { deleteSessionWithUndo, type DeleteSource } from '../offline/session-corrections';
import { weekdayDateLabelT } from '../workout/session-when-fields';

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
  const { t } = getTranslator();
  const lines = [
    t('gym.session.delete.first', {
      name: session.name,
      date: weekdayDateLabelT(session.localDate, t),
      count: preview.setsCount,
    }),
  ];
  if (preview.weekChanged) {
    lines.push(
      t('gym.session.delete.week', {
        before: preview.thisWeekBefore,
        count: preview.thisWeekAfter,
      }),
    );
  }
  if (preview.streakChanged) {
    lines.push(
      t('gym.session.delete.streak', { count: preview.streakBefore, after: preview.streakAfter }),
    );
  }
  lines.push(t('gym.session.delete.targets'));
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
  const { t } = useT();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t('gym.session.optionsFor', {
        label: `${session.name}, ${weekdayDateLabelT(session.localDate, t)}`,
      })}
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
      { name: 'edit', label: getTranslator().t('common.actions.edit') },
      { name: 'delete', label: getTranslator().t('common.actions.delete') },
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
  const { t } = useT();
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
          title={shown?.name ?? t('gym.session.workoutFallback')}
          eyebrow={shown ? weekdayDateLabelT(shown.localDate, t) : undefined}
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
            <Text className="text-base font-medium">{t('gym.session.editWorkout')}</Text>
          </Pressable>
          <Pressable
            testID={`${testIDPrefix}-menu-delete`}
            accessibilityRole="button"
            onPress={onMenuDelete}
            className="min-h-12 justify-center px-1 py-2 active:bg-muted"
          >
            <Text className="text-base font-medium text-destructive">
              {t('gym.session.deleteWorkout')}
            </Text>
          </Pressable>
        </Sheet>
        <ConfirmSheet
          visible={confirmFor !== null}
          onClose={() => setConfirmFor(null)}
          testID={`${testIDPrefix}-delete-confirm`}
          title={t('gym.session.deleteTitle')}
          body={shown ? deleteConfirmBody(shown, bootstrap) : ''}
          confirmLabel={t('gym.session.deleteWorkout')}
          cancelLabel={t('gym.workout.view.keepIt')}
          destructive
          onConfirm={onConfirmDelete}
        />
      </>
    ) : (
      <></>
    );

  return { openMenu, edit, askDelete, sheets };
}
