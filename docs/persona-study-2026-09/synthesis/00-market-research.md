# 00 — Market & competitive research dossier: Chefer

**Author role:** senior market researcher (consumer health, fitness and food apps)
**Date:** 2026-09-26. All sources accessed on 2026-09-26 unless stated otherwise.
**Feeds:** stage 2 of the persona-study pipeline (`02-business-strategy.md`).

**How to read this.** Sections 1–4 are **evidence**, and each claim carries a source tag `[Sx]` (see Sources). Section 5 keeps the evidence (5.1) apart from **my opinion** (5.2–5.4). Reliability flags:

- ⚠️ **secondary**: the figure comes from a review or SEO blog, often run by a competing app (for example NutriScan, Nutrola, MealThinker, sensai.fit). Use it for direction only.
- ⏳ **older**: the data predates 2025.
- ❓ **conflicting**: sources disagree.

US prices are from US storefronts. **RON prices were read from the Romanian App Store listings on 2026-09-26.** Apple lists all in-app purchase price points, including promotional and legacy ones, so RON figures are ranges.

---

## 0. The product being benchmarked (from the repo)

Source: `packages/types/src/plan-features.ts` and `business_flow.md` §9–§26.

| Area               | Free tier                                                                                                                                                     | Premium tier (free during beta; no payment integration yet)                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meal plans         | Curated weekly plans from a chef-curated pool, filtered by allergies and restrictions and portioned toward calorie and protein targets. 3 generations per day | AI plans. Personal targets (goal, body metrics, calories). AI swaps (30/day). Budget cap ("keep my week under €X"). Week auto-generated every Sunday. 20 generations per day |
| Safety             | Allergies, restrictions and dislikes are free on every tier. Household members (up to 5) with their own allergies are free                                    | Same                                                                                                                                                                         |
| Shopping           | List with estimated week cost (Carrefour RO price data)                                                                                                       | AI-consolidated list                                                                                                                                                         |
| Tracking           | Quick add (name + kcal, optional macros). Weight tracking                                                                                                     | Snap-to-log photo scan (10/day). Week rebalance. AI nutrition auto-fill (30/day)                                                                                             |
| Coaching / AI      | Locked chat preview                                                                                                                                           | AI chef chat. Adaptive weekly coach review. Training-day nutrition bump                                                                                                      |
| Cookbook           | Cook mode, curated recipes                                                                                                                                    | Recipe import from URL, text, video link or photo (5/day)                                                                                                                    |
| Household / pantry | Members and their safety data                                                                                                                                 | Portion scaling for the table. Zero-waste pantry planning                                                                                                                    |
| Gym                | **Everything free**: library, editable routines from templates, offline set logging with RIR, deterministic progression, stats, pause, reminders              | Same                                                                                                                                                                         |

Two facts about the product matter for the comparison below:

1. Personal calorie-target editing is **premium**. The free onboarding stores optional basics, but customising the targets is behind the paywall.
2. Nothing in the repo docs mentions a barcode scanner, Apple Health / Health Connect sync, watch apps or UI localisation. Wearables and health sync are listed as _out of scope_ in `gym_plan.md`.

---

## 1. Competitor landscape

### 1.1 Summary table

| App                      | Core job                                                | Target user                       | Platforms                         | Free tier                                                       | Paid, US (mo / yr / lifetime)                                                     | Paid, Romanian App Store (lei)                                 | Romanian UI?          | Notable 2025–26 AI                                                                                                        |
| ------------------------ | ------------------------------------------------------- | --------------------------------- | --------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **MyFitnessPal**         | Calorie/macro logging                                   | Mass-market dieters               | iOS, Android, web                 | Logging with ads. Barcode scanner paywalled since 2023          | Premium $19.99 / $79.99. Premium+ $24.99 / $99.99 (adds Meal Planner) [S1][S2] ⚠️ | 39.99–409.99 [S4]                                              | Not listed [S4]       | Meal Scan photo upload; Meal Planner with dietitian-reviewed recipes (Winter 2026) [S2]. **Bought Cal AI, Mar 2026** [S3] |
| **MacroFactor**          | Adaptive macro coaching. Workouts app launched Jan 2026 | Data-literate lifters and dieters | iOS, Android                      | None (trial only)                                               | $11.99 / $71.99. Bundle with Workouts $89.99/yr [S5] ⚠️                           | 57.99–59.99/mo; 294.99–354.99/yr; bundle 499.99 [S6]           | No (EN, JA only) [S6] | Adaptive expenditure algorithm (V3, late 2025); AI-assisted logging [S7]                                                  |
| **Cronometer**           | Micronutrient-accurate tracking                         | Health optimisers, clinicians     | iOS, Android, web                 | Generous: 84 nutrients, barcode                                 | Gold $10.99 / $59.99 [S8]                                                         | n/a                                                            | n/a                   | Photo Log, Crono Coach, recipe URL importer (all Gold) [S8]                                                               |
| **YAZIO**                | Calorie counting and fasting                            | EU mainstream dieters             | iOS, Android                      | Logging                                                         | ~€4.99–5.99 / ~€29.99, varies by country [S9] ⚠️                                  | 34.99–149.99; 12 months 74.99 or 149.99 [S10]                  | Not listed [S10]      | AI photo logging (late 2025) [S9] ⚠️. 100M+ users claimed [S9] ⚠️                                                         |
| **Lose It!**             | Simple, gamified calorie counting                       | Beginners                         | iOS, Android, web                 | Logging                                                         | $39.99/yr, some reviews say $79.99 [S11] ❓                                       | 29.99–399.99; lifetime 299.99 [S12]                            | Not listed [S12]      | Snap It photo logging (premium). Accuracy criticised [S11] ⚠️                                                             |
| **Noom**                 | Behavioural weight loss; GLP-1 telehealth               | US adults with weight goals       | iOS, Android                      | None                                                            | ~$17.42/mo on a 12-month plan. GLP-1 programmes $179–$299/mo (US) [S13]           | n/a                                                            | n/a                   | Pivot to medication plus coaching. $62M auto-renewal settlement ⏳ [S14]                                                  |
| **Strong**               | Minimal gym logger                                      | Experienced lifters               | iOS, Android, Watch               | Limited routines                                                | $4.99 / $29.99 / $99.99 [S15] ⚠️                                                  | 22.99–23.99/mo; 109.99–142.99/yr; lifetime 399.99–499.99 [S16] | No [S16]              | Little AI                                                                                                                 |
| **Hevy**                 | Social gym logger                                       | Gym-goers of all levels           | iOS, Android, web, Watch, Wear OS | Unlimited workouts; **4 routines**, 7 custom exercises [S17] ⚠️ | $2.99 / $23.99 / $74.99 [S17] ⚠️                                                  | 14.99–22.99/mo; 122.99/yr; lifetime 379.99 [S18]               | Unclear               | Minor. Claims 10M+ users [S19] ❓                                                                                         |
| **Fitbod**               | Auto-generated strength workouts                        | Beginner and intermediate lifters | iOS, Android, Watch               | 3 free workouts or 7-day trial                                  | $15.99 / $95.99 since Aug 2026, up from $12.99 / $79.99 [S20] ⚠️                  | 64.99–89.99/mo; 399.99–499.99/yr [S21]                         | No (EN, PT, ES) [S21] | Algorithmic programming                                                                                                   |
| **Mealime**              | Quick healthy recipes and meal plans                    | Busy home cooks                   | iOS, Android, web                 | Plans and lists                                                 | Pro $5.99 / $49.99 [S23] ⚠️                                                       | n/a                                                            | n/a                   | **Shutting down 21 Oct 2026** [S22]. Pro reportedly free until then [S23] ⚠️                                              |
| **Samsung Food (Whisk)** | Recipe saving, planning, shopping                       | Home cooks, Samsung owners        | iOS, Android, web                 | Recipe import (including social links), planner, lists          | Food+ $6.99 / $59.99; another source says $29.99/yr [S24] ❓                      | n/a                                                            | n/a                   | Personalised plans in Food+. Vision AI is Galaxy-only; some features are US-only [S24]                                    |
| **Paprika 3**            | Personal recipe manager                                 | Recipe collectors                 | iOS, Android, Mac, Windows        | —                                                               | One-time: $4.99 mobile, $29.99 desktop [S25] ⚠️                                   | n/a                                                            | n/a                   | None; web clipper                                                                                                         |
| **Eat This Much**        | Auto-generated meal plans to hit macros                 | Dieters who hate planning         | iOS, Android, web                 | One day at a time                                               | $14.99 / $59.99, promos seen [S26] ⚠️                                             | n/a                                                            | n/a                   | Automatic generator. Grocery list with Instacart/AmazonFresh (US)                                                         |
| **Plan to Eat**          | Recipe import, planner and list                         | Organised family cooks            | iOS, Android, web                 | 14-day trial, no card                                           | $5.95 / $49 ($54.99/yr via Apple) [S27] ⚠️                                        | n/a                                                            | n/a                   | Import-centric                                                                                                            |
| **Ollie**                | AI family meal planner                                  | US parents                        | iOS, Android                      | Trial                                                           | In-app prices $9.99, $28.99, $79.99 (tiers not mapped) [S28]                      | n/a                                                            | n/a                   | AI chat planning for families                                                                                             |

**Pattern across the table** (evidence): every scaled nutrition tracker gives away logging and charges for AI (photo scan, coaching, import) and for speed features such as barcode scanning and voice. Every scaled gym logger gives away logging and charges for _limits_: routine caps, history depth and custom exercises. None of the global apps checked lists Romanian as a supported language on the Romanian App Store (MFP, YAZIO, MacroFactor, Lose It!, Strong, Fitbod; Hevy is unclear) [S4][S6][S10][S12][S16][S21].

### 1.2 Short notes: what users love, what they hate, and retention mechanics

- **MyFitnessPal.** _Love:_ the biggest food database, which Cal AI users now also get: 20M foods and 380+ restaurant chains [S3]. _Hate:_ crowd-sourced duplicates and wrong entries, ads, and once-free features moved behind the paywall, above all the barcode scanner [S1][S59]. _Mechanics:_ streaks, a social feed, Instacart discounts for Premium+ in the US [S2]. **Strategic signal:** the market leader is merging "log" and "plan" (Meal Planner in Premium+) and bought the fastest AI-logging brand [S2][S3].
- **MacroFactor.** _Love:_ an adaptive expenditure algorithm that adjusts targets weekly from logged intake and weight trend, no ads, fast logging. _Hate:_ no free tier, a steep learning curve, and the new Workouts app felt unfinished at launch [S7]. **Signal:** a specialist with strong credibility now sells a **nutrition + training bundle** ($89.99/yr) [S5]. That validates Chefer's food + gym thesis and also names its toughest rival for that thesis.
- **Cronometer.** _Love:_ data accuracy and a free tier that includes barcode scanning. _Hate:_ a dated, dense UI. It is now adding AI (Photo Log, Coach, recipe importer) only in Gold [S8].
- **YAZIO.** A European heavyweight: SEB majority stake since 2023, 100M+ users claimed [S9] ⚠️. Strong in fasting and recipes, and cited by Sensor Tower among the AI-nutrition apps with the fastest revenue growth [S43]. Pricing is regional and discounted in Southern and Eastern Europe [S9] ⚠️. **No Romanian UI**, despite being the most EU-centric of the group [S10].
- **Lose It!** Gamification (badges, streaks) and simplicity for beginners. Snap It accuracy is a recurring complaint [S11] ⚠️.
- **Noom.** A cautionary tale. It paid a $62M class settlement over trial-to-auto-renew practices and cancellation friction [S14], then pivoted toward GLP-1 telehealth [S13]. WeightWatchers filed for Chapter 11 in May 2025 as GLP-1 drugs eroded its diet-subscription model: 4.0M → 3.4M subscribers [S60]. Evidence that "diet coaching" alone is under pressure in the US.
- **Strong vs Hevy.** Both are praised for fast logging between sets. Hevy wins on its generous free tier and social feed (4.9★, 200k+ reviews reported); some users find the feed distracting and it cannot be turned off [S17] ⚠️. The main complaint on both is the **routine cap** on the free tier [S15][S17]. Hevy grew to 2M downloads with no paid marketing (⏳ 2023 interview) [S72].
- **Fitbod.** Valued for auto-generated sessions. Churn talk centres on price, and the price rose in Aug 2026 [S20] ⚠️.
- **Mealime.** Loved for simplicity, and **shutting down 21 Oct 2026** [S22]. Displaced users will be looking for a new home during Q4 2026 (inference).
- **Samsung Food.** A strong free recipe importer, including TikTok and Instagram links, but planning is manual and the best AI is tied to Galaxy phones or the US [S24] ⚠️.
- **Eat This Much.** The closest analogue to "plans that hit your macros". Its main complaint, reported "hundreds of times", is **repetitive meals by week 3–4** and occasional nonsensical meals [S26] ⚠️.
- **Paprika / Plan to Eat.** Loyal niches of recipe collectors who pay once or a little each year. They show that users value _owning their recipes_, not AI.

### 1.3 Romanian and regional players

| Player                                     | What it is                                                                                                                                                                                     | Overlap with Chefer                             | Gap                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| **Kaufland RO app**                        | Offers, 4,000+ recipes (with filters such as lactose-free, vegetarian, gluten-free, and videos), one-tap "add ingredients to a shared shopping list" [S30]                                     | Recipe → shared list, family use                | No goals, macros, weekly plan or tracking. Tied to one retailer      |
| **Carrefour RO app**                       | Act for Good loyalty, personalised offers (with consent), self-scan, price check, list, digital receipts. Smart Cart pilot July 2025 [S31]                                                     | Price data and lists                            | No meal planning found. A potential partner rather than a competitor |
| **Freshful by eMAG**                       | Online hypermarket: 18k+ products, 3.4M orders delivered to 233k households, "My Freshlist" reorder, nutrition info [S32]                                                                      | Grocery fulfilment                              | No recipe or plan layer found                                        |
| **Glovo, Bringo, Wolt, Bolt Food, Sezamo** | Quick commerce and e-grocery. The market was described as ~€1bn (headline figure) and Glovo is in 74 cities [S33]                                                                              | Could fulfil a Chefer list                      | No plan layer                                                        |
| **FitDiary** (RO)                          | AI photo food diary (Gemini) with 7,000 Romanian dishes and a Romanian chat assistant. Solo founder, bootstrapped, relaunched; target 100k downloads and ~1k Pro subscribers by end-2026 [S34] | Direct overlap on snap-to-log for Romanian food | Small; no planning, shopping or gym                                  |
| **Eat & Track** (RO)                       | Food diary with 50k products from Romanian stores, recipes, and an in-app nutritionist marketplace [S35]                                                                                       | Logging                                         | Human-led plans; no AI planner or gym                                |
| **DAHNA** (RO)                             | Menus from 200 recipes using the user's metabolic profile, plus exercise videos [S36] (date unclear ❓)                                                                                        | Food + exercise concept                         | Small recipe base                                                    |
| **myCHEF GPT** (Cluj)                      | AI menus, lists, "cook from what you have"; free; a 2024 article said a mobile app was planned [S37] ⏳                                                                                        | AI chef concept                                 | Current status unknown                                               |
| **SmartMeal-RO**                           | Open-source weekly planner with RON prices from Lidl, Kaufland, Carrefour and Mega Image [S38]                                                                                                 | Price-aware Romanian planning                   | Hobby scale; shows the idea is obvious                               |
| **World Class, 7card, ESX**                | Gym chain and corporate-benefit apps: bookings, access; ESX adds online training and nutrition plans [S39]                                                                                     | Gym audience and a B2B2C channel                | Not set loggers                                                      |
| **Listonic**                               | Romanian-localised shared shopping list [S73]                                                                                                                                                  | Lists                                           | No nutrition                                                         |

---

## 2. Market sizing signals

### 2.1 Category size (treat syndicated research as order-of-magnitude only)

| Metric                                           | Value                                                                                                                    | Source                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Global fitness-app market                        | $12.1bn (2025) → $33.6bn (2033), 13.4% CAGR                                                                              | Grand View [S40]              |
| Europe fitness-app market                        | $2.55bn (2024) → $5.89bn (2030), 14.9% CAGR                                                                              | Grand View [S40] ⏳ base year |
| Health & Fitness in-app purchase revenue, global | **$4.5bn in 2025 (+13%)**; downloads 3.96bn (+0.8%)                                                                      | Sensor Tower [S43]            |
| Where spending is                                | US >50% of global H&F spend; UK second at 8% (2024)                                                                      | Sensor Tower [S42] ⏳         |
| AI as a growth driver                            | 28% of H&F apps use AI keywords in their store listings; AI nutrition among the top growers by IAP revenue               | Sensor Tower [S43]            |
| Meal-planning apps                               | Estimates range from $0.5bn (2023) to $2.45bn (2025); "AI-driven meal planning" $0.83bn (2025) → $2.45bn (2030)          | [S41] ❓ low confidence       |
| European gym membership                          | 75.5M members, €39.1bn revenue, 9.3% population penetration (2025)                                                       | EuropeActive/Deloitte [S49]   |
| Romania, H&F app revenue                         | Top Romanian H&F apps peaked at ~$7.3k (Flo) and ~$6.3k (Strava) of **weekly** revenue in Q3 2024: a small paying market | Sensor Tower [S44] ⏳         |
| Romanian food e-commerce                         | ~$267m (2025), 15–20% growth, online share 0–5%                                                                          | ECDB [S53] ⚠️                 |

### 2.2 Romania-specific context

- **Android dominates.** Romania, Aug 2026: Android 80.6%, iOS 19.4%. Europe: Android 62.7%, iOS 37.3% [S45]. These are Statcounter web-traffic shares, not device installs.
- **Purchasing power.** GDP per capita at 79% of the EU average in PPS (2025), and price levels 40–50% below the EU average [S50]. App-store prices in lei are _not_ discounted to match (MacroFactor costs 294.99–354.99 lei a year [S6]).
- **Inflation.** Romania had the EU's highest annual inflation through 2026: 8.5% (Jan), 9.5% (Apr), 8.2% (Jul), 6.3% (Aug) [S51]. Food budgets are under pressure.
- **Food waste.** EU average 130 kg per person, households 53% (69 kg) in 2023. Romania was missing from that Eurostat release; a secondary estimate of 181 kg per person is unverified ❓ [S52].

### 2.3 Subscription benchmarks

RevenueCat _State of Subscription Apps 2026_: 115k apps, $16bn revenue, published March 2026 [S46].

| Benchmark                               | Health & Fitness (global median)        | Western Europe (all categories)        |
| --------------------------------------- | --------------------------------------- | -------------------------------------- |
| Download → trial (D30)                  | 6.9% (top quartile >23%)                | 5.0%                                   |
| Trial → paid                            | **37.7%** (top quartile >51.4%)         | **29.7%**                              |
| Download → paid (D35)                   | 2.9% (top quartile >6.2%)               | 2.0%                                   |
| Revenue per install, D14 / D60          | $0.48 / $0.66 (highest of any category) | $0.25 / $0.33                          |
| Realised LTV per payer, year 1          | $35.64                                  | $26.64                                 |
| Median price                            | $9.99/mo, $39.94/yr                     | $8.99/mo, $39.44/yr                    |
| Share of subscriptions that are annual  | 68%                                     | —                                      |
| Conversions arriving in week 6 or later | —                                       | 21.2% (the longest tail of any region) |

Across all categories [S46]:

- A **hard paywall** converts 10.7% of downloads to paid by D35, against 2.1% for **freemium**. Revenue per install at D60 is $3.09 against $0.38.
- 55.4% of 3-day-trial cancellations happen on day 0.
- Trial length matters: trial→paid medians are 25.5% for trials of 4 days or less, 37.4% for 5–9 days and 42.5% for 17–32 days (reported via a secondary summary ⚠️).

Adapty, Health & Fitness [S47]:

- 11.2% install→trial.
- Annual plans bring in 61% of revenue.
- Higher-priced annual plans reach an LTV of about $70, against $17 for low-priced ones.
- Price indices vary about 4× between Germany and lower-income markets.

**Retention (low confidence ⚠️; these are aggregator blogs citing Adjust and AppsFlyer).** H&F apps average about **D1 20–27%, D7 ~7%, D30 ~3%**. Leading fitness apps reportedly reach D30 of 8–12% [S48].

**Pricing bands in this sample.** Gym loggers cost $24–30 a year, with lifetime deals at $75–100. Mass trackers cost $30–80 a year. Premium coaching or AI apps cost $60–100 a year. Meal planners cost $49–60 a year. Noom-style coaching costs $200+ a year.

---

## 3. Why people churn, and what retains them

### 3.1 Churn drivers (evidence)

| Driver                            | Evidence                                                                                                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Logging fatigue**               | In a smartphone self-monitoring RCT, dietary tracking fell sharply over 12 weeks [S54]. In two mHealth trials, fewer than half of participants still tracked after week 10 (⏳ 2019) [S54]. Manual logging is widely described as taking 15–20 minutes a day ⚠️                                    |
| **Shame, targets, notifications** | A UCL study of social posts about MyFitnessPal, Strava, WW and others (_British Journal of Health Psychology_, Oct 2025) found shame at logging "unhealthy" food, irritation at nag notifications, discouragement over lost streaks and slow progress, and some users abandoning their goals [S55] |
| **Paywall shifts and ads**        | MyFitnessPal moving the barcode scanner to premium and adding intrusive ads is a leading complaint and a reason to switch [S1][S59] ⚠️                                                                                                                                                             |
| **Inaccurate data**               | Crowd-sourced database errors [S59]. Photo-AI estimates: in a 2025 evaluation of three LLMs, energy error was around 40% for the best models and macro errors reached 42–110% [S58]                                                                                                                |
| **Plan monotony**                 | Eat This Much: the same meals repeat by week 3–4 [S26] ⚠️                                                                                                                                                                                                                                          |
| **Dark-pattern billing**          | Noom's $62M settlement over trial auto-renew and cancellation friction [S14]. The EU "withdrawal button" has been mandatory since 19 Jun 2026 [S69]                                                                                                                                                |
| **Workout loggers**               | Free-tier routine caps on Hevy (4) and Strong [S15][S17]. Price rises (Fitbod) [S20]. The claim that "up to 80% quit within 3 months" is unverified ⚠️                                                                                                                                             |
| **Macro shift**                   | GLP-1 drugs eroding diet subscriptions (WW Chapter 11, subscriber decline) [S60]. Noom's pivot to medication [S13]                                                                                                                                                                                 |

### 3.2 Retention patterns that work (evidence)

- **Gamification helps modestly.** A 2024 meta-analysis of RCTs (eClinicalMedicine) found gamified health apps produced small but significant gains in physical activity over non-gamified apps [S56]. The UCL findings [S55] show the downside when streaks punish lapses.
- **Adaptive, well-timed nudges.** Micro-randomised trials show that notification timing and content change engagement. A reinforcement-learning personalised-prompt arm increased steps at 1 and 2 months against controls [S57].
- **Adaptive plans.** MacroFactor's coaching algorithm and YAZIO's AI features are among the top AI-nutrition revenue growers [S43][S7]. MFP is investing in plans [S2].
- **Low-friction logging.** Photo logging drove Cal AI to 15M+ downloads and $30M+ annual revenue within two years [S3], even though accuracy is limited [S58]. Users pay for _speed_, not precision.
- **Social and community.** Hevy's free social feed is central to its word-of-mouth growth [S17][S72].
- **Trials and annual plans.** H&F is annual-first (68% of subscriptions). Longer trials convert better. Trial users have higher LTV [S46][S47].

---

## 4. Regulatory and trust considerations (EU / Romania)

_This is not legal advice. Items marked "counsel" need a lawyer._

| Topic                                                         | What applies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Relevance to Chefer                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Allergens: Reg. (EU) 1169/2011**                            | Duties fall on **food business operators**, covering prepacked foods and allergen information for non-prepacked food. For distance selling, mandatory information must be available **before the purchase is concluded** [S61]                                                                                                                                                                                                                                                                                                             | Chefer is not selling food, so the labelling duties probably do not apply directly (counsel). If Chefer ever links into checkout, as a Carrefour/Freshful integration would, the retailer's duties apply and Chefer must not contradict them. Annex II's 14 allergens are the natural taxonomy. Chefer already re-checks AI output against allergies and shows "Contains…" warnings (`business_flow.md` §9) |
| **Product liability: Dir. (EU) 2024/2853**                    | Software and AI systems count as "products" under no-fault liability. Transposition deadline is **9 Dec 2026**; it applies to products placed on the market after that date. Damages include medically recognised psychological harm [S70]                                                                                                                                                                                                                                                                                                 | An allergen miss in an AI-generated plan becomes a product-defect question, not just a terms-of-service question. Safety filtering, warnings and logs are the defence. Revisit disclaimers and the evidence trail before Dec 2026 (counsel)                                                                                                                                                                 |
| **Nutrition and health claims: Reg. 1924/2006**               | Covers claims such as "high protein" or "supports immunity" in _commercial communications about food_ [S62]                                                                                                                                                                                                                                                                                                                                                                                                                                | Low risk for recipe tags. Higher risk in marketing copy or retailer co-marketing. Avoid health claims outside the authorised register                                                                                                                                                                                                                                                                       |
| **Medical device status: MDR, MDCG 2019-11 rev.1 (Jun 2025)** | Software used only for lifestyle or wellness is **not** medical device software. The **intended purpose, i.e. the claims made**, decides qualification [S63]                                                                                                                                                                                                                                                                                                                                                                               | Stay "wellness". Never claim to manage diabetes, calculate insulin, or treat or diagnose. Diabetes-friendly recipes should be framed as preference, not therapy                                                                                                                                                                                                                                             |
| **App stores**                                                | Apple 1.4.1: extra scrutiny for health claims; remind users to consult a doctor. 5.1.3: health data may not be used for ads. **5.1.2(i), since 13 Nov 2025:** disclose data sharing with third-party AI in-app and get explicit permission [S64]. Google Play: a Health apps declaration is mandatory, and non-regulated health apps must state they are not a medical device [S65]                                                                                                                                                        | Chefer already has an AI data consent flow (`business_flow.md` §25). The Play Store listing needs the "not a medical device" disclaimer                                                                                                                                                                                                                                                                     |
| **GDPR Art. 9 (special-category data)**                       | Weight, body metrics, allergies and goals are **health data**. The CJEU's _Lindenapotheke_ ruling (C-21/23, Oct 2024) reads health data broadly, including data that reveals health _indirectly_, whatever the controller intends [S66]. Diet choices such as halal, kosher or vegan can also reveal religious or philosophical beliefs (inference). Romania's **Law 190/2018** requires explicit consent (or a legal basis) for automated decisions or profiling based on health data; the digital consent age in Romania is **16** [S67] | Adaptive coaching and AI plans are arguably profiling on health data, so they need explicit, separate consent. A DPIA is likely required (Art. 35(3)(b), large-scale special-category processing). For transfers to Groq (US), use its DPA and SCCs; Groq reportedly offers EU endpoints [S71] ⚠️ (verify, including Cloudflare). Add an age gate at 16                                                     |
| **EU AI Act, Art. 50**                                        | Applies from **2 Aug 2026**. Chatbots must tell people they are interacting with AI unless that is obvious. Providers of generative systems must machine-mark synthetic output (grace period to 2 Dec 2026 for systems already on the market). "Standard editing assistance" is exempt [S68]                                                                                                                                                                                                                                               | Label the chat as AI at first interaction. Check with counsel whether Chefer counts as a "provider" whose AI-generated recipe text or images need machine-readable marking. Otherwise Chefer's AI is minimal-risk                                                                                                                                                                                           |
| **Consumer law**                                              | Online "withdrawal button" mandatory from 19 Jun 2026 (Dir. 2023/2673) [S69]. Noom's settlement is the cautionary case [S14]                                                                                                                                                                                                                                                                                                                                                                                                               | When web payments launch: two-step withdrawal and emailed confirmation. Chefer's existing "no fake urgency" nudge cap is on the right side of this line                                                                                                                                                                                                                                                     |

---

## 5. White-space analysis

### 5.1 Evidence (facts only)

1. **Incumbents are converging on "log + plan + AI".** MFP added Meal Planner to Premium+ and bought Cal AI [S2][S3]. MacroFactor launched Workouts and a bundle [S5][S7]. Cronometer added an importer and a coach [S8].
2. **Standalone meal planners struggle.** Mealime is closing [S22]. Samsung Food planning is manual [S24]. Eat This Much suffers repetition [S26]. Recipe managers survive as cheap niches [S25][S27].
3. **Gym loggers compete on a generous free tier.** Hevy (free, social, 10M+ users claimed) caps routines. Strong caps routines. Fitbod has no free tier [S15][S17][S20].
4. **No global competitor checked offers a Romanian UI** [S4][S6][S10][S12][S16][S21].
   - Romanian retailer apps have recipes and lists but no goal-based planning [S30][S31][S32].
   - Local nutrition apps are small and logging-centric [S34][S35].
   - Chefer itself shows no UI-localisation work in its docs (repo observation; verify).
5. **Romania is 80% Android, price-sensitive and inflation-hit** [S45][S50][S51]. Western-European trial→paid (29.7%) and download→paid (2.0%) are below the global H&F medians [S46].
6. **Photo-AI logging sells despite ~40% error** [S3][S58]. Shame, streak loss and nagging drive disengagement [S55].
7. **Household or family planning is thin.** Ollie (US) is the only dedicated AI family planner in this sample [S28]. Kaufland's shared lists and recipes are the closest thing in Romania [S30].

### 5.2 Opinion: where a combined food + training + household app can plausibly win

1. **"What do _we_ eat this week, what will it cost, and what do I buy?" for Romanian households.**
   - Nobody in the sample joins goal-aware weekly plans, household safety (allergies per member, free), portion scaling and **lei-denominated cost from real Carrefour prices**.
   - Retailers hold the prices but not the plan; trackers hold the goals but not the basket.
   - With the EU's highest inflation, a budget cap ("keep my week under X lei") is a sharper hook in Romania than in Western Europe.
   - Risk: the idea is obvious (SmartMeal-RO exists [S38]), so execution and data freshness are the moat, not the concept.
2. **Lifters who want a free logger _and_ food that follows training.**
   - Free unlimited routines beat Hevy's and Strong's caps on the most-cited complaint.
   - Training-day nutrition (premium) is something Hevy and Strong cannot offer and MacroFactor charges $89.99 for.
   - The best positioning is roughly "Hevy-level free gym plus a chef who feeds your training".
3. **An anti-shame, weekly-rhythm design.**
   - Chefer's gym streak is weekly, with flex weeks and pauses, and has "no red missed markers" (`business_flow.md` §21). That matches what the UCL evidence says to do, and the principle could extend to food logging (weekly averages, no red days).
4. **Trust as a feature.**
   - Free allergy safety, AI output re-checked against allergies, and honest "protein short by N g" messages are credible differentiators against apps criticised for inaccuracy.
   - They also map directly onto 2026–27 regulation (product liability, Art. 50, GDPR Art. 9).
5. **Android-first quality and a Romanian UI.** In a market that is 80% Android and where global apps are English-only, this may matter more than any AI feature. This needs validation.
6. **Timing.** Mealime closes on 21 Oct 2026. Its users want simple planning plus lists, which is Chefer's free-tier sweet spot. This is small in Romania but relevant for EU and English-speaking users.

### 5.3 Opinion: where Chefer risks being "a worse version of" a specialist

| Versus                                       | Risk        | Why                                                                                                                                                                                                                                    |
| -------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MFP, Cronometer, Cal AI (logging)            | **High**    | No barcode scanner or large branded-food database is documented. Photo scan is premium and a commodity, and the inaccuracy is industry-wide. Free users get quick add only, while MFP, YAZIO and Cronometer give free database logging |
| Free calorie trackers (targets)              | **High**    | Editing personal calorie targets is premium in Chefer, but free in MFP, YAZIO, Lose It! and Cronometer. A free user may see Chefer as "less than free"                                                                                 |
| Hevy / Strong (logging)                      | Medium      | Polish, watch apps, social features and Apple Health / Health Connect sync are all out of scope for Chefer. Serious lifters judge on logging speed and integrations                                                                    |
| MacroFactor (adaptive coaching)              | Medium–High | MacroFactor's algorithm is its core product and brand. Chefer's weekly coach review is one feature among many                                                                                                                          |
| Samsung Food, Paprika, Plan to Eat (recipes) | Medium      | Recipe import is premium in Chefer (5 a day) but free in Samsung Food, and Paprika costs a one-time $4.99                                                                                                                              |
| Eat This Much (plans)                        | Medium      | The curated pool may produce the same repetition complaint; pool exhaustion is already an upsell trigger                                                                                                                               |
| Kaufland app (recipes → list)                | Low–Medium  | Free, Romanian-language, 4,000+ recipes, and a shared list built into the grocer                                                                                                                                                       |
| Breadth itself                               | **High**    | Ten modules in one app blur the core job. The churn evidence punishes effort, so every extra surface is a potential logging chore                                                                                                      |

### 5.4 Opinion: implications for stage 2 (hypotheses to test, not decisions)

- **Pick one wedge for acquisition.** Either the Romanian household weekly plan with basket cost, or free gym plus training nutrition. Let the other modules serve retention.
- **Revisit the free/premium line against market norms.**
  - Basic target setting and database logging are table stakes that competitors give away free.
  - Competitors charge for _AI and automation_, which matches Chefer's per-user-AI rule.
- **Price for Romania.** The medians are $39–40/yr [S46] and the Western Europe median is $39.44/yr. Romanian purchasing power points below that. Test a low annual price in lei, and consider a household plan given the family use case.
- **Payment timing.** Freemium converts far below a hard paywall [S46]. Given Chefer's soft paywall, the best lever is probably a longer trial (5–9 days or more) at the moments of highest intent: after the first plan, and at the first household or budget setup.
- **Compliance before scaling.** Complete these before paid launch and before 9 Dec 2026: explicit Art. 9 consent for profiling, a DPIA, Art. 50 labelling, the Play Store "not a medical device" disclaimer, and a withdrawal button for web payments.

**What to validate with real users:** willingness to pay in lei, and whether a Romanian UI matters to them. Whether the basket cost is trusted, given how fresh the prices are. Whether lifters will switch loggers for training nutrition. Whether households adopt the shared plan, or one person plans for everyone.

---

## Sources

All accessed 2026-09-26. ⚠️ = secondary, often run by a competitor; ⏳ = older than 2025; ❓ = uncertain or conflicting.

- [S1] FitBudd, "MyFitnessPal Cost 2026" ⚠️ — https://www.fitbudd.com/post/myfitnesspal-app-cost
- [S2] MyFitnessPal / GlobeNewswire, "MyFitnessPal Debuts Its 2026 Winter Release" (24 Feb 2026) — https://www.globenewswire.com/news-release/2026/02/24/3243668/0/en/myfitnesspal-debuts-its-2026-winter-release.html
- [S3] TechCrunch, "MyFitnessPal has acquired Cal AI" (2 Mar 2026) — https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens/
- [S4] Apple App Store (RO), MyFitnessPal — https://apps.apple.com/ro/app/myfitnesspal-calorie-counter/id341232718
- [S5] MacroFactor, Workouts pricing — https://macrofactor.com/workouts/price/ ; Hronikka, "MacroFactor Pricing 2026" ⚠️ — https://hronikka.com/blog/macrofactor-pricing
- [S6] Apple App Store (RO), MacroFactor — https://apps.apple.com/ro/app/macrofactor-macro-tracker/id1553503471
- [S7] MacroFactor, "Workout App Launched…" (Jan 2026) — https://macrofactor.com/mm-jan-2026/ ; Outlift review — https://outlift.com/macrofactor-review/
- [S8] Cronometer Gold (official) — https://cronometer.com/gold/index.html
- [S9] NutriScan, "YAZIO PRO Pricing 2026" ⚠️ — https://nutriscan.app/blog/posts/yazio-pricing-2026-free-vs-pro-what-pro-unlocks-33b26f8fc7 ; Nutrola, "What Happened to Yazio?" ⚠️ — https://nutrola.app/en/blog/what-happened-to-yazio
- [S10] Apple App Store (RO), YAZIO — https://apps.apple.com/ro/app/yazio-calorie-counter-diet/id946099227
- [S11] FitBudd, "Is Lose It Premium Worth It? 2026" ⚠️ — https://www.fitbudd.com/post/lose-it-premium-review
- [S12] Apple App Store (RO), Lose It! — https://apps.apple.com/ro/app/lose-it-calorie-counter/id297368629
- [S13] Noom, "Noom Program Cost in 2026" — https://www.noom.com/blog/weight-management/noom-cost/ ; NutriScan, Noom Med pricing ⚠️ — https://nutriscan.app/blog/posts/noom-med-pricing-2026-glp1-program-cost-cae274c166
- [S14] Kelley Drye, "Noom to Pay Over $60M to Cancel Automatic Renewal Suit" ⏳ (2022) — https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/noom-to-pay-over-60m-to-cancel-automatic-renewal-suit
- [S15] Strong Help Center, "What is Strong PRO?" — https://help.strongapp.io/article/132-strong-pro ; sensai.fit, "Hevy vs Strong (2026)" ⚠️ — https://www.sensai.fit/blog/hevy-vs-strong-2026
- [S16] Apple App Store (RO), Strong — https://apps.apple.com/ro/app/strong-workout-tracker-gym-log/id464254577
- [S17] sensai.fit, "Hevy Review 2026" ⚠️ — https://www.sensai.fit/blog/hevy-review-2026 ; RepReturn, "Hevy App Review (2026)" ⚠️ — https://repreturn.com/hevy-app-review/
- [S18] Apple App Store (RO), Hevy — https://apps.apple.com/ro/app/hevy-workout-tracker-gym-log/id1458862350
- [S19] Hevy, Community Update July 2026 — https://www.hevyapp.com/community-updates/july-26/ ; Apple App Store (US), Hevy — https://apps.apple.com/us/app/hevy-workout-tracker-gym-log/id1458862350 ❓ (user counts vary 9M–16M)
- [S20] sensai.fit, "Fitbod Review 2026" ⚠️ — https://www.sensai.fit/blog/fitbod-review-2026 ; Fitbod FAQ — https://fitbod.me/faqs/
- [S21] Apple App Store (RO), Fitbod — https://apps.apple.com/ro/app/fitbod-gym-fitness-planner/id1041517543
- [S22] Mealime homepage (shutdown banner, 21 Oct 2026) — https://www.mealime.com/
- [S23] MealThinker, "Mealime Is Shutting Down…" ⚠️ — https://mealthinker.com/blog/mealime-alternative
- [S24] Plan to Eat, "Samsung Food Review" (Jan 2026) ⚠️ — https://www.plantoeat.com/blog/2026/01/samsung-food-review-pros-and-cons/ ; MealThinker, "Samsung Food App 2026" ⚠️ — https://mealthinker.com/blog/samsung-food-alternative
- [S25] Ladle, "Paprika 3 Pricing (2026)" ⚠️ — https://www.useladle.com/blog/paprika-alternative ; Apple App Store (US), Paprika 3 — https://apps.apple.com/us/app/paprika-recipe-manager-3/id1303222868
- [S26] ProMealPlan, "Eat This Much Review (2026)" ⚠️ — https://www.promealplan.com/en/blog/eat-this-much-review-2026 ; MealThinker, "Best Eat This Much Alternative" ⚠️ — https://mealthinker.com/blog/eat-this-much-alternative
- [S27] Ladle, "Plan to Eat Pricing (2026)" ⚠️ — https://www.useladle.com/blog/plan-to-eat-alternative
- [S28] Apple App Store (US), Ollie — https://apps.apple.com/us/app/ollie-family-ai-for-meals/id6480014476
- [S29] TechCrunch, Strava buys Runna and The Breakaway (22 May 2025) — https://techcrunch.com/2025/05/22/strava-is-buying-up-athletic-training-apps-first-runna-and-now-the-breakaway
- [S30] Kaufland Romania, app page — https://www.kaufland.ro/utile/aplicatia-kaufland.html
- [S31] Carrefour Romania, app page — https://carrefour.ro/corporate/aplicatia-carrefour ; Smart Cart press release — https://carrefour.ro/corporate/stiri-presa/noutati/carrefour-lanseaza-in-premiera-smart-cart-primul-carucior-inteligent-din-romania
- [S32] Apple App Store, Freshful by eMAG — https://apps.apple.com/us/app/freshful-by-emag/id1590338608 ; Retail.ro — https://www.retail.ro/articole/stiri-si-noutati/ce-pun-clientii-freshful-by-emag-in-cos-si-cat-de-des-comanda-13105.html
- [S33] Economica.net, quick-commerce market split — https://www.economica.net/batalia-pe-livrarile-rapide-ale-romanilor-cum-si-au-impartit-glovo-bringo-si-wolt-piata-de-1-miliard-de-euro_889764.html ; Retail-FMCG, Glovo 2025 retrospective — https://www.retail-fmcg.ro/e-commerce-2/retrospectiva-glovo-2025.html
- [S34] Start-up.ro, FitDiary (25 Mar 2026) — https://start-up.ro/aplicatia-care-foloseste-ai-sa-iti-spuna-cate-calorii-are-farfuria-de-sarmale-povestea-fitdiary-proiectul-relansat-dupa-o-pauza-de-patru-ani
- [S35] Eat & Track — https://eatntrack.ro/mobileapp
- [S36] StartupCafe, DAHNA ❓ (undated) — https://www.startupcafe.ro/idei-antreprenori/aplicatie-nutritie-meniu.htm
- [S37] Revista Biz, myCHEF (12 Jul 2024) ⏳ — https://www.revistabiz.ro/aplicatia-care-iti-face-meniul-lista-de-cumparaturi-si-iti-ofera-inclusiv-idei-pentru-plating/
- [S38] GitHub, smartmeal-ro — https://github.com/teo-eleven/smartmeal-ro
- [S39] 7card — https://7card.ro/en/ ; ESX — https://esx.ro/ ; World Class Romania (Google Play) — https://play.google.com/store/apps/details?id=ro.worldclass.members&hl=en_US
- [S40] Grand View Research, global fitness apps — https://www.grandviewresearch.com/press-release/global-fitness-app-market ; Europe outlook — https://www.grandviewresearch.com/horizon/outlook/fitness-app-market/europe
- [S41] Virtue Market Research — https://virtuemarketresearch.com/report/meal-planning-and-recipes-application-market ; The Business Research Company — https://www.thebusinessresearchcompany.com/report/ai-driven-meal-planning-apps-global-market-report ; Business Research Insights — https://www.businessresearchinsights.com/market-reports/meal-planning-app-market-113013 ❓
- [S42] Sensor Tower, "State of Mobile Health & Fitness 2025" — https://sensortower.com/blog/state-of-mobile-health-and-fitness-in-2025
- [S43] Sensor Tower, "Health and Fitness Apps See Surging Revenue Fueled by AI" (Feb 2026) — https://sensortower.com/blog/health-and-fitness-apps-ai
- [S44] Sensor Tower, "Top 5 Health and Fitness Apps in Romania Q3 2024" ⏳ — https://sensortower.com/blog/2024-q3-unified-top-5-health%20and%20fitness-revenue-ro-600af518241bc16eb8dce802
- [S45] Statcounter, mobile OS share, Romania — https://gs.statcounter.com/os-market-share/mobile/romania ; Europe — https://gs.statcounter.com/os-market-share/mobile/europe/
- [S46] RevenueCat, "State of Subscription Apps 2026" — https://www.revenuecat.com/state-of-subscription-apps ; summary blog — https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 ; trial-length split via Tasu ⚠️ — https://tasu.ai/library/trial-to-paid-conversion-rate-benchmark
- [S47] Adapty, "In-app subscription benchmarks for Health & Fitness apps" (27 Mar 2026) — https://adapty.io/blog/health-fitness-app-subscription-benchmarks/
- [S48] Business of Apps, H&F benchmarks — https://www.businessofapps.com/data/health-fitness-app-benchmarks/ ; UXCam — https://uxcam.com/blog/mobile-app-retention-benchmarks/ ; Enable3 — https://enable3.io/blog/app-retention-benchmarks-2025 ⚠️
- [S49] EuropeActive, 2025 European Health & Fitness Market Report press release — https://www.europeactive.eu/blog/press-corner-4/strong-growth-in-members-and-revenues-for-european-health-fitness-market-in-2025-140
- [S50] Eurostat, "PPPs for GDP per capita in 2025" — https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260325-1 ; price level indices — https://ec.europa.eu/eurostat/statistics-explained/index.php?title=GDP_per_capita%2C_consumption_per_capita_and_price_level_indices
- [S51] Eurostat euro indicators, inflation (Aug 2026 release) — https://ec.europa.eu/eurostat/en/web/products-euro-indicators/w/2-19082026-ap ; (Sep 2026 release) — https://ec.europa.eu/eurostat/web/products-euro-indicators/w/2-17092026-ap
- [S52] Eurostat, "130 kg of food wasted per person annually in the EU" — https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251016-2
- [S53] ECDB, Online grocery in Romania ⚠️ — https://ecdb.com/resources/sample-data/market/ro/food
- [S54] PubMed 30816851, "Comparing Self-Monitoring Strategies for Weight Loss in a Smartphone App: RCT" ⏳ — https://pubmed.ncbi.nlm.nih.gov/30816851/ ; PubMed 31155473, "Defining Adherence to Mobile Dietary Self-Monitoring…" ⏳ — https://pubmed.ncbi.nlm.nih.gov/31155473/
- [S55] UPI, UCL study in _British Journal of Health Psychology_ (24 Oct 2025) — https://www.upi.com/Health_News/2025/10/24/fitness-apps-detrimental-motivation-study/3281761303530/
- [S56] eClinicalMedicine (2024), gamification meta-analysis — https://www.thelancet.com/journals/eclinm/article/PIIS2589-5370(24)00377-8/fulltext
- [S57] Valle et al. (2025), JITAI pilot MRT — https://doi.org/10.1177/20552076251353267 ; Annual Review of Psychology, JITAIs — https://www.annualreviews.org/content/journals/10.1146/annurev-psych-121024-044244
- [S58] "Performance Evaluation of 3 Large Language Models for Nutritional Content Estimation from Food Images" (2025) — https://www.sciencedirect.com/science/article/pii/S2475299125030185
- [S59] FeastGood, "MyFitnessPal Sucks…" ⚠️ — https://feastgood.com/myfitnesspal-sucks/
- [S60] Axios, WeightWatchers bankruptcy (6 May 2025) — https://www.axios.com/2025/05/06/weight-watchers-bankruptcy-filing-chapter-11-ozempic
- [S61] European Commission, Distance selling (FIC) — https://food.ec.europa.eu/food-safety/labelling-and-nutrition/food-information-consumers-legislation/distance-selling_en ; EUR-Lex 1169/2011 — https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A32011R1169
- [S62] European Commission, Nutrition and health claims — https://food.ec.europa.eu/food-safety/labelling-and-nutrition/nutrition-and-health-claims_en
- [S63] MDCG 2019-11 — https://health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_11_guidance_en_0.pdf ; Emergo by UL on rev.1 (2025) — https://www.emergobyul.com/news/european-revision-primary-software-guidance-mdcg-2019-11-revision-1-small-changes-meaningful
- [S64] Apple, App Review Guidelines — https://developer.apple.com/app-store/review/guidelines/ ; TechCrunch on 5.1.2(i) (13 Nov 2025) — https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai
- [S65] Google Play, Health Content and Services — https://support.google.com/googleplay/android-developer/answer/16679511?hl=en ; Health apps declaration — https://support.google.com/googleplay/android-developer/answer/14738291?hl=en
- [S66] Bird & Bird on CJEU C-21/23 _Lindenapotheke_ (2024) — https://www.twobirds.com/en/insights/2024/global/feeling-unwell-after-the-cjeus-lindenapotheke-decision
- [S67] Linklaters, "Data Protected – Romania" — https://www.linklaters.com/en/insights/data-protected/data-protected---romania ; RecordingLaw, Romania Law 190/2018 guide ⚠️ — https://www.recordinglaw.com/world-laws/world-data-privacy-laws/romania-data-privacy-laws/
- [S68] European Commission, FAQ on Art. 50 AI Act (24 Jul 2026) — https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act
- [S69] Loyens & Loeff, new EU withdrawal-function rules — https://www.loyensloeff.com/insights/news--events/news/new-eu-rules-on-withdrawing-from-online-contracts/
- [S70] EUR-Lex, Directive (EU) 2024/2853 (Product Liability) — https://eur-lex.europa.eu/eli/dir/2024/2853/oj/eng
- [S71] GroqCloud Data Processing Addendum — https://console.groq.com/docs/legal/customer-data-processing-addendum ⚠️ (EU endpoint claim from a secondary source; verify)
- [S72] RevenueCat podcast, Hevy: "Two Million Downloads, No Paid Marketing" ⏳ — https://www.revenuecat.com/blog/growth/guillem-ros-hevy-podcast
- [S73] Listonic Romania — https://listonic.com/ro
