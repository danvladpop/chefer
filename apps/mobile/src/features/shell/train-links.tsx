import { router, type Href } from 'expo-router';
import { ListRow, ListSection, useThemeColors } from '@chefer/ui-mobile';
import { Icon, type IconName } from '../../components/icon';

// The old Gym mode had five tabs; in the new shell Train is one, and the
// other four are a short list at its foot (plan: "Train"): the screens you
// visit weekly, not daily, one tap down instead of one tap across.

const LINKS: readonly { title: string; href: Href; icon: IconName; testID: string }[] = [
  { title: 'Routine', href: '/training/routine', icon: 'routine', testID: 'train-routine' },
  { title: 'Exercises', href: '/training/exercises', icon: 'library', testID: 'train-exercises' },
  { title: 'Stats and history', href: '/training/stats', icon: 'stats', testID: 'train-stats' },
  { title: 'Gym settings', href: '/gym/settings', icon: 'gymSettings', testID: 'train-settings' },
];

export function TrainLinks() {
  const colors = useThemeColors();
  return (
    <ListSection title="Your training" testID="train-links">
      {LINKS.map((link) => (
        <ListRow
          key={link.testID}
          testID={link.testID}
          title={link.title}
          icon={<Icon name={link.icon} color={colors.brand} />}
          onPress={() => router.push(link.href)}
        />
      ))}
    </ListSection>
  );
}
