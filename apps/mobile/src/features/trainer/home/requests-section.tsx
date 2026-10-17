import { useState } from 'react';
import { View } from 'react-native';
import { COACHING_COPY, type TrainerRequestDto } from '@chefer/types';
import { Button, Text, useSnackbar } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { formatStampDate } from '../../gym/routine/attribution';
import { CoachingCard } from '../components/coaching-card';

// ─── Requests (PRD 2026-10 §4.1) ──────────────────────────────────────────────
// Clients who asked this trainer to coach them, from Find a trainer: "Maria asked you to coach them",
// the expiry, "Has a trainer now: accepting ends that coaching." when it applies, Accept / Decline.
// Accept starts the coaching (the client joins Clients); both answers tell the client.
// Nothing renders while the list is empty, loading or unavailable.

function RequestRow({
  request,
  busy,
  onAccept,
  onDecline,
}: {
  request: TrainerRequestDto;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const copy = COACHING_COPY.request;
  return (
    <CoachingCard testID={`trainer-request-${request.id}`} className="gap-2">
      <Text className="text-headline font-semibold text-label">
        {copy.fromClient(request.client.name)}
      </Text>
      <Text className="text-subhead text-label-secondary">
        {copy.expires(formatStampDate(request.expiresAt))}
      </Text>
      {request.hasTrainer ? (
        <Text
          testID={`trainer-request-${request.id}-has-trainer`}
          className="text-subhead text-label-secondary"
        >
          {copy.hasTrainer}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          testID={`trainer-request-${request.id}-accept`}
          className="flex-1"
          disabled={busy}
          accessibilityLabel={`${copy.accept}: ${request.client.name}`}
          onPress={onAccept}
        >
          {copy.accept}
        </Button>
        <Button
          testID={`trainer-request-${request.id}-decline`}
          variant="outline"
          className="flex-1"
          disabled={busy}
          accessibilityLabel={`${copy.decline}: ${request.client.name}`}
          onPress={onDecline}
        >
          {copy.decline}
        </Button>
      </View>
    </CoachingCard>
  );
}

export function RequestsSection() {
  const copy = COACHING_COPY.request;
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const [error, setError] = useState<string | null>(null);
  const requests = trpc.trainer.requests.list.useQuery(undefined, { retry: false });
  const refresh = () => {
    void utils.trainer.requests.list.invalidate();
    void utils.trainer.clients.list.invalidate();
    void utils.coaching.notices.invalidate();
  };
  const accept = trpc.trainer.requests.accept.useMutation({
    meta: { silent: true },
    onError: (err) => setError(userFacingErrorMessage(err)),
    onSettled: refresh,
  });
  const decline = trpc.trainer.requests.decline.useMutation({
    meta: { silent: true },
    onError: (err) => setError(userFacingErrorMessage(err)),
    onSettled: refresh,
  });

  const list = requests.data ?? [];
  if (list.length === 0) return null;
  const busy = accept.isPending || decline.isPending;

  return (
    <View testID="trainer-requests" className="gap-2">
      <Text accessibilityRole="header" className="text-title3 font-bold text-label">
        {copy.listTitle}
      </Text>
      {list.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          busy={busy}
          onAccept={() => {
            setError(null);
            accept.mutate(
              { requestId: request.id },
              { onSuccess: () => snackbar.show({ message: copy.accepted(request.client.name) }) },
            );
          }}
          onDecline={() => {
            setError(null);
            decline.mutate(
              { requestId: request.id },
              { onSuccess: () => snackbar.show({ message: copy.declined }) },
            );
          }}
        />
      ))}
      {error ? (
        <Text
          testID="trainer-requests-error"
          accessibilityRole="alert"
          className="text-subhead text-danger"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
