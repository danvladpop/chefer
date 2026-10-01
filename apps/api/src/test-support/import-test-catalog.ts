// Test support: one shared in-memory catalog for module mocks that replace the
// resolver / nutrition singletons (vi.mock factories import this lazily, so
// they all see the same instance). Round numbers keep expectations readable.
import { catalogRow, fakeCatalog } from './fake-catalog.js';

export const IMPORT_TEST_CATALOG = fakeCatalog([
  catalogRow('chicken', 'chicken-breast-raw', ['chicken breast'], {
    kcalPer100g: 120,
    proteinPer100g: 22,
    carbsPer100g: 0,
    fatPer100g: 2,
  }),
  catalogRow('pb', 'peanut-butter', ['peanut butter'], {
    kcalPer100g: 600,
    proteinPer100g: 25,
    carbsPer100g: 15,
    fatPer100g: 50,
    fiberPer100g: 6,
  }),
  catalogRow('cm', 'coconut-milk-canned', ['coconut milk'], {
    kcalPer100g: 200,
    proteinPer100g: 2,
    carbsPer100g: 3,
    fatPer100g: 20,
    densityGPerMl: 1,
  }),
  catalogRow('tofu', 'tofu-firm', ['tofu'], {
    kcalPer100g: 150,
    proteinPer100g: 16,
    carbsPer100g: 2,
    fatPer100g: 9,
  }),
]);
