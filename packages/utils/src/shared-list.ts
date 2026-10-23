// ─── Shared shopping list: reconcile a sync answer (ADR 0002) ─────────────────
// A shared list polls `shoppingList.sync` and merges its ticks into the list a
// client already shows. A key the user toggled locally and whose toggle has not
// been answered yet (pending) keeps its local state: the server has not seen
// that toggle, so its answer for that key is older than what the user did.
// Web and mobile both call this; keep it pure.

export type CheckedKeysState = { checkedKeys: string[] };

export type MergedChecks = {
  /**
   * The merged checked keys. The same array as `current.checkedKeys` when
   * nothing changed, so a caller can skip a cache write by reference.
   */
  checkedKeys: string[];
  /** Keys whose checked state the OTHER side changed (pending keys never count). */
  remoteChanges: number;
};

export function mergeSyncedChecks(
  current: CheckedKeysState,
  sync: CheckedKeysState,
  pendingKeys: Set<string>,
): MergedChecks {
  const local = new Set(current.checkedKeys);
  const remote = new Set(sync.checkedKeys);
  let remoteChanges = 0;

  // Unticked elsewhere: drop it, unless the local toggle is still in flight.
  const kept = current.checkedKeys.filter((key) => {
    if (pendingKeys.has(key) || remote.has(key)) return true;
    remoteChanges += 1;
    return false;
  });
  // Ticked elsewhere: add it, in the server's order, under the same rule.
  const added = sync.checkedKeys.filter(
    (key, i) => !local.has(key) && !pendingKeys.has(key) && sync.checkedKeys.indexOf(key) === i,
  );
  remoteChanges += added.length;

  if (remoteChanges === 0) return { checkedKeys: current.checkedKeys, remoteChanges: 0 };
  return { checkedKeys: [...kept, ...added], remoteChanges };
}
