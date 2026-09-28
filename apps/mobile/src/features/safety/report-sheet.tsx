import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, ChipGroup, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import { reportSentSnackbarText, SAFETY_COPY } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// T-01.5 — report a safety problem (UX-01 (d)): recipe-detail header overflow
// (wired in app/recipe/[id].tsx). On send, `safety.report` hides the recipe
// from this user's plans, swaps and suggestions immediately (AC10). The
// plan-card long-press item (L-SAFE2, wave 2) reuses this same component.

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: SAFETY_COPY.reportOptionCantEat, label: SAFETY_COPY.reportOptionCantEat },
  { value: SAFETY_COPY.reportOptionLabelWrong, label: SAFETY_COPY.reportOptionLabelWrong },
  { value: SAFETY_COPY.reportOptionSomethingElse, label: SAFETY_COPY.reportOptionSomethingElse },
];

export interface ReportSafetySheetProps {
  visible: boolean;
  onClose: () => void;
  recipeId: string;
  recipeName: string;
  /** Where the report was opened from (§B-26 evidence trail). */
  surface: string;
}

export function ReportSafetySheet({
  visible,
  onClose,
  recipeId,
  recipeName,
  surface,
}: ReportSafetySheetProps) {
  const [reason, setReason] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const snackbar = useSnackbar();
  const utils = trpc.useUtils();

  const reportMutation = trpc.safety.report.useMutation({
    onSuccess: () => {
      onClose();
      setReason([]);
      setNote('');
      void utils.recipe.list.invalidate();
      void utils.mealPlan.invalidate();
      snackbar.show({ message: reportSentSnackbarText(recipeName), tone: 'success' });
    },
  });

  const handleSend = () => {
    const [primaryReason] = reason;
    if (!primaryReason || reportMutation.isPending) return;
    reportMutation.mutate({
      recipeId,
      surface,
      reason: primaryReason,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={SAFETY_COPY.reportTitle}
      testID="report-safety-sheet"
      footer={
        <Button
          testID="report-safety-send"
          disabled={reason.length === 0}
          loading={reportMutation.isPending}
          onPress={handleSend}
        >
          {SAFETY_COPY.reportSend}
        </Button>
      }
    >
      <ChipGroup
        testID="report-safety-reason"
        options={REASON_OPTIONS}
        value={reason}
        onChange={setReason}
        className="flex-col items-start"
      />
      <View className="gap-1">
        <Text variant="label">{SAFETY_COPY.reportNoteLabel}</Text>
        <TextInput
          testID="report-safety-note"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          accessibilityLabel={SAFETY_COPY.reportNoteLabel}
          className="min-h-20 rounded-md border border-input bg-background p-3 text-sm text-foreground"
        />
      </View>
      {reportMutation.isError ? (
        <Text className="text-xs text-red-600">{reportMutation.error.message}</Text>
      ) : null}
    </Sheet>
  );
}
