import { render, screen } from '@testing-library/react-native';
import { NumbersModeProvider } from '../../src/features/numbers-mode/numbers-mode';
import { NutritionCard } from '../../src/features/shell/today/nutrition-card';
import { householdSummary } from '../../src/features/shell/you-screen';
import { resetLocaleForTests } from '../../src/lib/i18n';

// Lane J phase 4: the shell's Today card and You's household line follow the
// UI language (`today.shell.*`, `today.hideNumbers.*`).

const amounts = {
  eatenKcal: 900,
  targetKcal: 2000,
  protein: { value: 72, target: 120 },
  carbs: { value: 100, target: 220 },
  fat: { value: 30, target: 70 },
};

function renderCard(mode: string, onPlan?: { eaten: number; planned: number }) {
  return render(
    <NumbersModeProvider mode={mode}>
      <NutritionCard {...amounts} proteinOnly={mode !== 'FULL'} onPlan={onPlan} />
    </NumbersModeProvider>,
  );
}

describe('shell Today in Romanian', () => {
  beforeEach(() => resetLocaleForTests(['ro-RO']));
  afterAll(() => resetLocaleForTests(['en-US']));

  it('"Hide numbers" shows the planned meals eaten, with the Romanian plural', async () => {
    await renderCard('NONE', { eaten: 2, planned: 3 });
    expect(screen.getByText('Azi, până acum')).toBeOnTheScreen();
    expect(screen.getByText('2 din 3 mese planificate, mâncate')).toBeOnTheScreen();
  });

  it('protein-only mode words the target in Romanian', async () => {
    await renderCard('PROTEIN_ONLY');
    expect(screen.getByText('din 120 g proteine')).toBeOnTheScreen();
  });

  it('the household summary reads "Tu + …"', () => {
    expect(householdSummary(['Ana'])).toBe('Tu + Ana');
    expect(householdSummary(['Ana', 'Ben', 'Cris'])).toBe('Tu + 3');
  });
});

describe('shell Today in English', () => {
  beforeEach(() => resetLocaleForTests(['en-US']));

  it('keeps the English copy', async () => {
    await renderCard('NONE', { eaten: 2, planned: 3 });
    expect(screen.getByText('2 of 3 planned meals eaten')).toBeOnTheScreen();
    expect(householdSummary(['Ana', 'Ben'])).toBe('You + Ana, Ben');
  });
});
