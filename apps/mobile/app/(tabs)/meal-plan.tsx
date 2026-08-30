import { Card, CardTitle, Screen, Text } from '@chefer/ui-mobile';

export default function MealPlanScreen() {
  return (
    <Screen>
      <Text variant="title" className="py-4">
        Meal Plan
      </Text>
      <Card>
        <CardTitle>Coming soon</CardTitle>
        <Text variant="muted">Your weekly plan and swaps arrive with plan task M2-2.</Text>
      </Card>
    </Screen>
  );
}
