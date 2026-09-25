'use client';

import { use } from 'react';
import { SummaryView } from '@/features/gym/workout/summary-view';

export default function GymSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SummaryView id={id} />;
}
