import type { Href } from 'expo-router';
import type { TodaysThreeQuest } from '@chefer/types';

// Where tapping one of Today's three goes (build-plan.md Lane C §2): the log
// flow for a meal or protein, cook mode for the planned dinner, Train for the
// workout, Shop for the list. `navigate` is for tab roots, `push` for screens.

export type QuestTarget = { mode: 'push' | 'navigate'; href: Href };

export function questTarget(quest: TodaysThreeQuest): QuestTarget {
  switch (quest.kind) {
    case 'LOG_SLOT':
    case 'LOG_ANY':
    case 'PROTEIN':
      return { mode: 'push', href: '/tracker' };
    case 'COOK':
      return quest.recipeId
        ? {
            mode: 'push',
            href: {
              pathname: '/cook/[id]',
              params: { id: quest.recipeId, ...(quest.mealType ? { meal: quest.mealType } : {}) },
            },
          }
        : { mode: 'navigate', href: '/plan' };
    case 'WORKOUT':
      return { mode: 'navigate', href: '/train' };
    case 'SHOP':
      return { mode: 'navigate', href: '/shop' };
  }
}
