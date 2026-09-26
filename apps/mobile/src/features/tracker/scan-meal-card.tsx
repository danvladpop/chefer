import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetch as expoFetch } from 'expo/fetch';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useEntitlement } from '../../hooks/use-entitlement';
import { getApiBaseUrl } from '../../lib/api-url';
import { getToken } from '../../lib/auth-store';
import {
  base64ToBytes,
  scanMealPhoto,
  ScanUpgradeRequiredError,
  type ImageMime,
  type MealPhotoEstimate,
} from '../../lib/media-client';
import { trpc } from '../../lib/trpc';
import { useAiConsent } from '../ai-consent/ai-consent-provider';
import { recordRebalance } from './rebalance-store';

// Snap-to-Log (F4 / M3-2) — mobile counterpart of web's ScanMealButton.
// Camera or library → vision estimate → confirm card → logCustomMeal.

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const CONFIDENCE_LABEL: Record<MealPhotoEstimate['confidence'], string> = {
  low: 'Rough guess',
  med: 'Decent estimate',
  high: 'Confident',
};

export function ScanMealCard({ date, onLogged }: { date: string; onLogged: () => void }) {
  const { enabled } = useEntitlement('mealScansPerDay');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const [estimate, setEstimate] = useState<MealPhotoEstimate | null>(null);
  const [mealType, setMealType] = useState<(typeof MEAL_TYPES)[number]>('lunch');

  const logMutation = trpc.tracker.logCustomMeal.useMutation({
    onSuccess: (data) => {
      recordRebalance(data.rebalance);
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
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: 'images',
      base64: true,
      quality: 0.7,
    };
    const result =
      source === 'camera'
        ? await (async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              setError('Camera access is needed to scan a meal.');
              return null;
            }
            return ImagePicker.launchCameraAsync(options);
          })()
        : await ImagePicker.launchImageLibraryAsync(options);

    const asset = result && !result.canceled ? result.assets.at(0) : null;
    if (!asset?.base64) {
      return;
    }
    setScanning(true);
    try {
      const mime = (asset.mimeType ?? 'image/jpeg') as ImageMime;
      const est = await scanMealPhoto(
        { fetchImpl: expoFetch, apiBaseUrl: getApiBaseUrl(), getToken },
        base64ToBytes(asset.base64),
        mime,
      );
      setEstimate(est);
    } catch (err) {
      if (err instanceof ScanUpgradeRequiredError) {
        setUpgradeNeeded(true);
      } else {
        setError(err instanceof Error ? err.message : 'Scan failed. Try a clearer shot.');
      }
    } finally {
      setScanning(false);
    }
  };

  if (!enabled) {
    return null; // tier has zero scans — the profile page carries the upsell
  }

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
              You&apos;ve used today&apos;s scans — premium raises the limit. Upgrade from your
              Profile.
            </Text>
          )}
          {error && <Text className="text-xs text-red-600">{error}</Text>}
        </>
      ) : (
        <>
          {/* Confirm — honest confidence, adjustable meal slot */}
          <View className="flex-row items-center gap-2">
            <View className="rounded-full bg-accent px-2 py-0.5">
              <Text className="text-[12px] font-semibold uppercase text-primary">
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
            <Text className="text-xs text-red-600">{logMutation.error.message}</Text>
          )}
        </>
      )}
    </Card>
  );
}
