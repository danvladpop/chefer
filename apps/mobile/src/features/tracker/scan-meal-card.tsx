import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetch as expoFetch } from 'expo/fetch';
import { Button, Card, Text } from '@chefer/ui-mobile';
import {
  cn,
  defaultMealSlot,
  PREMIUM_PITCH_COPY,
  showSnapTaste,
  userFacingErrorMessage,
} from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
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
import { openPremium } from '../premium/open-premium';
import { invalidateDayQueries } from './invalidate';
import { recordRebalance } from './rebalance-store';

// Snap-to-Log (F4 / M3-2) — mobile counterpart of web's ScanMealButton.
// Camera or library → vision estimate → confirm card → logCustomMeal.

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const CONFIDENCE_LABEL: Record<MealPhotoEstimate['confidence'], string> = {
  low: 'Rough guess',
  med: 'Decent estimate',
  high: 'Confident',
};

/**
 * Premium (and admins) get the real Snap card. On a free plan the card used to
 * render nothing, so a tracker never learned Snap existed (bug B-35, T-10.6):
 * a food-job user now sees a taste instead, and a gym-only user still sees
 * nothing.
 */
export function ScanMealCard(props: { date: string; onLogged: () => void }) {
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

function SnapCard({ date, onLogged }: { date: string; onLogged: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [estimate, setEstimate] = useState<MealPhotoEstimate | null>(null);
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
  const logMutation = trpc.tracker.logCustomMeal.useMutation({
    onSuccess: (data) => {
      recordRebalance(data.rebalance);
      // Bug B-44: Today used to lag the tracker by ~8s after a snap log —
      // this mutation invalidated nothing, so the dashboard ring only caught
      // up on its own stale-time refetch.
      invalidateDayQueries(utils, date);
      setEstimate(null);
      onLogged();
    },
  });

  // AI data consent (App Store 5.1.2(i)): asked before the camera/library
  // opens; the provider runs the pick only after its sheet is fully gone
  // (iOS can't present the picker over a dismissing Modal). "Not now" = no
  // photo is taken or sent.
  const requestAiConsent = useAiConsent();
  const pick = (source: 'camera' | 'library') =>
    requestAiConsent('meal-scan', () => void pickNow(source));

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
          {/* Confirm — honest confidence, adjustable meal slot */}
          <View className="flex-row items-center gap-2">
            <View className="rounded-full bg-accent px-2 py-0.5">
              <Text className="text-xs font-semibold uppercase text-primary">
                {CONFIDENCE_LABEL[estimate.confidence]}
              </Text>
            </View>
            <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-gray-900">
              {estimate.dishName}
            </Text>
          </View>
          <Text variant="muted" className="text-xs">
            {estimate.portionNote}
          </Text>
          <Text className="text-sm text-gray-700">
            {estimate.kcal} kcal · {estimate.protein}g P · {estimate.carbs}g C · {estimate.fat}g F
          </Text>
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
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => setEstimate(null)}>
              Discard
            </Button>
            <Button
              testID="scan-log"
              className="flex-1"
              loading={logMutation.isPending}
              onPress={() =>
                logMutation.mutate({
                  date,
                  name: estimate.dishName || 'Scanned meal',
                  estimatedBy: 'vision',
                  mealType,
                  kcal: estimate.kcal,
                  protein: estimate.protein,
                  carbs: estimate.carbs,
                  fat: estimate.fat,
                })
              }
            >
              {`Log ${estimate.kcal} kcal`}
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
