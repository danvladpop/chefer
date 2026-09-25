'use client';

import { useEffect, useState } from 'react';
import { loadExerciseNote, saveExerciseNote } from './exercise-note';

// A sticky personal note per exercise (gym_plan.md §1.3), device-local only.
// Loaded after mount (it touches localStorage) and saved on blur / debounce
// so typing doesn't hit storage on every keystroke.

export function ExerciseNoteEditor({ exerciseId }: { exerciseId: string }) {
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setNote(loadExerciseNote(exerciseId));
    setSaved(true);
  }, [exerciseId]);

  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => {
      saveExerciseNote(exerciseId, note);
      setSaved(true);
    }, 500);
    return () => clearTimeout(t);
  }, [note, saved, exerciseId]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Your note
        </p>
        <span className="text-[11px] text-neutral-400">
          {saved ? 'Saved on this device' : 'Saving…'}
        </span>
      </div>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        placeholder="Pause reps, cue reminders, machine number…"
        rows={3}
        maxLength={500}
        className="w-full resize-none rounded-xl border border-neutral-200 bg-white p-3 text-sm focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00]"
      />
    </div>
  );
}
