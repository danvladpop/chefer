import type { Catalog } from '../../types';

export const settings: Catalog['settings'] = {
  language: {
    title: 'Limbă',
    description: 'Limba în care Chefer îți afișează ecranele și emailurile.',
    automatic: 'La fel ca telefonul',
    automaticWeb: 'La fel ca browserul',
    automaticHint: 'Acum: {language}',
    saved: 'Limba a fost schimbată',
    names: {
      en: 'English',
      ro: 'Română',
    },
  },
};
