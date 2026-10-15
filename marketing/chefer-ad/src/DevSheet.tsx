import React from "react";
import { AbsoluteFill } from "remotion";
import { Biscuit } from "./components/Biscuit";
import { Logo } from "./components/Logo";
import { Phone } from "./components/Phone";
import { C } from "./theme";

/** Character/model sheet for checking poses outside the ad. */
export const DevSheet: React.FC = () => (
  <AbsoluteFill style={{ background: C.canvas }}>
    <div
      style={{
        position: "absolute",
        left: 20,
        top: 40,
        display: "flex",
        flexWrap: "wrap",
        width: 1880,
        gap: 40,
      }}
    >
      <Biscuit pose="lie" size={330} mood="sad" reach={1} />
      <Biscuit
        pose="stand"
        size={330}
        mood="excited"
        eyesWide={1}
        reach={0.6}
      />
      <Biscuit pose="push" size={330} walk />
      <Biscuit
        pose="squat"
        size={330}
        accessory="headband"
        holding="dumbbell"
        mood="focused"
        squatDepth={1}
      />
      <Biscuit
        pose="proud"
        size={330}
        mood="proud"
        bodyWidth={0.78}
        armRaise={1}
        holding="carrot"
      />
      <Biscuit pose="wink" size={330} accessory="chefHat" holding="none" />
      <Biscuit
        pose="stand"
        size={330}
        accessory="chefHat"
        armRaise={1}
        holding="phone"
      />
      <Biscuit
        pose="squat"
        size={330}
        accessory="headband"
        holding="dumbbell"
        bodyWidth={0.75}
      />
    </div>
    <Logo size={200} style={{ position: "absolute", left: 1600, top: 820 }} />
    <div
      style={{
        position: "absolute",
        left: 1000,
        top: 600,
        scale: "0.4",
        transformOrigin: "0 0",
      }}
    >
      <Phone active="meals" title="Meals" subtitle="Week of 13 Oct" />
    </div>
  </AbsoluteFill>
);
