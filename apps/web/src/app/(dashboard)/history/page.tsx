import { redirect } from 'next/navigation';

// History merged into My weeks (P2-8, F-PLAN-6-3): saved weeks on top, past
// weeks below. Old links and bookmarks land there; /history/[planId] (the
// read-only week view) is unchanged.
export default function HistoryPage() {
  redirect('/my-weeks');
}
