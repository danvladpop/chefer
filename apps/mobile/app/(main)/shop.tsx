import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import ShoppingListScreen from '../(food)/shopping-list';

// New shell: Shop. The shopping list, unchanged (plan: "Shop").
export default function ShopTab() {
  return (
    <ShellChromeProvider value={{ kind: 'tab-root' }}>
      <ShoppingListScreen />
    </ShellChromeProvider>
  );
}
