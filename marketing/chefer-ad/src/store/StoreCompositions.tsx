import React from "react";
import { Composition, Folder } from "remotion";
import { FeatureGraphic, featureGraphicSchema } from "./FeatureGraphic";
import { frameFor, SETS, SIZES } from "./frames";
import { Screenshot, screenshotSchema } from "./Screenshot";

/**
 * One still per (set, size, frame). The id encodes the output path, which
 * scripts/render-store.mjs relies on:
 *   <set>--<w>x<h>--<NN>-<slug>  →  aso-creatives-v1/<set>/<w>x<h>/<NN>-<slug>.png
 *   <set>--<file>                →  aso-creatives-v1/<set>/<file>.png
 */
export const StoreCompositions: React.FC = () => (
  <Folder name="Store">
    {SETS.map((set) => (
      <Folder key={set.id} name={set.id}>
        {set.sizes.map((sizeKey) => {
          const size = SIZES[sizeKey];
          return set.order.map((ref, i) => {
            const frame = frameFor(ref);
            const nn = String(i + 1).padStart(2, "0");
            return (
              <Composition
                key={`${sizeKey}${nn}`}
                id={`${set.id}--${size.width}x${size.height}--${nn}-${frame.slug}`}
                component={Screenshot}
                width={size.width}
                height={size.height}
                fps={30}
                durationInFrames={1}
                schema={screenshotSchema}
                defaultProps={{
                  caption: frame.caption,
                  subline: frame.subline,
                  tone: frame.tone,
                  device: size.device,
                  screens: frame.screens,
                  callout: frame.callout?.[size.device],
                }}
              />
            );
          });
        })}
      </Folder>
    ))}
    <Composition
      id="play--feature-graphic-1024x500"
      component={FeatureGraphic}
      width={1024}
      height={500}
      fps={30}
      durationInFrames={1}
      schema={featureGraphicSchema}
      defaultProps={{
        lines: [
          "Meals planned around *your allergies.*",
          "Lifts that progress.",
        ],
      }}
    />
  </Folder>
);
