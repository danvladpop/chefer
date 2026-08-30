import { StyleSheet, Text, View } from 'react-native';
import type { PlanTier } from '@chefer/types';
import { capitalize } from '@chefer/utils';

// Placeholder screen — proves that @chefer/* workspace packages resolve
// through Metro. Replaced by the real shell in plan task M1-3.
const tier: PlanTier = 'FREE';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{capitalize('chefer')}</Text>
      <Text>Native app scaffold — plan tier: {tier}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
});
