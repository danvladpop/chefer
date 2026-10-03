import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Card,
  ErrorState,
  Input,
  SegmentedControl,
  Text,
  useQueryState,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// ─── TargetsCard (§2.11, T-35.3) ────────────────────────────────────────────────
// Settings › Preferences "Your targets": Suggested (read-only, from the
// resolver) or My own (editable kcal/protein/carbs/fat). Bounds mirror the
// server's (targets.router.ts): kcal 1,200–5,000, protein 40–400 g — the
// server is still the source of truth (AC4); this is a friendlier inline
// message before the round trip. The training-day pair (customTrainingKcal/
// customTrainingProteinG, addTrainingBonus) is API-ready (targets.set already
// accepts them) but has no UI here yet — a lifter's OWN target still gets no
// training-day bump on top, which is a strict subset of what the resolver
// supports, not a regression.

const MODE_OPTIONS = [
  { value: 'SUGGESTED' as const, label: 'Suggested', testID: 'targets-mode-suggested' },
  { value: 'OWN' as const, label: 'My own', testID: 'targets-mode-own' },
];

function parseIntOrNull(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}

export interface TargetsCardProps {
  /**
   * UX-FOOD-14 (onboarding): the calorie target the body metrics ENTERED so far
   * give. They are only saved when setup finishes, so until then the server
   * still resolves the 2,000 kcal default — show this number instead.
   */
  previewKcal?: number | null | undefined;
}

export function TargetsCard({ previewKcal }: TargetsCardProps = {}) {
  const utils = trpc.useUtils();
  const targetsQuery = trpc.targets.get.useQuery();
  const { data } = targetsQuery;
  const { state: loadState, retry } = useQueryState(targetsQuery);

  const [mode, setMode] = useState<'SUGGESTED' | 'OWN'>('SUGGESTED');
  const [kcalText, setKcalText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [carbsText, setCarbsText] = useState('');
  const [fatText, setFatText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Bug B-38 pattern: "Saved ✓" must not stick past a further edit — snapshot
  // exactly what was sent, captured synchronously at save-click time.
  const [savedSnapshot, setSavedSnapshot] = useState<{
    mode: 'SUGGESTED' | 'OWN';
    kcalText: string;
    proteinText: string;
    carbsText: string;
    fatText: string;
  } | null>(null);
  const dirty =
    savedSnapshot !== null &&
    (savedSnapshot.mode !== mode ||
      savedSnapshot.kcalText !== kcalText ||
      savedSnapshot.proteinText !== proteinText ||
      savedSnapshot.carbsText !== carbsText ||
      savedSnapshot.fatText !== fatText);

  // The server has no body metrics yet (onboarding) but the user has entered
  // some: the suggested number is the one computed from those, not the default.
  const fromEntered =
    typeof previewKcal === 'number' && !!data && !data.custom.kcal && data.inputs.weightKg === null;

  useEffect(() => {
    if (!data || loaded) return;
    setMode(data.targetMode);
    // Macros scale with the calories so an own target prefilled from the
    // preview still passes the server's 4/4/9 fit check.
    const ratio =
      fromEntered && previewKcal ? previewKcal / (data.effective.dailyCalorieTarget || 1) : 1;
    const scaled = (grams: number) => String(Math.round(grams * ratio));
    setKcalText(
      String(data.custom.kcal ?? (fromEntered ? previewKcal : data.effective.dailyCalorieTarget)),
    );
    setProteinText(
      data.custom.proteinG !== null
        ? String(data.custom.proteinG)
        : scaled(data.effective.proteinG),
    );
    setCarbsText(
      data.custom.carbsG !== null ? String(data.custom.carbsG) : scaled(data.effective.carbsG),
    );
    setFatText(data.custom.fatG !== null ? String(data.custom.fatG) : scaled(data.effective.fatG));
    setLoaded(true);
  }, [data, loaded, fromEntered, previewKcal]);

  const setMutation = trpc.targets.set.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.targets.get.invalidate();
      void utils.targets.changes.invalidate();
      void utils.dashboard.summary.invalidate();
      void utils.tracker.getDay.invalidate();
      setLocalError(null);
    },
    onError: (err) => setLocalError(userFacingErrorMessage(err)),
  });

  const save = () => {
    const snapshot = { mode, kcalText, proteinText, carbsText, fatText };
    if (mode === 'SUGGESTED') {
      setSavedSnapshot(snapshot);
      setMutation.mutate({ targetMode: 'SUGGESTED' });
      return;
    }
    const kcal = parseIntOrNull(kcalText);
    const proteinG = parseIntOrNull(proteinText);
    const carbsG = parseIntOrNull(carbsText);
    const fatG = parseIntOrNull(fatText);
    if (kcal === null || kcal < 1200 || kcal > 5000) {
      setLocalError('Calories must be between 1,200 and 5,000.');
      return;
    }
    if (proteinG === null || proteinG < 40 || proteinG > 400) {
      setLocalError('Protein must be between 40 and 400 g.');
      return;
    }
    setLocalError(null);
    setSavedSnapshot(snapshot);
    setMutation.mutate({
      targetMode: 'OWN',
      kcal,
      proteinG,
      ...(carbsG !== null && { carbsG }),
      ...(fatG !== null && { fatG }),
    });
  };

  // UX-X-12: a failed load is not "Loading…" forever — say so and offer Retry.
  if (loadState === 'error') {
    return (
      <Card testID="targets-card" className="gap-2">
        <Text variant="heading">Your targets</Text>
        <ErrorState
          testID="targets-card-error"
          title="Couldn't load your targets"
          onRetry={retry}
          className="py-4"
        />
      </Card>
    );
  }
  if (!data) {
    return (
      <Card testID="targets-card" className="gap-2">
        <Text variant="heading">Your targets</Text>
        <Text variant="muted" className="text-xs">
          Loading…
        </Text>
      </Card>
    );
  }

  return (
    <Card testID="targets-card" className="gap-4">
      <View className="gap-1">
        <Text variant="heading">Your targets</Text>
        <Text variant="muted" className="text-xs">
          Suggested is computed from your body and goal; My own is never changed for you — a gym
          setup, weigh-in or goal edit only ever proposes a change, and you decide.
        </Text>
      </View>

      <SegmentedControl
        size="sm"
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
        accessibilityLabel="Target mode"
        testID="targets-mode"
      />

      {mode === 'SUGGESTED' ? (
        <View className="gap-1 rounded-lg bg-accent p-3">
          <Text testID="targets-suggested-kcal" className="text-2xl font-bold text-primary">
            {(fromEntered && previewKcal
              ? previewKcal
              : data.suggested.dailyCalorieTarget
            ).toLocaleString('en-US')}{' '}
            kcal
          </Text>
          <Text variant="muted" className="text-xs">
            {fromEntered
              ? 'Worked out from the details you entered. Your macros are set when you finish.'
              : `${data.suggested.proteinG}g protein · ${data.suggested.carbsG}g carbs · ${data.suggested.fatG}g fat`}
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Text variant="label">Calories</Text>
              <Input
                testID="targets-kcal"
                accessibilityLabel="Calories"
                value={kcalText}
                onChangeText={setKcalText}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text variant="label">Protein (g)</Text>
              <Input
                testID="targets-protein"
                accessibilityLabel="Protein grams"
                value={proteinText}
                onChangeText={setProteinText}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Text variant="label">Carbs (g)</Text>
              <Input
                testID="targets-carbs"
                accessibilityLabel="Carbs grams"
                value={carbsText}
                onChangeText={setCarbsText}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text variant="label">Fat (g)</Text>
              <Input
                testID="targets-fat"
                accessibilityLabel="Fat grams"
                value={fatText}
                onChangeText={setFatText}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>
      )}

      <Button testID="targets-save" loading={setMutation.isPending} onPress={save}>
        {setMutation.isSuccess && !dirty ? 'Saved ✓' : 'Save targets'}
      </Button>
      {(localError ??
        (setMutation.error ? userFacingErrorMessage(setMutation.error) : undefined)) && (
        <Text testID="targets-error" className="text-xs text-red-600">
          {localError ??
            (setMutation.error ? userFacingErrorMessage(setMutation.error) : undefined)}
        </Text>
      )}
    </Card>
  );
}
