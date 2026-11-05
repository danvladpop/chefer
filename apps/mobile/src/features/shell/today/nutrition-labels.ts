import type { Translator } from '@chefer/i18n';
import type { CalorieGaugeLabels, MacroKey, MacroLabels } from '@chefer/ui-mobile';

// Lane J phase 4: the UI kit's CalorieGauge and MacroRow / MacroTiles stay
// language-free (English defaults); every app caller passes these, built from
// `today.shell.gauge.*` and `today.shell.macros.*`.

type T = Translator['t'];

/** The gauge's caption (pass it as `caption`) and its other words. */
export function calorieGaugeLabels(t: T): { caption: string; labels: CalorieGaugeLabels } {
  return {
    caption: t('today.shell.gauge.kcalEaten'),
    labels: {
      left: t('today.shell.gauge.kcalLeft'),
      over: t('today.shell.gauge.kcalOver'),
      target: t('today.shell.gauge.kcalTarget'),
      spoken: ({ value, target, remaining, overBy, over }) => {
        if (target === '') return t('today.shell.gauge.spoken.kcalNoTarget', { value });
        return over
          ? t('today.shell.gauge.spoken.kcalOver', { value, target, over: overBy })
          : t('today.shell.gauge.spoken.kcalLeft', { value, target, remaining });
      },
    },
  };
}

/** Translated words for each macro, for MacroRow `labels` and MacroTiles `labels`. */
export function macroLabels(t: T): Record<MacroKey, MacroLabels> {
  const forMacro = (name: string): MacroLabels => ({
    name,
    over: (overBy) => t('today.shell.macros.overGrams', { value: overBy }),
    spoken: ({ name: spokenName, value, target, overBy, grams }) => {
      if (target === undefined) {
        return t('today.shell.macros.spoken.noTarget', { count: grams, name: spokenName, value });
      }
      return overBy === undefined
        ? t('today.shell.macros.spoken.withTarget', {
            count: grams,
            name: spokenName,
            value,
            target,
          })
        : t('today.shell.macros.spoken.over', {
            count: grams,
            name: spokenName,
            value,
            target,
            over: overBy,
          });
    },
  });
  return {
    protein: forMacro(t('today.shell.macros.names.protein')),
    carbs: forMacro(t('today.shell.macros.names.carbs')),
    fat: forMacro(t('today.shell.macros.names.fat')),
  };
}
