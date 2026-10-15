import { Audio } from "@remotion/media";
import React, { createContext, useContext } from "react";
import { Sequence, staticFile } from "remotion";

export type SfxKind = "tap" | "whoosh" | "tick" | "chime";
export type SfxSources = Record<SfxKind, string>;

const NO_SFX: SfxSources = { tap: "", whoosh: "", tick: "", chime: "" };
export const SfxContext = createContext<SfxSources>(NO_SFX);

/** A path in public/ (e.g. "music.mp3") or a full URL. */
export const resolveSrc = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src);

/**
 * SFX hook point. Every paw tap, card whoosh, check tick and the PR chime is
 * marked with one of these; it renders nothing until a source is set for its
 * kind in the composition's `sfx` props.
 */
export const SfxCue: React.FC<{
  at: number;
  kind: SfxKind;
  volume?: number;
}> = ({ at, kind, volume = 0.8 }) => {
  const src = useContext(SfxContext)[kind];
  if (!src) return null;
  return (
    <Sequence
      from={at}
      durationInFrames={60}
      layout="none"
      name={`SFX ${kind}`}
    >
      <Audio src={resolveSrc(src)} volume={volume} />
    </Sequence>
  );
};
