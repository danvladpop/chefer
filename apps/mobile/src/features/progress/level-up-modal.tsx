import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LevelUp, Rank } from '@chefer/types';
import {
  Celebration,
  haptics,
  PopIn,
  PressableScale,
  ProgressRing,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { levelLabel, nextRankLine, PROGRESS_COPY } from '@chefer/utils';
import { BiscuitLine } from './biscuit-line';

// The level-up moment (mockup 04), shown only on "Full party": a full-screen
// modal with the new level in a ring, the rank, Biscuit's one line (when he is
// on and the low-intake guard is not), where the next rank is and "Keep
// cooking". The ring pops in (MO-14), the confetti is the tier-3 Celebration
// (MO-18, with a success haptic; nothing under reduced motion). Android back
// and the button both close it. No Share (P2).

export interface LevelUpModalProps {
  levelUp: LevelUp | null;
  nextRank: Rank | null;
  biscuit: boolean;
  onClose: () => void;
}

export function LevelUpModal({ levelUp, nextRank, biscuit, onClose }: LevelUpModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [burst, setBurst] = useState(0);

  const level = levelUp?.to ?? null;
  useEffect(() => {
    if (level === null) return;
    haptics.success();
    setBurst((n) => n + 1);
  }, [level]);

  return (
    <Modal
      visible={levelUp !== null}
      transparent={false}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        testID="level-up-modal"
        accessibilityViewIsModal
        style={{ paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }}
        className="flex-1 items-center justify-between gap-6 bg-canvas px-6"
      >
        {levelUp ? (
          <>
            <View className="flex-1 items-center justify-center gap-5 self-stretch">
              <Text
                accessibilityRole="header"
                testID="level-up-title"
                className="text-subhead font-bold uppercase tracking-widest text-brand"
              >
                {PROGRESS_COPY.levelUpTitle}
              </Text>
              <PopIn from={0.5}>
                <ProgressRing
                  testID="level-up-ring"
                  progress={1}
                  size={176}
                  strokeWidth={14}
                  color={colors.brand}
                  trackColor={colors.brandTint}
                  accessibilityLabel={levelLabel(levelUp.to)}
                >
                  <Text accessibilityElementsHidden className="text-display">
                    🧑‍🍳
                  </Text>
                  <Text
                    testID="level-up-level"
                    maxFontSizeMultiplier={1.2}
                    className="text-title1 font-bold text-brand"
                  >
                    {levelUp.to}
                  </Text>
                </ProgressRing>
              </PopIn>
              <Text testID="level-up-rank" className="text-center text-title1 font-bold text-label">
                {levelUp.rank.title}
              </Text>
              {biscuit ? (
                <BiscuitLine moment="levelUp" seed={String(levelUp.to)} testID="level-up-biscuit" />
              ) : null}
              {nextRank ? (
                <Text
                  testID="level-up-next"
                  className="text-center text-callout text-label-secondary"
                >
                  {nextRankLine(nextRank.title, nextRank.minLevel)}
                </Text>
              ) : null}
            </View>
            <PressableScale
              testID="level-up-continue"
              accessibilityRole="button"
              accessibilityLabel={PROGRESS_COPY.levelUpContinue}
              onPress={() => {
                haptics.selection();
                onClose();
              }}
              className="min-h-14 items-center justify-center self-stretch rounded-control bg-brand px-4"
            >
              <Text className="text-headline font-bold text-brand-on">
                {PROGRESS_COPY.levelUpContinue}
              </Text>
            </PressableScale>
            <Celebration
              testID="level-up-celebration"
              play={burst}
              colors={[colors.brand, colors.positive, colors.attention, colors.info]}
              origin={{ x: 0.5, y: 0.3 }}
            />
          </>
        ) : null}
      </View>
    </Modal>
  );
}
