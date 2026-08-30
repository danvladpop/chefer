import { Card, CardTitle, Screen, Text } from '@chefer/ui-mobile';

export default function ShoppingListScreen() {
  return (
    <Screen>
      <Text variant="title" className="py-4">
        Shopping List
      </Text>
      <Card>
        <CardTitle>Coming soon</CardTitle>
        <Text variant="muted">Your list with check-off sync — plan task M2-5.</Text>
      </Card>
    </Screen>
  );
}
