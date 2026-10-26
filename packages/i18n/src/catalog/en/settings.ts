export const settings = {
  language: {
    title: 'Language',
    description: 'The language Chefer uses for screens and emails.',
    automatic: 'Same as my phone',
    automaticWeb: 'Same as my browser',
    automaticHint: 'Currently {language}',
    saved: 'Language updated',
    // Each language names itself, so someone who picked the wrong one can find their way back.
    names: {
      en: 'English',
      ro: 'Română',
    },
  },
} as const;
