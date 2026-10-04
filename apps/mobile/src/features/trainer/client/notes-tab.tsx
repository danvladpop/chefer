import { ActivityIndicator, View } from 'react-native';
import { COACHING_COPY, COACHING_LIMITS } from '@chefer/types';
import { Button, Card, ErrorState, FormField, Input, Text } from '@chefer/ui-mobile';
import { usePrivateNote, type NoteStatus } from './use-private-note';

// ─── Client › Notes (spec §2.5 "Private notes") ───────────────────────────────
// One free-text note per client, autosaved. Never shown to the client, never read by Chefer.

const STATUS_TEXT: Record<NoteStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save yet.',
};

export function NotesTab({ clientId, firstName }: { clientId: string; firstName: string }) {
  const note = usePrivateNote(clientId);
  if (note.isLoading) {
    return (
      <View testID="trainer-notes-loading" className="items-center py-10">
        <ActivityIndicator />
      </View>
    );
  }
  if (note.loadFailed) {
    return <ErrorState testID="trainer-notes-error" onRetry={note.reload} />;
  }
  return (
    <Card testID="trainer-notes" className="gap-2">
      <FormField
        testID="trainer-notes-field"
        label={COACHING_COPY.trainer.privateNote}
        hint={COACHING_COPY.trainer.privateNoteHint(firstName)}
      >
        <Input
          testID="trainer-notes-input"
          label={COACHING_COPY.trainer.privateNote}
          value={note.body}
          multiline
          maxLength={COACHING_LIMITS.noteMaxChars}
          textAlignVertical="top"
          className="min-h-40"
          onChangeText={note.onChange}
          onBlur={() => void note.flush()}
        />
      </FormField>
      <View className="flex-row items-center justify-between gap-2">
        <Text
          testID="trainer-notes-status"
          variant="muted"
          className="min-w-0 flex-1 text-xs"
          accessibilityLiveRegion="polite"
        >
          {STATUS_TEXT[note.status]}
        </Text>
        {note.status === 'error' ? (
          <Button
            testID="trainer-notes-retry"
            size="sm"
            variant="outline"
            onPress={() => void note.flush()}
          >
            {COACHING_COPY.common.retry}
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
