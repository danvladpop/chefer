import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  CHECK_IN_COPY,
  CHECK_IN_LIMITS,
  CHECK_IN_QUESTIONS,
  type CheckInAnswers,
  type CheckInQuestion,
} from '@chefer/types';
import {
  Button,
  EmptyState,
  ErrorState,
  FormField,
  haptics,
  Input,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import { cn, isCompleteCheckIn, userFacingErrorMessage } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { goBackOrHome, TrainerHeader } from '../../trainer/components/trainer-header';

// ─── The weekly check-in (lane K3) ────────────────────────────────────────────
// The trainer's questions as 1–5 scales and an optional note. Sending again changes the answers until
// the next check-in opens. The note is the client's own text for their trainer: never sent to AI or
// analytics (the event carries counts only). Mirrors web CheckInForm.tsx.

const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

function ScaleRow({
  question,
  value,
  onChange,
  disabled,
}: {
  question: CheckInQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const q = CHECK_IN_QUESTIONS[question];
  return (
    <View testID={`check-in-${question}`} className="gap-1.5">
      <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
        {q.label}
      </Text>
      <View accessibilityRole="radiogroup" className="flex-row gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            // MO-01: press feedback on each scale step.
            <PressableScale
              key={n}
              testID={`check-in-${question}-${n}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={CHECK_IN_COPY.client.scaleLabel(q.label, n)}
              disabled={disabled}
              onPress={() => {
                haptics.selection();
                onChange(n);
              }}
              className={cn(
                'min-h-11 flex-1 items-center justify-center rounded-control border',
                selected ? 'border-brand bg-brand' : 'border-separator bg-surface-sunken',
              )}
            >
              <Text
                className={cn(
                  'text-headline font-semibold',
                  selected ? 'text-brand-on' : 'text-label',
                )}
              >
                {n}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-footnote text-label-secondary">{q.low}</Text>
        <Text className="text-footnote text-label-secondary">{q.high}</Text>
      </View>
    </View>
  );
}

export function CheckInScreen() {
  const copy = CHECK_IN_COPY.client;
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const online = useIsOnline();
  const today = localDate();
  const current = trpc.coaching.checkIn.current.useQuery({ today }, { retry: false });
  const [answers, setAnswers] = useState<CheckInAnswers>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (current.data?.answered) {
      setAnswers(current.data.answered.answers);
      setNote(current.data.answered.note ?? '');
    }
  }, [current.data]);
  const submit = trpc.coaching.checkIn.submit.useMutation({
    meta: { silent: true },
    onSuccess: (sent) => {
      track('check_in_submitted', {
        questions: sent.questions.length,
        withNote: (sent.answered?.note ?? '') !== '',
        edit: current.data?.answered != null,
      });
      void utils.coaching.checkIn.current.invalidate();
      snackbar.show({ message: copy.sent(sent.trainerName) });
      goBackOrHome();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  const header = <TrainerHeader testID="check-in-header" title={copy.title} />;
  if (current.isPending) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0" testID="check-in-loading">
        {header}
        <ActivityIndicator className="py-16" />
      </Screen>
    );
  }
  if (current.isError) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0">
        {header}
        <ErrorState testID="check-in-error" onRetry={() => void current.refetch()} />
      </Screen>
    );
  }
  const open = current.data;
  if (!open) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0" testID="check-in-closed">
        {header}
        <EmptyState title={copy.closed} />
      </Screen>
    );
  }
  const complete = isCompleteCheckIn(open.questions, answers);
  return (
    <Screen edges={EDGES} className="bg-canvas px-0" testID="check-in">
      {header}
      <KeyboardAwareScrollView
        keyboardDismissMode="on-drag"
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
      >
        <Text className="text-subhead text-label-secondary">{copy.intro(open.trainerName)}</Text>
        <CoachingCard className="gap-5">
          {open.questions.map((q) => (
            <ScaleRow
              key={q}
              question={q}
              value={answers[q]}
              disabled={submit.isPending}
              onChange={(v) => setAnswers((cur) => ({ ...cur, [q]: v }))}
            />
          ))}
        </CoachingCard>
        <FormField testID="check-in-note-field" label={copy.noteLabel}>
          <Input
            testID="check-in-note"
            label={copy.noteLabel}
            placeholder={copy.notePlaceholder}
            value={note}
            multiline
            maxLength={CHECK_IN_LIMITS.noteMaxChars}
            textAlignVertical="top"
            className="min-h-28"
            onChangeText={setNote}
          />
        </FormField>
        {error ? (
          <Text
            testID="check-in-submit-error"
            accessibilityRole="alert"
            className="text-subhead text-danger"
          >
            {error}
          </Text>
        ) : !complete ? (
          <Text className="text-footnote text-label-secondary">{copy.needsAll}</Text>
        ) : null}
        <Button
          testID="check-in-send"
          loading={submit.isPending}
          disabled={!complete || !online}
          onPress={() => {
            setError(null);
            submit.mutate({
              today,
              periodStart: open.periodStart,
              answers,
              ...(note.trim() !== '' && { note: note.trim() }),
            });
          }}
        >
          {open.answered ? copy.edit : copy.send}
        </Button>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
