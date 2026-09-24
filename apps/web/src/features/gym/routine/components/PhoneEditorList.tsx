'use client';

import type { Dispatch } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { Button } from '@chefer/ui';
import type { ExerciseLookup } from '@chefer/utils';
import type { DraftAction, DraftRoutine } from '../draft';
import { DayHeaderFields } from './DayHeaderFields';
import { ExerciseFieldsForm } from './ExerciseFieldsForm';

export interface PhoneEditorListProps {
  draft: DraftRoutine;
  dispatch: Dispatch<DraftAction>;
  lookup: ExerciseLookup;
  onAddDay: () => void;
  onOpenPicker: (dayKey: string) => void;
  onSwap: (dayKey: string, exerciseKey: string) => void;
}

const exerciseMoveButtonCls =
  'flex h-[18px] w-9 items-center justify-center text-gray-400 transition-colors hover:text-gray-600 disabled:pointer-events-none disabled:opacity-20';

/** Phone-width editor: move-up/down buttons and a "move to day" select instead of drag. */
export function PhoneEditorList({
  draft,
  dispatch,
  lookup,
  onAddDay,
  onOpenPicker,
  onSwap,
}: PhoneEditorListProps) {
  return (
    <div className="flex flex-col gap-4 lg:hidden">
      {draft.days.map((day, dayIndex) => (
        <div key={day.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <DayHeaderFields
            name={day.name}
            plannedWeekday={day.plannedWeekday}
            onRename={(name) => dispatch({ type: 'rename_day', dayKey: day.key, name })}
            onWeekdayChange={(weekday) =>
              dispatch({ type: 'set_day_weekday', dayKey: day.key, weekday })
            }
            onDuplicate={() => dispatch({ type: 'duplicate_day', dayKey: day.key })}
            onDelete={() => dispatch({ type: 'delete_day', dayKey: day.key })}
            canDelete={draft.days.length > 1}
            leading={
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label="Move day up"
                  disabled={dayIndex === 0}
                  onClick={() =>
                    dispatch({ type: 'move_day', fromIndex: dayIndex, toIndex: dayIndex - 1 })
                  }
                  className="flex h-4 w-9 items-center justify-center text-gray-400 disabled:opacity-20"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move day down"
                  disabled={dayIndex === draft.days.length - 1}
                  onClick={() =>
                    dispatch({ type: 'move_day', fromIndex: dayIndex, toIndex: dayIndex + 1 })
                  }
                  className="flex h-4 w-9 items-center justify-center text-gray-400 disabled:opacity-20"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            }
          />

          <div className="mt-3 flex flex-col gap-2.5">
            {day.exercises.map((exercise, exIndex) => (
              <div key={exercise.key} className="flex flex-col gap-1.5">
                <ExerciseFieldsForm
                  exercise={exercise}
                  lookup={lookup}
                  onChange={(patch) =>
                    dispatch({
                      type: 'update_exercise',
                      dayKey: day.key,
                      exerciseKey: exercise.key,
                      patch,
                    })
                  }
                  onSwap={() => onSwap(day.key, exercise.key)}
                  onRemove={() =>
                    dispatch({
                      type: 'remove_exercise',
                      dayKey: day.key,
                      exerciseKey: exercise.key,
                    })
                  }
                  leading={
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label="Move exercise up"
                        disabled={exIndex === 0}
                        className={exerciseMoveButtonCls}
                        onClick={() =>
                          dispatch({
                            type: 'move_exercise',
                            fromDayKey: day.key,
                            exerciseKey: exercise.key,
                            toDayKey: day.key,
                            toIndex: exIndex - 1,
                          })
                        }
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move exercise down"
                        disabled={exIndex === day.exercises.length - 1}
                        className={exerciseMoveButtonCls}
                        onClick={() =>
                          dispatch({
                            type: 'move_exercise',
                            fromDayKey: day.key,
                            exerciseKey: exercise.key,
                            toDayKey: day.key,
                            toIndex: exIndex + 1,
                          })
                        }
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  }
                />
                {draft.days.length > 1 && (
                  <label className="flex items-center gap-2 pl-1 text-xs text-gray-400">
                    Move to
                    <select
                      value=""
                      onChange={(e) => {
                        const toDayKey = e.target.value;
                        if (!toDayKey) return;
                        const toDay = draft.days.find((d) => d.key === toDayKey);
                        dispatch({
                          type: 'move_exercise',
                          fromDayKey: day.key,
                          exerciseKey: exercise.key,
                          toDayKey,
                          toIndex: toDay?.exercises.length ?? 0,
                        });
                      }}
                      className="h-7 rounded-md border border-gray-200 bg-white px-1.5 text-xs text-gray-600 focus:border-gray-400 focus:outline-none"
                    >
                      <option value="">another day…</option>
                      {draft.days
                        .filter((d) => d.key !== day.key)
                        .map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => onOpenPicker(day.key)}
          >
            <Plus className="h-4 w-4" /> Add exercise
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={onAddDay}>
        <Plus className="h-4 w-4" /> Add day
      </Button>
    </div>
  );
}
