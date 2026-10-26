'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  CURATED_MEAL_TYPES,
  curatedDraftRecipeSchema,
  RECIPE_UNITS,
  type CuratedDraftLine,
  type CuratedDraftRecipe,
  type CuratedMealType,
} from '@chefer/types';
import { cn, pressControl } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { PROSE_LABEL, STATUS_CLASS, STATUS_LABEL } from '../lib/status';
import { CatalogMatchSheet } from './CatalogMatchSheet';

// ─── Admin: review one curated draft (market review F1) ───────────────────────
// Edit the extracted facts, match every line to the global catalog, check the
// prose is Chefer's, then approve (the API runs the safety, allergen and
// nutrition gates again) or reject. The review panel reflects the SAVED
// draft; unsaved edits are re-checked on Save or Approve.

type Detail = RouterOutputs['curatedAdmin']['get'];

const inputClass =
  'min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:border-[#944a00] focus:outline-none';
const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:border-[#944a00]/40 hover:text-[#944a00] disabled:opacity-50';

const MEAL_LABEL: Record<CuratedMealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export function DraftReview({ id }: { id: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const query = trpc.curatedAdmin.get.useQuery(
    { id },
    { refetchInterval: (q) => (q.state.data?.draft.status === 'EXTRACTING' ? 4000 : false) },
  );

  if (query.isLoading) {
    return <div className="mx-auto mt-8 h-64 max-w-3xl animate-pulse rounded-2xl bg-gray-100" />;
  }
  if (!query.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Draft not found</h1>
        <BackLink />
      </div>
    );
  }
  return (
    <DraftEditor
      key={`${query.data.draft.id}:${String(query.data.draft.updatedAt)}`}
      detail={query.data}
      onChanged={() => {
        void utils.curatedAdmin.get.invalidate({ id });
        void utils.curatedAdmin.list.invalidate();
        void utils.curatedAdmin.budget.invalidate();
      }}
      onDone={() => router.push('/admin/recipes')}
    />
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/recipes"
      className="inline-flex min-h-11 items-center gap-1 text-sm text-gray-600 hover:text-[#944a00]"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Queue
    </Link>
  );
}

function DraftEditor({
  detail,
  onChanged,
  onDone,
}: {
  detail: Detail;
  onChanged: () => void;
  onDone: () => void;
}) {
  const { draft: row, review } = detail;
  const stored = curatedDraftRecipeSchema.safeParse(row.draft);
  const [form, setForm] = useState<CuratedDraftRecipe | null>(stored.success ? stored.data : null);
  const [meals, setMeals] = useState<CuratedMealType[]>(
    row.mealTypes.filter((m): m is CuratedMealType =>
      (CURATED_MEAL_TYPES as readonly string[]).includes(m),
    ),
  );
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [matching, setMatching] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const editable = row.status === 'DRAFT';
  const errorId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const opts = { meta: { silent: true }, onSuccess: onChanged };
  const update = trpc.curatedAdmin.update.useMutation(opts);
  const rewrite = trpc.curatedAdmin.rewriteProse.useMutation(opts);
  const retry = trpc.curatedAdmin.retry.useMutation(opts);
  const unpublish = trpc.curatedAdmin.unpublish.useMutation(opts);
  const approve = trpc.curatedAdmin.approve.useMutation({
    ...opts,
    onSuccess: () => {
      onChanged();
      onDone();
    },
  });
  const reject = trpc.curatedAdmin.reject.useMutation({
    ...opts,
    onSuccess: () => {
      onChanged();
      onDone();
    },
  });
  const busy = [update, rewrite, retry, unpublish, approve, reject].some((m) => m.isPending);
  const error = [update, rewrite, retry, unpublish, approve, reject].find((m) => m.isError)?.error;

  const edit = (patch: Partial<CuratedDraftRecipe>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };
  const editLine = (k: number, patch: Partial<CuratedDraftLine>) => {
    if (!form) return;
    edit({ ingredients: form.ingredients.map((l, i) => (i === k ? { ...l, ...patch } : l)) });
  };
  // Blank steps and unnamed lines are typing leftovers, not content.
  const payload = () => ({
    id: row.id,
    ...(form
      ? {
          draft: {
            ...form,
            instructions: form.instructions.map((s) => s.trim()).filter(Boolean),
            ingredients: form.ingredients.filter((l) => l.name.trim()),
          },
        }
      : {}),
    mealTypes: meals,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <BackLink />
      <div className="mb-4 mt-2 flex flex-wrap items-start gap-2">
        <h1 className="min-w-0 flex-1 font-serif text-2xl font-bold text-gray-900">
          {[form?.name, row.sourceTitle].find((s) => s?.trim()) ?? 'Untitled draft'}
        </h1>
        <span
          className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLASS[row.status])}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </div>

      <section aria-label="Source" className="rounded-2xl border bg-white p-4 text-sm shadow-sm">
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 max-w-full items-center gap-1 break-all text-[#944a00] underline"
        >
          {row.sourceUrl}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </a>
        <p className="text-xs text-gray-500">
          {[row.platform, row.creator, row.transcriptSource && `read from ${row.transcriptSource}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {row.status === 'EXTRACTING' && (
          <p className="mt-2 inline-flex items-center gap-2 text-gray-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Reading the link — videos can take a few minutes.
          </p>
        )}
        {row.error && <p className="mt-2 text-red-700">{row.error}</p>}
        {row.rejectReason && <p className="mt-2 text-gray-700">Rejected: {row.rejectReason}</p>}
        {(row.assumptions.length > 0 || row.notFound.length > 0) && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Check before approving</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {row.notFound.map((f) => (
                <li key={f}>Not in the source: {f}</li>
              ))}
              {row.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {form && (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(payload(), { onSuccess: () => setDirty(false) });
          }}
        >
          <fieldset
            disabled={!editable || busy}
            className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm"
          >
            <legend className="sr-only">Recipe</legend>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-semibold',
                  row.proseStatus === 'ORIGINAL'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-emerald-50 text-emerald-800',
                )}
              >
                {PROSE_LABEL[row.proseStatus]}
              </span>
              {editable && (
                <button
                  type="button"
                  className={cn(buttonClass, pressControl)}
                  onClick={() =>
                    dirty
                      ? update.mutate(payload(), {
                          onSuccess: () => rewrite.mutate({ id: row.id }),
                        })
                      : rewrite.mutate({ id: row.id })
                  }
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Rewrite in Chefer&apos;s voice
                </button>
              )}
            </div>
            <Field label="Name">
              {(fid) => (
                <input
                  id={fid}
                  className={inputClass}
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => edit({ name: e.target.value })}
                />
              )}
            </Field>
            <Field label="Description">
              {(fid) => (
                <textarea
                  id={fid}
                  className={inputClass}
                  rows={2}
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => edit({ description: e.target.value })}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Cuisine">
                {(fid) => (
                  <input
                    id={fid}
                    className={inputClass}
                    value={form.cuisineType}
                    onChange={(e) => edit({ cuisineType: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Prep (min)">
                {(fid) => (
                  <NumberInput
                    id={fid}
                    value={form.prepTimeMins}
                    min={0}
                    onChange={(v) => edit({ prepTimeMins: v })}
                  />
                )}
              </Field>
              <Field label="Cook (min)">
                {(fid) => (
                  <NumberInput
                    id={fid}
                    value={form.cookTimeMins}
                    min={0}
                    onChange={(v) => edit({ cookTimeMins: v })}
                  />
                )}
              </Field>
              <Field label="Servings">
                {(fid) => (
                  <NumberInput
                    id={fid}
                    value={form.servings}
                    min={1}
                    onChange={(v) => edit({ servings: Math.max(1, v) })}
                  />
                )}
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-gray-800">
                Meal slots it may fill
              </legend>
              <div className="flex flex-wrap gap-2">
                {CURATED_MEAL_TYPES.map((m) => (
                  <label
                    key={m}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={meals.includes(m)}
                      onChange={(e) => {
                        setMeals((cur) =>
                          e.target.checked ? [...cur, m] : cur.filter((x) => x !== m),
                        );
                        setDirty(true);
                      }}
                    />
                    {MEAL_LABEL[m]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field
              label="Other tags (comma-separated)"
              hint="Diet tags (vegan, gluten-free…) are derived from the ingredients on approval."
            >
              {(fid, hintId) => (
                <input
                  id={fid}
                  aria-describedby={hintId}
                  className={inputClass}
                  value={form.dietaryTags.join(', ')}
                  onChange={(e) =>
                    edit({
                      dietaryTags: e.target.value
                        .split(',')
                        .map((t) => t.trim().toLowerCase())
                        .filter(Boolean)
                        .slice(0, 10),
                    })
                  }
                />
              )}
            </Field>

            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-800">Ingredients</p>
              <ul className="space-y-2">
                {form.ingredients.map((line, k) => {
                  const lineReview = !dirty ? review?.lines[k] : undefined;
                  const matchName = picked[k] ?? lineReview?.match?.name ?? null;
                  return (
                    <li key={k} className="rounded-xl border p-3">
                      <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
                        <input
                          aria-label={`Ingredient ${k + 1} name`}
                          className={inputClass}
                          value={line.name}
                          onChange={(e) => editLine(k, { name: e.target.value, slug: undefined })}
                        />
                        <NumberInput
                          aria-label={`Ingredient ${k + 1} amount`}
                          value={line.quantity}
                          min={0}
                          step="any"
                          onChange={(v) => editLine(k, { quantity: v })}
                        />
                        <select
                          aria-label={`Ingredient ${k + 1} unit`}
                          className={inputClass}
                          value={line.unit}
                          onChange={(e) => editLine(k, { unit: e.target.value })}
                        >
                          {[...new Set([line.unit, ...RECIPE_UNITS])].map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {matchName ? (
                          <span className="inline-flex items-center gap-1 text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {matchName}
                          </span>
                        ) : line.slug ? (
                          <span className="text-gray-600">{line.slug}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            No catalog match
                          </span>
                        )}
                        {matchName && lineReview?.problem && (
                          <span className="text-red-700">({lineReview.problem})</span>
                        )}
                        {lineReview?.candidates.map((c) => (
                          <button
                            key={c.slug}
                            type="button"
                            className="min-h-11 rounded-full border border-dashed px-2 text-gray-700"
                            onClick={() => {
                              editLine(k, { slug: c.slug });
                              setPicked((p) => ({ ...p, [k]: c.name }));
                            }}
                          >
                            {c.name}?
                          </button>
                        ))}
                        <button
                          type="button"
                          className={cn(buttonClass, 'min-h-11 py-0 text-xs', pressControl)}
                          onClick={() => setMatching(k)}
                        >
                          {matchName || line.slug ? 'Change match' : 'Match…'}
                        </button>
                        <label className="inline-flex min-h-11 items-center gap-1 text-gray-700">
                          <input
                            type="checkbox"
                            checked={line.optional ?? false}
                            onChange={(e) =>
                              editLine(k, { optional: e.target.checked || undefined })
                            }
                          />
                          To serve
                        </label>
                        <button
                          type="button"
                          className="min-h-11 px-2 text-red-700"
                          onClick={() => {
                            edit({ ingredients: form.ingredients.filter((_, i) => i !== k) });
                            setPicked({});
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className={cn(buttonClass, 'mt-2', pressControl)}
                onClick={() =>
                  edit({
                    ingredients: [...form.ingredients, { name: '', quantity: 1, unit: 'piece' }],
                  })
                }
              >
                Add ingredient
              </button>
            </div>

            <Field label="Method (one step per line)">
              {(fid) => (
                <textarea
                  id={fid}
                  className={inputClass}
                  rows={Math.max(4, form.instructions.length + 1)}
                  value={form.instructions.join('\n')}
                  onChange={(e) =>
                    edit({
                      instructions: e.target.value
                        .split('\n')
                        .map((s) => s.trimStart())
                        .filter((s, i, all) => s || i < all.length - 1),
                    })
                  }
                />
              )}
            </Field>
          </fieldset>

          {editable && (
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy || !dirty}
                className={cn(buttonClass, pressControl)}
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => approve.mutate(payload())}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#944a00] px-4 text-sm font-semibold text-white disabled:opacity-50',
                  pressControl,
                )}
              >
                {approve.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Approve into the free pool
              </button>
            </div>
          )}
        </form>
      )}

      {error && (
        <p id={errorId} role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {userFacingErrorMessage(error)}
        </p>
      )}

      {review && (
        <section
          aria-label="What approval will store"
          className="mt-4 rounded-2xl border bg-white p-4 text-sm shadow-sm"
        >
          <h2 className="text-base font-semibold text-gray-900">What approval will store</h2>
          {dirty && (
            <p className="mt-1 text-xs text-amber-800">Unsaved edits — save to re-check.</p>
          )}
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">
                Per serving ({review.nutrition.status === 'COMPUTED' ? 'computed' : 'incomplete'})
              </dt>
              <dd>
                {review.nutrition.perServing.calories} kcal · {review.nutrition.perServing.protein}{' '}
                g protein · {review.nutrition.perServing.carbs} g carbs ·{' '}
                {review.nutrition.perServing.fat} g fat
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Diet tags</dt>
              <dd>{review.dietaryTags.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Contains</dt>
              <dd>{review.safety.contains.join(', ') || 'none of the 14 allergens'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Diets that will see it</dt>
              <dd>{review.safety.diets.join(', ') || 'none'}</dd>
            </div>
          </dl>
          {review.blockers.length > 0 ? (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">
              <p className="font-semibold">Not ready to approve</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {review.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1 text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Ready to approve.
            </p>
          )}
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {row.status === 'FAILED' && (
          <button
            type="button"
            disabled={busy}
            className={cn(buttonClass, pressControl)}
            onClick={() => retry.mutate({ id: row.id })}
          >
            Try again
          </button>
        )}
        {row.status === 'APPROVED' && (
          <button
            type="button"
            disabled={busy}
            className={cn(buttonClass, pressControl)}
            onClick={() => unpublish.mutate({ id: row.id })}
          >
            Take out of the pool
          </button>
        )}
        {(row.status === 'DRAFT' || row.status === 'FAILED') && (
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <label htmlFor={reasonId} className="sr-only">
              Reason for rejecting
            </label>
            <input
              id={reasonId}
              className={cn(inputClass, 'sm:flex-1')}
              placeholder="Reason (optional)"
              maxLength={300}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              className={cn(buttonClass, 'text-red-700', pressControl)}
              onClick={() => reject.mutate({ id: row.id, reason: rejectReason || undefined })}
            >
              Reject
            </button>
          </div>
        )}
      </div>

      <CatalogMatchSheet
        open={matching !== null}
        initialQuery={matching !== null ? (form?.ingredients[matching]?.name ?? '') : ''}
        onClose={() => setMatching(null)}
        onPick={(pick) => {
          if (matching === null) return;
          editLine(matching, { slug: pick.slug });
          setPicked((p) => ({ ...p, [matching]: pick.name }));
          setMatching(null);
        }}
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string, hintId: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-800">
        {label}
      </label>
      {children(id, hint ? hintId : undefined)}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-gray-500">
          {hint}
        </p>
      )}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      className={inputClass}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
