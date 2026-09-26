import { Redirect } from 'expo-router';

// History merged into My weeks (P2-8, F-PLAN-6-3), same as web's /history:
// saved weeks on top, past weeks below — one card per week, past weeks only
// (`pastWeeks`, @chefer/utils). Old links and notifications land there;
// /history/[planId] (the read-only week view) is unchanged.
export default function HistoryScreen() {
  return <Redirect href="/my-weeks" />;
}
