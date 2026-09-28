import { TextInput, View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { recipeFormCopy } from './copy';

export interface NutritionValues {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export interface NutritionFieldsProps {
  values: NutritionValues;
  onChange: (patch: Partial<NutritionValues>) => void;
}

/** 4 kcal/g protein and carbs, 9 kcal/g fat — the 4/4/9 sanity check for the amber line. */
function kcalFromMacros(protein: number, carbs: number, fat: number): number {
  return 4 * protein + 4 * carbs + 9 * fat;
}

/** The macro with the largest gap from what the typed calories imply, for the amber line's name. */
function macroSanityWarning(values: NutritionValues): string | null {
  const kcal = Number(values.calories) || 0;
  const protein = Number(values.protein) || 0;
  const carbs = Number(values.carbs) || 0;
  const fat = Number(values.fat) || 0;
  if (kcal <= 0 || (protein === 0 && carbs === 0 && fat === 0)) return null;

  const fromMacros = kcalFromMacros(protein, carbs, fat);
  const diff = Math.abs(kcal - fromMacros);
  if (diff <= 10 || diff / Math.max(kcal, 1) <= 0.25) return null;

  const candidates: [string, number, number][] = [
    ['protein', protein, protein * 4],
    ['carbs', carbs, carbs * 4],
    ['fat', fat, fat * 9],
  ];
  const [macro, grams, macroKcal] = candidates.reduce((a, b) => (b[2] > a[2] ? b : a));
  return recipeFormCopy.nutrition.dontAddUp(grams, macro, Math.round(macroKcal));
}

/** Nutrition per serving — optional, four fields (D-18: no fiber input). */
export function NutritionFields({ values, onChange }: NutritionFieldsProps) {
  const warning = macroSanityWarning(values);
  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <NumberField
          testID="rf-kcal"
          label="kcal"
          value={values.calories}
          onChangeText={(v) => onChange({ calories: v })}
        />
        <NumberField
          testID="rf-protein"
          label="Protein g"
          value={values.protein}
          onChangeText={(v) => onChange({ protein: v })}
        />
        <NumberField
          testID="rf-carbs"
          label="Carbs g"
          value={values.carbs}
          onChangeText={(v) => onChange({ carbs: v })}
        />
        <NumberField
          testID="rf-fat"
          label="Fat g"
          value={values.fat}
          onChangeText={(v) => onChange({ fat: v })}
        />
      </View>
      {warning ? (
        <Text testID="rf-nutrition-warning" className="text-xs text-amber-700">
          {warning}
        </Text>
      ) : null}
    </View>
  );
}

function NumberField({
  testID,
  label,
  value,
  onChangeText,
}: {
  testID: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="label">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#9ca3af"
        accessibilityLabel={label}
        className="h-11 rounded-md border border-input bg-background px-2 text-center text-base text-foreground"
      />
    </View>
  );
}
