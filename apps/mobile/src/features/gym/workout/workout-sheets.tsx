import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import {
  HIDDEN_EXERCISE_IMAGE_IDS,
  type ExerciseDto,
  type SessionExerciseDoc,
  type WeightUnit,
} from '@chefer/types';
import { Button, ExplainSheet, Sheet, Text } from '@chefer/ui-mobile';
import { cn, explain, explainInputs, formatLoad } from '@chefer/utils';
import { ExerciseImage } from '../components/exercise-image';
import { ExerciseVideoSheet } from '../library-screens/exercise-video-sheet';
import { exerciseImageUrl } from '../library/exercise-image';
import { isAtSetCap, SET_CAP_REASON } from './caps';
import type { ExerciseHistoryEntry } from './workout-model';

// Sheets opened from an exercise card. They live once at screen level (not one
// Modal per card) and are driven by the screen's sheet state.

// ─── Technique ────────────────────────────────────────────────────────────────

type VideoRequest = { videoId: string; startSec: number; channel: string | null };

export function TechniqueSheet({
  visible,
  onClose,
  exercise,
}: {
  visible: boolean;
  onClose: () => void;
  exercise: ExerciseDto | null;
}) {
  // R-16: "Watch technique" plays in the in-app video sheet instead of
  // throwing the user out to YouTube mid-set. iOS refuses to present a Modal
  // while another is still dismissing, so the technique sheet closes first and
  // the video sheet opens from its `onExited` (never two Modals stacked). The
  // video's details are captured at tap time because the parent clears its
  // sheet content once this sheet is gone.
  const [pendingVideo, setPendingVideo] = useState<VideoRequest | null>(null);
  const [video, setVideo] = useState<VideoRequest | null>(null);
  const images = exercise
    ? [exerciseImageUrl(exercise, 0), exerciseImageUrl(exercise, 1)].filter(
        (u): u is string => u !== null,
      )
    : [];
  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title={exercise?.name ?? 'Technique'}
        eyebrow="Technique"
        testID="technique-sheet"
        onExited={() => {
          if (pendingVideo) {
            setVideo(pendingVideo);
            setPendingVideo(null);
          }
        }}
      >
        {exercise ? (
          <View className="flex-row gap-2">
            {images.length > 0 ? (
              images.map((uri, i) => (
                <View key={uri} className="flex-1 overflow-hidden rounded-xl">
                  <ExerciseImage
                    uri={uri}
                    equipment={exercise.equipment}
                    name={exercise.name}
                    size="hero"
                    hidden={HIDDEN_EXERCISE_IMAGE_IDS.has(exercise.id)}
                    analyticsExerciseId={exercise.ownerId ? 'custom' : exercise.id}
                    testID={`technique-sheet-image-${i}`}
                  />
                </View>
              ))
            ) : (
              <View className="flex-1 overflow-hidden rounded-xl">
                <ExerciseImage
                  uri={null}
                  equipment={exercise.equipment}
                  name={exercise.name}
                  size="hero"
                  analyticsExerciseId={exercise.ownerId ? 'custom' : exercise.id}
                  testID="technique-sheet-image-0"
                />
              </View>
            )}
          </View>
        ) : null}
        {exercise?.videoId ? (
          <Button
            testID="technique-sheet-video"
            variant="outline"
            onPress={() => {
              if (!exercise.videoId) return;
              setPendingVideo({
                videoId: exercise.videoId,
                startSec: exercise.videoStartSec ?? 0,
                channel: exercise.videoChannel,
              });
              onClose();
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
      {video ? (
        <ExerciseVideoSheet
          visible
          onClose={() => setVideo(null)}
          videoId={video.videoId}
          startSec={video.startSec}
          channel={video.channel}
          testID="technique-video-sheet"
        />
      ) : null}
    </>
  );
}

// ─── Why? ─────────────────────────────────────────────────────────────────────

export function WhySheet({
  visible,
  onClose,
  exercise,
  name,
  unit,
  setBy = null,
}: {
  visible: boolean;
  onClose: () => void;
  exercise: SessionExerciseDoc | null;
  name: string;
  unit: WeightUnit;
  /** Trainer coaching: who set a trainer-set target ("Ana"); "Set by Ana" replaces "Your own target". */
  setBy?: string | null;
}) {
  // D2 protected (gym-why-sheet.test.tsx pins the exact copy/testIDs): this
  // is the gym instance of the kit ExplainSheet (PAT-1, T-00.1) — same
  // sentence, rows and footnote as before the refactor, unchanged.
  return (
    <ExplainSheet
      visible={visible}
      onClose={onClose}
      title={name}
      eyebrow="Why this target"
      testID="why-sheet"
      sentence={exercise ? explain(exercise.prescription, unit, 'today', setBy) : undefined}
      rows={exercise ? explainInputs(exercise.prescription, unit, setBy) : []}
      footnote="Change any number freely: the next suggestion uses what you actually lift."
    />
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
  /**
   * WP-04 (feedback 2): false for a freestyle session (no routine) or an
   * exercise that isn't a routine slot — there is nothing to ask, so Swap
   * goes straight to the picker as "Just today". Default true (scope page).
   */
  swapAsksScope?: boolean;
  history: ExerciseHistoryEntry[];
  unit: WeightUnit;
  loadType: ExerciseDto['loadType'];
  /** UX-GYM-19: dumbbell / kettlebell loads read "20 kg each". */
  perHand?: boolean;
  onSwap: (scope: SwapScope) => void;
  onSkip: () => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onSaveNote: (note: string | null) => void;
  /**
   * UX-44 (T-44.3): `edit` is a past workout — `Replace exercise` goes straight
   * to the picker (this workout only, never the routine: no scope page),
   * `Remove from this workout` drops the exercise, and Skip is hidden.
   */
  mode?: 'live' | 'edit' | 'log';
  /** `Remove exercise` (live) / `Remove from this workout` (edit). */
  onRemoveExercise?: () => void;
  /** plan-library-supersets S2: "Superset" (live only) — opens the pick sheet with this exercise ticked. */
  onSuperset?: () => void;
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
        <Text variant="muted" className="text-sm">
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ExerciseMenuSheet(props: ExerciseMenuProps) {
  const { visible, onClose, exercise, name, isFirst, isLast, routineBlockedReason } = props;
  const swapAsksScope = props.swapAsksScope ?? true;
  // Log mode (a new past workout) is edit mode where every listed set counts.
  const logging = props.mode === 'log';
  const editing = props.mode === 'edit' || logging;
  const [page, setPage] = useState<MenuPage>('actions');
  const [note, setNote] = useState(exercise?.notes ?? '');
  // UX-05 A1 (T-05.A1.2): renamed "Remove last set" — it removes the last
  // unlogged set, or (once every set is logged) the last set outright.
  const hasWorkingSet = exercise?.sets.some((s) => !s.isWarmup) ?? false;
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
          {editing ? (
            <>
              <MenuRow
                testID="menu-replace"
                label="Replace exercise"
                hint="Changes this workout only."
                onPress={() => props.onSwap('today')}
              />
              <MenuRow
                testID="menu-remove-exercise"
                label="Remove from this workout"
                destructive
                onPress={() => props.onRemoveExercise?.()}
              />
            </>
          ) : (
            <>
              <MenuRow
                testID="menu-swap"
                label="Swap exercise"
                onPress={() => (swapAsksScope ? setPage('swap') : props.onSwap('today'))}
              />
              <MenuRow
                testID="menu-skip"
                label={exercise.skipped ? 'Unskip exercise' : 'Skip exercise'}
                hint={exercise.skipped ? undefined : 'Skipping never counts as a miss.'}
                onPress={props.onSkip}
              />
              {/* Owner dogfood 2026-09-30: an exercise added by mistake must be
                  removable, not just skippable. Undo comes from the snackbar. */}
              <MenuRow
                testID="menu-remove-exercise"
                label="Remove exercise"
                hint="Removes it from this workout only."
                destructive
                onPress={() => props.onRemoveExercise?.()}
              />
            </>
          )}
          <MenuRow
            testID="menu-add-set"
            label="Add set"
            hint={isAtSetCap(exercise.sets.length) ? SET_CAP_REASON : undefined}
            disabled={isAtSetCap(exercise.sets.length)}
            onPress={props.onAddSet}
          />
          <MenuRow
            testID="menu-remove-set"
            label="Remove last set"
            hint={
              logging && hasWorkingSet
                ? 'Removes the last set.'
                : hasOpenSet
                  ? 'Removes the last set you haven’t logged.'
                  : hasWorkingSet
                    ? 'Removes the last set.'
                    : 'No sets to remove.'
            }
            disabled={!hasWorkingSet}
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
          {!editing && props.onSuperset ? (
            <MenuRow
              testID="menu-superset"
              label="Superset"
              hint="Do it back to back with other exercises."
              onPress={props.onSuperset}
            />
          ) : null}
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
            accessibilityLabel="Exercise note"
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
                        : `${formatLoad(s.weightKg, props.unit, props.loadType, { each: props.perHand })} × ${s.reps}`,
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
