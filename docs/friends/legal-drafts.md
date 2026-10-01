# Following: privacy policy and terms drafts

**Draft for counsel review · prepared 2026-10-01 · apply at Following launch, not before**

| Field               | Value                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status              | **Draft. Not applied.** Nothing in `apps/web/src/app/{privacy,terms}/page.tsx` or `packages/types/src/legal.ts` has been changed. The live legal pages and `LEGAL_VERSIONS` are exactly as they were.                                                                                      |
| Why drafts, not PRs | Merging a change to the legal pages deploys it at once, and bumping `LEGAL_VERSIONS` makes every signed-in user re-accept, for a feature that ships dark. So the owner applies this at launch (section 3).                                                                                 |
| Sources             | [`prd.md`](./prd.md) §5.1, §7, §9, §14, FD-3, FD-14, E11 · [`implementation-plan.md`](./implementation-plan.md) §2 (data), §10 (F3.2) · the live pages `apps/web/src/app/privacy/page.tsx` and `terms/page.tsx`.                                                                           |
| Companion drafts    | [`dpia.md`](./dpia.md) · "At Following launch" sections in [`docs/app-store/ios/privacy-and-rating.md`](../app-store/ios/privacy-and-rating.md), [`review-notes.md`](../app-store/ios/review-notes.md) and [`docs/app-store/android/data-safety.md`](../app-store/android/data-safety.md). |
| Not legal advice    | Like the live pages, this was drafted without a lawyer. Section 4 lists what counsel should decide.                                                                                                                                                                                        |

## 0. Conventions used in the drafts

- **User-facing words.** The feature is called **Following**. The word "Friends" appears nowhere in the text to be pasted.
- **In-app only.** Following activity (follow requests, new followers, accepted requests) is shown only in the app's
  Activity list. The drafts say so, and add no wording about any other delivery channel, because none exists. They
  state that **your email address is never shown to other people**.
- **House style.** Plain language, short sentences, the same section layout as the live pages: a bold lead-in
  followed by a paragraph or a bulleted list. The JSX uses the page's own helpers (`Section`, `Mail`, `linkClass`,
  `Link`) and HTML entities (`&apos;`, `&ldquo;`, `&rdquo;`, `&amp;`), as the live pages do.
- **Where a block goes.** Neither page numbers its sections, so positions are given by the title of the section
  they follow. Both pages' sections currently run in the order listed in 1.1 and 2.1.
- `{…}` is never used as a placeholder inside the JSX. The only placeholders are in section 3: `<LAUNCH-DATE>`.

---

## 1. Privacy policy (`apps/web/src/app/privacy/page.tsx`)

### 1.1 Where each block goes

Current section order of the live page: The short version · Who we are · What we collect and why · Health-related
data · AI processing · Camera & photos · Who receives your data · Transfers outside the EU · How long we keep your
data · Deleting your account · Your rights · Children · Cookies and analytics · Security · Changes to this policy ·
Contact.

| #   | Block                                           | Position                                                                                 | Kind                |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| P1  | New section "Following and what others can see" | Immediately **after** `Camera & photos`, before `Who receives your data`.                | New `<Section>`     |
| P2  | Bullet in "The short version"                   | After the bullet "AI features send your data to an AI provider only after you allow it." | One `<li>`          |
| P3  | Bullet in "What we collect and why"             | After the bullet "What you put into the app".                                            | One `<li>`          |
| P4  | Paragraph in "Health-related data"              | As the last paragraph of the section (after "When you add a household member…").         | One `<p>`           |
| P5  | Bullet in "Who receives your data"              | After the Oracle Cloud Infrastructure bullet (first in the list).                        | One `<li>`          |
| P6  | Bullets in "How long we keep your data"         | After the "Sign-in sessions" bullet, before "Server logs…".                              | Two `<li>`          |
| P7  | Sentence in "Deleting your account"             | Append to the end of the one paragraph in that section.                                  | Text                |
| P8  | Bullets in "Your rights"                        | Replace the "portable" bullet's list of contents; add a withdrawal clause.               | Edit of two bullets |
| P9  | Header comment                                  | Add one line to the MAINTAINERS comment (the processor evidence).                        | Comment             |

"Cookies and analytics", "Transfers outside the EU", "Children" and "Security" need no change. Following adds no
processor and no transfer. Its analytics events are counts and fixed labels only, never names or search text (PRD
§15), which is already what the "In the app" paragraph promises.

### 1.2 P1: the new section

```tsx
<Section id="following" title="Following and what others can see">
  <p>
    Following is an optional part of the Chefer app for iOS and Android. It lets you follow other
    people and be followed. It is off until you turn it on yourself. If you never turn it on,
    nothing in this section applies to you: nobody can find you, and nobody can see anything of
    yours.
  </p>
  <p>
    <strong>What turning it on does.</strong> It creates a Following profile. Others see your first
    and last name (we ask you to confirm them, and you can edit them) and a circle with your
    initials. You choose who can follow you: <em>Private</em> (the default: you approve each person)
    or <em>Public</em> (anyone with Following turned on can follow you without asking). Turning it
    on is your explicit consent to the sharing described here. We record that consent with its date
    and the version of this policy. We ask again when you switch to Public and when you choose to
    share your daily targets.
  </p>
  <p>
    <strong>Who can find you.</strong> Anyone who has turned on Following can find you by searching
    your name. There is no search by email address, and we never show your email address to other
    people. We do not keep what people type in the search box.
  </p>
  <p>
    <strong>What other people can see.</strong>
  </p>
  <ul className="list-disc space-y-2 pl-5">
    <li>
      <strong>Anyone with Following turned on</strong> (unless you blocked them): your name, your
      initials circle, how many people follow you and how many you follow, and whether you follow
      them. Nothing else, whether your profile is Private or Public.
    </li>
    <li>
      <strong>People who follow you</strong> (those you approved, or anyone, if you are Public) see
      the sections you share. You can switch each one off at any time:
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          this week&apos;s meal plan, with each meal&apos;s portion, calories, protein, carbs and
          fat, and the day and week totals;
        </li>
        <li>
          the recipes you wrote or imported. For an imported recipe they also see the website it
          came from, with a link;
        </li>
        <li>
          your active training routine and the workouts you completed in the last 7 days, with sets,
          reps, weights and duration;
        </li>
        <li>
          your daily calorie and macro targets. This one is <strong>off</strong> unless you switch
          it on.
        </li>
      </ul>
    </li>
    <li>
      <strong>Never shared</strong>: your email address, allergies, diets and dislikes, body
      measurements, weight and goal, what you have logged, your household, shopping list, pantry and
      budget, AI chats, notes on workouts and exercises, workouts older than 7 days, and other weeks
      of your plan. Followers cannot see who else follows you or whom you follow.
    </li>
  </ul>
  <p>
    <strong>What followers can do with it.</strong> A follower can save one of your recipes to their
    own saved list, which shows it for as long as they can still see it. They can also add it to
    their own week. That makes a private copy of the recipe (its text, ingredients, nutrition, photo
    and source link) that belongs to them. If you later stop sharing, turn off Following or delete
    your account, copies already made stay with the people who made them. We cannot control what
    someone does with what they can see, for example a screenshot. Approve only people you know, and
    think about this before you choose Public.
  </p>
  <p>
    <strong>Why your meals and workouts need your consent.</strong> A meal plan with calories, or a
    training log, can say something about your health, so under the GDPR it can be special-category
    data (Art. 9). We therefore share it only on your explicit consent (Art. 9(2)(a) and Art.
    6(1)(a)), given when you turn Following on. You can withdraw it at any time, with{' '}
    <em>Turn off Following</em> (everything below) or by switching a section off (that section stops
    being shown at once). Withdrawing does not affect what happened before.
  </p>
  <p>
    <strong>In-app activity.</strong> When someone asks to follow you, follows you, or accepts your
    request, it appears in the Activity list inside the app, with a count on the Following entry.
    Activity items are kept for 90 days. A follow request nobody answers expires after 90 days.
    Chefer does not tell you or anyone else about Following activity in any other way.
  </p>
  <p>
    <strong>Your controls.</strong> In <em>More → Following</em> you can switch Private and Public,
    switch each section on or off, remove a follower, block a person, see and undo your blocks, and{' '}
    <em>Turn off Following</em>. Blocking is immediate and works both ways: you stop seeing each
    other anywhere in the app, and any follows between you are removed. The other person is not
    told.
  </p>
  <p>
    <strong>Turning Following off.</strong> This removes you straight away: your Following profile,
    everyone you follow and everyone who follows you, pending requests, the people you blocked, the
    suggestions you dismissed, and your Activity list are deleted. You cannot be found or followed.
    The reports and moderation records described next are kept, so that leaving and rejoining does
    not wipe them. You can turn Following on again later, starting fresh.
  </p>
  <p>
    <strong>Automatic moderation.</strong> There is no person who reviews Following content. These
    steps are automatic, and each one is written to a log:
  </p>
  <ul className="list-disc space-y-2 pl-5">
    <li>
      A list of blocked words is checked on your display name, and on the name and description of a
      recipe you share. A match is refused with a message, or, for recipes you had before turning on
      Following, the recipe is not shown to followers.
    </li>
    <li>
      Anyone can report a person or a recipe in one tap. A report also blocks, so the reporter stops
      seeing that person and their recipes at once. A report stores who reported, who or what was
      reported, the reason you picked and the time. The person reported is never told who reported
      them.
    </li>
    <li>
      A recipe reported by 3 different accounts is hidden from everyone but its owner. A person
      reported by 5 different accounts is made Private (they cannot switch back to Public) and
      removed from search and suggestions. A report counts only if the reporting account is at least
      24 hours old and its email address is confirmed.
    </li>
    <li>
      We keep the reports and the moderation log (what was done, why, and how many accounts
      reported) so that we can check that the system works and to prevent abuse. Our basis is our
      legitimate interest in keeping Chefer safe (Art. 6(1)(f)). They are kept after you turn
      Following off and are deleted when you delete your account. Reports that you filed are shown
      in the download of your data; reports about you and the moderation log are not.
    </li>
  </ul>
  <p>
    These actions are made by software, not by a person, and we do not believe they have legal or
    similarly significant effects on you. If you think one was a mistake, or you object to the
    processing, email <Mail /> and we will look at it. We can reverse an automatic action.
  </p>
  <p>
    <strong>Who receives this data.</strong> Other Chefer users, as described above. They are
    separate from us and decide for themselves what to do with what they see. Behind the scenes it
    is handled only by the hosting provider already named in this policy; Following adds no new
    provider and no transfer outside the EU.
  </p>
</Section>
```

### 1.3 P2 to P9: the small edits

**P2: "The short version", one new bullet:**

```tsx
<li>
  Following is off until you turn it on. Then only people you approve (or anyone, if you choose
  Public) can see what you share, and your email address is never shown.
</li>
```

**P3: "What we collect and why", one new bullet after "What you put into the app":**

```tsx
<li>
  <strong>Following</strong>, only if you turn it on: your display name, who follows you and whom
  you follow, requests, blocks, reports you file, the choices you make about what to share, and your
  Activity list. Used to provide Following and to keep it safe. Basis: your consent, and our
  legitimate interest in preventing abuse. See{' '}
  <a href="#following" className={linkClass}>
    Following and what others can see
  </a>
  .
</li>
```

**P4: "Health-related data", a last paragraph:**

```tsx
<p>
  If you turn on Following, your meal plan and workouts can be seen by the people who follow you.
  That is described in{' '}
  <a href="#following" className={linkClass}>
    Following and what others can see
  </a>
  . The health details listed above, such as allergies, measurements and weight, are never shown to
  other people.
</p>
```

**P5: "Who receives your data", a bullet after the Oracle Cloud Infrastructure bullet:**

```tsx
<li>
  <strong>Other Chefer users</strong> see what you share, if you turn on Following. They are not our
  service providers. See{' '}
  <a href="#following" className={linkClass}>
    Following and what others can see
  </a>
  .
</li>
```

**P6: "How long we keep your data", two bullets after "Sign-in sessions":**

```tsx
<li>
  <strong>Following</strong>: your profile, follows, blocks and requests are kept until you turn
  Following off or delete your account. Activity items, unanswered follow requests and dismissed
  suggestions are deleted automatically after 90 days.
</li>
```

```tsx
<li>
  <strong>Reports and the moderation log</strong>: kept while your account exists, including after
  you turn Following off, and deleted with your account.
</li>
```

**P7: "Deleting your account", add to the end of the paragraph:**

> Your Following profile, follows, blocks, requests, reports and Activity are deleted with it, and your recipes stop being shown to others. Copies of your recipes that other people made for themselves stay with them, without a link to you.

**P8: "Your rights".** Two edits.

1. In the bullet that starts "get your data in a portable, machine-readable format", extend the parenthesis: replace
   "your account, plans, recipes, logs, workouts, consent history and a log of the AI requests made for you;" with
   "your account, plans, recipes, logs, workouts, consent history, a log of the AI requests made for you, and your
   Following data (settings, people you follow and who follow you, requests, blocks, Activity and the reports you
   filed);".
2. In the bullet that starts "withdraw any consent at any time", add: "Following in More → Following → Turn off
   Following." before "This does not affect what we did before."

**P9: header comment.** Add to the MAINTAINERS comment: "Following (privacy) adds no processor. The evidence for the
statements in the Following section is `docs/friends/prd.md` §7, §9 and FD-14, and `docs/friends/dpia.md`."

---

## 2. Terms (`apps/web/src/app/terms/page.tsx`)

### 2.1 Where each block goes

Current section order of the live page: The short version · Who we are · Who can use Chefer · Your account · Using
Chefer fairly · Your content · Health and nutrition: not medical advice · Allergies: always check yourself · AI
features · Free and Premium · Availability and changes · Ending your account · Our responsibility · Law and
disputes · Changes to these terms · Contact.

| #   | Block                                          | Position                                                                                        | Kind            |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- |
| T1  | New section "Following and shared content"     | Immediately **after** `Your content`, before `Health and nutrition: not medical advice`.        | New `<Section>` |
| T2  | New section "Automatic enforcement"            | Immediately **after** T1.                                                                       | New `<Section>` |
| T3  | Replace paragraph 1 of "Your content"          | In place. The live text says recipes "are not shared with other users", which stops being true. | Edit            |
| T4  | Bullet in "The short version"                  | After "You can delete your account at any time."                                                | One `<li>`      |
| T5  | Bullets in "Using Chefer fairly"               | Append to the list of things not to do.                                                         | Two `<li>`      |
| T6  | Paragraph in "Ending your account"             | After the first paragraph.                                                                      | One `<p>`       |
| T7  | Sentence in "Allergies: always check yourself" | Append.                                                                                         | Text            |
| T8  | Sentence in "Contact"                          | Append.                                                                                         | Text            |

### 2.2 T1 and T2: the new sections

```tsx
<Section title="Following and shared content">
  <p>
    Following is optional. When you turn it on, you choose to share some of your content with the
    people who follow you: this week&apos;s meal plan, the recipes you wrote or imported, your
    routine and recent workouts, and, only if you switch it on, your daily targets. The{' '}
    <Link href="/privacy#following" className={linkClass}>
      Privacy Policy
    </Link>{' '}
    explains exactly what each person can see.
  </p>
  <p>
    <strong>Licence to your followers.</strong> What you share stays yours. While you share it, you
    give us a free, non-exclusive licence to display it, inside Chefer, to the people who are
    allowed to see it, and you allow them to view it, to save a reference to a recipe in their saved
    list, and to make a private copy of a recipe for their own personal use. The licence for
    display and saving ends when you stop sharing it, turn off Following or delete your account.
    Copies people already made for themselves stay with them. Nobody may republish what they see.
  </p>
  <p>
    <strong>Imported recipes.</strong> You may share a recipe you imported only if you have the right
    to. Followers see the website it came from, with a link, and you remain responsible for the
    content you share. If you are a rights holder and think a recipe on Chefer infringes your
    rights, email{' '}
    <a href={`mailto:${SUPPORT_EMAIL}`} className={`${linkClass} break-all`}>
      {SUPPORT_EMAIL}
    </a>{' '}
    with the details and where you saw it.
  </p>
  <p>
    <strong>Your name.</strong> Use your own name, or the name you are known by. Do not pretend to be
    someone else.
  </p>
  <p>
    <strong>What you must not share or do.</strong> In your name, in the name and description of a
    recipe, and in how you use Following, do not:
  </p>
  <ul className="list-disc space-y-1 pl-5">
    <li>post anything hateful, harassing, threatening, sexually explicit, violent or illegal;</li>
    <li>
      share recipes or advice that is dangerous or misleading about food safety, or that you know
      to be false;
    </li>
    <li>share other people&apos;s personal data, or content you have no right to share;</li>
    <li>
      send follow requests in bulk, spam people, or make accounts to get around a block or a
      report;
    </li>
    <li>
      follow, search for or contact someone to harass or stalk them, or use Following to collect
      information about people (including by scraping or automated access);
    </li>
    <li>report people or recipes falsely, or ask others to do so, to silence someone.</li>
  </ul>
  <p>
    <strong>What you see from others.</strong> Recipes and meal plans that other people share are
    theirs and are not checked by us for accuracy, nutrition or safety. Their calories and macros
    are what their plan shows, and may be estimates. Chefer checks a recipe against the allergies
    and diets in <em>your</em> profile, as it does for your own recipes, but that check is
    best effort (see the allergies section above): always read the ingredients yourself. Use what
    you see for yourself only. There is no messaging in Following, and we will never ask you to
    contact someone.
  </p>
</Section>

<Section title="Automatic enforcement">
  <p>
    Following is moderated by software, not by people. <strong>No person reviews reports or shared
    content</strong> before or after these steps run; they are automatic, immediate and logged.
  </p>
  <ul className="list-disc space-y-2 pl-5">
    <li>
      <strong>Word filter.</strong> Names, and the name and description of shared recipes, are
      checked against a list of blocked words. A name or recipe that matches is refused, or a
      recipe you already had is not shown to followers.
    </li>
    <li>
      <strong>Block and report.</strong> You can block anyone at any time. A report is one tap and
      also blocks, so you stop seeing that person and their recipes at once. The person reported is
      not told who reported them.
    </li>
    <li>
      <strong>Hiding a recipe.</strong> A recipe reported by 3 different accounts is hidden from
      everyone but you. People who already saved it or made a copy keep what they have.
    </li>
    <li>
      <strong>Limiting an account.</strong> A person reported by 5 different accounts is made
      Private, cannot make their profile Public, and is removed from search and suggestions.
      People who already follow them keep following.
    </li>
    <li>
      <strong>Which reports count.</strong> Only reports from accounts that are at least 24 hours
      old and have a confirmed email address count towards these numbers. Everyone&apos;s report
      still blocks.
    </li>
    <li>
      <strong>You are told.</strong> If a recipe of yours is hidden, or your profile is limited, the
      app says so where you manage it (on the recipe, or in <em>Sharing &amp; privacy</em>).
    </li>
  </ul>
  <p>
    Automatic systems make mistakes, and people can also misuse reports. If you think a step was
    wrong, email{' '}
    <a href={`mailto:${SUPPORT_EMAIL}`} className={`${linkClass} break-all`}>
      {SUPPORT_EMAIL}
    </a>
    .
    We can reverse an automatic step, but we do not promise a person will look at every message.
    These steps do not replace our right to suspend or close an account under{' '}
    <em>Ending your account</em>. To tell us about content you think is illegal, email the same
    address with where to find it and why; we will act on clear notices without undue delay.
  </p>
</Section>
```

### 2.3 T3 to T8: the small edits

**T3: "Your content", replace paragraph 1.** The live text is: "Recipes, photos, notes and other content you add stay
yours. Recipes you import or create stay in your personal collection and are not shared with other users. To run
Chefer, you give us a free, non-exclusive licence …". Replace the second sentence only:

> "Unless you turn on Following (see below), recipes you import or create stay in your personal collection and are not shown to other users."

Leave the rest of the paragraph, including the licence "only to provide the service to you", as it is: sharing under
Following is covered by the separate licence in T1.

**T4: "The short version", one new bullet:**

```tsx
<li>
  Following is optional and off until you turn it on. Sharing is automatic to the people you allow,
  and moderation is automatic too: no person reviews reports.
</li>
```

**T5: "Using Chefer fairly", two bullets appended to the list:**

```tsx
<li>
  share or do anything the rules in <em>Following and shared content</em> forbid, or try to get
  around blocks, reports or the automatic limits;
</li>
```

```tsx
<li>make false reports, or use many accounts to report or follow.</li>
```

**T6: "Ending your account", a paragraph after the first:**

```tsx
<p>
  If you turn off Following, your social profile, follows, blocks, requests and Activity are deleted
  at once. Copies of your recipes that other people made for themselves stay with them.
</p>
```

**T7: "Allergies: always check yourself", append:** "This applies to recipes other people share with you too."

**T8: "Contact", append:** "Reports made inside the app are handled automatically and are not read by a person. To reach a person, email us."

---

## 3. Apply-at-launch steps (owner)

Do these on one branch, after counsel has reviewed sections 1 and 2 and `docs/friends/dpia.md`, and **before**
`friends` is added to `FEATURE_FLAGS` (plan §14 steps 2 and 6). Choose the launch date `<LAUNCH-DATE>` (ISO
`YYYY-MM-DD`; it must be later than `2026-09-30`).

**Why the order matters.** `friends.activate` records the `SOCIAL_SHARING` consent against `LEGAL_VERSIONS.privacy`
(`social-profile.service.ts`), and the Following intro links to `/privacy`. So the policy section must be live, and the
version bumped, before anyone can turn Following on.

| Step | File                                    | Change                                                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `apps/web/src/app/privacy/page.tsx`     | Apply P1 to P9 (section 1). Set `EFFECTIVE_DATE` from `'30 September 2026'` to the launch date in the page's format, for example `'12 October 2026'`.                                                                                                                                                                     |
| 2    | `apps/web/src/app/terms/page.tsx`       | Apply T1 to T8 (section 2). Set `EFFECTIVE_DATE` from `'26 September 2026'` to the same launch date.                                                                                                                                                                                                                      |
| 3    | `packages/types/src/legal.ts`           | `LEGAL_VERSIONS.terms`: `'2026-09-26'` → `'<LAUNCH-DATE>'`. `LEGAL_VERSIONS.privacy`: `'2026-09-30'` → `'<LAUNCH-DATE>'`. Replace the "Wave 4" comment above `privacy` with one that names Following. The file's header says each version equals the page's `EFFECTIVE_DATE`: keep both pages and both constants in step. |
| 4    | `docs/app-store/release-1-checklist.md` | Rows A7 and section B: record the new versions and that the Terms changed too (the 2026-09-30 note says the Terms stayed at 2026-09-26).                                                                                                                                                                                  |
| 5    | `apps/web/src/app/support/page.tsx`     | Recommended, not in this draft: add short FAQ entries "How do I report or block someone in Following?" and "How do I turn Following off?". The support URL is the published contact point for App Store 1.2.                                                                                                              |

**Current values (verified in the worktree on 2026-10-01):** `LEGAL_VERSIONS = { terms: '2026-09-26', privacy:
'2026-09-30' }`; `CURRENT_TERMS_VERSION` = the later one = `'2026-09-30'`; privacy `EFFECTIVE_DATE` = `'30 September
2026'`; terms `EFFECTIVE_DATE` = `'26 September 2026'`. **Proposed:** both constants `'<LAUNCH-DATE>'`, so
`CURRENT_TERMS_VERSION` = `'<LAUNCH-DATE>'`. No test pins the old literals (`grep` for `2026-09-26`/`2026-09-30` in
tests found none; the tests use the constants).

**Run:** `pnpm --filter @chefer/types test`, `pnpm --filter @chefer/web typecheck`, `pnpm lint`,
`pnpm exec prettier --check` on the three files.

**Effect of the bump (this is a mass prompt):**

- **Web:** `TermsReacceptGate` shows the re-accept sheet to every signed-in user whose latest recorded Terms/Privacy
  acceptance is older than `CURRENT_TERMS_VERSION`, right after the web deploy.
- **Mobile:** `terms-reaccept-sheet.tsx` compares against the constant bundled in the app's JavaScript. It starts
  asking when the over-the-air update that contains the bump arrives (the deploy workflow publishes it on merge). An
  app that has not received that update keeps its old constant and is not asked.
- **Not prompted:** accounts with no recorded Terms acceptance at all (accounts that predate versioned consent), by
  design (`isStale` returns false when no record exists).
- **New sign-ups** record the new version.
- **Everyone who is not asked about Following still gets asked**, because the constant is global. Following is
  flag-gated, so a user who will never see the feature will still re-accept. That is the price of keeping the legal text
  and the consent version in step. To limit the nuisance, apply this on the day the flag is flipped, not weeks before.
- **Order on launch day:** merge and deploy the legal change → open `/privacy#following` and `/terms` and confirm
  the text → then flip the `friends` flag.

---

## 4. Questions for counsel and the owner

1. **Legal basis for moderation records.** The draft names legitimate interest (Art. 6(1)(f)) for reports, the log
   and the word filter. The PRD only names consent for the sharing. Confirm, and confirm the balancing test.
2. **Retention of reports and the moderation log.** Today they have no maximum age: they are kept while the account
   exists, survive "Turn off Following", and are deleted by the account-deletion cascade. Decide a limit (for example,
   24 months) or accept that. The weekly metrics line contains counts only.
3. **Reports about a person.** The data export includes reports the user filed but not reports about them or the
   moderation log. The draft says so. Confirm this is acceptable under Art. 15(4) (rights of the reporters, integrity
   of abuse prevention).
4. **Automated decisions.** Is hiding a recipe or forcing an account private "similarly significant" (Art. 22)? The draft
   says no and offers email contact with an optional reversal. The PRD has no appeal flow (Q-F-13): is an email route
   enough, and may the terms say "we can reverse"? The wording is a commitment the owner has to be willing to keep.
5. **Digital Services Act.** Chefer hosts user content. Check the hosting-service duties that apply to a micro
   enterprise: a point of contact, terms that describe moderation including automated means (section 2.2 does), a
   notice-and-action route for illegal content (the email address in section 2.2), and a statement of reasons when
   content is restricted (the in-app message to the owner, but nothing to the reporter). Confirm the exemptions for
   small providers and whether sharing to followers makes Chefer an "online platform".
6. **Joint or separate control.** The draft treats other users as independent recipients, not as our processors or
   joint controllers.
7. **Name display and impersonation.** Names are not verified. The draft asks users to use their own name and
   relies on reports. Is that enough?
8. **Users under 16.** Age is self-declared. Following adds no age check. The DPIA covers this as a risk.
9. **Imported recipes and copyright.** Sharing an imported recipe with attribution is an owner decision (Q-F-7). The
   draft puts the responsibility on the user and gives a notice route. Counsel to confirm the licence wording in
   section 2.2.
10. **Binary-versus-OTA timing.** The feature reaches installed apps over the air before the next store submission
    updates the age rating and review notes. See the App Store addendum for the order we recommend.
