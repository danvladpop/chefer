import { router, type Href } from 'expo-router';
import { ListRow, ListSection, useThemeColors } from '@chefer/ui-mobile';
import { Icon, type IconName } from '../../components/icon';
import { useT } from '../../lib/i18n';

// The old Gym mode had five tabs; in the new shell Train is one, and the
// other four are a short list at its foot (plan: "Train"): the screens you
// visit weekly, not daily, one tap down instead of one tap across.

const LINKS: readonly {
  titleKey: `today.shell.trainLinks.${'routine' | 'exercises' | 'stats' | 'gymSettings'}`;
  href: Href;
  icon: IconName;
  testID: string;
}[] = [
  {
    titleKey: 'today.shell.trainLinks.routine',
    href: '/training/routine',
    icon: 'routine',
    testID: 'train-routine',
  },
  {
    titleKey: 'today.shell.trainLinks.exercises',
    href: '/training/exercises',
    icon: 'library',
    testID: 'train-exercises',
  },
  {
    titleKey: 'today.shell.trainLinks.stats',
    href: '/training/stats',
    icon: 'stats',
    testID: 'train-stats',
  },
  {
    titleKey: 'today.shell.trainLinks.gymSettings',
    href: '/gym/settings',
    icon: 'gymSettings',
    testID: 'train-settings',
  },
];

export function TrainLinks() {
  const colors = useThemeColors();
  const { t } = useT();
  return (
    <ListSection title={t('today.shell.trainLinks.title')} testID="train-links">
      {LINKS.map((link) => (
        <ListRow
          key={link.testID}
          testID={link.testID}
          title={t(link.titleKey)}
          icon={<Icon name={link.icon} color={colors.brand} />}
          onPress={() => router.push(link.href)}
        />
      ))}
    </ListSection>
  );
}
