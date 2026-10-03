import { View } from 'react-native';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { isNetworkError, NETWORK_ERROR_MESSAGE, SERVER_ERROR_MESSAGE } from '@chefer/utils';
import { outbox, type OutboxStatus } from '../offline/outbox';
import { friendlyValidationMessage, parseIssuesFromMessage } from '../validation-copy';

// UX-GYM-25 / audit §6.3: a batch that keeps failing used to retry forever in
// silence — Today only said "N workouts waiting to sync", never why. This card
// says how many are waiting, the plain-language reason of the last failure and
// offers "Sync now" (a forced flush, past the backoff window). Items the server
// refused outright are PARKED and have their own "didn't save" card on Today.

/** The outbox's raw `lastError` text, as one plain sentence. */
export function friendlyOutboxError(raw: string): string {
  if (parseIssuesFromMessage(raw) !== null) return friendlyValidationMessage(raw);
  if (isNetworkError(new Error(raw))) return NETWORK_ERROR_MESSAGE;
  return SERVER_ERROR_MESSAGE;
}

export interface OutboxWaitingCardProps {
  status: Pick<OutboxStatus, 'pending' | 'lastError' | 'isFlushing'>;
  testID?: string;
}

/** "N waiting · last error · Sync now"; renders nothing when nothing is waiting. */
export function OutboxWaitingCard({
  status,
  testID = 'gym-outbox-waiting',
}: OutboxWaitingCardProps) {
  if (status.pending === 0) return null;
  return (
    <Card testID={testID} className="gap-2">
      <Text testID={`${testID}-count`} className="text-sm font-medium">
        {`${status.pending} workout${status.pending === 1 ? '' : 's'} waiting to sync`}
      </Text>
      {status.lastError ? (
        <Text testID={`${testID}-error`} variant="muted" className="text-xs">
          {friendlyOutboxError(status.lastError)}
        </Text>
      ) : null}
      <View className="flex-row">
        <Button
          testID={`${testID}-sync-now`}
          size="sm"
          variant="outline"
          loading={status.isFlushing}
          onPress={() => void outbox.flush({ force: true })}
        >
          Sync now
        </Button>
      </View>
    </Card>
  );
}
