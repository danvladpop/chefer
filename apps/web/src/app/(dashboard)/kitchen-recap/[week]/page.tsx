'use client';

import { useParams } from 'next/navigation';
import { RecapView } from '@/features/progress/recap-view';

// Kitchen progress: the weekly recap, at /kitchen-recap (a plain /recap is another page) (mockup 10). `week` is the Monday of the
// week it recaps (YYYY-MM-DD); the view validates it.
export default function RecapPage() {
  const params = useParams<{ week: string }>();
  return <RecapView week={params.week} />;
}
