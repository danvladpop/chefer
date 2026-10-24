import { useLocalSearchParams } from 'expo-router';
import { WeeklyRecapScreen } from '../../src/features/progress/weekly-recap-screen';

// Kitchen progress: the weekly recap story for the week starting `week`
// (YYYY-MM-DD, a Monday). Opened from Today's recap banner. Revamp shell only;
// the screen gates itself on `progress.availability`.
export default function RecapRoute() {
  const { week } = useLocalSearchParams<{ week: string }>();
  return <WeeklyRecapScreen week={week} />;
}
