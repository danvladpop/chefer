// ─── Email templates (audit P2-5) ─────────────────────────────────────────────
// Pure renderers: data in, { subject, text, html } out. The HTML is plain,
// table-based and inline-styled (what email clients actually render), in the
// app's cream/brown palette. Every interpolated value is escaped. The text
// part carries the same content for text-only clients.
//
// Tone (docs/gym/programming-research.md §4.3, applied to food too): never
// guilt copy. A quiet week gets an encouraging line, not a scolding one.

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export type PlanTierLike = 'FREE' | 'PREMIUM';

/**
 * Where this week's plan came from:
 * - chef: premium Sunday auto-plan (learned from ratings, pins, pantry)
 * - curated: free Sunday auto-plan (curated recipes, safety + targets)
 * - template: a followed "My weeks" week that repeats
 * - yours: generated or built by the user
 */
export type WeekSource = 'chef' | 'curated' | 'template' | 'yours';

export interface WeekReadyEmailData {
  firstName: string | null;
  tier: PlanTierLike;
  source: WeekSource;
  /** Dishes the user rated — premium learning signal (chef source only). */
  ratedCount: number;
  /** "22–28 Sep" */
  weekLabel: string;
  /** One row per planned day, Monday first: the day's dinner (or last meal). */
  dinners: { day: string; name: string }[];
  /** Formatted estimate in the user's currency ("~€74"), null when unpriced. */
  listTotal: string | null;
  planUrl: string;
  listUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
}

export interface WeeklyRecapEmailData {
  firstName: string | null;
  tier: PlanTierLike;
  /** "22–28 Sep" */
  weekLabel: string;
  mealsLogged: number;
  daysLogged: number;
  /** Logged days within ±10% of the calorie target. */
  daysOnTarget: number;
  /** "−0.4 kg since your previous weigh-in"; null without two weigh-ins. */
  weightChange: string | null;
  /** Completed workouts; null for users who don't use Gym. */
  gymSessions: number | null;
  /** Dinners already planned for next week; null when nothing is planned. */
  nextWeekDinners: number | null;
  /** Premium: the Sunday chef review was written for this week. */
  hasChefReview: boolean;
  progressUrl: string;
  planUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
}

export interface VerifyEmailData {
  firstName: string | null;
  verifyUrl: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BRAND = '#944a00';
const CREAM = '#fff3e8';
const INK = '#1f2937';
const MUTED = '#6b7280';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function greeting(firstName: string | null): string {
  const name = firstName?.trim();
  return name ? `Hi ${name},` : 'Hi,';
}

function button(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;padding:12px 20px;border-radius:10px;">${escapeHtml(label)}</a>`;
}

function paragraph(html: string, extra = ''): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:${INK};${extra}">${html}</p>`;
}

/** The shared shell: brand header, white card, footer with the opt-out. */
function layout(opts: { preheader: string; bodyHtml: string; footerHtml: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Chefer</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:${FONT};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:${BRAND};">Chefer</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:24px;">${opts.bodyHtml}</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:${MUTED};">${opts.footerHtml}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function weeklyFooter(
  preferencesUrl: string,
  unsubscribeUrl: string,
  what: string,
): {
  html: string;
  text: string;
} {
  return {
    html: `You get this ${escapeHtml(what)} because weekly emails are on for your Chefer account. <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};">Unsubscribe</a> · <a href="${escapeHtml(preferencesUrl)}" style="color:${MUTED};">Email preferences</a>`,
    text: [
      `You get this ${what} because weekly emails are on for your Chefer account.`,
      `Unsubscribe: ${unsubscribeUrl}`,
      `Email preferences: ${preferencesUrl}`,
    ].join('\n'),
  };
}

// ─── Monday: "your week is ready" ────────────────────────────────────────────

function sourceLine(data: WeekReadyEmailData): string {
  switch (data.source) {
    case 'chef':
      return data.ratedCount > 0
        ? `Your chef planned it on Sunday, around your targets and the ${plural(data.ratedCount, 'dish', 'dishes')} you rated.`
        : 'Your chef planned it on Sunday, around your targets and preferences.';
    case 'curated':
      return 'We picked a fresh week of recipes on Sunday that fit your allergies and daily targets.';
    case 'template':
      return 'The saved week you follow in My weeks repeats this week.';
    case 'yours':
      return "Here's the week you planned.";
  }
}

export function renderWeekReadyEmail(data: WeekReadyEmailData): RenderedEmail {
  const count = data.dinners.length;
  const subject = data.listTotal
    ? `Your week is ready: ${plural(count, 'dinner')}, ${data.listTotal} shopping list`
    : `Your week is ready: ${plural(count, 'dinner')} planned`;
  const intro = sourceLine(data);
  const upsell =
    data.tier === 'FREE'
      ? 'Premium weeks learn from the dishes you rate and what is already in your pantry.'
      : null;
  const listLine = data.listTotal
    ? `Estimated shopping list: ${data.listTotal}.`
    : 'Your shopping list is ready too.';
  const footer = weeklyFooter(data.preferencesUrl, data.unsubscribeUrl, 'Monday email');

  const text = [
    greeting(data.firstName),
    '',
    `Your week of ${data.weekLabel} is ready. ${intro}`,
    '',
    'Dinners this week:',
    ...data.dinners.map((d) => `- ${d.day}: ${d.name}`),
    '',
    listLine,
    '',
    `See your week: ${data.planUrl}`,
    `Shopping list: ${data.listUrl}`,
    ...(upsell ? ['', upsell] : []),
    '',
    '—',
    footer.text,
  ].join('\n');

  const rows = data.dinners
    .map(
      (d) =>
        `<tr><td style="padding:8px 12px 8px 0;font-size:14px;line-height:20px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(d.day)}</td><td style="padding:8px 0;font-size:15px;line-height:20px;color:${INK};">${escapeHtml(d.name)}</td></tr>`,
    )
    .join('');

  const bodyHtml = [
    paragraph(escapeHtml(greeting(data.firstName))),
    paragraph(
      `Your week of <strong>${escapeHtml(data.weekLabel)}</strong> is ready. ${escapeHtml(intro)}`,
    ),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid #f1e4d6;border-bottom:1px solid #f1e4d6;">${rows}</table>`,
    paragraph(
      data.listTotal
        ? `Estimated shopping list: <strong>${escapeHtml(data.listTotal)}</strong>.`
        : escapeHtml(listLine),
    ),
    `<p style="margin:0 0 16px;">${button('See your week', data.planUrl)}</p>`,
    paragraph(
      `<a href="${escapeHtml(data.listUrl)}" style="color:${BRAND};">Open the shopping list</a>`,
    ),
    ...(upsell ? [paragraph(escapeHtml(upsell), `color:${MUTED};font-size:13px;`)] : []),
  ].join('');

  return {
    subject,
    text,
    html: layout({
      preheader: `${plural(count, 'dinner')} planned for ${data.weekLabel}.`,
      bodyHtml,
      footerHtml: footer.html,
    }),
  };
}

// ─── Sunday: "your week in review" ───────────────────────────────────────────

function recapLines(data: WeeklyRecapEmailData): string[] {
  const lines: string[] = [];
  if (data.mealsLogged > 0) {
    lines.push(
      `${plural(data.mealsLogged, 'meal')} logged across ${plural(data.daysLogged, 'day')}`,
    );
    lines.push(`${plural(data.daysOnTarget, 'day')} on your calorie target`);
  }
  if (data.weightChange) lines.push(`Weight: ${data.weightChange}`);
  if (data.gymSessions !== null && data.gymSessions > 0) {
    lines.push(`${plural(data.gymSessions, 'workout')} finished`);
  }
  return lines;
}

export function renderWeeklyRecapEmail(data: WeeklyRecapEmailData): RenderedEmail {
  const lines = recapLines(data);
  const subject =
    data.mealsLogged > 0
      ? `Your week in review: ${plural(data.mealsLogged, 'meal')} logged, ${plural(data.daysOnTarget, 'day')} on target`
      : 'Your week in review';
  const quiet =
    data.mealsLogged === 0
      ? 'No meals logged this week, and that is fine. Logging even a few days next week makes this recap (and your targets) much more useful.'
      : null;
  const review =
    data.tier === 'PREMIUM' && data.hasChefReview
      ? "Your chef's weekly review is waiting on Progress."
      : null;
  const upsell =
    data.tier === 'FREE' && data.daysLogged >= 3
      ? 'Premium adds a weekly chef review that adjusts your targets from these numbers.'
      : null;
  const nextWeek =
    data.nextWeekDinners !== null && data.nextWeekDinners > 0
      ? `Next week is already planned: ${plural(data.nextWeekDinners, 'dinner')}.`
      : null;
  const footer = weeklyFooter(data.preferencesUrl, data.unsubscribeUrl, 'Sunday recap');

  const text = [
    greeting(data.firstName),
    '',
    `Here's your week of ${data.weekLabel}.`,
    '',
    ...lines.map((l) => `- ${l}`),
    ...(quiet ? [quiet] : []),
    '',
    ...(review ? [review] : []),
    `See your progress: ${data.progressUrl}`,
    ...(nextWeek ? ['', nextWeek, `See next week: ${data.planUrl}`] : []),
    ...(upsell ? ['', upsell] : []),
    '',
    '—',
    footer.text,
  ].join('\n');

  const statRows = lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;font-size:15px;line-height:20px;color:${INK};border-bottom:1px solid #f1e4d6;">${escapeHtml(l)}</td></tr>`,
    )
    .join('');

  const bodyHtml = [
    paragraph(escapeHtml(greeting(data.firstName))),
    paragraph(`Here's your week of <strong>${escapeHtml(data.weekLabel)}</strong>.`),
    ...(statRows
      ? [
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${statRows}</table>`,
        ]
      : []),
    ...(quiet ? [paragraph(escapeHtml(quiet))] : []),
    ...(review ? [paragraph(escapeHtml(review))] : []),
    `<p style="margin:0 0 16px;">${button('See your progress', data.progressUrl)}</p>`,
    ...(nextWeek
      ? [
          paragraph(
            `${escapeHtml(nextWeek)} <a href="${escapeHtml(data.planUrl)}" style="color:${BRAND};">See next week</a>`,
          ),
        ]
      : []),
    ...(upsell ? [paragraph(escapeHtml(upsell), `color:${MUTED};font-size:13px;`)] : []),
  ].join('');

  return {
    subject,
    text,
    html: layout({
      preheader: lines[0] ?? `Your week of ${data.weekLabel}.`,
      bodyHtml,
      footerHtml: footer.html,
    }),
  };
}

// ─── Confirm your email ──────────────────────────────────────────────────────

export function renderVerifyEmail(data: VerifyEmailData): RenderedEmail {
  const intro =
    'Confirm this address to get your Monday "your week is ready" email and the Sunday recap.';
  const text = [
    greeting(data.firstName),
    '',
    intro,
    '',
    `Confirm your email (link valid for 7 days): ${data.verifyUrl}`,
    '',
    "If you didn't create a Chefer account, ignore this email.",
  ].join('\n');
  const bodyHtml = [
    paragraph(escapeHtml(greeting(data.firstName))),
    paragraph(escapeHtml(intro)),
    `<p style="margin:0 0 16px;">${button('Confirm my email', data.verifyUrl)}</p>`,
    paragraph('This link is valid for 7 days.', `color:${MUTED};font-size:13px;`),
  ].join('');
  return {
    subject: 'Confirm your email for Chefer',
    text,
    html: layout({
      preheader: 'One tap to get your weekly plan by email.',
      bodyHtml,
      footerHtml: "If you didn't create a Chefer account, ignore this email.",
    }),
  };
}
