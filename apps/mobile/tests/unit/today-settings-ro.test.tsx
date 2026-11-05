import { render, screen } from '@testing-library/react-native';
import { NumbersModeProvider } from '../../src/features/numbers-mode/numbers-mode';
import { GoalStep } from '../../src/features/preferences/components/goal-step';
import { NumbersModeChoice } from '../../src/features/preferences/numbers-mode-choice';
import { resetLocaleForTests } from '../../src/lib/i18n';

// Lane J phase 4: the numbers choice and the goal step follow the UI language
// (`today.numbersMode.*`, `today.settings.goal.*`), and the goal's calorie
// effect still disappears in "Hide numbers".

describe('numbers and goal settings in Romanian', () => {
  beforeEach(() => resetLocaleForTests(['ro-RO']));
  afterAll(() => resetLocaleForTests(['en-US']));

  it('"What do you want to keep an eye on?" offers the three modes in Romanian', async () => {
    await render(<NumbersModeChoice value="NONE" onChange={jest.fn()} />);
    expect(screen.getByText('Ce vrei să urmărești?')).toBeOnTheScreen();
    expect(screen.getByText('Calorii și macronutrienți')).toBeOnTheScreen();
    expect(screen.getByText('Doar proteine')).toBeOnTheScreen();
    expect(screen.getByText('Ascunde cifrele')).toBeOnTheScreen();
  });

  it('the goal step words the goals and the calorie effect in Romanian', async () => {
    await render(<GoalStep value={null} onChange={jest.fn()} />);
    expect(screen.getByText('Slăbire')).toBeOnTheScreen();
    expect(screen.getByText('Deficit de 500 kcal/zi')).toBeOnTheScreen();
  });

  it('"Hide numbers" still drops the calorie effect in Romanian', async () => {
    await render(
      <NumbersModeProvider mode="NONE">
        <GoalStep value={null} onChange={jest.fn()} compact />
      </NumbersModeProvider>,
    );
    expect(screen.queryByText(/kcal/)).toBeNull();
    expect(screen.getByText('Slăbire')).toBeOnTheScreen();
  });
});
