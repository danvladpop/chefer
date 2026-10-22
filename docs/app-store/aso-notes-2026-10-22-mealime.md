# ASO notes: Mealime shutdown (2026-10-22)

> **For the owner.** This is a dated section for `docs/app-store/aso-plan.md`. That file is untracked in the main checkout, so this lane couldn't edit it. Paste this section in as §10, or keep it here. Nothing below has been applied to any store listing. Every change is a manual owner step.

## 10. Mealime shutdown: keyword and promo-text suggestions (2026-10-22)

### 10.1 What happened (checked 2026-10-22)

- Mealime was discontinued on 21 October 2026. Its users are pointed to Meals Hub inside Albertsons Companies grocery apps. The notice says "All personal data will be deleted when the Mealime application is shut down" and offers no export. Source: <https://www.mealime.com/closing>.
- Public recipe pages on mealime.com still load and carry schema.org Recipe JSON-LD. Chefer's link import reads them (PR for lane L). That is what makes "bring your recipes" honest for now. It may stop working whenever those pages go.
- Chefer covers the same core loop (weekly plan → swap → one aisle-sorted list → cook mode, plus diet filters). It adds household allergy safety, EUR/RON prices, link/video import, a gym log and free export. The web page that makes the comparison is `/switch/mealime`.

### 10.2 Store policy: where the name "Mealime" may and may not go

| Surface                                          | "Mealime" allowed? | Why                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS name, subtitle, keyword field                | **No**             | App Review Guideline 2.3.7: no trademarked terms or other apps' names in metadata. §2 of this plan already says "No competitor names" for the keyword field                                    |
| iOS promotional text, description, screenshots   | **No**             | Same guideline (all metadata). Not indexed anyway                                                                                                                                              |
| Play title, short and full description           | **No**             | Play Metadata policy (no misleading references to other apps; no keyword stuffing) and its intellectual-property rules on third-party trademarks                                               |
| Web page `/switch/mealime` (SEO)                 | Yes, factually     | Nominative use: it names Mealime to say what it replaces, with a not-affiliated line and no logos. This is where the "Mealime alternative" query is meant to land                              |
| Apple Ads keyword bids (if the §5.4 test runs)   | Probably           | Apple Ads lets you bid on competitor terms, and the ad shows only Chefer's own metadata. **Check the current Apple Ads policy before bidding.** If unsure, use the generic terms below instead |
| Play custom store listing keyed to a search term | Later, maybe       | Only once the Play search-terms report shows real queries for it (§2). The listing's own text still must not name Mealime                                                                      |

So the stores get the **generic** version of the message ("new meal planner", "bring your recipes"). The web page carries the named one.

### 10.3 Keyword suggestions (generic, store-safe)

Mealime's users searched for quick, simple weekly dinners and a grocery list. These terms target that audience without naming anyone:

| Term                                       | Tier (§3.2)      | Where                                                                                                                                      |
| ------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| meal planner                               | very hard        | Already in the name (`Chefer: Meal Planner & Gym`). Keep it, don't build on it                                                             |
| weekly meal plan, meal plan grocery list   | winnable         | Already covered by word combination (`weekly`, `grocery`, `list` in the keyword field). Keep                                               |
| dinner planner, easy dinners, quick dinner | winnable (guess) | es-MX locale keyword field already has `dinner`, `easy`, `quick`. On Play, use "easy weekly dinners" once or twice in the full description |
| recipe import, save recipes                | hard             | Play full description: "Import recipes from any link or cooking video". iOS: `recipe` is already in the keyword field                      |
| meal planner app free                      | —                | Don't: "free" in a title breaks Play's title policy, and pricing words are discouraged in Apple metadata                                   |

No keyword-field swap is proposed right now. The 2026-10-16 fields already cover these by combination. Re-check after the next Play search-terms report (§7). If "dinner" or "recipe import" queries show up, move `dinner` into the en-US keyword field in place of the weakest term then.

### 10.4 Promotional text (iOS, 170 max, editable any time, no review)

Use this for a few weeks while people look for a replacement:

> Looking for a new weekly meal planner? A week of dinners, one aisle-sorted shopping list and step-by-step cook mode, checked for every allergy at your table.

(157 characters.) Alternative focused on recipes coming with you (144):

> New meal planner? Bring your recipes from any link or cooking video, plan the week and shop from one list, safe for every allergy at your table.

### 10.5 Play listing line (full description, near the top)

> Moving from another meal planner? Import recipes from any link or cooking video, then plan your week.

(101 characters.) It's generic and store-safe, and adds the terms "meal planner" and "import recipes" once.

### 10.6 Web side (already shipped in the lane L PR)

- `/switch/mealime` is in `sitemap.xml` and linked from the public footer. Its title is "A Mealime alternative for weekly meal plans | Chefer". It has store badges with campaign `switch-mealime` (Play Console → acquisition by `utm_campaign`) and fires the `switch_page_viewed` PostHog event.
- **Time box:** review in 4–6 weeks (around 2026-12-01). Check Search Console impressions for the page, `switch_page_viewed` counts and `switch-mealime` installs. If they're negligible, leave the page up (it's cheap), drop the promo text and move on.

### 10.7 Owner steps

1. Paste the §10.4 promotional text in App Store Connect (any time, no review). Optional.
2. Add the §10.5 line to the Play full description with the next listing edit. Optional.
3. After deploy, submit `https://<domain>/sitemap.xml` in Google Search Console, or request indexing of `/switch/mealime`.
4. If the Apple Ads test (§5.4) runs, decide whether to include a competitor-term ad group after checking Apple's current policy.
