import { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import type { ExerciseDto, SessionExerciseDoc, WeightUnit } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { cn, explain, explainInputs, formatLoad } from '@chefer/utils';
import { exerciseImageUrl } from '../library/exercise-image';
import type { ExerciseHistoryEntry } from './workout-model';

// Sheets opened from an exercise card. They live once at screen level (not one
// Modal per card) and are driven by the screen's sheet state.

// ─── Technique ────────────────────────────────────────────────────────────────

export function youtubeUrl(videoId: string, startSec: number | null): string {
  return `https://youtu.be/${videoId}${startSec ? `?t=${startSec}` : ''}`;
}

export function TechniqueSheet({
  visible,
  onClose,
  exercise,
}: {
  visible: boolean;
  onClose: () => void;
  exercise: ExerciseDto | null;
}) {
  const images = exercise
    ? [exerciseImageUrl(exercise, 0), exerciseImageUrl(exercise, 1)].filter(
        (u): u is string => u !== null,
      )
    : [];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={exercise?.name ?? 'Technique'}
      eyebrow="Technique"
      testID="technique-sheet"
    >
      {images.length > 0 ? (
        <View className="flex-row gap-2">
          {images.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{ flex: 1, aspectRatio: 1, borderRadius: 12 }}
              contentFit="cover"
              cachePolicy="disk"
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
      ) : null}
      {exercise?.videoId ? (
        <Button
          testID="technique-sheet-video"
          variant="outline"
          onPress={() => {
            if (exercise.videoId) {
              Linking.openURL(youtubeUrl(exercise.videoId, exercise.videoStartSec)).catch(
                () => undefined,
              );
            }
          }}
        >
          ▶ Watch technique
        </Button>
      ) : null}
      {exercise && exercise.cues.length > 0 ? (
        <View className="gap-1">
          <Text variant="label">Focus on</Text>
          {exercise.cues.map((cue) => (
            <Text key={cue} className="text-sm">
              • {cue}
            </Text>
          ))}
        </View>
      ) : null}
      {exercise && exercise.mistakes.length > 0 ? (
        <View className="gap-1">
          <Text variant="label">Avoid</Text>
          {exercise.mistakes.map((m) => (
            <Text key={m} className="text-sm">
              • {m}
            </Text>
          ))}
        </View>
      ) : null}
      {exercise?.cues.length === 0 && exercise.mistakes.length === 0 ? (
        <Text variant="muted">No coaching notes for this exercise yet.</Text>
      ) : null}
    </Sheet>
  );
}

// ─── Why? ─────────────────────────────────────────────────────────────────────

export function WhySheet({
  visible,
  onClose,
  exercise,
  name,
  unit,
}: {
  visible: boolean;
  onClose: () => void;
  exercise: SessionExerciseDoc | null;
  name: string;
  unit: WeightUnit;
}) {
  const rows = exercise ? explainInputs(exercise.prescription, unit) : [];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={name}
      eyebrow="Why this target"
      testID="why-sheet"
    >
      {exercise ? (
        <Text testID="why-sheet-sentence" className="text-base">
          {explain(exercise.prescription, unit)}
        </Text>
      ) : null}
      <View className="gap-2">
        {rows.map((row) => (
          <View
            key={row.label}
            className="flex-row justify-between gap-3 border-b border-border py-2"
          >
            <Text variant="muted">{row.label}</Text>
            <Text className="min-w-0 flex-1 text-right text-sm font-medium">{row.value}</Text>
          </View>
        ))}
      </View>
      <Text variant="muted" className="text-xs">
        Change any number freely: the next suggestion uses what you actually lift.
      </Text>
    </Sheet>
  );
}

// ─── ⋯ menu (actions, swap scope, note, history) ─────────────────────────────

export type SwapScope = 'today' | 'routine';

export interface ExerciseMenuProps {
  visible: boolean;
  onClose: () => void;
  exercise: SessionExerciseDoc | null;
  name: string;
  isFirst: boolean;
  isLast: boolean;
  /** null = "Update routine" is available; otherwise the sentence explaining why not. */
  routineBlockedReason: string | null;
  history: ExerciseHistoryEntry[];
  unit: WeightUnit;
  loadType: ExerciseDto['loadType'];
  onSwap: (scope: SwapScope) => void;
  onSkip: () => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onSaveNote: (note: string | null) => void;
}

type MenuPage = 'actions' | 'swap' | 'note' | 'history';

function MenuRow({
  testID,
  label,
  hint,
  onPress,
  disabled = false,
  destructive = false,
}: {
  testID: string;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-12 justify-center border-b border-border px-1 py-2 active:bg-muted',
        disabled && 'opacity-50',
      )}
    >
      <Text className={cn('text-base font-medium', destructive && 'text-destructive')}>
        {label}
      </Text>
      {hint ? (
        <Text variant="muted" className="text-xs">
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ExerciseMenuSheet(props: ExerciseMenuProps) {
  const { visible, onClose, exercise, name, isFirst, isLast, routineBlockedReason } = props;
  const [page, setPage] = useState<MenuPage>('actions');
  const [note, setNote] = useState(exercise?.notes ?? '');
  const hasOpenSet = exercise?.sets.some((s) => !s.isWarmup && s.completedAt === null) ?? false;

  const titles: Record<MenuPage, string> = {
    actions: name,
    swap: `Swap ${name}`,
    note: 'Note',
    history: 'History',
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={titles[page]}
      eyebrow={page === 'actions' ? undefined : name}
      testID="exercise-menu"
    >
      {page === 'actions' && exercise ? (
        <View>
          <MenuRow testID="menu-swap" label="Swap exercise" onPress={() => setPage('swap')} />
          <MenuRow
            testID="menu-skip"
            label={exercise.skipped ? 'Unskip exercise' : 'Skip exercise'}
            hint={exercise.skipped ? undefined : 'Skipping never counts as a miss.'}
            onPress={props.onSkip}
          />
          <MenuRow testID="menu-add-set" label="Add set" onPress={props.onAddSet} />
          <MenuRow
            testID="menu-remove-set"
            label="Remove a set"
            hint={hasOpenSet ? 'Removes the last set you haven’t logged.' : 'Every set is logged.'}
            disabled={!hasOpenSet}
            onPress={props.onRemoveSet}
          />
          <MenuRow
            testID="menu-move-up"
            label="Move up"
            disabled={isFirst}
            onPress={() => props.onMove('up')}
          />
          <MenuRow
            testID="menu-move-down"
            label="Move down"
            disabled={isLast}
            onPress={() => props.onMove('down')}
          />
          <MenuRow
            testID="menu-note"
            label={exercise.notes ? 'Edit note' : 'Add note'}
            onPress={() => {
              setNote(exercise.notes ?? '');
              setPage('note');
            }}
          />
          <MenuRow
            testID="menu-history"
            label="Exercise history"
            onPress={() => setPage('history')}
          />
        </View>
      ) : null}

      {page === 'swap' ? (
        <View className="gap-3">
          <Text variant="muted">Pick where the change applies, then choose the exercise.</Text>
          <Button testID="menu-swap-today" size="lg" onPress={() => props.onSwap('today')}>
            Just today
          </Button>
          <Button
            testID="menu-swap-routine"
            size="lg"
            variant="outline"
            disabled={routineBlockedReason !== null}
            onPress={() => props.onSwap('routine')}
          >
            Today and my routine
          </Button>
          {routineBlockedReason ? (
            <Text testID="menu-swap-routine-blocked" variant="muted">
              {routineBlockedReason}
            </Text>
          ) : null}
          <Button testID="menu-back" variant="ghost" onPress={() => setPage('actions')}>
            Back
          </Button>
        </View>
      ) : null}

      {page === 'note' ? (
        <View className="gap-3">
          <TextInput
            testID="menu-note-input"
            value={note}
            onChangeText={setNote}
            placeholder="Seat height, grip, a cue…"
            multiline
            maxLength={500}
            className="min-h-24 rounded-xl border border-border bg-background p-3 text-base"
            textAlignVertical="top"
          />
          <Button
            testID="menu-note-save"
            onPress={() => props.onSaveNote(note.trim() === '' ? null : note.trim())}
          >
            Save note
          </Button>
          <Button variant="ghost" onPress={() => setPage('actions')}>
            Back
          </Button>
        </View>
      ) : null}

      {page === 'history' ? (
        <View className="gap-2">
          {props.history.length === 0 ? (
            <Text variant="muted">No history yet. This will be the first time.</Text>
          ) : (
            props.history.map((h) => (
              <View
                key={h.sessionId}
                testID={`menu-history-${h.sessionId}`}
                className="gap-0.5 border-b border-border py-2"
              >
                <Text className="text-sm font-medium">{h.localDate}</Text>
                <Text variant="muted">
                  {h.sets
                    .map((s) =>
                      props.loadType === 'BODYWEIGHT'
                        ? String(s.reps)
                        : `${formatLoad(s.weightKg, props.unit, props.loadType)} × ${s.reps}`,
                    )
                    .join(', ')}
                  {h.lastSetRir !== null
                    ? ` · ${h.lastSetRir >= 3 ? '3+' : String(h.lastSetRir)} left`
                    : ''}
                </Text>
              </View>
            ))
          )}
          <Button variant="ghost" onPress={() => setPage('actions')}>
            Back
          </Button>
        </View>
      ) : null}
    </Sheet>
  );
}
