'use client';

import { useState, type Dispatch } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVertical, Plus } from 'lucide-react';
import { Button } from '@chefer/ui';
import type { ExerciseLookup } from '@chefer/utils';
import type { DraftAction, DraftExercise, DraftRoutine } from '../draft';
import { DayHeaderFields } from './DayHeaderFields';
import { ExerciseFieldsForm } from './ExerciseFieldsForm';

export interface DesktopEditorBoardProps {
  draft: DraftRoutine;
  dispatch: Dispatch<DraftAction>;
  lookup: ExerciseLookup;
  onAddDay: () => void;
  onOpenPicker: (dayKey: string) => void;
  onSwap: (dayKey: string, exerciseKey: string) => void;
}

/** The subset of dnd-kit's internal Transform shape useSortable() gives us. */
interface DndTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

// dnd-kit's Transform → CSS, written by hand so we don't need the separate
// @dnd-kit/utilities package (the task caps this port at exactly two new
// dependencies: @dnd-kit/core and @dnd-kit/sortable).
function transformToCss(transform: DndTransform | null): string | undefined {
  if (!transform) return undefined;
  return `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
}

function findDayKey(draft: DraftRoutine, id: string): string | undefined {
  if (draft.days.some((d) => d.key === id)) return id;
  return draft.days.find((d) => d.exercises.some((e) => e.key === id))?.key;
}

/**
 * Desktop-first strength (gym_plan.md §7 G5-B): drag-and-drop to reorder days
 * and exercises, and to move exercises between days. Cross-day moves are
 * applied live in onDragOver (so the lists visibly shuffle while dragging);
 * same-day reorders and day reorders are committed once on drop.
 */
export function DesktopEditorBoard({
  draft,
  dispatch,
  lookup,
  onAddDay,
  onOpenPicker,
  onSwap,
}: DesktopEditorBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;
    if (draft.days.some((d) => d.key === activeKey)) return; // day drags resolve on drop

    const fromDayKey = findDayKey(draft, activeKey);
    const toDayKey = findDayKey(draft, overKey);
    if (!fromDayKey || !toDayKey || fromDayKey === toDayKey) return;

    const toDay = draft.days.find((d) => d.key === toDayKey);
    if (!toDay) return;
    const overIndex = toDay.exercises.findIndex((e) => e.key === overKey);
    const toIndex = overIndex === -1 ? toDay.exercises.length : overIndex;
    dispatch({ type: 'move_exercise', fromDayKey, exerciseKey: activeKey, toDayKey, toIndex });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    if (draft.days.some((d) => d.key === activeKey)) {
      const fromIndex = draft.days.findIndex((d) => d.key === activeKey);
      const toIndex = draft.days.findIndex((d) => d.key === overKey);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        dispatch({ type: 'move_day', fromIndex, toIndex });
      }
      return;
    }

    const dayKey = findDayKey(draft, activeKey);
    const overDayKey = findDayKey(draft, overKey);
    if (!dayKey || overDayKey !== dayKey) return; // cross-day moves already applied in onDragOver
    const day = draft.days.find((d) => d.key === dayKey);
    if (!day) return;
    const fromIndex = day.exercises.findIndex((e) => e.key === activeKey);
    const toIndex =
      overKey === dayKey
        ? day.exercises.length - 1
        : day.exercises.findIndex((e) => e.key === overKey);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      dispatch({
        type: 'move_exercise',
        fromDayKey: dayKey,
        exerciseKey: activeKey,
        toDayKey: dayKey,
        toIndex,
      });
    }
  };

  const activeDay = activeId ? draft.days.find((d) => d.key === activeId) : undefined;
  const activeExercise = activeId
    ? draft.days.flatMap((d) => d.exercises).find((e) => e.key === activeId)
    : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={draft.days.map((d) => d.key)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {draft.days.map((day) => (
            <DayColumn
              key={day.key}
              day={day}
              dispatch={dispatch}
              lookup={lookup}
              canDelete={draft.days.length > 1}
              onOpenPicker={onOpenPicker}
              onSwap={onSwap}
            />
          ))}
          <button
            type="button"
            onClick={onAddDay}
            className="flex h-24 w-48 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-600"
          >
            <Plus className="h-5 w-5" />
            Add day
          </button>
        </div>
      </SortableContext>

      <DragOverlay>
        {activeDay && (
          <div className="w-72 rounded-2xl border border-gray-300 bg-white p-3 shadow-xl">
            <p className="text-sm font-semibold text-gray-900">{activeDay.name}</p>
          </div>
        )}
        {activeExercise && (
          <div className="w-72 rounded-xl border border-gray-300 bg-white p-3 shadow-xl">
            <p className="truncate text-sm font-medium text-gray-900">
              {lookup(activeExercise.exerciseId)?.name ?? activeExercise.exerciseId}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface DayColumnProps {
  day: DraftRoutine['days'][number];
  dispatch: Dispatch<DraftAction>;
  lookup: ExerciseLookup;
  canDelete: boolean;
  onOpenPicker: (dayKey: string) => void;
  onSwap: (dayKey: string, exerciseKey: string) => void;
}

function DayColumn({ day, dispatch, lookup, canDelete, onOpenPicker, onSwap }: DayColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.key,
  });
  const style = {
    transform: transformToCss(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3"
    >
      <DayHeaderFields
        name={day.name}
        plannedWeekday={day.plannedWeekday}
        onRename={(name) => dispatch({ type: 'rename_day', dayKey: day.key, name })}
        onWeekdayChange={(weekday) =>
          dispatch({ type: 'set_day_weekday', dayKey: day.key, weekday })
        }
        onDuplicate={() => dispatch({ type: 'duplicate_day', dayKey: day.key })}
        onDelete={() => dispatch({ type: 'delete_day', dayKey: day.key })}
        canDelete={canDelete}
        leading={
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder this day"
            className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-gray-400 hover:text-gray-600 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />

      <SortableContext
        items={day.exercises.map((e) => e.key)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {day.exercises.map((exercise) => (
            <SortableExerciseRow
              key={exercise.key}
              dayKey={day.key}
              exercise={exercise}
              lookup={lookup}
              dispatch={dispatch}
              onSwap={() => onSwap(day.key, exercise.key)}
            />
          ))}
          {day.exercises.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400">
              Drop an exercise here
            </p>
          )}
        </div>
      </SortableContext>

      <Button type="button" variant="outline" size="sm" onClick={() => onOpenPicker(day.key)}>
        <Plus className="h-4 w-4" /> Add exercise
      </Button>
    </div>
  );
}

interface SortableExerciseRowProps {
  dayKey: string;
  exercise: DraftExercise;
  lookup: ExerciseLookup;
  dispatch: Dispatch<DraftAction>;
  onSwap: () => void;
}

function SortableExerciseRow({
  dayKey,
  exercise,
  lookup,
  dispatch,
  onSwap,
}: SortableExerciseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.key,
  });
  const style = {
    transform: transformToCss(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ExerciseFieldsForm
        exercise={exercise}
        lookup={lookup}
        onChange={(patch) =>
          dispatch({ type: 'update_exercise', dayKey, exerciseKey: exercise.key, patch })
        }
        onSwap={onSwap}
        onRemove={() => dispatch({ type: 'remove_exercise', dayKey, exerciseKey: exercise.key })}
        leading={
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder this exercise"
            className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}
