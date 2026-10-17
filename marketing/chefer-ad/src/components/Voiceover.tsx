import { Audio } from "@remotion/media";
import React from "react";
import { interpolate, Sequence, staticFile } from "remotion";
import manifest from "../voiceover-manifest.json";
import { CLAMP } from "../theme";

export type VoiceKind = "none" | "heart";
type Line = { id: string; at: number; frames: number; src: string };

/** The narration lines for this voice (see scripts/voiceover-lines.json). */
export const activeLines = (voice: VoiceKind): Line[] =>
  voice === "none" ? [] : manifest[voice];

/** 0 → 1 while any line is speaking (with short ramps), for ducking the music. */
export const speechAt = (frame: number, lines: Line[]) =>
  lines.reduce(
    (max, l) =>
      Math.max(
        max,
        interpolate(
          frame,
          [l.at - 6, l.at, l.at + l.frames, l.at + l.frames + 10],
          [0, 1, 1, 0],
          CLAMP,
        ),
      ),
    0,
  );

/** Places each generated clip (public/voiceover/<voice>/) on its start frame. */
export const Voiceover: React.FC<{ lines: Line[] }> = ({ lines }) => (
  <>
    {lines.map((l) => (
      <Sequence
        key={l.id}
        from={l.at}
        durationInFrames={l.frames + 6}
        layout="none"
        name={`VO ${l.id}`}
      >
        <Audio src={staticFile(l.src)} />
      </Sequence>
    ))}
  </>
);
