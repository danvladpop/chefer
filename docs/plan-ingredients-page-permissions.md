# Implementation Plan — Ingredients Page & Permissions

Status: **planned**

## Permission model

| Row type                    | Visible to                                               | Editable/deletable by |
| --------------------------- | -------------------------------------------------------- | --------------------- |
| Global (`creatorId = null`) | everybody                                                | **Admins only**       |
| Custom (`creatorId = user`) | creator only (even admins don't see others' custom rows) | creator only          |

- The ADMIN concept already exists (`UserRole.ADMIN`, `adminProcedure`); visibility
  filtering already exists in `ingredients.search`/`computeNutrition`. New here:
  edit/delete surface + the page.
- **Alice Johnson becomes ADMIN** (DB update + seed script + docs so it survives
  reseeds). Admins already count as premium.
- Protection against the weekly AI refresher: rows whose `source` is not
  `AI_ESTIMATE` (i.e. `USER` custom rows and `ADMIN`-edited globals) are never
  re-estimated, so manual edits stick. Deleting a global row lets the vocabulary
  worker re-create it with fresh AI estimates if recipes still use it.

## Backend (`ingredients` router/service)

- `list { search?, mineOnly?, limit?, offset? }` — full-detail rows (macros,
  prices, gramsPerPiece, image, `isCustom`, `canEdit` computed server-side from
  ownership/role).
- `update { name, imageUrl?/generateAiImage?, macros…, gramsPerPiece?, prices… }`
  — allowed for own custom rows, or global rows when ADMIN (ownership check in
  service per the architecture rules; admin edits set `source: 'ADMIN'`).
- `delete { name }` — own custom rows; admins may also delete global rows.
  Another user's custom row behaves as NOT_FOUND (existence hidden).

## Frontend

- `CustomIngredientModal` generalised into `IngredientFormModal`
  (`features/ingredients/components/`): create + edit modes; name locked in edit
  (it's the primary key); price fields editable; the recipe-form picker keeps
  using create mode.
- New sidebar item **Ingredients** (`/ingredients`), styled like the Recipes
  page: header with "Add ingredient", tabs **All** / **My Ingredients**, search,
  card grid (image, name, "Mine" badge, per-100g macros, price estimate,
  Edit/Delete buttons when permitted, "Load more" pagination).

## Verification

Alice (admin): edits a global ingredient (persists, survives refresh), sees the
ADMIN badge. Custom rows show under My Ingredients with edit/delete. Bob cannot
edit globals and doesn't see Alice's custom rows.
