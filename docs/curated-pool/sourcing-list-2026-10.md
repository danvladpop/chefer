# Curated pool: recipes to source next (2026-10-22)

Market review F2. What to paste into `/admin/recipes` next, ranked by where the free pool is thinnest
for restricted households. Numbers come from `pnpm recipes:coverage` (or `/admin/recipes/coverage`)
on the 105-recipe pool at master `98d54302`. A meal type is eaten once a day, so a pool of N repeats
within N ÷ 7 weeks.

**Fits** is a sourcing hint, not a label. Approval derives the real diet tags from the ingredients,
and the allergen check runs again. Abbreviations: **VG** vegan, **V** vegetarian, **GF** gluten-free,
**DF** dairy-free, **NF** no tree nuts or peanuts, **EF** egg-free. Times are prep + cook.

## Where the pool is thin

| Household                | Breakfast |  Lunch | Dinner | Snack |
| ------------------------ | --------: | -----: | -----: | ----: |
| No restrictions          |        28 |     27 |     39 |    11 |
| Vegan + nut-free         |     **8** | **12** |     15 | **4** |
| Nut-free + dairy-free    |    **13** |     21 |     29 | **6** |
| Gluten-free + dairy-free |    **12** | **13** |     24 | **7** |
| Vegetarian + gluten-free |        15 | **11** |     19 |    10 |
| Vegan                    |        14 |     15 |     19 | **6** |
| Dairy + egg allergy      |        14 |     24 |     32 | **8** |

Bold = repeats within 2 weeks. Other gaps:

- **Snacks**: 11 in total. Every restricted household repeats them within about a week.
- **Quick dinners**: no dinner at 15 minutes or less, and only 7 at 30 minutes or less. Most dinners take 31–45 minutes.
- **Cuisine**: American (16) leads; Romanian (15) is a close second, with no Romanian snack and only 3 breakfasts.
- **Diet tags on fixtures**: a few authored recipes are dairy-free by ingredients but lack the tag, so the dairy-free _diet_ (strict) sees 18 breakfasts where the dairy _allergy_ sees 20. That is a fixture fix, not a sourcing one.

Keto (1–2 per meal) and paleo (0–2) are near-empty. That is out of scope for this list unless the owner wants those diets served on Free.

## P1: fill the red cells (75)

### Snacks, mostly vegan / nut-free / dairy-free (25)

| #   | Dish                                                             | Fits       | Time |
| --- | ---------------------------------------------------------------- | ---------- | ---- |
| 1   | Zacuscă on cucumber rounds                                       | VG GF NF   | 5    |
| 2   | Roasted pumpkin seeds with paprika                               | VG GF NF   | 20   |
| 3   | Pickled vegetable plate (murături asortate)                      | VG GF NF   | 5    |
| 4   | White bean dip with crudités                                     | VG GF NF   | 10   |
| 5   | Baked apple with cinnamon (măr copt)                             | VG GF NF   | 25   |
| 6   | Muhammara with sunflower seeds instead of walnuts                | VG NF      | 15   |
| 7   | Pear with dark chocolate and sunflower seeds                     | VG GF NF   | 5    |
| 8   | Spiced roasted fava beans                                        | VG GF NF   | 35   |
| 9   | Oat and date energy balls (seed butter)                          | VG NF      | 15   |
| 10  | Carrot and beetroot sticks with tahini dip                       | VG GF NF   | 10   |
| 11  | Popcorn with smoked paprika                                      | VG GF NF   | 5    |
| 12  | Plum compote (compot de prune) with oat crumble                  | VG NF      | 20   |
| 13  | Bruschetta with tomato and basil                                 | VG NF      | 10   |
| 14  | Grilled courgette roll-ups with herbed bean spread               | VG GF NF   | 15   |
| 15  | Baked kale crisps                                                | VG GF NF   | 20   |
| 16  | Watermelon with mint and lime                                    | VG GF NF   | 5    |
| 17  | Roasted aubergine dip with pita (baba ganoush)                   | VG NF      | 40   |
| 18  | Rice cakes with mashed peas and lemon                            | VG GF NF   | 5    |
| 19  | Soy yogurt with stewed sour cherries                             | VG GF NF   | 10   |
| 20  | Mini vegetable fritters (chiftele de legume, baked)              | V NF       | 30   |
| 21  | Hard-boiled eggs with zacuscă                                    | V GF DF NF | 12   |
| 22  | Cucumber-tomato salad cups with sunflower seeds                  | VG GF NF   | 5    |
| 23  | Banana "nice cream" with cocoa                                   | VG GF NF   | 5    |
| 24  | Smoked mackerel and lemon pâté (no cream cheese) on rye crackers | DF NF EF   | 10   |
| 25  | Telemea and grapes                                               | V GF NF EF | 3    |

### Breakfasts for vegan, nut-free and dairy-free tables (25)

| #   | Dish                                                                 | Fits       | Time |
| --- | -------------------------------------------------------------------- | ---------- | ---- |
| 26  | Mămăligă with sautéed mushrooms and tomatoes                         | VG GF NF   | 20   |
| 27  | Savoury buckwheat with fried onions and greens                       | VG GF NF   | 20   |
| 28  | Oat porridge with stewed plums and pumpkin seeds                     | VG NF      | 10   |
| 29  | Chickpea-flour omelette with peppers (socca-style)                   | VG GF NF   | 15   |
| 30  | Potato and leek rösti with tomato salad                              | VG GF NF   | 25   |
| 31  | Millet porridge with apple and cinnamon (mei)                        | VG GF NF   | 20   |
| 32  | Rye toast with hummus, cucumber and dill                             | VG NF      | 5    |
| 33  | Baked beans on toast (homemade, no sugar added)                      | VG NF      | 15   |
| 34  | Spanish pan con tomate with olive oil                                | VG NF      | 5    |
| 35  | Rice porridge with cardamom and pear                                 | VG GF NF   | 25   |
| 36  | Tofu "jumări" with onions and paprika                                | VG GF NF   | 15   |
| 37  | Polenta breakfast bowl with beans and avocado                        | VG GF NF   | 15   |
| 38  | Smoked tofu, roasted pepper and spinach wrap                         | VG NF      | 10   |
| 39  | Quinoa porridge with berries and seeds                               | VG GF NF   | 20   |
| 40  | Zacuscă and avocado on sourdough                                     | VG NF      | 5    |
| 41  | Overnight oats with soy milk, apple and sunflower seeds              | VG NF      | 5    |
| 42  | Sweet potato toast with tahini and pomegranate                       | VG GF NF   | 15   |
| 43  | Courgette and chickpea-flour fritters                                | VG GF NF   | 20   |
| 44  | Turkish menemen with tomatoes and peppers                            | V GF DF NF | 15   |
| 45  | Scrambled eggs with tomatoes and spring onion on rye                 | V DF NF    | 10   |
| 46  | Ham, egg and tomato breakfast skillet                                | GF DF NF   | 15   |
| 47  | Smoked salmon and egg on rice cakes                                  | GF DF NF   | 10   |
| 48  | Fried eggs with sautéed greens and potatoes                          | V GF DF NF | 20   |
| 49  | Bircher muesli with oat milk and grated apple, seeds instead of nuts | VG NF      | 10   |
| 50  | Gluten-free buckwheat crêpes with mushrooms                          | VG GF NF   | 25   |

### Lunches for vegetarian + gluten-free, vegan and GF + DF tables (25)

| #   | Dish                                                    | Fits       | Time |
| --- | ------------------------------------------------------- | ---------- | ---- |
| 51  | Ciorbă de fasole (bean soup, no smoked meat)            | VG GF NF   | 50   |
| 52  | Supă cremă de dovleac (pumpkin cream soup)              | VG GF NF   | 35   |
| 53  | Supă de linte roșie with lemon                          | VG GF NF   | 30   |
| 54  | Salată de boeuf, vegetarian (potato, peas, pickles)     | V GF NF    | 40   |
| 55  | Mâncare de mazăre (pea stew) with rice                  | VG GF NF   | 35   |
| 56  | Spanakorizo (Greek spinach rice), no feta               | VG GF NF   | 30   |
| 57  | Lentil and beetroot salad with mustard dressing         | VG GF NF   | 25   |
| 58  | Potato salad with dill and pickles (Eastern European)   | VG GF NF   | 25   |
| 59  | Gazpacho with chickpeas                                 | VG NF      | 15   |
| 60  | Roasted cauliflower and chickpea bowl with tahini       | VG GF NF   | 35   |
| 61  | Borș de legume (sour vegetable soup)                    | VG GF NF   | 45   |
| 62  | Tabbouleh with quinoa instead of bulgur                 | VG GF NF   | 20   |
| 63  | Stuffed tomatoes with rice and herbs                    | VG GF NF   | 45   |
| 64  | Polenta with bean stew and pickled cabbage              | VG GF NF   | 30   |
| 65  | Minestrone with rice instead of pasta                   | VG GF NF   | 40   |
| 66  | Ciorbă de pui à la grecque (lemon chicken soup)         | GF DF NF   | 45   |
| 67  | Chicken and vegetable rice soup                         | GF DF NF   | 40   |
| 68  | Tuna, potato and green bean salad (niçoise, no anchovy) | GF DF NF   | 25   |
| 69  | Baked potato with bean chilli                           | VG GF NF   | 45   |
| 70  | Fasole verde cu roșii (green bean and tomato stew)      | VG GF NF   | 30   |
| 71  | Buckwheat salad with roasted vegetables and herbs       | VG GF NF   | 30   |
| 72  | Egg salad lettuce cups with radishes                    | V GF DF NF | 15   |
| 73  | Carrot and ginger soup with crispy chickpeas            | VG GF NF   | 30   |
| 74  | Grilled vegetable and white bean salad                  | VG GF NF   | 25   |
| 75  | Ratatouille with brown rice                             | VG GF NF   | 50   |

## P2: quick dinners, 30 minutes or less (30)

| #   | Dish                                                      | Fits       | Time |
| --- | --------------------------------------------------------- | ---------- | ---- |
| 76  | Pork schnitzel (șnițel) with cucumber salad               | DF NF      | 25   |
| 77  | Chicken piccata with green beans                          | NF         | 25   |
| 78  | Garlic prawns with rice and peas                          | GF DF NF   | 20   |
| 79  | Pan-fried trout with lemon and boiled potatoes            | GF NF EF   | 25   |
| 80  | Spaghetti aglio e olio with broccoli                      | VG NF      | 15   |
| 81  | Gnocchi with tomato sauce and spinach                     | V NF       | 15   |
| 82  | Chicken and pepper skillet with paprika (papricaș, quick) | GF NF      | 30   |
| 83  | Turkey kofta with yogurt sauce and salad                  | GF NF      | 25   |
| 84  | Salmon teriyaki-style with rice and pak choi              | DF NF      | 20   |
| 85  | Omelette with potatoes and herbs (tortilla, quick)        | V GF DF NF | 25   |
| 86  | Egg fried rice with peas and carrots                      | V DF NF    | 15   |
| 87  | Chickpea and spinach stew with paprika                    | VG GF NF   | 20   |
| 88  | Penne with tuna, capers and tomatoes                      | DF NF EF   | 20   |
| 89  | Beef and broccoli stir-fry with rice                      | DF NF      | 20   |
| 90  | Mici-style skinless sausages with mustard and salad       | GF DF NF   | 25   |
| 91  | Chicken souvlaki with tzatziki and pita                   | NF EF      | 25   |
| 92  | Cod in tomato sauce with olives (pescado a la plancha)    | GF DF NF   | 25   |
| 93  | Mushroom stroganoff with rice                             | V GF NF    | 25   |
| 94  | Pasta with peas, mint and lemon                           | VG NF      | 15   |
| 95  | Halloumi and vegetable skewers with couscous              | V NF       | 25   |
| 96  | Pork chops with apples and mashed potatoes                | GF NF      | 30   |
| 97  | Lentil and mushroom shepherd's pie (quick skillet)        | VG GF NF   | 30   |
| 98  | Mackerel with beetroot and potato salad                   | GF DF NF   | 20   |
| 99  | Tofu with green beans in garlic-soy sauce                 | VG DF NF   | 20   |
| 100 | Chicken liver with onions and mămăligă (ficăței)          | GF DF NF   | 25   |
| 101 | Vegetable and bean quesadillas                            | V NF       | 20   |
| 102 | Prawn and courgette risotto (quick)                       | GF NF EF   | 30   |
| 103 | Polenta with fried eggs and sautéed peppers               | V GF NF    | 20   |
| 104 | Chicken shawarma bowl with rice and salad                 | GF DF NF   | 30   |
| 105 | Pasta e fagioli                                           | VG NF      | 30   |

## P3: Romanian and Eastern European classics (30)

| #   | Dish                                           | Meal      | Fits       | Time |
| --- | ---------------------------------------------- | --------- | ---------- | ---- |
| 106 | Ciorbă de burtă (light version)                | lunch     | GF NF      | 120  |
| 107 | Ciorbă de văcuță                               | lunch     | GF DF NF   | 90   |
| 108 | Ciorbă rădăuțeană                              | lunch     | GF NF      | 75   |
| 109 | Supă de găluște                                | lunch     | DF NF      | 45   |
| 110 | Tochitură moldovenească                        | dinner    | GF NF      | 50   |
| 111 | Musaca de cartofi                              | dinner    | GF NF      | 75   |
| 112 | Musaca de vinete (aubergine moussaka)          | dinner    | NF         | 80   |
| 113 | Varză călită cu cârnați                        | dinner    | GF DF NF   | 50   |
| 114 | Varză călită (vegan, with rice)                | dinner    | VG GF NF   | 45   |
| 115 | Pilaf cu pui                                   | dinner    | GF DF NF   | 45   |
| 116 | Piept de pui cu ciuperci și smântână           | dinner    | GF NF      | 35   |
| 117 | Pește la cuptor cu legume (baked carp or hake) | dinner    | GF DF NF   | 45   |
| 118 | Saramură de pește                              | dinner    | GF DF NF   | 35   |
| 119 | Chiftele de pui la cuptor with mashed potatoes | dinner    | NF         | 45   |
| 120 | Ostropel de pui                                | dinner    | GF DF NF   | 50   |
| 121 | Gulaș de vită                                  | dinner    | GF DF NF   | 90   |
| 122 | Mâncare de cartofi (potato stew)               | dinner    | VG GF NF   | 40   |
| 123 | Ardei umpluți cu carne                         | dinner    | GF NF      | 75   |
| 124 | Dovlecei umpluți (stuffed courgettes)          | dinner    | GF NF      | 60   |
| 125 | Papanași (baked, lighter)                      | breakfast | V NF       | 35   |
| 126 | Clătite cu brânză (cheese pancakes)            | breakfast | V NF       | 30   |
| 127 | Pâine prăjită cu ou (eggy bread) with tomatoes | breakfast | V NF       | 15   |
| 128 | Salată de roșii cu telemea și ceapă            | lunch     | V GF NF EF | 10   |
| 129 | Salată orientală (potato, egg, olives, onion)  | lunch     | V GF DF NF | 30   |
| 130 | Pierogi with potato and onion                  | dinner    | V NF       | 60   |
| 131 | Polish żurek with egg (light)                  | lunch     | DF NF      | 45   |
| 132 | Hungarian lecsó with eggs                      | dinner    | V GF DF NF | 30   |
| 133 | Bulgarian shopska salad                        | lunch     | V GF NF EF | 10   |
| 134 | Serbian prebranac (baked beans)                | dinner    | VG GF NF   | 70   |
| 135 | Ukrainian borscht (meat-free)                  | lunch     | VG GF NF   | 60   |

## P4: other European weeknight staples (15)

| #   | Dish                                              | Meal      | Fits       | Time |
| --- | ------------------------------------------------- | --------- | ---------- | ---- |
| 136 | French lentils with sausage and carrots           | dinner    | GF DF NF   | 45   |
| 137 | Italian chicken cacciatore with polenta           | dinner    | GF DF NF   | 50   |
| 138 | Spanish chickpea and chorizo stew                 | dinner    | GF DF NF   | 35   |
| 139 | Portuguese caldo verde                            | lunch     | GF DF NF   | 35   |
| 140 | Greek fasolada (white bean soup)                  | lunch     | VG GF NF   | 60   |
| 141 | Greek gemista (stuffed peppers and tomatoes)      | dinner    | VG GF NF   | 75   |
| 142 | Italian ribollita                                 | lunch     | VG NF      | 50   |
| 143 | German potato and cucumber salad with frankfurter | lunch     | GF DF NF   | 25   |
| 144 | Swedish meatballs with potatoes and lingonberry   | dinner    | NF         | 40   |
| 145 | Turkish red lentil köfte (mercimek köftesi)       | lunch     | VG NF      | 35   |
| 146 | Croatian brudet (fish stew) with polenta          | dinner    | GF DF NF   | 45   |
| 147 | Italian frittata with courgette and mint          | breakfast | V GF NF    | 20   |
| 148 | French ratatouille omelette                       | breakfast | V GF DF NF | 20   |
| 149 | Spanish tortilla de patatas                       | lunch     | V GF DF NF | 40   |
| 150 | Greek yogurt with honey, oats and stewed quince   | snack     | V NF       | 10   |

## How to work through it

1. Find a short video or a recipe page for the dish. Prefer creators who list exact amounts in the
   caption: captions are the cheapest source (no Whisper) and give the most reliable quantities.
2. Paste the link at `/admin/recipes`. Each link costs one extraction plus one prose rewrite against
   `CURATED_INGEST_DAILY_CAP` (default 20 a day).
3. In review, match every line to the catalog, tick the meal slots, check the steps, and approve.
4. Re-run `pnpm recipes:coverage` after each batch of about 20. The red cells above should move to
   amber (14 or more) first, then clear (28 or more).
