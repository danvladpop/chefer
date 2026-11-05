// ─── Trainer coaching: automated weekly check-ins (lane K3) ───────────────────
// Owner decision 2026-10-22: a trainer turns on a short weekly check-in; each
// of their clients gets an in-app prompt (and an email) on the trainer's
// check-in day, answers a few 1–5 questions and an optional note, and the
// trainer sees the answers with their history in the client's page.
//
// The questions are a fixed catalogue (not free text), so they read the same
// on web and mobile, translate, and never carry a trainer's free text into a
// client's inbox. The client's note is opaque: never sent to AI or analytics.

import { z } from 'zod';
import { localDateSchema } from '../gym/schemas';
import { coachingClientIdSchema, coachingSourceSchema } from './schemas';

/** The catalogue. `low` / `high` label the ends of the 1–5 scale. */
export const CHECK_IN_QUESTIONS = {
  ENERGY: { label: 'Energy', low: 'Very low', high: 'Great' },
  HUNGER: { label: 'Hunger', low: 'Rarely hungry', high: 'Hungry all the time' },
  SLEEP: { label: 'Sleep', low: 'Poor', high: 'Great' },
  STRESS: { label: 'Stress', low: 'Calm', high: 'Very stressed' },
  ADHERENCE: { label: 'Sticking to the plan', low: 'Not at all', high: 'Fully' },
  SORENESS: { label: 'Soreness', low: 'None', high: 'Very sore' },
  MOOD: { label: 'Mood', low: 'Low', high: 'Great' },
} as const;

export const CHECK_IN_QUESTION_KEYS = Object.keys(CHECK_IN_QUESTIONS) as [
  keyof typeof CHECK_IN_QUESTIONS,
  ...(keyof typeof CHECK_IN_QUESTIONS)[],
];
export const checkInQuestionSchema = z.enum(CHECK_IN_QUESTION_KEYS);
export type CheckInQuestion = z.infer<typeof checkInQuestionSchema>;

/** What a trainer starts from when turning check-ins on. */
export const DEFAULT_CHECK_IN_QUESTIONS: readonly CheckInQuestion[] = [
  'ENERGY',
  'HUNGER',
  'SLEEP',
  'ADHERENCE',
];

export const CHECK_IN_LIMITS = {
  maxQuestions: 6,
  noteMaxChars: 500,
  /** `trainer.client.checkIns` returns the last N periods. */
  historyItems: 12,
  /** Sunday: the default check-in weekday (0 = Monday … 6 = Sunday). */
  defaultDay: 6,
  /** The email goes out on the check-in day from this hour (UTC). */
  emailHourUtc: 8,
} as const;

// ─── Inputs ───────────────────────────────────────────────────────────────────

export const checkInDaySchema = z.number().int().min(0).max(6);

/** `trainer.checkIns.saveConfig`. */
export const saveCheckInConfigInputSchema = z.object({
  enabled: z.boolean(),
  day: checkInDaySchema,
  questions: z
    .array(checkInQuestionSchema)
    .min(1)
    .max(CHECK_IN_LIMITS.maxQuestions)
    .refine((q) => new Set(q).size === q.length, { message: 'Each question once.' }),
});
export type SaveCheckInConfigInput = z.infer<typeof saveCheckInConfigInputSchema>;

/** `coaching.checkIn.current`: the client's device-local date. */
export const currentCheckInInputSchema = z.object({ today: localDateSchema });

/** `coaching.checkIn.submit`: every asked question answered 1–5, the note optional. */
export const submitCheckInInputSchema = z.object({
  today: localDateSchema,
  periodStart: localDateSchema,
  answers: z.record(checkInQuestionSchema, z.number().int().min(1).max(5)),
  note: z.string().trim().max(CHECK_IN_LIMITS.noteMaxChars).optional(),
  source: coachingSourceSchema.optional(),
});
export type SubmitCheckInInput = z.infer<typeof submitCheckInInputSchema>;

/** `trainer.client.checkIns`: `today` = the trainer's device-local date (is this week's one open?). */
export const clientCheckInsInputSchema = z.object({
  clientId: coachingClientIdSchema,
  today: localDateSchema,
});

// ─── Outputs ──────────────────────────────────────────────────────────────────

export interface CheckInConfigDto {
  enabled: boolean;
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  questions: CheckInQuestion[];
}

export type CheckInAnswers = Partial<Record<CheckInQuestion, number>>;

/** `coaching.checkIn.current`: the open check-in (null when the trainer has none, or none is open yet). */
export interface CurrentCheckInDto {
  /** The client-local date the check-in opened; send it back with the answers. */
  periodStart: string;
  trainerName: string;
  questions: CheckInQuestion[];
  /** The client's answers to this one, when already sent (they can change them until the next opens). */
  answered: { submittedAt: string; answers: CheckInAnswers; note: string | null } | null;
}

/** One answered check-in as the trainer sees it. */
export interface ClientCheckInDto {
  periodStart: string;
  submittedAt: string;
  /** What was asked (a snapshot: a later config change never re-labels it). */
  questions: CheckInQuestion[];
  answers: CheckInAnswers;
  note: string | null;
}

/** `trainer.client.checkIns`: newest first, the last CHECK_IN_LIMITS.historyItems. */
export interface ClientCheckInsDto {
  /** The trainer's check-ins are on (else the card offers to turn them on). */
  enabled: boolean;
  /** The current period, when one is open: whether it is answered yet. */
  current: { periodStart: string; answered: boolean } | null;
  items: ClientCheckInDto[];
}

// ─── Copy (web and mobile) ────────────────────────────────────────────────────

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const CHECK_IN_COPY = {
  weekday: (day: number) => WEEKDAYS[day] ?? 'Sunday',
  client: {
    cardTitle: (trainer: string) => `${trainer}’s weekly check-in`,
    cardBody: (n: number) => `${n} quick questions and a note. It takes a minute.`,
    answer: 'Answer',
    later: 'Later',
    edit: 'Change my answers',
    sentTitle: (trainer: string) => `Sent to ${trainer}`,
    title: 'Weekly check-in',
    intro: (trainer: string) => `${trainer} reads this before your next session.`,
    noteLabel: 'Anything else? (optional)',
    notePlaceholder: 'How the week went, what got in the way…',
    send: 'Send',
    sent: (trainer: string) => `Check-in sent to ${trainer}`,
    needsAll: 'Answer every question first.',
    scaleLabel: (question: string, value: number) => `${question}: ${value} of 5`,
    closed: 'This check-in has closed. A new one opens next week.',
  },
  trainer: {
    settingsTitle: 'Weekly check-in',
    settingsBody:
      'Every client gets a few quick questions once a week, in the app and by email. You see the answers on their page.',
    enable: 'Ask my clients every week',
    dayLabel: 'Check-in day',
    questionsLabel: 'Questions (up to 6)',
    noteAlways: 'Clients can always add a note.',
    save: 'Save',
    saved: 'Check-in saved',
    cardTitle: 'Check-ins',
    off: 'Weekly check-ins are off.',
    turnOn: 'Turn on in Trainer settings',
    none: (client: string) => `${client} hasn’t answered a check-in yet.`,
    waiting: (client: string) => `This week’s check-in is waiting for ${client}.`,
    week: (date: string) => `Week of ${date}`,
    showMore: 'Show more',
  },
  email: {
    subject: (trainer: string) => `${trainer}’s weekly check-in`,
    preheader: 'A minute to tell your trainer how the week went.',
    body: (trainer: string) =>
      `${trainer} asks how your week went: a few quick questions and an optional note. Open Chefer to answer.`,
    cta: 'Answer in Chefer',
    unsubscribe: 'Stop check-in emails',
  },
  server: {
    noCheckIn: 'There is no check-in to answer right now.',
  },
} as const;
