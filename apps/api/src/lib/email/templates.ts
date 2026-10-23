// ─── Email templates (audit P2-5) ─────────────────────────────────────────────
// Pure renderers: data in, { subject, text, html } out. The HTML is plain,
// table-based and inline-styled (what email clients actually render), in the
// app's cream/brown palette. Every interpolated value is escaped. The text
// part carries the same content for text-only clients.
//
// Tone (docs/gym/programming-research.md §4.3, applied to food too): never
// guilt copy. A quiet week gets an encouraging line, not a scolding one.
//
// Copy lives in @chefer/i18n (`email.*`): every renderer takes the
// recipient's Translator (ADR 0004), so the subject, body and <html lang>
// follow User.locale ?? User.deviceLocale ?? 'en'.

import type { Translator } from '@chefer/i18n';

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

function greeting(tr: Translator, firstName: string | null): string {
  const name = firstName?.trim();
  return name ? tr.t('email.greeting', { name }) : tr.t('email.greetingNoName');
}

function button(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:20px;padding:12px 20px;border-radius:10px;">${escapeHtml(label)}</a>`;
}

// A translated sentence with one value in bold: the message is rendered with
// a marker in place of the value, escaped, then the marker becomes <strong>.
// Keeps the bold word where each language puts it.
const VALUE_MARK = '\u0000';

function strongPlaceholder(message: string, value: string): string {
  return escapeHtml(message).replace(VALUE_MARK, `<strong>${escapeHtml(value)}</strong>`);
}

function paragraph(html: string, extra = ''): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:${INK};${extra}">${html}</p>`;
}

/** The shared shell: brand header, white card, footer with the opt-out. */
function layout(opts: {
  lang: string;
  preheader: string;
  bodyHtml: string;
  footerHtml: string;
}): string {
  return `<!doctype html>
<html lang="${escapeHtml(opts.lang)}">
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
  tr: Translator,
  preferencesUrl: string,
  unsubscribeUrl: string,
  which: 'monday' | 'sunday',
): {
  html: string;
  text: string;
} {
  const reason = tr.t(
    which === 'monday' ? 'email.weeklyFooter.reasonMonday' : 'email.weeklyFooter.reasonSunday',
  );
  const unsubscribe = tr.t('email.weeklyFooter.unsubscribe');
  const preferences = tr.t('email.weeklyFooter.preferences');
  return {
    html: `${escapeHtml(reason)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};">${escapeHtml(unsubscribe)}</a> · <a href="${escapeHtml(preferencesUrl)}" style="color:${MUTED};">${escapeHtml(preferences)}</a>`,
    text: [reason, `${unsubscribe}: ${unsubscribeUrl}`, `${preferences}: ${preferencesUrl}`].join(
      '\n',
    ),
  };
}

// ─── Monday: "your week is ready" ────────────────────────────────────────────

function sourceLine(tr: Translator, data: WeekReadyEmailData): string {
  switch (data.source) {
    case 'chef':
      return data.ratedCount > 0
        ? tr.t('email.weekReady.sourceChefRated', { count: data.ratedCount })
        : tr.t('email.weekReady.sourceChef');
    case 'curated':
      return tr.t('email.weekReady.sourceCurated');
    case 'template':
      return tr.t('email.weekReady.sourceTemplate');
    case 'yours':
      return tr.t('email.weekReady.sourceYours');
  }
}

export function renderWeekReadyEmail(tr: Translator, data: WeekReadyEmailData): RenderedEmail {
  const dinners = tr.t('common.counts.dinners', { count: data.dinners.length });
  const subject = data.listTotal
    ? tr.t('email.weekReady.subjectWithTotal', { dinners, total: data.listTotal })
    : tr.t('email.weekReady.subject', { dinners });
  const intro = sourceLine(tr, data);
  const upsell = data.tier === 'FREE' ? tr.t('email.weekReady.upsell') : null;
  const listLine = data.listTotal
    ? tr.t('email.weekReady.listTotal', { total: data.listTotal })
    : tr.t('email.weekReady.listReady');
  const footer = weeklyFooter(tr, data.preferencesUrl, data.unsubscribeUrl, 'monday');
  const seeWeek = tr.t('email.weekReady.seeWeek');

  const text = [
    greeting(tr, data.firstName),
    '',
    `${tr.t('email.weekReady.intro', { week: data.weekLabel })} ${intro}`,
    '',
    tr.t('email.weekReady.dinnersHeading'),
    ...data.dinners.map((d) => `- ${d.day}: ${d.name}`),
    '',
    listLine,
    '',
    `${seeWeek}: ${data.planUrl}`,
    `${tr.t('email.weekReady.shoppingList')}: ${data.listUrl}`,
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
    paragraph(escapeHtml(greeting(tr, data.firstName))),
    paragraph(
      `${strongPlaceholder(tr.t('email.weekReady.intro', { week: VALUE_MARK }), data.weekLabel)} ${escapeHtml(intro)}`,
    ),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-top:1px solid #f1e4d6;border-bottom:1px solid #f1e4d6;">${rows}</table>`,
    paragraph(
      data.listTotal
        ? strongPlaceholder(
            tr.t('email.weekReady.listTotal', { total: VALUE_MARK }),
            data.listTotal,
          )
        : escapeHtml(listLine),
    ),
    `<p style="margin:0 0 16px;">${button(seeWeek, data.planUrl)}</p>`,
    paragraph(
      `<a href="${escapeHtml(data.listUrl)}" style="color:${BRAND};">${escapeHtml(tr.t('email.weekReady.openList'))}</a>`,
    ),
    ...(upsell ? [paragraph(escapeHtml(upsell), `color:${MUTED};font-size:13px;`)] : []),
  ].join('');

  return {
    subject,
    text,
    html: layout({
      lang: tr.locale,
      preheader: tr.t('email.weekReady.preheader', { dinners, week: data.weekLabel }),
      bodyHtml,
      footerHtml: footer.html,
    }),
  };
}

// ─── Sunday: "your week in review" ───────────────────────────────────────────

function recapLines(tr: Translator, data: WeeklyRecapEmailData): string[] {
  const lines: string[] = [];
  if (data.mealsLogged > 0) {
    lines.push(
      tr.t('email.recap.mealsAcrossDays', {
        meals: tr.t('common.counts.meals', { count: data.mealsLogged }),
        days: tr.t('common.counts.days', { count: data.daysLogged }),
      }),
    );
    lines.push(tr.t('email.recap.daysOnTarget', { count: data.daysOnTarget }));
  }
  if (data.weightChange) lines.push(tr.t('email.recap.weight', { change: data.weightChange }));
  if (data.gymSessions !== null && data.gymSessions > 0) {
    lines.push(tr.t('email.recap.workouts', { count: data.gymSessions }));
  }
  return lines;
}

export function renderWeeklyRecapEmail(tr: Translator, data: WeeklyRecapEmailData): RenderedEmail {
  const lines = recapLines(tr, data);
  const subject =
    data.mealsLogged > 0
      ? tr.t('email.recap.subjectLogged', {
          meals: tr.t('common.counts.meals', { count: data.mealsLogged }),
          days: tr.t('common.counts.days', { count: data.daysOnTarget }),
        })
      : tr.t('email.recap.subject');
  const quiet = data.mealsLogged === 0 ? tr.t('email.recap.quiet') : null;
  const review =
    data.tier === 'PREMIUM' && data.hasChefReview ? tr.t('email.recap.chefReview') : null;
  const upsell = data.tier === 'FREE' && data.daysLogged >= 3 ? tr.t('email.recap.upsell') : null;
  const nextWeek =
    data.nextWeekDinners !== null && data.nextWeekDinners > 0
      ? tr.t('email.recap.nextWeekPlanned', {
          dinners: tr.t('common.counts.dinners', { count: data.nextWeekDinners }),
        })
      : null;
  const footer = weeklyFooter(tr, data.preferencesUrl, data.unsubscribeUrl, 'sunday');
  const seeProgress = tr.t('email.recap.seeProgress');
  const seeNextWeek = tr.t('email.recap.seeNextWeek');
  const intro = tr.t('email.recap.intro', { week: data.weekLabel });

  const text = [
    greeting(tr, data.firstName),
    '',
    intro,
    '',
    ...lines.map((l) => `- ${l}`),
    ...(quiet ? [quiet] : []),
    '',
    ...(review ? [review] : []),
    `${seeProgress}: ${data.progressUrl}`,
    ...(nextWeek ? ['', nextWeek, `${seeNextWeek}: ${data.planUrl}`] : []),
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
    paragraph(escapeHtml(greeting(tr, data.firstName))),
    paragraph(strongPlaceholder(tr.t('email.recap.intro', { week: VALUE_MARK }), data.weekLabel)),
    ...(statRows
      ? [
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${statRows}</table>`,
        ]
      : []),
    ...(quiet ? [paragraph(escapeHtml(quiet))] : []),
    ...(review ? [paragraph(escapeHtml(review))] : []),
    `<p style="margin:0 0 16px;">${button(seeProgress, data.progressUrl)}</p>`,
    ...(nextWeek
      ? [
          paragraph(
            `${escapeHtml(nextWeek)} <a href="${escapeHtml(data.planUrl)}" style="color:${BRAND};">${escapeHtml(seeNextWeek)}</a>`,
          ),
        ]
      : []),
    ...(upsell ? [paragraph(escapeHtml(upsell), `color:${MUTED};font-size:13px;`)] : []),
  ].join('');

  return {
    subject,
    text,
    html: layout({
      lang: tr.locale,
      preheader: lines[0] ?? intro,
      bodyHtml,
      footerHtml: footer.html,
    }),
  };
}

// ─── Confirm your email ──────────────────────────────────────────────────────

export function renderVerifyEmail(tr: Translator, data: VerifyEmailData): RenderedEmail {
  const intro = tr.t('email.verify.intro');
  const notYou = tr.t('email.verify.notYou');
  const text = [
    greeting(tr, data.firstName),
    '',
    intro,
    '',
    `${tr.t('email.verify.linkText')} ${data.verifyUrl}`,
    '',
    notYou,
  ].join('\n');
  const bodyHtml = [
    paragraph(escapeHtml(greeting(tr, data.firstName))),
    paragraph(escapeHtml(intro)),
    `<p style="margin:0 0 16px;">${button(tr.t('email.verify.button'), data.verifyUrl)}</p>`,
    paragraph(escapeHtml(tr.t('email.verify.validity')), `color:${MUTED};font-size:13px;`),
  ].join('');
  return {
    subject: tr.t('email.verify.subject'),
    text,
    html: layout({
      lang: tr.locale,
      preheader: tr.t('email.verify.preheader'),
      bodyHtml,
      footerHtml: escapeHtml(notYou),
    }),
  };
}

// ─── Password reset ──────────────────────────────────────────────────────────

/** Plain text only, as before: the link is the whole message. */
export function renderPasswordResetEmail(
  tr: Translator,
  data: { resetUrl: string },
): { subject: string; text: string } {
  return {
    subject: tr.t('email.passwordReset.subject'),
    text: [
      tr.t('email.passwordReset.intro'),
      '',
      tr.t('email.passwordReset.linkText'),
      data.resetUrl,
      '',
      tr.t('email.passwordReset.notYou'),
    ].join('\n'),
  };
}
