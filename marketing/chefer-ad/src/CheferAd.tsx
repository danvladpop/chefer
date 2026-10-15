import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import { AbsoluteFill, interpolate, useVideoConfig } from "remotion";
import { resolveSrc, SfxContext } from "./components/Sfx";
import { activeLines, speechAt, Voiceover } from "./components/Voiceover";
import { CheferAdProps } from "./schema";
import { CookAndCheckOff } from "./scenes/CookAndCheckOff";
import { EndCard } from "./scenes/EndCard";
import { Hook } from "./scenes/Hook";
import { MealPlan } from "./scenes/MealPlan";
import { Payoff } from "./scenes/Payoff";
import { Shop } from "./scenes/Shop";
import { Train } from "./scenes/Train";
import { C, CLAMP, EASE_ENTER, TRANSITION } from "./theme";

const timing = linearTiming({
  durationInFrames: TRANSITION,
  easing: EASE_ENTER,
});

/**
 * 24s vertical (or landscape) ad. Each scene runs its range plus the 8-frame
 * transition into the next one, so scene starts land exactly on
 * 0 / 180 / 270 / 360 / 450 / 570 / 660 and the total stays 720 frames.
 */
export const CheferAd: React.FC<CheferAdProps> = ({
  petName,
  headlines,
  playStoreLive,
  musicSrc,
  musicStartSeconds,
  musicVolume,
  voiceover,
  sfx,
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const lines = activeLines(voiceover);
  // Music sits lower when there is narration and ducks further while a line plays.
  const musicBase = (lines.length ? 0.55 : 0.8) * musicVolume;

  return (
    <SfxContext.Provider value={sfx}>
      <AbsoluteFill style={{ background: C.canvas }}>
        <TransitionSeries>
          {/* 0–180 */}
          <TransitionSeries.Sequence name="1 Hook" durationInFrames={188}>
            <Hook
              intro={headlines.intro}
              introTag={headlines.introTag}
              headline={headlines.hook}
              struck={headlines.hookStruck}
              replacement={headlines.hookReplacement}
              petName={petName}
            />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={slide({ direction: "from-bottom" })}
            timing={timing}
          />
          {/* 180–270 */}
          <TransitionSeries.Sequence name="2 MealPlan" durationInFrames={98}>
            <MealPlan headline={headlines.mealPlan} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={slide({ direction: "from-right" })}
            timing={timing}
          />
          {/* 270–360 */}
          <TransitionSeries.Sequence name="3 Shop" durationInFrames={98}>
            <Shop headline={headlines.shop} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={slide({ direction: "from-right" })}
            timing={timing}
          />
          {/* 360–450 */}
          <TransitionSeries.Sequence
            name="4 CookAndCheckOff"
            durationInFrames={98}
          >
            <CookAndCheckOff headline={headlines.cook} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={slide({ direction: "from-right" })}
            timing={timing}
          />
          {/* 450–570 */}
          <TransitionSeries.Sequence name="5 Train" durationInFrames={128}>
            <Train headline={headlines.train} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          {/* 570–660 */}
          <TransitionSeries.Sequence name="6 Payoff" durationInFrames={98}>
            <Payoff headline={headlines.payoff} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          {/* 660–720 */}
          <TransitionSeries.Sequence name="7 EndCard" durationInFrames={60}>
            <EndCard
              subline={headlines.endCardSubline}
              playStoreLive={playStoreLive}
            />
          </TransitionSeries.Sequence>
        </TransitionSeries>

        {musicSrc ? (
          <Audio
            name="Music"
            src={resolveSrc(musicSrc)}
            trimBefore={Math.round(musicStartSeconds * fps)}
            volume={(f) =>
              musicBase *
              (1 - 0.6 * speechAt(f, lines)) *
              interpolate(
                f,
                [durationInFrames - 15, durationInFrames],
                [1, 0],
                CLAMP,
              )
            }
          />
        ) : null}
        <Voiceover lines={lines} />
      </AbsoluteFill>
    </SfxContext.Provider>
  );
};
