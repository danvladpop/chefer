'use client';

import type { ReactNode } from 'react';
import { Ban, Bookmark, MoreHorizontal, PlusCircle, Trash2, UtensilsCrossed } from 'lucide-react';
import { pressControl, useMenu } from '@chefer/ui';
import { cn, PLAN_MEAL_MENU_COPY } from '@chefer/utils';

// ─── The "…" menu on a plan meal (FB7-11) ─────────────────────────────────────
// ONE compact menu replaces the always-visible pin button and the separate
// "Ate something else" row under the card: Keep in next plans / Stop keeping,
// Ate something else + Skipped it (only while the slot is still to eat),
// Add a side dish (FB7-04) and Remove from plan (side dishes only). Built on
// `useMenu()` — Escape, arrow keys, focus return, outside click.
// Cards are links, so every click inside is kept from navigating.

/** "Ate something else" / "Skipped it" for a slot that is still to eat (WP-06). */
export interface SlotLogActions {
  /** An eaten slot can be replaced but not skipped. */
  canSkip: boolean;
  onAteElse: () => void;
  onSkip: () => void;
}

export interface PlanMealMenuProps {
  mealName: string;
  /** Test-id suffix: the meal type, plus the slot index for a side dish. */
  slotKey: string;
  pinned: boolean;
  /** Keep in next plans / Stop keeping. */
  onTogglePin?: (() => void) | undefined;
  logActions?: SlotLogActions | undefined;
  /** "Add a side dish". */
  onAddSide?: (() => void) | undefined;
  /** "Remove from plan" — passed for a side dish only. */
  onRemove?: (() => void) | undefined;
  className?: string | undefined;
  /** The desktop week grid's small trigger (a 32px circle with a padded hit area). */
  compact?: boolean | undefined;
}

export function planMealMenuHasItems(p: {
  onTogglePin?: unknown;
  logActions?: unknown;
  onAddSide?: unknown;
  onRemove?: unknown;
}): boolean {
  return [p.onTogglePin, p.logActions, p.onAddSide, p.onRemove].some((x) => x !== undefined);
}

const ITEM =
  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none';

export function PlanMealMenu({
  mealName,
  slotKey,
  pinned,
  onTogglePin,
  logActions,
  onAddSide,
  onRemove,
  className,
  compact = false,
}: PlanMealMenuProps) {
  const menu = useMenu();
  if (!planMealMenuHasItems({ onTogglePin, logActions, onAddSide, onRemove })) return null;

  const choose = (action: () => void) => () => {
    menu.close();
    action();
  };
  const item = (
    testId: string,
    icon: ReactNode,
    label: string,
    onClick: () => void,
    extra?: string,
  ) => (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-testid={testId}
      onClick={choose(onClick)}
      className={cn(ITEM, extra)}
    >
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
  const icon = 'h-4 w-4 shrink-0 text-[#944a00]';

  return (
    // The card is a link: taps (and keys) in here must never navigate.
    <div
      ref={menu.rootRef}
      className={cn('relative', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        {...menu.triggerProps}
        aria-label={PLAN_MEAL_MENU_COPY.moreActions(mealName)}
        data-testid={`plan-meal-more-${slotKey}`}
        className={cn(
          'flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100',
          compact ? 'touch-target relative h-8 w-8' : 'h-11 w-11',
          pressControl,
        )}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {menu.open && (
        <div
          {...menu.menuProps}
          className="absolute right-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-1 shadow-e3"
        >
          {onTogglePin &&
            item(
              `slot-action-pin-${slotKey}`,
              <Bookmark
                className={icon}
                aria-hidden="true"
                fill={pinned ? 'currentColor' : 'none'}
              />,
              pinned ? PLAN_MEAL_MENU_COPY.unpin : PLAN_MEAL_MENU_COPY.pin,
              onTogglePin,
            )}
          {logActions &&
            item(
              'slot-action-ate-else',
              <UtensilsCrossed className={icon} aria-hidden="true" />,
              'Ate something else',
              logActions.onAteElse,
            )}
          {logActions?.canSkip &&
            item(
              'slot-action-skip',
              <Ban className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />,
              'Skipped it',
              logActions.onSkip,
            )}
          {onAddSide &&
            item(
              `slot-action-add-side-${slotKey}`,
              <PlusCircle className={icon} aria-hidden="true" />,
              PLAN_MEAL_MENU_COPY.addSide,
              onAddSide,
            )}
          {onRemove &&
            item(
              `slot-action-remove-${slotKey}`,
              <Trash2 className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />,
              PLAN_MEAL_MENU_COPY.removeSide,
              onRemove,
              'text-red-700 hover:bg-red-50 focus-visible:bg-red-50',
            )}
        </div>
      )}
    </div>
  );
}
