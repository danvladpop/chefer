// ─── /switch/mealime copy (market review 2026-10, lane L) ─────────────────────
// Every claim here is about Chefer, or is something Mealime's own closing
// notice says. No claims about Mealime's quality, no claims we can't check,
// and nothing that reads as a partnership: the page says "a Mealime
// alternative" and carries a not-affiliated line. Sources, checked 2026-10-22:
// https://www.mealime.com/closing (discontinued 21 Oct 2026, personal data
// deleted at shutdown, no export offered) and a live fetch of public
// mealime.com recipe pages (they still served schema.org Recipe data).

export const MEALIME_CLOSING_URL = 'https://www.mealime.com/closing';

export const SWITCH_TITLE = 'A Mealime alternative for weekly meal plans';
export const SWITCH_DESCRIPTION =
  'Mealime closed on 21 October 2026. Chefer plans your week, builds one aisle-sorted shopping list and cooks with you step by step, and it adds allergy checks for the whole household, euro and lei prices, recipe import from links and videos, a gym log and free data export.';

export const NOT_AFFILIATED =
  'Chefer is an independent app. It is not affiliated with, endorsed by or sponsored by Mealime or Albertsons Companies. Mealime is a trademark of its owner.';

export type SwitchFeature = { icon: string; title: string; description: string };

export const CARRIES_OVER: readonly SwitchFeature[] = [
  {
    icon: '🗓️',
    title: 'Weekly meal plans',
    description:
      'Get a full week planned in one tap, then swap any meal you don’t fancy. Plans follow your goals, cooking time and servings.',
  },
  {
    icon: '🛒',
    title: 'A shopping list sorted by aisle',
    description:
      'The week’s recipes become one list, grouped by aisle with the amounts added up. Tick things off as you shop.',
  },
  {
    icon: '👩‍🍳',
    title: 'Cook mode',
    description:
      'One step at a time, with the amounts for that step, built-in timers and the screen kept awake where your browser allows it.',
  },
  {
    icon: '🥗',
    title: 'Diet filters',
    description:
      'Vegetarian, vegan, pescatarian, gluten-free, dairy-free, keto and more, plus the foods you dislike. Set them once and every plan follows them.',
  },
];

export const CHEFER_ADDS: readonly SwitchFeature[] = [
  {
    icon: '🛡️',
    title: 'Allergy-safe for the whole household',
    description:
      'Add the people you cook for, each with their own allergies. Every plan, swap and imported recipe is checked against everyone at the table.',
  },
  {
    icon: '💶',
    title: 'Costs in euros or lei',
    description:
      'The shopping list shows an estimated price for each item and a total for the week, in EUR or RON (USD and GBP too).',
  },
  {
    icon: '🔗',
    title: 'Import recipes from links and videos',
    description:
      'Paste a recipe link, or a YouTube, TikTok or Instagram cooking video, and Chefer turns it into a recipe you can plan with.',
  },
  {
    icon: '🏋️',
    title: 'A free gym log',
    description:
      'Log sets in one tap with the weights filled in, and get a “next time” target. Food and training in one app.',
  },
  {
    icon: '📦',
    title: 'Free export, so your data isn’t trapped',
    description:
      'Download everything Chefer stores about you as one file, whenever you like, at no cost.',
  },
];

export type ImportStep = { title: string; body: string };

export const IMPORT_STEPS: readonly ImportStep[] = [
  {
    title: 'Find the recipe',
    body: 'Copy the link of its web page. Public recipe pages on mealime.com still opened when we checked on 22 October 2026. No page? A screenshot or the copied text works too.',
  },
  {
    title: 'Open Import',
    body: 'Open your Cookbook, on the web or in the app, and choose Import.',
  },
  {
    title: 'Pick the source',
    body: 'Link for a web page, Paste for copied text, Photo for a screenshot or a recipe card, Video for a cooking video.',
  },
  {
    title: 'Check it and save',
    body: 'Chefer reads the ingredients and steps, checks them against everyone’s allergies and shows you the recipe to review. Save it, then add it to any day of your week.',
  },
];

export const SWITCH_FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Is Chefer connected to Mealime?',
    a: 'No. Chefer is a separate, independent app with no link to Mealime or Albertsons Companies.',
  },
  {
    q: 'Can I move my Mealime account over?',
    a: 'Not directly: the two apps aren’t connected, and Mealime’s closing notice says personal data is deleted when the app shuts down. Setting your diet and allergies in Chefer takes about a minute, and you can import recipes one at a time as shown above.',
  },
  {
    q: 'What does it cost?',
    a: 'Nothing. Every feature, Premium included, is free to use, and Chefer never asks for payment details. Recipe import is part of Premium, which you switch on for free.',
  },
  {
    q: 'Can I take my data with me later?',
    a: 'Yes. Profile → Your data → Download my data saves everything Chefer stores about you in one file, at any time.',
  },
];
