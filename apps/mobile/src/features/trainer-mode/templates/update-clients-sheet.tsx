import { useState } from 'react';
import { Alert, View } from 'react-native';
import type { MessageKey } from '@chefer/i18n';
import type { WorkoutTemplateDto } from '@chefer/types';
import { Button, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  defaultTemplateUpdateSelection,
  templateAssignmentStatus,
  userFacingErrorMessage,
  type TemplateAssignmentStatus,
} from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { CheckRow } from './check-row';

// ─── Update for clients (trainer-mode.md §6.6) ────────────────────────────────
// The clients who have this template, one checkbox each. Clients with an older version start ticked;
// those whose day was edited since start unticked ("Edited since. Updating replaces their changes");
// up-to-date ones cannot be picked. Each picked client's day gets this version's exercises (their
// loads are kept for exercises still there).

const STATUS_KEY = {
  upToDate: 'trainer.templates.update.upToDate',
  outdated: 'trainer.templates.update.olderVersion',
  editedSince: 'trainer.templates.update.editedSince',
} as const satisfies Record<TemplateAssignmentStatus, MessageKey>;

export function UpdateClientsSheet({
  visible,
  onClose,
  template,
  testID = 'update-sheet',
}: {
  visible: boolean;
  onClose: () => void;
  template: WorkoutTemplateDto | null;
  testID?: string;
}) {
  const { t } = useT();
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const assignments = template?.assignments ?? [];
  const [picked, setPicked] = useState<string[]>(() => defaultTemplateUpdateSelection(assignments));
  const update = trpc.trainer.templates.updateClients.useMutation({ meta: { silent: true } });

  // A fresh default selection every time the sheet opens.
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) setPicked(defaultTemplateUpdateSelection(assignments));
  }

  const toggle = (clientId: string) =>
    setPicked((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );

  const confirm = () => {
    if (!template || picked.length === 0) return;
    update.mutate(
      { templateId: template.id, clientIds: picked },
      {
        onSuccess: (result) => {
          const ok = result.results.filter((r) => r.ok).length;
          const failed = result.results.length - ok;
          if (ok > 0) track('template_clients_updated', { clients: ok });
          snackbar.show({
            message:
              failed > 0
                ? t('trainer.templates.assign.partial', {
                    done: t('trainer.templates.update.done', { count: ok }),
                    failed: t('trainer.templates.assign.failed', { count: failed }),
                  })
                : t('trainer.templates.update.done', { count: ok }),
            tone: failed > 0 ? 'info' : 'success',
          });
          void utils.trainer.templates.get.invalidate({ templateId: template.id });
          void utils.trainer.templates.list.invalidate();
          void utils.trainer.client.routine.invalidate();
          onClose();
        },
        onError: (error) =>
          Alert.alert(t('trainer.templates.update.errorTitle'), userFacingErrorMessage(error)),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('trainer.templates.update.title')}
      testID={testID}
      footer={
        <Button
          testID={`${testID}-confirm`}
          disabled={picked.length === 0}
          loading={update.isPending}
          onPress={confirm}
        >
          {t('trainer.templates.update.confirm', { count: picked.length })}
        </Button>
      }
    >
      <Text className="text-subhead text-label-secondary">
        {t('trainer.templates.update.body')}
      </Text>
      <View className="gap-2">
        {assignments.map((a) => (
          <CheckRow
            key={a.clientId}
            testID={`${testID}-client-${a.clientId}`}
            title={a.clientName}
            detail={`${a.dayName} · ${t(STATUS_KEY[templateAssignmentStatus(a)])}`}
            checked={a.outdated && picked.includes(a.clientId)}
            disabled={!a.outdated}
            onToggle={() => toggle(a.clientId)}
          />
        ))}
      </View>
    </Sheet>
  );
}
