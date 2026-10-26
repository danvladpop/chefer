import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import type { HealthSyncType } from '@chefer/types';
import { IconButton, Screen, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { useHealthConsent } from '../privacy/use-health-consent';
import { HEALTH_TYPE_COPY, HEALTH_TYPE_GROUPS, healthScreenCopy } from './health-copy';
import type { HealthStore } from './health-store';
import {
  readHealthSettings,
  useHealthSettings,
  withHealthType,
  writeHealthSettings,
} from './health-sync';
import { useHealthAvailability } from './use-health-sync';

// Settings › Apple Health / Health Connect (C2, owner decision 5): one switch
// per data type — this screen is the consent step. Turning one on asks the OS
// for just that type; weigh-ins are health information, so they also need
// Chefer's health consent first (useHealthConsent). Every change is logged as
// a HEALTH_SYNC consent event (privacy.recordHealthSync). Turning on waits for
// that log; turning off always works on the phone, and logs best-effort.

const CARD = 'gap-1 rounded-card border border-separator bg-surface px-4 py-2';

function TypeRow(props: {
  type: HealthSyncType;
  on: boolean;
  busy: boolean;
  first: boolean;
  onChange: (next: boolean) => void;
}) {
  const colors = useThemeColors();
  const copy = HEALTH_TYPE_COPY[props.type];
  return (
    <View
      className={
        props.first
          ? 'min-h-14 flex-row items-center gap-3 py-2'
          : 'min-h-14 flex-row items-center gap-3 border-t border-separator py-2'
      }
    >
      <View className="min-w-0 flex-1">
        <Text className="text-body text-label">{copy.title}</Text>
        <Text className="mt-0.5 text-subhead text-label-secondary">{copy.description}</Text>
      </View>
      {props.busy ? (
        <ActivityIndicator testID={`health-${props.type}-busy`} color={colors.brand} />
      ) : (
        <Switch
          testID={`health-${props.type}`}
          accessibilityLabel={copy.title}
          value={props.on}
          onValueChange={props.onChange}
          trackColor={{ true: colors.brand, false: colors.separator }}
        />
      )}
    </View>
  );
}

function HealthSyncBody({ store }: { store: HealthStore }) {
  const colors = useThemeColors();
  const copy = healthScreenCopy(store.platform);
  const settings = useHealthSettings();
  const on = new Set(settings?.platform === store.platform ? settings.types : []);
  const [busy, setBusy] = useState<HealthSyncType | null>(null);
  const [denied, setDenied] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const record = trpc.privacy.recordHealthSync.useMutation({ meta: { silent: true } });

  const apply = (type: HealthSyncType, next: boolean) => {
    const updated = withHealthType(readHealthSettings(), store.platform, type, next);
    writeHealthSettings(updated);
    track('health_sync_toggled', { platform: store.platform, type, on: next });
    return updated;
  };

  const turnOn = async (type: HealthSyncType) => {
    setBusy(type);
    setDenied(false);
    setSaveFailed(false);
    try {
      const granted = await store.requestAccess([type]);
      if (!granted.includes(type)) {
        setDenied(true);
        return;
      }
      const types = withHealthType(readHealthSettings(), store.platform, type, true).types;
      await record.mutateAsync({ platform: store.platform, types });
      apply(type, true);
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const change = (type: HealthSyncType, next: boolean) => {
    if (!next) {
      setDenied(false);
      setSaveFailed(false);
      const updated = apply(type, false);
      record.mutate({ platform: store.platform, types: updated.types });
      return;
    }
    if (type === 'weight') requestHealthConsent(() => void turnOn(type));
    else void turnOn(type);
  };

  return (
    <ScrollView
      testID="health-scroll"
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-8 pt-3"
    >
      <Text className="text-subhead text-label-secondary">{copy.intro}</Text>
      {HEALTH_TYPE_GROUPS.map((group) => (
        <View key={group.title} className="gap-2">
          <Text
            accessibilityRole="header"
            className="text-footnote font-semibold uppercase text-label-secondary"
          >
            {group.title}
          </Text>
          <View className={CARD}>
            {group.types.map((type, i) => (
              <TypeRow
                key={type}
                type={type}
                first={i === 0}
                on={on.has(type)}
                busy={busy === type}
                onChange={(next) => change(type, next)}
              />
            ))}
          </View>
        </View>
      ))}
      {denied && (
        <View testID="health-denied" className="gap-2">
          <Text className="text-subhead text-danger">{copy.denied}</Text>
          <Pressable
            testID="health-open-settings"
            accessibilityRole="button"
            onPress={() => void store.openSettings().catch(() => undefined)}
            className="min-h-11 flex-row items-center gap-1 self-start"
          >
            <Text className="text-callout font-semibold text-brand">{copy.openSettings}</Text>
            <Icon name="chevronRight" size={16} color={colors.brand} />
          </Pressable>
        </View>
      )}
      {saveFailed && (
        <Text testID="health-save-error" className="text-subhead text-danger">
          {copy.saveError}
        </Text>
      )}
      <Text className="text-footnote text-label-tertiary">{copy.footer}</Text>
      {healthConsentSheet}
    </ScrollView>
  );
}

export function HealthSyncScreen() {
  const colors = useThemeColors();
  const availability = useHealthAvailability();
  const title =
    availability.status === 'available'
      ? healthScreenCopy(availability.store.platform).title
      : 'Health';
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      <View className="mx-4 mt-3 min-h-11 flex-row items-center gap-1">
        <IconButton
          testID="health-back"
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
          className="-ml-2"
        />
        <Text
          testID="health-title"
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 text-title1 font-bold text-label"
        >
          {title}
        </Text>
      </View>
      {availability.status === 'available' ? (
        <HealthSyncBody store={availability.store} />
      ) : availability.status === 'checking' ? (
        <ActivityIndicator className="mt-8" color={colors.brand} />
      ) : (
        <Text testID="health-unavailable" className="mx-4 mt-3 text-subhead text-label-secondary">
          Health sync isn’t available on this phone yet.
        </Text>
      )}
    </Screen>
  );
}
