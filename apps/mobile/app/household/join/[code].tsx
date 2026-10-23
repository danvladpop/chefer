import { useLocalSearchParams } from 'expo-router';
import { HouseholdJoinScreen } from '../../../src/features/household/join/household-join-screen';

// `/household/join/<code>` — a household invite link's app route (`chefer://household/join/<code>`,
// ADR 0002). Reachable signed out (the screen sends the visitor to sign in / register and brings them back).
export default function HouseholdJoinRoute() {
  const { code } = useLocalSearchParams<{ code: string | string[] }>();
  return <HouseholdJoinScreen code={Array.isArray(code) ? (code[0] ?? '') : code} />;
}
