// Pure model for the trainer's workout templates on the web (trainer-mode.md
// §6.6, M2). The editor works on the routine editor's own draft shape (one
// day, `role="template"`), so the same components edit both; this module
// converts that draft to and from the template document. The rules both apps
// share (search, validation, the assign and update sheets) are in
// `@chefer/utils` (coaching/templates).
import { makeKey, type DraftRoutine } from '@/features/gym/routine/draft';
import type { Translator } from '@chefer/i18n';
import type {
  TemplateDoc,
  WorkoutTemplateAssignmentDto,
  WorkoutTemplateDto,
  WorkoutTemplateSummaryDto,
  WorkoutType,
} from '@chefer/types';
import { normalizeSupersets, workoutTypeLabel } from '@chefer/utils';

/** The editor route for a template not created yet. */
export const NEW_TEMPLATE_ID = 'new';

export interface TemplateDraft {
  name: string;
  workoutType: WorkoutType | null;
  /** One day: the template's exercises in the routine editor's shape. */
  rows: DraftRoutine;
}

/** A fresh, unsaved template: no name, no type, no exercises. */
export function emptyTemplateDraft(): TemplateDraft {
  return {
    name: '',
    workoutType: null,
    rows: {
      id: NEW_TEMPLATE_ID,
      name: '',
      days: [{ key: makeKey('day'), name: 'Template', plannedWeekday: null, exercises: [] }],
    },
  };
}

/** The server's template as an editor draft (rows keep their ids). */
export function fromTemplateDto(template: WorkoutTemplateDto): TemplateDraft {
  return {
    name: template.name,
    workoutType: template.workoutType,
    rows: {
      id: template.id,
      name: template.name,
      days: [
        {
          key: makeKey('day'),
          name: template.name,
          plannedWeekday: null,
          exercises: normalizeSupersets(
            template.exercises
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((row) => ({
                key: makeKey('ex'),
                id: row.id,
                exerciseId: row.exerciseId,
                sets: row.sets,
                repMin: row.repMin,
                repMax: row.repMax,
                targetRir: row.targetRir,
                restSec: row.restSec,
                supersetGroup: row.supersetGroup,
                notes: null,
                trainerNote: row.trainerNote,
                defaultLoadKg: row.defaultLoadKg,
              })),
          ),
        },
      ],
    },
  };
}

/** Draft → `trainer.templates.create` / `.save` document. Name and notes trimmed; empty note = none. */
export function toTemplateDoc(draft: TemplateDraft): TemplateDoc {
  const day = draft.rows.days[0];
  return {
    name: draft.name.trim(),
    workoutType: draft.workoutType,
    exercises: (day?.exercises ?? []).map((row) => {
      const note = row.trainerNote?.trim() ?? '';
      return {
        ...(row.id ? { id: row.id } : {}),
        exerciseId: row.exerciseId,
        sets: row.sets,
        repMin: row.repMin,
        repMax: row.repMax,
        targetRir: row.targetRir,
        restSec: row.restSec,
        supersetGroup: row.supersetGroup,
        defaultLoadKg: row.defaultLoadKg ?? null,
        trainerNote: note === '' ? null : note,
      };
    }),
  };
}

/** A stable comparison key for "has this changed since the last save". */
export function templateDocKey(doc: TemplateDoc): string {
  return JSON.stringify(doc);
}

/** Shared with mobile: a new template is created only once it has a name plus an exercise or a type. */
export { hasTemplateContent } from '@chefer/utils';

// ─── Template labels in the UI language (Lane J, ADR 0004) ────────────────────
// The translated twins of @chefer/utils' `templateSummaryLine` and
// `templateAssignmentStatusText` (which still write English). Kept identical
// on web and mobile until they move to a shared home.

/** A library row's detail line: "Lower body · 5 exercises · ~45 min". */
export function templateSummaryText(tr: Translator, row: WorkoutTemplateSummaryDto): string {
  return [
    row.workoutType ? workoutTypeLabel(row.workoutType) : null,
    tr.t('trainer.templates.library.exercises', { count: row.exerciseCount }),
    row.estimatedMin !== null
      ? tr.t('trainer.templates.library.minutes', { n: row.estimatedMin })
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** "Not assigned yet" / "Assigned to 3 clients". */
export function templateAssignedText(tr: Translator, count: number): string {
  return count === 0
    ? tr.t('trainer.templates.library.notAssigned')
    : tr.t('trainer.templates.library.assigned', { count });
}

/** "Older version" or "Up to date", plus "Edited since" when someone changed the day. */
export function templateAssignmentStatusLabel(
  tr: Translator,
  a: Pick<WorkoutTemplateAssignmentDto, 'outdated' | 'editedSince'>,
): string {
  const version = a.outdated
    ? tr.t('trainer.templates.update.olderVersion')
    : tr.t('trainer.templates.update.upToDate');
  return a.editedSince
    ? `${version} · ${tr.t('trainer.templates.update.editedSinceLabel')}`
    : version;
}
