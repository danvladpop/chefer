import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import {
  CHECK_IN_COPY,
  CHECK_IN_LIMITS,
  CHECK_IN_QUESTION_KEYS,
  CHECK_IN_QUESTIONS,
  COACHING_SHARING_COPY,
  type CheckInConfigDto,
} from '@chefer/types';
import {
  Button,
  haptics,
  PressableScale,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { CoachingCard } from '../components/coaching-card';

// ─── Trainer settings › Weekly check-in (lane K3) ─────────────────────────────
// One check-in for every client: on / off, the weekday it opens, and up to 6 questions from the
// catalogue (clients can always add a note). Mirrors web CheckInSettings.tsx.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Chip({
  label,
  selected,
  onPress,
  testID,
  a11y,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  a11y: string;
}) {
  return (
    // MO-01: press feedback on each chip.
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      className={cn(
        'min-h-11 items-center justify-center rounded-inner px-3',
        selected ? 'bg-brand' : 'bg-surface-sunken',
      )}
    >
      <Text className={cn('text-subhead font-semibold', selected ? 'text-brand-on' : 'text-label')}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function CheckInSettingsCard() {
  const copy = CHECK_IN_COPY.trainer;
  const colors = useThemeColors();
  const snackbar = useSnackbar();
  const utils = trpc.useUtils();
  const config = trpc.trainer.checkIns.config.useQuery(undefined, { retry: false });
  const [draft, setDraft] = useState<CheckInConfigDto | null>(null);
  useEffect(() => {
    if (config.data) setDraft(config.data);
  }, [config.data]);
  const save = trpc.trainer.checkIns.saveConfig.useMutation({
    meta: { silent: true },
    onSuccess: (saved) => {
      track('check_in_config_saved', { enabled: saved.enabled, questions: saved.questions.length });
      void utils.trainer.checkIns.config.invalidate();
      snackbar.show({ message: copy.saved });
    },
  });
  if (!draft) return null;
  const toggleQuestion = (q: (typeof CHECK_IN_QUESTION_KEYS)[number]) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.questions.includes(q);
      if (has && d.questions.length === 1) return d;
      if (!has && d.questions.length >= CHECK_IN_LIMITS.maxQuestions) return d;
      return { ...d, questions: has ? d.questions.filter((x) => x !== q) : [...d.questions, q] };
    });
  return (
    <CoachingCard testID="trainer-check-in-settings" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {copy.settingsTitle}
      </Text>
      <Text className="text-subhead text-label-secondary">{copy.settingsBody}</Text>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-subhead font-semibold text-label">{copy.enable}</Text>
        <Switch
          testID="trainer-check-in-enabled"
          accessibilityLabel={copy.enable}
          value={draft.enabled}
          onValueChange={(enabled) => setDraft({ ...draft, enabled })}
          trackColor={{ true: colors.brand, false: colors.separator }}
        />
      </View>
      {draft.enabled ? (
        <>
          <Text className="text-footnote font-semibold text-label-secondary">{copy.dayLabel}</Text>
          <View className="flex-row flex-wrap gap-2">
            {DAYS.map((label, day) => (
              <Chip
                key={label}
                testID={`trainer-check-in-day-${day}`}
                label={label}
                a11y={CHECK_IN_COPY.weekday(day)}
                selected={draft.day === day}
                onPress={() => setDraft({ ...draft, day })}
              />
            ))}
          </View>
          <Text className="text-footnote font-semibold text-label-secondary">
            {copy.questionsLabel}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CHECK_IN_QUESTION_KEYS.map((q) => (
              <Chip
                key={q}
                testID={`trainer-check-in-q-${q}`}
                label={CHECK_IN_QUESTIONS[q].label}
                a11y={CHECK_IN_QUESTIONS[q].label}
                selected={draft.questions.includes(q)}
                onPress={() => toggleQuestion(q)}
              />
            ))}
          </View>
          <Text className="text-footnote text-label-secondary">{copy.noteAlways}</Text>
        </>
      ) : null}
      {save.isError ? (
        <Text className="text-subhead text-danger">{COACHING_SHARING_COPY.saveError}</Text>
      ) : null}
      <Button
        testID="trainer-check-in-save"
        variant="outline"
        loading={save.isPending}
        onPress={() =>
          save.mutate({ enabled: draft.enabled, day: draft.day, questions: draft.questions })
        }
      >
        {copy.save}
      </Button>
    </CoachingCard>
  );
}
