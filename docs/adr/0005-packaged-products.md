# Packaged products: barcode lookup on Open Food Facts, kept outside the ingredient catalog

Supersedes B-29 ("never a branded product or barcode", AC6). Owner decision, 2026-10-22.

B-29 kept the Log sheet to Chefer's own reviewed ingredient catalog. The 2026-10 market review showed that slow
logging is the best-documented reason people leave a calorie tracker, and that every app Chefer is compared with
(MyFitnessPal, MacroFactor, Cronometer, Yazio) logs packaged food by barcode. People eat packaged food even when they
follow a meal plan, so we now log it.

## What changes

- A **packaged product** is a branded, barcoded food. It lives in its own table, `PackagedProduct`, not in the
  `Ingredient` / `IngredientPrice` catalog.
- A barcode is looked up first among the user's own products, then in Chefer's cache of Open Food Facts rows, and only
  then on Open Food Facts itself (v2 API, with a User-Agent that names the app and at most 60 requests a minute). Every
  entry point ends in one procedure that takes the digits, `products.lookupBarcode`: a typed number, a photo of the
  barcode decoded on the server, and later the live camera scanner of a native build.
- Barcode lookup, product search, saving your own product and logging it are **free**. Reading a nutrition-label
  photo is **premium**, under the same rules as Snap-to-Log: AI consent, then the daily scan quota.
- A product that is not found can be added by the user from a label photo or typed in. Either way it is a private row
  that only its owner sees, and it wins over the shared cache for that owner.
- A logged product is an ordinary custom entry (the name, the scaled numbers) plus an additive `product: { id, grams }`
  reference. Shipped app binaries total, edit and re-log it like any quick-add.
- Allergens: Open Food Facts' tags are mapped onto Chefer's EU-14 taxonomy. A clash with anyone at the user's table
  (household included, diets such as vegan or dairy-free too) is a **warning**, never a block, because the user may be
  logging the food for someone else. When Open Food Facts has no allergen data we say "Allergens unknown", never
  "none".
- Open Food Facts data is shown with "Data from Open Food Facts" and a link (ODbL attribution).

## Why scanned products stay out of the reviewed catalog

The ingredient catalog is the source of truth for recipe nutrition and the allergen matcher. Its rows are reviewed
(USDA / CIQUAL references, energy checks, the weekly review) and shared by every recipe. Open Food Facts rows are
crowd-sourced, can change or disappear, and describe one brand's product, not an ingredient. Label scans and typed
products are one user's reading of one pack. Mixing them into the catalog would let unreviewed numbers flow into
every recipe and into the safety matcher. Kept apart, a bad product row can only affect the entries logged from it.

## Consequences

- A product's numbers are only as good as its source. The card says where they came from (Open Food Facts, "from a
  label photo", "Your product") and shows unknown values as unknown, never as 0.
- Cached Open Food Facts rows are refreshed after 30 days. If Open Food Facts is down, the cached copy is served with a
  note saying so.
- Lane C's live scanner (a later store build) needs no API change: it passes the barcode string to
  `products.lookupBarcode`.
