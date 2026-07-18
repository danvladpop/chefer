# PRD — Store Product Links on Shopping List

**Status:** Ready for implementation  
**Date:** 2026-04-10  
**Scope:** `apps/web`, `apps/api` (types + fixture)

---

## 1. Problem Statement

The shopping list shows each ingredient with price and availability from the selected store, but there is no way to navigate to the actual product page on that store's website. Users who want to:

- Verify the exact product before ordering
- Check nutritional info or allergen details
- Place an order directly on the store's site

…must leave the app, open the store website manually, and search themselves. This is friction that can be eliminated with a single link per item.

---

## 2. Goals

- Add a direct "View on [Store]" link to each ingredient row on the shopping list.
- The link resolves to the correct store's search results for that specific product, using the store's branded product name (e.g. `"LIDL Avocado Ready to Eat"`).
- The link updates dynamically when the user switches the selected store.
- No link is shown when no store is selected or no match exists for an ingredient.

## 3. Non-Goals

- Deep-linking to individual product detail pages (requires store API integration; out of scope).
- In-app purchase or cart functionality.
- Link tracking / analytics.
- Mobile app deep links.

---

## 4. User Stories

| #   | As a…   | I want to…                                                       | So that…                                     |
| --- | ------- | ---------------------------------------------------------------- | -------------------------------------------- |
| 1   | Shopper | Click an ingredient and go straight to the store's search for it | I can verify the exact product before buying |
| 2   | Shopper | See the link update when I switch stores                         | I always land on the right retailer          |
| 3   | Shopper | Open the store link in a new tab                                 | I don't lose my shopping list                |
| 4   | Shopper | Not see a link for items the selected store doesn't carry        | The UI doesn't show broken/irrelevant links  |

---

## 5. UX Specification

### 5.1 Link placement

The link appears as a small **external-link icon button** inside each ingredient row, positioned to the right of the ingredient name and quantity — between the text block and the price/availability column.

```
┌─────────────────────────────────────────────────────────────────┐
│  [img]  Salmon Fillet          [↗]        €4.49   [LIMITED]  ○  │
│         340 g                                                     │
│         Aisle 6 – Fresh Fish                                     │
└─────────────────────────────────────────────────────────────────┘
         ↑ name + qty + aisle     ↑ NEW    ↑ price  ↑ badge
```

### 5.2 States

| Condition                             | Link shown?    | Behaviour                                         |
| ------------------------------------- | -------------- | ------------------------------------------------- |
| Store selected + item matched         | ✅ Yes         | Opens store search in new tab                     |
| Store selected + item **not** matched | ❌ No          | Link hidden                                       |
| No store selected yet                 | ❌ No          | Link hidden                                       |
| Item is OUT_OF_STOCK                  | ✅ Yes (muted) | Still links — user may want to check stock online |

### 5.3 Visual design

- **Icon:** `ExternalLink` (lucide-react, 12×12 px)
- **Size:** 24×24 px tap target, rounded, borderless
- **Colour:** `text-neutral-400` at rest → `text-primary` on hover
- **Tooltip:** `"View on {storeName}"` via `title` attribute
- **Does not toggle the "checked" state** — `stopPropagation` on click

### 5.4 Interaction with In-Store / Delivery mode toggle

The same link is used for both modes. The store's website handles both in-store and delivery availability.

---

## 6. Technical Specification

### 6.1 Data model change — `GroceryStore`

Add one field to `GroceryStore`:

```typescript
websiteSearchUrl: string;
// Base URL used to construct per-product search links.
// Product name is appended as a URL-encoded query parameter.
// Example: "https://www.lidl.de/search?q="
// Usage:   websiteSearchUrl + encodeURIComponent(item.storeProductName ?? item.ingredientName)
```

**Files:**

- `apps/api/src/lib/grocery-ai/types.ts` — add field to `GroceryStore` interface
- `apps/api/src/lib/grocery-ai/fixtures/grocery-stores.fixture.ts` — populate for each store

### 6.2 Store search URL values

| Store     | `websiteSearchUrl`                                           |
| --------- | ------------------------------------------------------------ |
| LIDL      | `https://www.lidl.de/search?q=`                              |
| Carrefour | `https://www.carrefour.fr/s?keyword=`                        |
| Kaufland  | `https://www.kaufland.de/products/search.html?search_value=` |

These are the real search endpoints of each retailer. The product name is URL-encoded and appended directly.

### 6.3 URL construction (frontend)

```typescript
// In shopping list page, inside the ingredient row render:
const productUrl =
  selectedStore && storeItem
    ? `${selectedStore.websiteSearchUrl}${encodeURIComponent(
        storeItem.storeProductName ?? item.ingredientName,
      )}`
    : null;
```

### 6.4 Link rendering

```tsx
{
  productUrl && (
    <a
      href={productUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`View on ${selectedStore!.name}`}
      onClick={(e) => e.stopPropagation()}
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-neutral-400 transition hover:text-primary"
    >
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
```

### 6.5 Files changed

| File                                                             | Change                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/api/src/lib/grocery-ai/types.ts`                           | Add `websiteSearchUrl: string` to `GroceryStore`                   |
| `apps/api/src/lib/grocery-ai/fixtures/grocery-stores.fixture.ts` | Add `websiteSearchUrl` to each of the 3 store objects              |
| `apps/web/src/app/(dashboard)/shopping-list/page.tsx`            | Build `productUrl` per item; render `<a>` with `ExternalLink` icon |

---

## 7. Edge Cases

| Case                               | Handling                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `storeProductName` is undefined    | Fall back to `item.ingredientName` as search term                                 |
| `websiteSearchUrl` is empty string | `productUrl` evaluates to falsy → link hidden                                     |
| User switches stores               | `selectedStore` reference changes → `productUrl` recomputes inline for every item |
| Item is checked off                | Link still present but row is visually muted (existing behaviour)                 |

---

## 8. Out-of-Scope / Future

- **Real store API integration** — when a real grocery delivery API is integrated (Instacart, Cornershop, etc.), `productUrl` can be replaced with a direct deep-link to the exact product SKU.
- **"Add to cart" button** — a logical follow-on once a delivery API is wired up.
- **Link previews** — hovering to show a mini product card from the store.
