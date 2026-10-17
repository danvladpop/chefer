import { simpleSkipKey } from '@chefer/utils';
import { kv } from '../offline/kv';

// "Skip" on simple Today's planned workout (simple training mode §6.4): a
// device-local note for that one day — the plan card turns into "Start a
// workout". Nothing is sent, nothing is ever "missed". Older days' notes are
// pruned on write so the store never grows.

const PREFIX = simpleSkipKey('');

export function isSimpleSkipped(localDate: string): boolean {
  return kv.getString(simpleSkipKey(localDate)) !== null;
}

export function skipSimpleDay(localDate: string): void {
  const key = simpleSkipKey(localDate);
  for (const old of kv.keys()) {
    if (old.startsWith(PREFIX) && old !== key) kv.remove(old);
  }
  kv.setString(key, '1');
}

export function unskipSimpleDay(localDate: string): void {
  kv.remove(simpleSkipKey(localDate));
}
