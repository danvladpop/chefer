import { Redirect } from 'expo-router';

// FB7-10: "In my kitchen" is retired — the pantry no longer exists in the app.
// The route stays only so old deep links and notifications land on the Shop
// tab instead of a dead screen.
export default function PantryScreen() {
  return <Redirect href="/shopping-list" />;
}
