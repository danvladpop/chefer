// A client who still needs gym setup leaves the join page (or a trainer's
// profile in Find a trainer) for /gym/setup. Where they were is kept on this
// device (never sent anywhere) so Gym Today can offer to carry on afterwards.

const KEY = 'chefer.coaching.pendingJoin';
const TRAINER_KEY = 'chefer.coaching.pendingTrainer';

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the link still works when opened again.
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

export function rememberPendingJoin(code: string): void {
  write(KEY, code);
}

export function readPendingJoin(): string | null {
  return read(KEY);
}

export function clearPendingJoin(): void {
  remove(KEY);
}

/** Find a trainer: the trainer whose profile sent the client to gym setup. */
export function rememberPendingTrainer(trainerId: string): void {
  write(TRAINER_KEY, trainerId);
}

export function clearPendingTrainer(): void {
  remove(TRAINER_KEY);
}

/** Where "Carry on joining your trainer" goes: the invite first, else the trainer's profile. */
export function readPendingJoinPath(): string | null {
  const code = read(KEY);
  if (code) return `/coaching/join/${code}`;
  const trainerId = read(TRAINER_KEY);
  return trainerId ? `/coaching/trainers/${encodeURIComponent(trainerId)}` : null;
}

export function clearAllPendingJoins(): void {
  remove(KEY);
  remove(TRAINER_KEY);
}
