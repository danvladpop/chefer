// The add-item parser is shared with the web app and the Pantry box: it lives
// in @chefer/utils (`quantity.ts`, WP-11 / UX-SHOP-01) and understands imperial
// and spoon units ("2 lb chicken thighs"), not just g/kg/ml/l. Re-exported so
// existing imports keep working.
export { parseCustomItemInput } from '@chefer/utils';
