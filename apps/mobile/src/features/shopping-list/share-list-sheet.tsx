import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, Switch, View } from 'react-native';
import { Button, colors, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { cn, dinnersFromPlan, weekdayShortName, weekRelationLabel } from '@chefer/utils';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { getWebUrl } from '../../lib/api-url';
import { trpc } from '../../lib/trpc';
import {
  buildShopShareText,
  shareCounts,
  toShareItems,
  type ShopItemLike,
} from './share-list-build';
import {
  DEFAULT_SHARE_PREFS,
  loadSharePrefs,
  saveSharePrefs,
  type ShareListPrefs,
} from './share-list-prefs';

// T-13.2 — `Send the list`: what to send (what's left / everything), with or
// without amounts, optionally with this week's dinners, then the system share
// sheet (RN core `Share.share`, no native module). Not an AI call, so no AI
// consent. The choice is remembered per device.

export interface ShareListSheetProps {
  visible: boolean;
  onClose: () => void;
  weekOffset: number;
  weekStart: Date;
  items: readonly ShopItemLike[];
  checkedKeys: readonly string[];
  fromDayOfWeek?: number | undefined;
  portions?: number | null | undefined;
  testID?: string;
}

const itemsLabel = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

function RadioRow({
  testID,
  label,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3"
    >
      <View
        className={cn(
          'h-5 w-5 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-gray-300',
        )}
      >
        {selected && <View className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </View>
      <Text className="min-w-0 flex-1 text-base">{label}</Text>
    </Pressable>
  );
}

function SwitchRow({
  testID,
  label,
  value,
  onChange,
}: {
  testID: string;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3">
      <Text className="min-w-0 flex-1 text-base">{label}</Text>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: '#d1d5db' }}
      />
    </View>
  );
}

export function ShareListSheet({
  visible,
  onClose,
  weekOffset,
  weekStart,
  items,
  checkedKeys,
  fromDayOfWeek,
  portions,
  testID = 'share-list-sheet',
}: ShareListSheetProps) {
  const unitSystem = useUnitSystem();
  const snackbar = useSnackbar();
  const [prefs, setPrefs] = useState<ShareListPrefs>(DEFAULT_SHARE_PREFS);
  const [sharing, setSharing] = useState(false);

  // Read the remembered choice each time the sheet opens.
  useEffect(() => {
    if (visible) setPrefs(loadSharePrefs());
  }, [visible]);

  const plan = trpc.mealPlan.getForWeek.useQuery(
    { weekOffset },
    { staleTime: 60_000, enabled: visible },
  );
  const dinners = useMemo(
    () => dinnersFromPlan(plan.data?.days ?? [], weekdayShortName),
    [plan.data?.days],
  );

  const counts = useMemo(() => shareCounts(toShareItems(items, checkedKeys)), [items, checkedKeys]);
  // Nothing ticked (or covered) yet: "what's left" would be the whole list, so
  // there is one option, `Everything`.
  const hasChoice = counts.whatsLeft !== counts.everything;
  const scope = hasChoice ? prefs.scope : 'everything';
  const hasDinners = dinners.length > 0;

  const update = (patch: Partial<ShareListPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveSharePrefs(next);
  };

  const send = async () => {
    setSharing(true);
    try {
      const message = buildShopShareText({
        items,
        checkedKeys,
        weekStart,
        fromDayOfWeek,
        portions,
        scope,
        withAmounts: prefs.withAmounts,
        withDinners: hasDinners && prefs.withDinners,
        dinners,
        weekOffset,
        unitSystem,
        shareUrl: getWebUrl('/'),
      });
      const result = await Share.share({ message });
      if (result.action === Share.sharedAction) {
        snackbar.show({ message: 'List ready to send.', tone: 'success' });
        onClose();
      }
    } catch {
      snackbar.show({ message: 'Couldn’t open sharing. Try again.' });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Send the list"
      testID={testID}
      footer={
        <Button testID="share-list-send" loading={sharing} onPress={() => void send()}>
          Share…
        </Button>
      }
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="What to send">
        {hasChoice && (
          <RadioRow
            testID="share-scope-left"
            label={`What’s left to buy · ${itemsLabel(counts.whatsLeft)}`}
            selected={scope === 'whatsLeft'}
            onPress={() => update({ scope: 'whatsLeft' })}
          />
        )}
        <RadioRow
          testID="share-scope-everything"
          label={`Everything · ${itemsLabel(counts.everything)}`}
          selected={scope === 'everything'}
          onPress={() => update({ scope: 'everything' })}
        />
      </View>
      <SwitchRow
        testID="share-amounts"
        label="Include amounts"
        value={prefs.withAmounts}
        onChange={(withAmounts) => update({ withAmounts })}
      />
      {hasDinners && (
        <SwitchRow
          testID="share-dinners"
          label={`Add ${weekRelationLabel(weekOffset)}’s dinners`}
          value={prefs.withDinners}
          onChange={(withDinners) => update({ withDinners })}
        />
      )}
    </Sheet>
  );
}
