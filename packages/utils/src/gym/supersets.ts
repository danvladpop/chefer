// Supersets (gym_plan.md §7 G4-B, research §5.1 #11). Pure and shared by the
// mobile and web routine editors and active-workout screens.
//
// A superset is a RUN of adjacent routine exercises that share the same
// `supersetGroup` letter. Letters are canonical: runs are labelled A, B, C…
// in order, and a "run" of one is no superset (its group is cleared). Every
// editor operation below returns a normalised list, so reordering or removing
// an exercise can never leave a stray letter or a group split in two.
//
// Inside a session there is no superset field (the session schema is frozen):
// grouping is derived from `routineExerciseId` via the routine, and the same
// adjacency rule applies to the session's current exercise order.
import type {
  NextWorkoutDto,
  RoutineDto,
  SessionExerciseDoc,
  SessionSetDoc,
  WorkoutSessionDoc,
} from '@chefer/types';

export interface SupersetItem {
  supersetGroup: string | null;
}

/** A superset in a list: indices `start`…`end` (inclusive, at least 2 items). */
export interface SupersetRun {
  label: string;
  start: number;
  end: number;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function labelFor(n: number): string {
  return LETTERS[n] ?? `S${n + 1}`;
}

/** Placeholder labels used mid-operation; normalisation replaces them. */
const TEMP_JOIN = '\u0000join';
const TEMP_SPLIT = '\u0000split';

function groupsOf(items: readonly SupersetItem[]): (string | null)[] {
  return items.map((item) => item.supersetGroup);
}

/** Bounds of the raw run (adjacent equal, non-null groups) containing `i`. */
function runBounds(groups: readonly (string | null)[], i: number): [number, number] {
  const g = groups[i];
  if (g === null || g === undefined) return [i, i];
  let start = i;
  let end = i;
  while (start > 0 && groups[start - 1] === g) start -= 1;
  while (end < groups.length - 1 && groups[end + 1] === g) end += 1;
  return [start, end];
}

/** Supersets in `items`, canonically labelled A, B, C… in list order. */
export function supersetRuns(items: readonly SupersetItem[]): SupersetRun[] {
  const groups = groupsOf(items);
  const runs: SupersetRun[] = [];
  let i = 0;
  while (i < groups.length) {
    const [start, end] = runBounds(groups, i);
    if (groups[i] !== null && end > start) {
      runs.push({ label: labelFor(runs.length), start, end });
    }
    i = end + 1;
  }
  return runs;
}

function withGroups<T extends SupersetItem>(items: readonly T[], groups: (string | null)[]): T[] {
  return items.map((item, i) => {
    const g = groups[i] ?? null;
    return item.supersetGroup === g ? item : { ...item, supersetGroup: g };
  });
}

/**
 * Canonical form: runs of 2+ relabelled A, B… in order; lone letters cleared.
 * Items that are already right keep their identity.
 */
export function normalizeSupersets<T extends SupersetItem>(items: readonly T[]): T[] {
  const groups: (string | null)[] = items.map(() => null);
  for (const run of supersetRuns(items)) {
    for (let i = run.start; i <= run.end; i++) groups[i] = run.label;
  }
  return withGroups(items, groups);
}

/** Where item `index` sits in its superset (0-based `position`), or null. */
export function supersetSlot(
  items: readonly SupersetItem[],
  index: number,
): { label: string; position: number; size: number } | null {
  const run = supersetRuns(items).find((r) => index >= r.start && index <= r.end);
  return run
    ? { label: run.label, position: index - run.start, size: run.end - run.start + 1 }
    : null;
}

/** True when item `index` and the one after it are in the same superset. */
export function isSupersetWithNext(items: readonly SupersetItem[], index: number): boolean {
  const a = items[index];
  const b = items[index + 1];
  return a !== undefined && b !== undefined && a.supersetGroup !== null
    ? a.supersetGroup === b.supersetGroup
    : false;
}

/**
 * The "Superset with next" toggle. Linking merges item `index`'s group (or the
 * item alone) with the next item's group; unlinking splits the group between
 * `index` and `index + 1` (a side left with one exercise stops being a superset).
 */
export function setSupersetWithNext<T extends SupersetItem>(
  items: readonly T[],
  index: number,
  linked: boolean,
): T[] {
  if (index < 0 || index >= items.length - 1 || isSupersetWithNext(items, index) === linked) {
    return normalizeSupersets(items);
  }
  const groups = groupsOf(items);
  if (linked) {
    const [start] = runBounds(groups, index);
    const [, end] = runBounds(groups, index + 1);
    for (let i = start; i <= end; i++) groups[i] = TEMP_JOIN;
  } else {
    const [, end] = runBounds(groups, index);
    for (let i = index + 1; i <= end; i++) groups[i] = TEMP_SPLIT;
  }
  return normalizeSupersets(withGroups(items, groups));
}

/** Removes item `index`; the rest of its superset stays together (or dissolves at one). */
export function removeSupersetItem<T extends SupersetItem>(
  items: readonly T[],
  index: number,
): T[] {
  return normalizeSupersets(items.filter((_, i) => i !== index));
}

/**
 * One step up/down (the phone editors' arrows). Inside its own superset the
 * item swaps with its partner. Otherwise it leaves its superset (if any) and
 * hops over the neighbouring exercise — or over the neighbouring superset as
 * a whole, so a step never cuts another superset in half.
 */
export function moveSupersetItem<T extends SupersetItem>(
  items: readonly T[],
  index: number,
  direction: 'up' | 'down',
): T[] {
  const j = direction === 'up' ? index - 1 : index + 1;
  const item = items[index];
  const neighbour = items[j];
  if (item === undefined || neighbour === undefined) return normalizeSupersets(items);

  if (item.supersetGroup !== null && neighbour.supersetGroup === item.supersetGroup) {
    const next = [...items];
    next[index] = neighbour;
    next[j] = item;
    return normalizeSupersets(next);
  }

  const [blockStart, blockEnd] = runBounds(groupsOf(items), j);
  const rest = items.filter((_, i) => i !== index);
  // `rest` coordinates: a block above keeps its indices; a block below shifts up by one.
  const at = direction === 'up' ? blockStart : blockEnd;
  rest.splice(at, 0, { ...item, supersetGroup: null });
  return normalizeSupersets(rest);
}

/**
 * Drag-and-drop move to index `to` (an index into the list WITHOUT the item,
 * as the web reducer uses). Dropped between two members of a superset → it
 * joins it; still next to its own superset → it stays in it; else it leaves.
 */
export function moveSupersetItemTo<T extends SupersetItem>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  const item = items[from];
  if (item === undefined) return normalizeSupersets(items);
  const rest = items.filter((_, i) => i !== from);
  const at = Math.max(0, Math.min(to, rest.length));
  const before = rest[at - 1]?.supersetGroup ?? null;
  const after = rest[at]?.supersetGroup ?? null;
  let group: string | null = null;
  if (before !== null && before === after) group = before;
  else if (
    item.supersetGroup !== null &&
    (before === item.supersetGroup || after === item.supersetGroup)
  )
    group = item.supersetGroup;
  rest.splice(at, 0, { ...item, supersetGroup: group });
  return normalizeSupersets(rest);
}

// ─── Inside a session ─────────────────────────────────────────────────────────

/** `routineExerciseId` → its routine superset letter (null when none / unknown). */
export type SupersetGroupOf = (routineExerciseId: string) => string | null;

/**
 * Superset letters from the cached bootstrap: the active routine first (the
 * freshest copy after an edit), the next-workout DTO as a fallback.
 */
export function supersetGroupLookup(sources: {
  activeRoutine?: RoutineDto | null;
  nextWorkout?: NextWorkoutDto | null;
}): SupersetGroupOf {
  const byId = new Map<string, string | null>();
  for (const ex of sources.nextWorkout?.exercises ?? []) {
    byId.set(ex.routineExerciseId, ex.supersetGroup);
  }
  for (const day of sources.activeRoutine?.days ?? []) {
    for (const ex of day.exercises) byId.set(ex.id, ex.supersetGroup);
  }
  return (routineExerciseId) => byId.get(routineExerciseId) ?? null;
}

/** One session exercise's place in a superset. `memberIds` are in session order. */
export interface SessionSupersetSlot {
  label: string;
  /** 0-based position inside the superset. */
  index: number;
  size: number;
  memberIds: readonly string[];
}

type SessionExerciseRef = Pick<SessionExerciseDoc, 'id' | 'routineExerciseId' | 'position'>;

function byPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/**
 * Supersets of a running session, keyed by session-exercise id. Exercises
 * added mid-session (no routine slot) never join one; moving an exercise away
 * from its partners in the session breaks the superset for that session.
 */
export function sessionSupersets(
  exercises: readonly SessionExerciseRef[],
  groupOf: SupersetGroupOf | null,
): Map<string, SessionSupersetSlot> {
  const sorted = byPosition(exercises);
  const items = sorted.map((se) => ({
    supersetGroup: groupOf && se.routineExerciseId ? groupOf(se.routineExerciseId) : null,
  }));
  const out = new Map<string, SessionSupersetSlot>();
  for (const run of supersetRuns(items)) {
    const memberIds = sorted.slice(run.start, run.end + 1).map((se) => se.id);
    memberIds.forEach((id, index) => {
      out.set(id, { label: run.label, index, size: memberIds.length, memberIds });
    });
  }
  return out;
}

/** A compact, stable key for memoising on the grouping (not on every tick). */
export function sessionSupersetKey(supersets: ReadonlyMap<string, SessionSupersetSlot>): string {
  return [...supersets.entries()].map(([id, s]) => `${id}:${s.label}${s.index}`).join('|');
}

function workingSetsOf(se: SessionExerciseDoc): SessionSetDoc[] {
  return byPosition(se.sets).filter((s) => !s.isWarmup);
}

/** What ticking a set leads to. */
export type SetTickOutcome =
  /** Start the rest timer (a plain exercise, or the round of a superset is complete). */
  | { kind: 'rest'; restSec: number; seId: string }
  /** Superset: go straight to the same set number of the next exercise, no rest. */
  | { kind: 'advance'; seId: string; setId: string }
  /** Warm-up (or unknown ids): no rest, no move. */
  | { kind: 'none' };

/**
 * Decide the rest timer after a working set is ticked. `doc` is the session
 * AFTER the tick. In a superset, round k is "set k of every member": while a
 * member (after this one, wrapping round) still has set k unticked, focus
 * advances to it with no rest; once the round is complete the rest starts,
 * using the rest of the superset's last exercise.
 */
export function setTickOutcome(
  doc: WorkoutSessionDoc,
  supersets: ReadonlyMap<string, SessionSupersetSlot>,
  seId: string,
  setId: string,
): SetTickOutcome {
  const se = doc.exercises.find((e) => e.id === seId);
  const set = se?.sets.find((s) => s.id === setId);
  if (!se || !set || set.isWarmup) return { kind: 'none' };

  const slot = supersets.get(seId);
  if (!slot) return { kind: 'rest', restSec: se.restSec, seId };

  const round = workingSetsOf(se).findIndex((s) => s.id === setId);
  const byId = new Map(doc.exercises.map((e) => [e.id, e] as const));
  const order = [...slot.memberIds.slice(slot.index + 1), ...slot.memberIds.slice(0, slot.index)];
  for (const id of order) {
    const member = byId.get(id);
    if (!member || member.skipped) continue;
    const target = workingSetsOf(member)[round];
    if (target?.completedAt === null) {
      return { kind: 'advance', seId: id, setId: target.id };
    }
  }

  const last = [...slot.memberIds]
    .reverse()
    .map((id) => byId.get(id))
    .find((m) => m !== undefined && !m.skipped);
  return { kind: 'rest', restSec: last?.restSec ?? se.restSec, seId };
}

/** The set to do next (the screen focuses and scrolls to its exercise). */
export interface WorkoutFocus {
  seId: string;
  setId: string;
}

/**
 * The next working set to do: exercises in order, skipped ones ignored; a
 * superset is walked round by round (set 1 of each member, then set 2 …).
 */
export function workoutFocus(
  doc: WorkoutSessionDoc,
  supersets: ReadonlyMap<string, SessionSupersetSlot>,
): WorkoutFocus | null {
  const byId = new Map(doc.exercises.map((e) => [e.id, e] as const));
  const seen = new Set<string>();
  for (const se of byPosition(doc.exercises)) {
    if (seen.has(se.id)) continue;
    const slot = supersets.get(se.id);
    const members = (slot ? slot.memberIds : [se.id])
      .map((id) => byId.get(id))
      .filter((m): m is SessionExerciseDoc => m !== undefined);
    members.forEach((m) => seen.add(m.id));
    const active = members.filter((m) => !m.skipped).map((m) => ({ m, sets: workingSetsOf(m) }));
    const rounds = Math.max(0, ...active.map((a) => a.sets.length));
    for (let r = 0; r < rounds; r++) {
      for (const { m, sets } of active) {
        const s = sets[r];
        if (s?.completedAt === null) return { seId: m.id, setId: s.id };
      }
    }
  }
  return null;
}
