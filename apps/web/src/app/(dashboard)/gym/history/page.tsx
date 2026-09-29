import { HistoryPage } from '@/features/gym/history/HistoryPage';

// UX-36 (5) / T-36.7: the web workout-history list; each row opens
// `/gym/history/[id]` (the existing detail).
export default function GymHistoryListPage() {
  return <HistoryPage />;
}
