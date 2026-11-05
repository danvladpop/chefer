import { ActivityIndicator, View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import { COACHING_LIMITS } from '@chefer/types';
import { Button, ErrorState, FormField, Input, Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { CoachingCard } from '../components/coaching-card';
import { usePrivateNote, type NoteStatus } from './use-private-note';

// ─── Client › Notes (spec §2.5 "Private notes") ───────────────────────────────
// One free-text note per client, autosaved. Never shown to the client, never read by Chefer.

function statusText(status: NoteStatus, t: Translator['t']): string {
  switch (status) {
    case 'idle':
      return '';
    case 'saving':
      return t('common.states.saving');
    case 'saved':
      return t('common.states.saved');
    case 'error':
      return t('coaching.trainer.privateNoteNotYet');
  }
}

export function NotesTab({ clientId, firstName }: { clientId: string; firstName: string }) {
  const { t } = useT();
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
    <CoachingCard testID="trainer-notes" className="gap-2">
      <FormField
        testID="trainer-notes-field"
        label={t('coaching.trainer.privateNote')}
        hint={t('coaching.trainer.privateNoteHint', { client: firstName })}
      >
        <Input
          testID="trainer-notes-input"
          label={t('coaching.trainer.privateNote')}
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
          className="min-w-0 flex-1 text-caption text-label-secondary"
          accessibilityLiveRegion="polite"
        >
          {statusText(note.status, t)}
        </Text>
        {note.status === 'error' ? (
          <Button
            testID="trainer-notes-retry"
            size="sm"
            variant="outline"
            onPress={() => void note.flush()}
          >
            {t('coaching.common.retry')}
          </Button>
        ) : null}
      </View>
    </CoachingCard>
  );
}
