'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { BookmarkPlus, Check, Pencil, Repeat, Trash2 } from 'lucide-react';

// My Weeks — up to 4 saved weeks (mirror of apps/mobile/app/my-weeks.tsx).
// Lives on the My weeks page (/my-weeks) above the past weeks (P2-8).
// Save refined weeks as named templates, follow one (applies now + future
// weeks carry it forward), rename, delete. Every tier: no AI involved.

const MAX_TEMPLATES = 4;

export function WeekTemplates({
  currentPlanId,
  showWhenEmpty = false,
}: {
  currentPlanId: string | null;
  /** Render the panel (with its explainer) even with no plan and no saved weeks. */
  showWhenEmpty?: boolean;
}) {
  const [saveName, setSaveName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const utils = trpc.useUtils();
  const { data: templates } = trpc.mealPlan.listTemplates.useQuery();

  const invalidate = () => {
    void utils.mealPlan.listTemplates.invalidate();
    void utils.mealPlan.getForWeek.invalidate();
  };

  const saveMutation = trpc.mealPlan.saveAsTemplate.useMutation({
    onSuccess: () => {
      setSaveName('');
      invalidate();
    },
  });
  const followMutation = trpc.mealPlan.followTemplate.useMutation({ onSuccess: invalidate });
  const unfollowMutation = trpc.mealPlan.unfollowTemplate.useMutation({ onSuccess: invalidate });
  const renameMutation = trpc.mealPlan.renameTemplate.useMutation({
    onSuccess: () => {
      setRenamingId(null);
      invalidate();
    },
  });
  const deleteMutation = trpc.mealPlan.deleteTemplate.useMutation({ onSuccess: invalidate });

  const atCap = (templates?.length ?? 0) >= MAX_TEMPLATES;
  const busy =
    saveMutation.isPending ||
    followMutation.isPending ||
    unfollowMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending;
  const error =
    saveMutation.error?.message ??
    followMutation.error?.message ??
    renameMutation.error?.message ??
    deleteMutation.error?.message ??
    null;

  // Nothing to show a brand-new user who has neither a plan nor templates.
  if (!showWhenEmpty && !currentPlanId && (templates?.length ?? 0) === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border bg-white p-4" data-testid="week-templates">
      <div className="mb-1 flex items-center gap-2">
        <Repeat className="h-4 w-4 text-[#944a00]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-gray-900">My weeks</h2>
        <span className="text-xs text-gray-500">
          {templates?.length ?? 0}/{MAX_TEMPLATES}
        </span>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Save a week you like and reuse it. The week you follow repeats each week until you switch.
      </p>

      {error && (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {/* Save the current week */}
      {currentPlanId && !atCap && (
        <form
          className="mb-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (saveName.trim() && !busy) {
              saveMutation.mutate({ planId: currentPlanId, name: saveName.trim() });
            }
          }}
        >
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this week, e.g. Mediterranean week"
            aria-label="Name for this saved week"
            maxLength={40}
            className="h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00]"
          />
          <button
            type="submit"
            disabled={!saveName.trim() || busy}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[#944a00] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Save this week
          </button>
        </form>
      )}
      {!currentPlanId && (templates?.length ?? 0) === 0 && (
        <p className="text-xs text-gray-500">
          No plan this week yet — generate one on the planner, then save it here.
        </p>
      )}
      {currentPlanId && atCap && (
        <p className="mb-3 text-xs text-gray-500">
          You already keep {MAX_TEMPLATES} weeks — delete one to save this week.
        </p>
      )}

      {/* Saved weeks */}
      {(templates?.length ?? 0) > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates?.map((t) => (
            <li key={t.id} className="rounded-xl border p-3">
              {renamingId === t.id ? (
                <form
                  className="mb-2 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renameValue.trim() && !busy) {
                      renameMutation.mutate({ templateId: t.id, name: renameValue.trim() });
                    }
                  }}
                >
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    aria-label={`New name for ${t.name}`}
                    maxLength={40}
                    className="h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!renameValue.trim() || busy}
                    aria-label="Confirm rename"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border hover:bg-gray-50"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="line-clamp-2 text-xs text-gray-500">
                      {t.mealsCount} meals · {t.previewNames.join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={`Rename ${t.name}`}
                      onClick={() => {
                        setRenamingId(t.id);
                        setRenameValue(t.name);
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${t.name}" from your saved weeks?`)) {
                          deleteMutation.mutate({ templateId: t.id });
                        }
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {t.isFollowed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => unfollowMutation.mutate()}
                  className="mt-1 min-h-11 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Following ✓ — click to stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Follow "${t.name}"? It replaces this week's plan and continues weekly.`,
                      )
                    ) {
                      followMutation.mutate({ templateId: t.id, weekOffset: 0 });
                    }
                  }}
                  className="mt-1 min-h-11 w-full rounded-lg border px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Follow this week
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
