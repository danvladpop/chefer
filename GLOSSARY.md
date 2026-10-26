# Chefer

Chefer helps people eat well and train: a meal plan and food tracking on one side, gym training on the other, plus
people they follow and trainers who coach them. This glossary holds the words the product and code settle on; add a
term the moment it is agreed.

## Premium

**Tier**:
Which set of features an account has: Free or Premium. Users read it as "Free plan" or "Premium plan".
_Avoid_: plan (that is the meal plan), subscription, membership

**Premium**:
The tier with the AI and planning extras; today it is included at no cost and turned on by the user.
_Avoid_: Pro, paid tier, trial, beta

**Turn on Premium**:
The user's own opt-in that moves an account from Free to Premium; "Switch back to Free" reverses it.
_Avoid_: upgrade (in user copy), subscribe, buy, purchase

**Pitch**:
What a user is shown about Premium at one entry point: a headline, a short lede, up to three benefits,
the rest of what is included, and the terms.
_Avoid_: paywall copy, upsell text

**Job**:
The one thing a pitch leads with (portions for your table, recipe import, the AI chef…); the
**overview** is the job that leads with everything at once.
_Avoid_: perk, feature (when meaning the headline)

**Upgrade source**:
The place in the app a pitch was opened from; it picks the job and names the funnel step.
_Avoid_: trigger, placement, origin

**Entry point**:
A place the user chooses to open a pitch from (a button, a locked card, the tier row); it is never
capped or dismissed.
_Avoid_: nudge (that is the unprompted kind)

**Nudge**:
A pitch the app shows without being asked, at a moment it is relevant; at most one a day, always
dismissible, and a dismissed one stays quiet for a week.
_Avoid_: popup, interstitial, prompt

**Tier row**:
The entry point that states the user's tier at the top of You (mobile) and Profile (web): Free opens
the overview pitch, Premium only shows status.
_Avoid_: plan card, upgrade banner

## Household

**Household**:
The people one account plans meals for: the household owner and their member profiles, some of which may be claimed
by partners. It is anchored on the owner's account (ADR 0003).
_Avoid_: family, group, team

**Household owner**:
The account the household's member profiles, week plan and shopping list belong to. Only the owner generates the
week, follows a saved week or removes partners.
_Avoid_: admin, host, main account

**Member profile**:
One person at the table that the owner added: a name, a portion and safety terms. It may or may not be claimed by a
partner.
_Avoid_: member account, dependant, eater (in user copy)

**Partner**:
A person with their own Chefer account who joined a household by claiming a member profile. A partner sees and edits
the shared week and list; their food logs, weight and targets stay their own.
_Avoid_: co-owner, guest, family member, collaborator

**Household invite**:
A single-use link the owner makes for one member profile; redeeming it makes the redeemer that profile's partner.
_Avoid_: share code, referral, family link

**Claim**:
What a partner does to a member profile on joining: confirm its safety terms and link it to their account. Leaving
unclaims it; the profile stays.
_Avoid_: adopt, merge, take over

**Shared week**:
The household owner's week plan as both owner and partners see it. A partner sees it at their own portion and
against their own targets.
_Avoid_: family plan, joint plan

**Shared list**:
The shopping list of the shared week; ticks show for everyone in the household within seconds, with who ticked them.
_Avoid_: family list, synced list

## Training

**Workout**:
One bout of training of any type (upper body, yoga, a run, a spin class), whether started live or logged afterwards.
_Avoid_: Training session, session, activity

**Workout type**:
The kind of workout: a strength focus (upper body, lower body, full body), a kind of cardio, or a kind of class.
_Avoid_: Session type, activity type, category

**Freestyle workout**:
In "Track my progress", a workout that does not follow a routine day.
_Avoid_: Quick workout, ad-hoc session

**Training style**:
How someone wants the gym side to work for them: "Keep it simple" or "Track my progress". It is a preference, not a skill level.
_Avoid_: Casual / advanced, lifter level, mode

**Routine**:
A person's training plan, made of routine days. Each person has exactly one active routine, whichever training style they use.
_Avoid_: Program, plan (plan means the meal plan)

**My week**:
The "Keep it simple" view of the active routine, with each weekday either a rest day or a planned workout.
_Avoid_: Weekly plan, schedule

**Training day**:
A day with a planned or completed workout of any type.
_Avoid_: Lift day, gym day

## Coaching

**Trainer**:
A person who coaches clients. Being a trainer is something an account switches on, not a separate kind of account.
_Avoid_: Coach, PT, instructor

**Client**:
A person who is being coached by a trainer. A client has at most one trainer.
_Avoid_: Trainee, athlete, coachee

**Coaching**:
The agreed relationship between one trainer and one client, which lets the trainer edit the client's routine.
_Avoid_: Coach (as a noun for a person), link, subscription

**Invite**:
A single-use offer of coaching from a trainer that the client accepts.
_Avoid_: Code, referral

**Coaching request**:
A client's ask to be coached, which the trainer accepts or declines.
_Avoid_: Application, follow request

## Trainer mode

**Personal mode**:
Chefer as it is for anyone: your own food and training.
_Avoid_: Private mode, client mode

**Trainer mode**:
The second app shell for coaching (Schedule · Clients · Today · Workouts · You), available to active trainers. The mode is remembered per device, not per account.
_Avoid_: Coach mode, pro mode

**Template**:
A reusable workout a trainer builds once and assigns to clients. Assigning makes a copy that is the client's own.
_Avoid_: Program, plan, master workout

**Booking**:
A time slot in a trainer's calendar with one or more clients.
_Avoid_: Session, appointment, class

**Blocked time**:
A time slot in a trainer's calendar with no client (a break, the trainer's own training, unavailable).
_Avoid_: Busy event

**Coached workout**:
A workout the trainer logged on the client's behalf ("Logged by Ana"). It belongs to the client.
_Avoid_: Trainer session

**Session delivered**:
A booking the trainer marked attended for a given client. It is the unit trainers bill by.
_Avoid_: Credit, paid session

## Your data

**Data export**:
The ZIP a user downloads from Privacy & data → "Download my data": `chefer-data.json` (everything), a README,
and spreadsheet CSVs. Free for every account.
_Avoid_: backup (we don't restore from it), GDPR request, data dump

**Workout import**:
Bringing past workouts from another app (Strong, Hevy) into Chefer's gym history from that app's CSV export.
Imported workouts count like logged ones: PRs, e1RM charts and progression.
_Avoid_: sync (nothing stays connected), migration

## Curated recipes

**Curated pool**:
The shared, non-personalised recipes free plans are drawn from (`source=CURATED`): the authored fixtures plus
approved ingested recipes.
_Avoid_: free recipes, default recipes, seed recipes

**Ingest**:
An admin pasting a recipe-video or web link so its facts become a draft for the curated pool.
_Avoid_: import (that is a user saving a recipe to their own collection), scrape

**Curated draft**:
An ingested recipe waiting for review; it is never served. Approval turns it into a curated recipe, rejection closes it.
_Avoid_: pending recipe, candidate

**Unpublish**:
Taking an approved ingested recipe out of the curated pool; plans that already hold it keep it.
_Avoid_: delete, retire

**Pool coverage**:
How many curated recipes a household with given restrictions can actually be served per meal type, and so how
soon it repeats (a pool of N daily meals repeats within N ÷ 7 weeks).
_Avoid_: recipe count, catalog size

## Kitchen progress

**Kitchen progress**:
The whole reward system: Chef XP, Chef ranks, the Flame, Today's three, achievements and the weekly recap. It rewards what people do, never body numbers.
_Avoid_: gamification (in user copy), points, game

**Chef XP**:
Progress points earned for real actions (logging, cooking, training, planning, shopping). XP shows progress; it is never spent, sold or taken back.
_Avoid_: points, coins, credits, score

**Chef rank**:
The kitchen-brigade title a level carries, from Kitchen Porter to Three-Star.
_Avoid_: tier (that is Free/Premium), badge, league

**Kitchen receipt**:
The itemised list of why a reward was earned ("+25 Cooked at home, +10 First time making this recipe").
_Avoid_: summary, reward screen

**Active day**:
A day with at least one logged meal, finished cook or completed workout.
_Avoid_: streak day, check-in

**Active-day goal**:
How many active days a week the user aims for (default 3 of 7, user-adjustable).
_Avoid_: daily goal, target (targets are nutrition)

**Flame**:
The main streak: the number of weeks in a row the active-day goal was met. Rest days never break it.
_Avoid_: daily streak, fire, chain

**Pilot light**:
A free, earned freeze that keeps the Flame lit through a short week; one every 4 good weeks, used automatically.
_Avoid_: streak freeze, flex token (that is the gym streak's)

**Today's three**:
Three small, personalised quests a day taken from the user's plan, with a bonus for finishing all three.
_Avoid_: daily challenges, missions, tasks

**Achievement**:
A named goal (Home Chef, Flame…) with one or more tiers (I, II, III); each earned tier is a badge.
_Avoid_: trophy, medal

**Weekly recap**:
The Sunday "unwrap your week" story cards: meals cooked, workouts, PRs, dish of the week, the Flame and XP.
_Avoid_: report, weekly review (that is the coach's ChefReview)

**Celebration level**:
How loudly progress is celebrated: Full party, Subtle or Off. Off still records everything.
_Avoid_: notifications setting

**Cook (finished)**:
A cook-mode session the user finished, stored on the server as a CookLog.
_Avoid_: made it (the button), cooking session

## Health sync

**Health sync**:
Chefer exchanging data with the phone's health store — Apple Health on iOS, Health Connect on Android — one data type at a time, each switched on by the user.
_Avoid_: Health integration, HealthKit sync, Google Fit

**Health store**:
The phone's shared health database: Apple Health (HealthKit) or Health Connect.
_Avoid_: Health app, health provider

**Imported weigh-in**:
A weigh-in read from the health store (a smart scale, another app). It is an ordinary weigh-in in Chefer, marked with its source; the same sample is never imported twice.
_Avoid_: Synced weight, external weight

## Appearance

**Appearance**:
The phone setting that picks the app's colours: Automatic, Day or Night. It lives on the phone, not the account.
_Avoid_: theme (there is one theme, Ember), display settings

**Night mode**:
The app in its dark colours — what Night pins, and what Automatic shows while the phone is in dark mode.
In code it is the `dark` scheme; in user copy it is always "Night" / "night mode".
_Avoid_: dark mode (in user copy), dark theme

**Colour role**:
A colour named for what it does (`canvas`, `label-secondary`, `brand`, `attention`…) with a Day and a Night
value, from `@chefer/tokens`. Every colour on mobile is one.
_Avoid_: palette colour, hex

## Progress

**Weigh-in**:
One body-weight reading the user logged, with its date. Raw and noisy: water, salt and timing move it a kilo or more.
_Avoid_: weight entry (in user copy), measurement

**Trend weight**:
The smoothed line through the weigh-ins (an exponentially weighted average, α = 0.1 a day, gaps handled in time); what
charts draw bold and what the Adaptive Chef reads. "Trend" for short in copy.
_Avoid_: average weight, moving average (in user copy), real weight

**Partly logged day**:
A logged day the user marked as incomplete. It still counts as logged, but the weekly review leaves it out of its
averages.
_Avoid_: missed day, bad day, incomplete day (in user copy)

**Complete day**:
A logged day not marked as partly logged; what the weekly review averages over.
_Avoid_: full day, good day

**Body measurement**:
One day's entry of waist, hips, chest, upper arm, thigh and/or body fat, each optional; free for everyone.
_Avoid_: body metrics (that is height, age, sex and activity on the profile), measurement (alone, in code)
