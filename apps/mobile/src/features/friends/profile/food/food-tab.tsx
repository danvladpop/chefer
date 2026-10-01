import { useState } from 'react';
import { View } from 'react-native';
import { FRIENDS_COPY, type FriendProfileDto, type FriendsMeDto } from '@chefer/types';
import { SegmentedControl } from '@chefer/ui-mobile';
import { LockedPanel } from '../../components/locked-panel';
import { sectionView, showsTargets } from '../sections';
import { FriendRecipeGrid, type FriendRecipeGridProps } from './friend-recipe-grid';
import { FriendWeekView } from './friend-week-view';

// ─── Food tab (UX §9.1) ───────────────────────────────────────────────────────
// `This week` · `Recipes {n}` sub-switch (local state). Both panes stay
// mounted once visited, so switching back keeps each pane's place and data.
// A section that isn't shared (or my own preview of one I don't share) shows
// its panel in place of the pane.

type Pane = 'week' | 'recipes';

export type FoodTabProps = {
  profile: FriendProfileDto;
  me: FriendsMeDto | undefined;
  registerLoadMore: FriendRecipeGridProps['registerLoadMore'];
};

export function FoodTab({ profile, me, registerLoadMore }: FoodTabProps) {
  const [pane, setPane] = useState<Pane>('week');
  const [visited, setVisited] = useState<Record<Pane, boolean>>({ week: true, recipes: false });
  const { id: userId, firstName } = profile.user;
  const plan = sectionView(profile, 'plan', me);
  const recipes = sectionView(profile, 'recipes', me);
  const count = profile.recipeCount ?? 0;

  const choose = (next: Pane) => {
    setPane(next);
    setVisited((v) => ({ ...v, [next]: true }));
  };

  return (
    <View testID="friends-profile-food" className="gap-4">
      <SegmentedControl<Pane>
        testID="friends-food-switch"
        size="sm"
        value={pane}
        onChange={choose}
        options={[
          { value: 'week', label: FRIENDS_COPY.food.thisWeek, testID: 'friends-food-week' },
          {
            value: 'recipes',
            label: FRIENDS_COPY.food.recipes(count),
            testID: 'friends-food-recipes',
          },
        ]}
      />
      <View className={pane === 'week' ? 'flex' : 'hidden'}>
        {plan.kind === 'panel' ? (
          <LockedPanel testID="friends-food-week-panel" {...plan.panel} />
        ) : (
          <FriendWeekView
            userId={userId}
            firstName={firstName}
            showTargets={showsTargets(profile, me)}
          />
        )}
      </View>
      {visited.recipes ? (
        <View className={pane === 'recipes' ? 'flex' : 'hidden'}>
          {recipes.kind === 'panel' ? (
            <LockedPanel testID="friends-food-recipes-panel" {...recipes.panel} />
          ) : (
            <FriendRecipeGrid
              userId={userId}
              firstName={firstName}
              recipeCount={profile.recipeCount}
              {...(pane === 'recipes' && registerLoadMore ? { registerLoadMore } : {})}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}
