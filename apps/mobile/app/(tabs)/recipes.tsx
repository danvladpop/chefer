import { Card, CardTitle, Screen, Text } from '@chefer/ui-mobile';

export default function RecipesScreen() {
  return (
    <Screen>
      <Text variant="title" className="py-4">
        Recipes
      </Text>
      <Card>
        <CardTitle>Coming soon</CardTitle>
        <Text variant="muted">Browse and search recipes — plan task M2-3.</Text>
      </Card>
    </Screen>
  );
}
