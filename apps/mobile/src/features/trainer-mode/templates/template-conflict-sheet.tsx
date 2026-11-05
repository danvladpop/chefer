import { View } from 'react-native';
import type { WorkoutTemplateDto } from '@chefer/types';
import { Sheet, Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { TrainButton } from '../../shell/train/train-button';

// A template's save conflict (trainer-mode.md §6.6): the template changed somewhere else (another
// device, a web tab) while it was open here. The routine editor's pattern and words: "Keep mine"
// re-saves these edits on the newer version, "Use the other version" loads it and drops them.

export function TemplateConflictSheet({
  current,
  onKeepMine,
  onUseTheirs,
  onClose,
  testID = 'template-editor-conflict',
}: {
  /** The server's copy from the CONFLICT error, or null (closed). */
  current: WorkoutTemplateDto | null;
  onKeepMine: () => void;
  onUseTheirs: () => void;
  onClose: () => void;
  testID?: string;
}) {
  const { t } = useT();
  return (
    <Sheet
      visible={current !== null}
      onClose={onClose}
      title={t('trainer.templates.conflict.title')}
      testID={testID}
      footer={
        <View className="gap-2">
          <TrainButton
            testID={`${testID}-keep-mine`}
            label={t('trainer.templates.conflict.keepMine')}
            size="lg"
            onPress={onKeepMine}
          />
          <TrainButton
            testID={`${testID}-use-theirs`}
            label={t('trainer.templates.conflict.useTheirs')}
            variant="outline"
            onPress={onUseTheirs}
          />
        </View>
      }
    >
      <Text testID={`${testID}-message`} className="text-subhead text-label-secondary">
        {t('trainer.templates.conflict.body')}
      </Text>
      {current ? (
        <Text
          testID={`${testID}-version`}
          className="self-start rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand"
        >
          {t('trainer.templates.conflict.serverVersion', { version: current.version })}
        </Text>
      ) : null}
    </Sheet>
  );
}
