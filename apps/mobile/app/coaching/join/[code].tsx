import { useLocalSearchParams } from 'expo-router';
import { JoinScreen } from '../../../src/features/coaching/join/join-screen';

// `/coaching/join/<code>` — the invite link's app route (`chefer://coaching/join/<code>`, spec §2.3).
// Reachable signed out (the screen sends the visitor to sign in / register and brings them back).
export default function CoachingJoinRoute() {
  const { code } = useLocalSearchParams<{ code: string | string[] }>();
  return <JoinScreen code={Array.isArray(code) ? (code[0] ?? '') : code} />;
}
