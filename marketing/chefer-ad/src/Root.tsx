import React from "react";
import { Composition, Folder } from "remotion";
import { CheferAd } from "./CheferAd";
import { DevSheet } from "./DevSheet";
import {
  LOOP,
  LOOP_SIZE,
  ONBOARDING_LOOPS,
  OnboardingLoopsSheet,
} from "./onboarding/OnboardingLoops";
import { cheferAdSchema } from "./schema";
import { CookAndCheckOff } from "./scenes/CookAndCheckOff";
import { EndCard } from "./scenes/EndCard";
import { Hook } from "./scenes/Hook";
import { MealPlan } from "./scenes/MealPlan";
import { Payoff } from "./scenes/Payoff";
import { Shop } from "./scenes/Shop";
import { Train } from "./scenes/Train";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="CheferAd"
      component={CheferAd}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={720}
      schema={cheferAdSchema}
      defaultProps={{
        petName: "Biscuit",
        headlines: {
          intro: "Meet {pet}.",
          introTag: "Professional couch potato",
          hook: "{pet} had a plan.",
          hookStruck: "had",
          hookReplacement: "needed",
          mealPlan: "AI meal plans, built for you",
          shop: "Your shopping list, done",
          cook: "Scan it. Check it off.",
          train: "Workouts that keep up with you",
          payoff: "Eat well. Train smart.",
          endCardSubline: "Free on iOS & Android",
        },
        musicSrc: "music/rising-forest.mp3",
        playStoreLive: true,
        musicStartSeconds: 0,
        musicVolume: 1,
        voiceover: "none",
        sfx: { tap: "", whoosh: "", tick: "", chime: "" },
      }}
    />
    <Composition
      id="CheferAdLandscape"
      component={CheferAd}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={720}
      schema={cheferAdSchema}
      defaultProps={{
        petName: "Biscuit",
        headlines: {
          intro: "Meet {pet}.",
          introTag: "Professional couch potato",
          hook: "{pet} had a plan.",
          hookStruck: "had",
          hookReplacement: "needed",
          mealPlan: "AI meal plans, built for you",
          shop: "Your shopping list, done",
          cook: "Scan it. Check it off.",
          train: "Workouts that keep up with you",
          payoff: "Eat well. Train smart.",
          endCardSubline: "Free on iOS & Android",
        },
        musicSrc: "music/rising-forest.mp3",
        playStoreLive: true,
        musicStartSeconds: 0,
        musicVolume: 1,
        voiceover: "none",
        sfx: { tap: "", whoosh: "", tick: "", chime: "" },
      }}
    />

    <Folder name="CheferAd-Voiceover">
      <Composition
        id="CheferAd-Heart"
        component={CheferAd}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={720}
        schema={cheferAdSchema}
        defaultProps={{
          petName: "Biscuit",
          headlines: {
            intro: "Meet {pet}.",
            introTag: "Professional couch potato",
            hook: "{pet} had a plan.",
            hookStruck: "had",
            hookReplacement: "needed",
            mealPlan: "AI meal plans, built for you",
            shop: "Your shopping list, done",
            cook: "Scan it. Check it off.",
            train: "Workouts that keep up with you",
            payoff: "Eat well. Train smart.",
            endCardSubline: "Free on iOS & Android",
          },
          musicSrc: "music/rising-forest.mp3",
          playStoreLive: true,
          musicStartSeconds: 0,
          musicVolume: 1,
          voiceover: "heart",
          sfx: { tap: "", whoosh: "", tick: "", chime: "" },
        }}
      />
      <Composition
        id="CheferAdLandscape-Heart"
        component={CheferAd}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={720}
        schema={cheferAdSchema}
        defaultProps={{
          petName: "Biscuit",
          headlines: {
            intro: "Meet {pet}.",
            introTag: "Professional couch potato",
            hook: "{pet} had a plan.",
            hookStruck: "had",
            hookReplacement: "needed",
            mealPlan: "AI meal plans, built for you",
            shop: "Your shopping list, done",
            cook: "Scan it. Check it off.",
            train: "Workouts that keep up with you",
            payoff: "Eat well. Train smart.",
            endCardSubline: "Free on iOS & Android",
          },
          musicSrc: "music/rising-forest.mp3",
          playStoreLive: true,
          musicStartSeconds: 0,
          musicVolume: 1,
          voiceover: "heart",
          sfx: { tap: "", whoosh: "", tick: "", chime: "" },
        }}
      />
    </Folder>

    {/* Each scene on its own timeline (connected compositions). Lengths include the 8-frame hand-off. */}
    <Folder name="CheferAd-Scenes">
      <Composition
        id="Scene1-Hook"
        component={Hook}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={188}
        defaultProps={{
          intro: "Meet {pet}.",
          introTag: "Professional couch potato",
          headline: "{pet} had a plan.",
          struck: "had",
          replacement: "needed",
          petName: "Biscuit",
        }}
      />
      <Composition
        id="Scene2-MealPlan"
        component={MealPlan}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={98}
        defaultProps={{ headline: "AI meal plans, built for you" }}
      />
      <Composition
        id="Scene3-Shop"
        component={Shop}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={98}
        defaultProps={{ headline: "Your shopping list, done" }}
      />
      <Composition
        id="Scene4-CookAndCheckOff"
        component={CookAndCheckOff}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={98}
        defaultProps={{ headline: "Scan it. Check it off." }}
      />
      <Composition
        id="Scene5-Train"
        component={Train}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={128}
        defaultProps={{ headline: "Workouts that keep up with you" }}
      />
      <Composition
        id="Scene6-Payoff"
        component={Payoff}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={98}
        defaultProps={{ headline: "Eat well. Train smart." }}
      />
      <Composition
        id="Scene7-EndCard"
        component={EndCard}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={60}
        defaultProps={{
          subline: "Free on iOS & Android",
          playStoreLive: true,
        }}
      />
    </Folder>

    {/* Onboarding proposal: one Biscuit loop per step (transparent, seamless). */}
    <Folder name="Onboarding">
      <Composition
        id="Onboarding-Sheet"
        component={OnboardingLoopsSheet}
        width={1800}
        height={1530}
        fps={30}
        durationInFrames={LOOP * 2}
      />
      {ONBOARDING_LOOPS.map((l) => (
        <Composition
          key={l.id}
          id={l.id}
          component={l.component}
          width={LOOP_SIZE}
          height={LOOP_SIZE}
          fps={30}
          durationInFrames={LOOP}
        />
      ))}
    </Folder>

    <Folder name="Dev">
      <Composition
        id="DevSheet"
        component={DevSheet}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={60}
      />
    </Folder>
  </>
);
