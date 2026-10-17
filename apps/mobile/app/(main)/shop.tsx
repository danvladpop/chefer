import { ShopScreen } from '../../src/features/shell/shop/shop-screen';

// New shell: Shop (10 Oct redesign, board "Shop"). Its own screen now — the
// old shell keeps `app/(food)/shopping-list.tsx` untouched. The screen draws
// its own top bar (title, Share, Ask Chef): Share opens its share sheet.
export default function ShopTab() {
  return <ShopScreen />;
}
