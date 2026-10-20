import { useState } from 'react';
import { Alert, View } from 'react-native';
import { TEMPLATE_COPY, type WorkoutTemplateDto } from '@chefer/types';
import { Button, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  defaultTemplateUpdateSelection,
  templateAssignmentStatus,
  userFacingErrorMessage,
  type TemplateAssignmentStatus,
} from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { CheckRow } from './check-row';

// ─── Update for clients (trainer-mode.md §6.6) ────────────────────────────────
// The clients who have this template, one checkbox each. Clients with an older version start ticked;
// those whose day was edited since start unticked ("Edited since. Updating replaces their changes");
// up-to-date ones cannot be picked. Each picked client's day gets this version's exercises (their
// loads are kept for exercises still there).

const COPY = TEMPLATE_COPY.update;
const STATUS_TEXT: Record<TemplateAssignmentStatus, string> = {
  upToDate: COPY.upToDate,
  outdated: COPY.olderVersion,
  editedSince: COPY.editedSince,
};

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
                ? `${COPY.done(ok)}. ${TEMPLATE_COPY.assign.failed(failed)}.`
                : COPY.done(ok),
            tone: failed > 0 ? 'info' : 'success',
          });
          void utils.trainer.templates.get.invalidate({ templateId: template.id });
          void utils.trainer.templates.list.invalidate();
          void utils.trainer.client.routine.invalidate();
          onClose();
        },
        onError: (error) => Alert.alert('Could not update', userFacingErrorMessage(error)),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={COPY.title}
      testID={testID}
      footer={
        <Button
          testID={`${testID}-confirm`}
          disabled={picked.length === 0}
          loading={update.isPending}
          onPress={confirm}
        >
          {COPY.confirm(picked.length)}
        </Button>
      }
    >
      <Text className="text-subhead text-label-secondary">{COPY.body}</Text>
      <View className="gap-2">
        {assignments.map((a) => (
          <CheckRow
            key={a.clientId}
            testID={`${testID}-client-${a.clientId}`}
            title={a.clientName}
            detail={`${a.dayName} · ${STATUS_TEXT[templateAssignmentStatus(a)]}`}
            checked={a.outdated && picked.includes(a.clientId)}
            disabled={!a.outdated}
            onToggle={() => toggle(a.clientId)}
          />
        ))}
      </View>
    </Sheet>
  );
}
