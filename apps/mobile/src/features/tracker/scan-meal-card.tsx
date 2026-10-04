import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetch as expoFetch } from 'expo/fetch';
import { Button, Card, Input, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  cn,
  defaultMealSlot,
  PREMIUM_PITCH_COPY,
  proteinLabel,
  QUICK_ADD_LIMITS,
  showSnapTaste,
  userFacingErrorMessage,
  type SlotRef,
} from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
import { trackMealLogged } from '../../lib/analytics-events';
import { getApiBaseUrl } from '../../lib/api-url';
import { getToken } from '../../lib/auth-store';
import {
  scanMealPhoto,
  ScanUpgradeRequiredError,
  type MealPhotoEstimate,
} from '../../lib/media-client';
import { photoPickerOptions, preparePhoto } from '../../lib/prepare-photo';
import { trpc } from '../../lib/trpc';
import { useAiConsent } from '../ai-consent/ai-consent-provider';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import { openPremium } from '../premium/open-premium';
import { invalidateDayQueries } from './invalidate';
import { REBALANCE_PREVIEW, recordRebalanceOutcome } from './rebalance-offer-store';
import { toLogMealType } from './slot-copy';

// Snap-to-Log (F4 / M3-2) — mobile counterpart of web's ScanMealButton.
// Camera or library → vision estimate → confirm card → logCustomMeal.

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const CONFIDENCE_LABEL: Record<MealPhotoEstimate['confidence'], string> = {
  low: 'Rough guess',
  med: 'Decent estimate',
  high: 'Confident',
};

/**
 * UX-FOOD-26: the calories the user typed over a vision estimate, with the
 * estimate's macros scaled by the same factor so the entry stays internally
 * consistent. An unreadable or empty field means 0 (Log stays disabled).
 */
export function loggedFromEstimate(
  estimate: Pick<MealPhotoEstimate, 'kcal' | 'protein' | 'carbs' | 'fat'> | null,
  kcalText: string,
): { kcal: number; protein: number; carbs: number; fat: number } {
  if (!estimate) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const parsed = Math.round(Number(kcalText.replace(',', '.')));
  const kcal = Math.min(QUICK_ADD_LIMITS.kcal, Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
  const factor = estimate.kcal > 0 ? kcal / estimate.kcal : 1;
  const scale = (grams: number, max: number): number =>
    Math.min(max, Math.round(grams * factor * 10) / 10);
  return {
    kcal,
    protein: scale(estimate.protein, QUICK_ADD_LIMITS.protein),
    carbs: scale(estimate.carbs, QUICK_ADD_LIMITS.carbs),
    fat: scale(estimate.fat, QUICK_ADD_LIMITS.fat),
  };
}

/**
 * Premium (and admins) get the real Snap card. On a free plan the card used to
 * render nothing, so a tracker never learned Snap existed (bug B-35, T-10.6):
 * a food-job user now sees a taste instead, and a gym-only user still sees
 * nothing.
 */
export type ScanMealCardProps = {
  date: string;
  onLogged: () => void;
  /**
   * UX-ACC-13: open the photo picker once, right after the card appears — the
   * post-upgrade "Snap your next meal" CTA lands here. Asks AI consent first.
   */
  autoPick?: boolean;
  /** Called once when `autoPick` has been acted on (so the caller can drop its route param). */
  onAutoPicked?: () => void;
  /**
   * WP-06 "Ate something else" → Snap: the photo's estimate REPLACES this plan
   * slot (`replacesSlot`), and the slot decides the meal (no meal picker).
   */
  replacesSlot?: SlotRef;
};

export function ScanMealCard(props: ScanMealCardProps) {
  const { enabled } = useEntitlement('mealScansPerDay');
  return enabled ? <SnapCard {...props} /> : <SnapTaste />;
}

/**
 * The free taste (UX-10 §7): a labelled static example and "See what Premium
 * adds" (source `snap-scan`). It sends nothing and opens no camera — there is
 * no AI call here, so no AI consent is asked; the real scan below still asks
 * (`meal-scan`) before the camera or library opens.
 */
function SnapTaste() {
  const { isPremium } = useEntitlement('mealScansPerDay');
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  if (!showSnapTaste({ isPremium, jobs: data?.jobs ?? [] })) return null;
  return (
    <Card testID="scan-taste" className="gap-3">
      <Text variant="heading">{PREMIUM_PITCH_COPY.snapTasteTitle}</Text>
      <Text variant="muted" className="text-xs">
        {PREMIUM_PITCH_COPY.snapTasteBody}
      </Text>
      <View
        testID="scan-taste-example"
        accessibilityLabel={`${PREMIUM_PITCH_COPY.snapTasteExampleLabel}: ${PREMIUM_PITCH_COPY.snapTasteExampleMacros}, ${PREMIUM_PITCH_COPY.snapTasteExampleNote}`}
        className="flex-row items-center gap-3 rounded-xl border border-dashed border-border bg-muted p-3"
      >
        <View className="h-12 w-12 items-center justify-center rounded-lg bg-white">
          <Ionicons name="restaurant-outline" size={24} color="#944a00" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="self-start rounded-full bg-accent px-2 py-0.5">
            <Text className="text-xs font-semibold uppercase text-primary">
              {PREMIUM_PITCH_COPY.snapTasteExampleLabel}
            </Text>
          </View>
          <Text className="text-sm font-semibold text-gray-900">
            {PREMIUM_PITCH_COPY.snapTasteExampleMacros}
          </Text>
          <Text variant="muted" className="text-xs">
            {PREMIUM_PITCH_COPY.snapTasteExampleNote}
          </Text>
        </View>
      </View>
      <Button
        testID="scan-taste-premium"
        variant="outline"
        onPress={() => openPremium('snap-scan')}
      >
        {PREMIUM_PITCH_COPY.seeWhatPremiumAdds}
      </Button>
    </Card>
  );
}

function SnapCard({ date, onLogged, autoPick, onAutoPicked, replacesSlot }: ScanMealCardProps) {
  const snackbar = useSnackbar();
  // WP-08: protein-only mode confirms the estimated protein, with no calorie field.
  const { proteinOnly } = useNumbersMode();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [estimate, setEstimate] = useState<MealPhotoEstimate | null>(null);
  // UX-FOOD-26: the photo itself on the confirm card, and the calories the
  // user may correct before logging (macros follow proportionally).
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [kcalText, setKcalText] = useState('');
  // Bug B-36: this always defaulted to Lunch, even for a 7am or 9pm scan.
  // Shared with Quick add so a log entered at any hour lands sensibly.
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>(() =>
    defaultMealSlot(new Date().getHours()),
  );
  // Bug B-37: camera permission denied used to leave the user staring at red
  // error text with no way forward. `cameraDenied` renders a muted notice
  // with a real way out instead.
  const [cameraDenied, setCameraDenied] = useState(false);

  const utils = trpc.useUtils();
  // UX-FOOD-26: the log is confirmed with a snackbar whose Undo deletes
  // exactly the entry just written (by its id).
  const undoMutation = trpc.tracker.deleteCustomMeal.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      invalidateDayQueries(utils, date);
      onLogged();
    },
    onError: (error) =>
      snackbar.show({ message: `Couldn't undo that. ${userFacingErrorMessage(error)}` }),
  });
  const logMutation = trpc.tracker.logCustomMeal.useMutation({
    meta: { silent: true },
    onSuccess: (data, variables) => {
      trackMealLogged('snap', variables.mealType);
      recordRebalanceOutcome(data);
      // Bug B-44: Today used to lag the tracker by ~8s after a snap log —
      // this mutation invalidated nothing, so the dashboard ring only caught
      // up on its own stale-time refetch.
      invalidateDayQueries(utils, date);
      setEstimate(null);
      setPhotoUri(null);
      onLogged();
      const entryId = data.entryId;
      snackbar.show({
        message: `Logged ${variables.name}`,
        tone: 'success',
        ...(entryId && {
          actionLabel: 'Undo',
          onAction: () => undoMutation.mutate({ date, entryId }),
        }),
      });
    },
  });

  // AI data consent (App Store 5.1.2(i)): asked before the camera/library
  // opens; the provider runs the pick only after its sheet is fully gone
  // (iOS can't present the picker over a dismissing Modal). "Not now" = no
  // photo is taken or sent.
  const requestAiConsent = useAiConsent();
  const pick = (source: 'camera' | 'library') =>
    requestAiConsent('meal-scan', () => void pickNow(source));

  // UX-ACC-13: arrive from the upgrade CTA → the picker opens by itself, once.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!autoPick || autoPicked.current) return;
    autoPicked.current = true;
    onAutoPicked?.();
    pick('library');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [autoPick]);

  const pickNow = async (source: 'camera' | 'library') => {
    setError(null);
    setUpgradeNeeded(false);
    setCameraDenied(false);
    // T-BUG-O1.2: the photo is shrunk on the device before the scan.
    const options = photoPickerOptions();
    const result =
      source === 'camera'
        ? await (async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              // Bug B-37: a muted notice + a real way out (Settings, or fall
              // back to a library photo — no new native module needed).
              setCameraDenied(true);
              return null;
            }
            return ImagePicker.launchCameraAsync(options);
          })()
        : await ImagePicker.launchImageLibraryAsync(options);

    const asset = result && !result.canceled ? result.assets.at(0) : null;
    if (!asset) {
      return;
    }
    setScanning(true);
    try {
      const photo = await preparePhoto(asset);
      if (!photo) {
        return;
      }
      const est = await scanMealPhoto(
        { fetchImpl: expoFetch, apiBaseUrl: getApiBaseUrl(), getToken },
        photo.bytes,
        photo.mime,
      );
      setEstimate(est);
      setKcalText(String(est.kcal));
      setPhotoUri(asset.uri);
    } catch (err) {
      if (err instanceof ScanUpgradeRequiredError) {
        setUpgradeNeeded(true);
      } else {
        setError(userFacingErrorMessage(err, 'Scan failed. Try a clearer shot.'));
      }
    } finally {
      setScanning(false);
    }
  };

  // What will be logged: the user's calories, with the estimated macros scaled
  // to match (the estimate's own numbers when they leave calories alone).
  const logged = loggedFromEstimate(estimate, kcalText);

  return (
    <Card testID="scan-meal-card" className="gap-3">
      {!estimate ? (
        <>
          <Text variant="heading">Snap to log</Text>
          <Text variant="muted" className="text-xs">
            Photograph a meal that isn&apos;t on your plan — the chef estimates its nutrition.
          </Text>
          <View className="flex-row gap-2">
            <Button
              testID="scan-camera"
              variant="outline"
              className="flex-1"
              loading={scanning}
              onPress={() => pick('camera')}
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="camera-outline" size={16} color="#944a00" />
                <Text className="text-sm font-medium text-primary">Camera</Text>
              </View>
            </Button>
            <Button
              testID="scan-library"
              variant="outline"
              className="flex-1"
              loading={scanning}
              onPress={() => pick('library')}
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="images-outline" size={16} color="#944a00" />
                <Text className="text-sm font-medium text-primary">Photos</Text>
              </View>
            </Button>
          </View>
          {upgradeNeeded && (
            <Text className="text-xs text-primary">
              You&apos;ve used today&apos;s scans. Premium raises the limit.
            </Text>
          )}
          {cameraDenied && (
            <View className="gap-2 rounded-lg bg-muted p-3">
              <Text variant="muted" className="text-xs">
                Chefer needs camera access to scan a meal. You can turn it on in Settings, or pick a
                photo instead.
              </Text>
              <View className="flex-row gap-2">
                <Button
                  testID="scan-open-settings"
                  variant="outline"
                  className="flex-1"
                  onPress={() => void Linking.openSettings()}
                >
                  Open Settings
                </Button>
                <Button
                  testID="scan-choose-photo-instead"
                  variant="outline"
                  className="flex-1"
                  onPress={() => pick('library')}
                >
                  Choose a photo instead
                </Button>
              </View>
            </View>
          )}
          {error && <Text className="text-xs text-red-600">{error}</Text>}
        </>
      ) : (
        <>
          {/* Confirm — the photo, honest confidence, adjustable calories and meal slot */}
          <View className="flex-row items-start gap-3">
            {photoUri && (
              <Image
                testID="scan-photo"
                source={{ uri: photoUri }}
                accessibilityLabel="The photo you scanned"
                className="h-16 w-16 rounded-lg bg-muted"
                resizeMode="cover"
              />
            )}
            <View className="min-w-0 flex-1 gap-1">
              <View className="self-start rounded-full bg-accent px-2 py-0.5">
                <Text className="text-xs font-semibold uppercase text-primary">
                  {CONFIDENCE_LABEL[estimate.confidence]}
                </Text>
              </View>
              <Text
                testID="scan-dish-name"
                numberOfLines={2}
                className="text-sm font-semibold text-gray-900"
              >
                {estimate.dishName}
              </Text>
            </View>
          </View>
          <Text variant="muted" className="text-xs">
            {estimate.portionNote}
          </Text>
          {proteinOnly ? (
            <Text testID="scan-protein" className="text-sm font-semibold text-gray-800">
              {`≈ ${proteinLabel(logged.protein)}`}
            </Text>
          ) : (
            <>
              <View className="gap-1">
                <Text className="text-xs font-medium text-gray-600">Calories</Text>
                <View className="flex-row items-center gap-2">
                  <Input
                    testID="scan-kcal"
                    accessibilityLabel="Calories"
                    value={kcalText}
                    keyboardType="number-pad"
                    onChangeText={setKcalText}
                    className="min-w-0 flex-1"
                  />
                  <Text className="text-sm text-muted-foreground">kcal</Text>
                </View>
              </View>
              <Text testID="scan-macros" className="text-sm text-gray-700">
                {logged.protein}g P · {logged.carbs}g C · {logged.fat}g F
              </Text>
            </>
          )}
          {!replacesSlot && (
            <View className="flex-row gap-1.5">
              {MEAL_TYPES.map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  onPress={() => setMealType(t)}
                  className={cn(
                    'h-9 flex-1 items-center justify-center rounded-lg border',
                    mealType === t ? 'border-primary bg-primary' : 'border-border bg-white',
                  )}
                >
                  <Text
                    className={cn(
                      'text-xs font-medium capitalize',
                      mealType === t ? 'text-primary-foreground' : 'text-gray-600',
                    )}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => {
                setEstimate(null);
                setPhotoUri(null);
              }}
            >
              Discard
            </Button>
            <Button
              testID="scan-log"
              className="flex-1"
              loading={logMutation.isPending}
              disabled={logged.kcal <= 0}
              onPress={() =>
                logMutation.mutate({
                  date,
                  ...REBALANCE_PREVIEW,
                  name: estimate.dishName || 'Scanned meal',
                  estimatedBy: 'vision',
                  mealType: replacesSlot ? toLogMealType(replacesSlot.mealType) : mealType,
                  ...(replacesSlot && {
                    replacesSlot: {
                      mealType: replacesSlot.mealType,
                      slotIndex: replacesSlot.slotIndex,
                    },
                  }),
                  kcal: logged.kcal,
                  protein: logged.protein,
                  carbs: logged.carbs,
                  fat: logged.fat,
                })
              }
            >
              {proteinOnly ? 'Log it' : `Log ${logged.kcal} kcal`}
            </Button>
          </View>
          {logMutation.isError && (
            <Text className="text-xs text-red-600">
              {userFacingErrorMessage(logMutation.error)}
            </Text>
          )}
        </>
      )}
    </Card>
  );
}
