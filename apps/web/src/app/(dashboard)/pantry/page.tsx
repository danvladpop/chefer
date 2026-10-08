import { redirect } from 'next/navigation';

// FB7-10: "In my kitchen" is retired — the pantry no longer exists in the app.
// The route stays only so old links and bookmarks land on the Shop page.
export default function PantryPage() {
  redirect('/shopping-list');
}
