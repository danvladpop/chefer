import { View } from 'react-native';
import { Biscuit, Text } from '@chefer/ui-mobile';
import { biscuitLine, cn, PROGRESS_COPY, type BiscuitMoment } from '@chefer/utils';

// Biscuit's cameo (idea 44): one warm line on a big moment — cook finished,
// level up, the weekly recap. He uses the existing loops (`cooking`, `allSet`),
// so there is nothing new to draw. The caller decides whether he appears
// (`settings.biscuit` on, and not `quiet`); the line is picked from the shared
// copy by a seed, so the same moment always says the same thing.

export function BiscuitLine({
  moment,
  seed,
  loop = 'allSet',
  size = 72,
  tone = 'light',
  testID = 'biscuit-line',
}: {
  moment: BiscuitMoment;
  seed: string;
  loop?: 'allSet' | 'cooking';
  size?: number;
  /** `dark` on the recap's brand-coloured card. */
  tone?: 'light' | 'dark';
  testID?: string;
}) {
  return (
    <View testID={testID} className="items-center gap-2 self-stretch">
      <Biscuit loop={loop} size={size} label={null} />
      <View
        className={cn(
          'rounded-card px-4 py-2.5',
          tone === 'dark' ? 'bg-brand-on/15' : 'bg-brand-tint',
        )}
      >
        <Text
          testID={`${testID}-text`}
          className={cn(
            'text-center text-callout',
            tone === 'dark' ? 'text-brand-on' : 'text-label',
          )}
        >
          “{biscuitLine(moment, seed)}” — {PROGRESS_COPY.biscuitName}
        </Text>
      </View>
    </View>
  );
}
