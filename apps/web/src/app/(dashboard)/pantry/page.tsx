import { redirect } from 'next/navigation';

// The pantry is the Shop tab's "In my kitchen" segment now (P2-8, PM review
// §5). Old links and bookmarks land there.
export default function PantryPage() {
  redirect('/shopping-list?view=kitchen');
}
