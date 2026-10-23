'use client';

import Link from 'next/link';
import type { ProgressSummary, QuestKind, TodaysThreeQuest } from '@chefer/types';
import { pressCard, ProgressBar } from '@chefer/ui';
import { cn, PROGRESS_COPY, questDetail, questLabel, xpLabel } from '@chefer/utils';
import { AnimatedCheck } from './animated-check';
import { PROGRESS_WEB_COPY } from './copy';

// ─── Today's three (mockup 01, lane C2) ───────────────────────────────────────
// Three real things from the user's own plan: an animated check (MO-16) and the
// XP the action earns, the bonus pill, a progress bar and the footer. No tip jar
// (P2). A quest that is still open deep-links to where it gets done.

export function questHref(quest: TodaysThreeQuest): string {
  const kind: QuestKind = quest.kind;
  switch (kind) {
    case 'COOK':
      return quest.recipeId ? `/recipes/${quest.recipeId}/cook` : '/recipes';
    case 'WORKOUT':
      return '/gym';
    case 'SHOP':
      return '/shopping-list';
    case 'LOG_SLOT':
    case 'LOG_ANY':
    case 'PROTEIN':
      return '/tracker';
  }
}

function QuestRow({ quest }: { quest: TodaysThreeQuest }) {
  const detail = questDetail(quest);
  const body = (
    <>
      <AnimatedCheck done={quest.done} />
      <span className="min-w-0 flex-1">
        <span className={cn('text-sm font-medium text-gray-900', quest.done && 'line-through')}>
          {questLabel(quest)}
        </span>
        {detail && <span className="text-xs text-gray-600"> · {detail}</span>}
      </span>
      <span className="shrink-0 text-sm font-bold text-orange-700">+{quest.xp}</span>
    </>
  );
  const rowClass = 'flex min-h-11 min-w-0 items-center gap-3 rounded-control px-1';
  return (
    <li data-testid={`quest-${quest.id}`} data-done={quest.done}>
      {quest.done ? (
        <div className={rowClass}>
          {body}
          <span className="sr-only">Done</span>
        </div>
      ) : (
        <Link href={questHref(quest)} className={cn(rowClass, 'hover:bg-gray-50', pressCard)}>
          {body}
        </Link>
      )}
    </li>
  );
}

export function TodaysThreeCard({ summary }: { summary: ProgressSummary }) {
  const three = summary.todaysThree;
  // `quiet` (low-intake guard, idea 59): no food quests with XP on them.
  if (!three || three.quests.length === 0 || !summary.settings.showXp || summary.quiet) return null;
  const done = three.quests.filter((q) => q.done).length;

  return (
    <section
      aria-labelledby="todays-three-title"
      data-testid="todays-three"
      className="rounded-card border bg-white p-4 shadow-e1"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 id="todays-three-title" className="min-w-0 text-base font-bold text-gray-900">
          {PROGRESS_COPY.todaysThreeTitle}
        </h2>
        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
          {xpLabel(three.bonusXp)} {PROGRESS_WEB_COPY.bonus}
        </span>
      </div>
      <ul className="mt-2">
        {three.quests.map((quest) => (
          <QuestRow key={quest.id} quest={quest} />
        ))}
      </ul>
      <ProgressBar
        progress={done / three.quests.length}
        label={`${done} of ${three.quests.length} done`}
        color="#15803d"
        className="mt-2 h-1.5"
      />
      <p className="mt-2 text-xs text-gray-600">
        {three.allDone ? PROGRESS_COPY.todaysThreeAllDone : PROGRESS_COPY.todaysThreeFooter}
      </p>
    </section>
  );
}
