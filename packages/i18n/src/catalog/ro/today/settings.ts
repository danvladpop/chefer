import type { Catalog } from '../../../types';

// Romanian draft (review-status.ts: machine-draft). The confirmation word stays
// DELETE: the API checks it, and the help pages (legal.ts) tell people to type it.
export const todaySettings: Catalog['today']['settings'] = {
  grams: {
    protein: '{value} g',
    macros: '{value} g',
  },

  numbers: {
    showOnToday: { kcal: 'Arată caloriile și macronutrienții în Azi' },
    showOnTodayOff: 'Oprit: Azi îți arată mesele și antrenamentele, fără cifre.',
    saveError: 'Nu am putut salva. Încearcă din nou.',
  },

  proteinWhy: {
    eyebrow: 'Proteinele tale',
    title: 'De ce acest număr de proteine?',
    perDay: 'Proteine pe zi',
    perKg: 'Pe kg de greutate corporală',
    atReference: 'La {value} g pe kg',
  },

  targetExplain: {
    eyebrow: 'Obiectivul tău',
    title: 'De ce acest număr',
    calories: 'Calorii',
    protein: 'Proteine',
    carbs: 'Carbohidrați',
    fat: 'Grăsimi',
    value: { kcal: '{value} kcal' },
    own: 'Ai stabilit tu acest obiectiv.',
    useSuggested: 'Folosește obiectivul sugerat',
    setOwn: 'Stabilește-ți propriul obiectiv',
    changeTargets: 'Schimbă-ți obiectivele',
  },

  goal: {
    title: 'Care este obiectivul tău principal?',
    subtitle: 'Planul tău de mese va fi construit în jurul acestui obiectiv.',
    goodFood: {
      title: 'Doar mâncare bună',
      detail:
        'Fără obiectiv de calorii. Planificăm mese echilibrate și nu numărăm nimic în locul tău.',
    },
    goals: {
      LOSE_WEIGHT: {
        label: 'Slăbire',
        description: 'Reduce grăsimea corporală și ajungi la o greutate mai sănătoasă',
        effect: { kcal: 'Deficit de 500 kcal/zi' },
      },
      MAINTAIN: {
        label: 'Menținerea greutății',
        description: 'Îți păstrezi greutatea actuală și mănânci bine',
        effect: { kcal: 'Calorii de menținere' },
      },
      GAIN_MUSCLE: {
        label: 'Masă musculară',
        description: 'Câștigi forță și masă musculară slabă',
        effect: { kcal: 'Surplus de 300 kcal/zi' },
      },
      EAT_HEALTHIER: {
        label: 'Alimentație mai sănătoasă',
        description: 'Îți îmbunătățești alimentația și obiceiurile alimentare',
        effect: { kcal: 'Calorii de menținere, macronutrienți mai buni' },
      },
      RECOMP: {
        label: 'Recompoziție',
        description: 'Pierzi grăsime și câștigi masă musculară în același timp',
        effect: { kcal: 'Calorii de menținere' },
      },
      PERFORMANCE: {
        label: 'Performanță',
        description: 'Energie pentru antrenament și recuperare, nu un număr pe cântar',
        effect: { kcal: 'Calorii de menținere' },
      },
    },
  },

  profile: {
    title: 'Profil',
    loadError: 'Nu am putut încărca profilul',
    tier: { premium: 'Premium', free: 'Plan gratuit' },
    household: {
      title: 'Gospodăria ta',
      justYou: 'Doar tu — adaugă persoanele pentru care gătești',
      atTable: {
        one: '{count} la masă: tu, {names}',
        few: '{count} la masă: tu, {names}',
        other: '{count} la masă: tu, {names}',
      },
    },
    usage: {
      resetAt: 'Limitele se resetează la {time}, ora ta.',
      ofLimit: '{used} / {limit}',
      unlimited: '{used} · nelimitat',
      aiMealPlans: 'Planuri de mese cu IA',
      curatedPlans: 'Planuri din rețetele noastre',
      chat: 'Mesaje în chat',
      imports: 'Importuri de rețete citite',
      scans: 'Scanări de fotografii cu mese',
      helperFree:
        'Planurile din rețetele noastre nu folosesc IA, iar conturile gratuite pot crea câteva pe zi.',
      helperPremium:
        'Planurile din rețetele noastre nu folosesc IA. Un import contează când îl citim; salvarea e gratuită.',
      helperPremiumSaved: {
        one: 'Planurile din rețetele noastre nu folosesc IA. Un import contează când îl citim; salvarea e gratuită ({count} salvat azi).',
        few: 'Planurile din rețetele noastre nu folosesc IA. Un import contează când îl citim; salvarea e gratuită ({count} salvate azi).',
        other:
          'Planurile din rețetele noastre nu folosesc IA. Un import contează când îl citim; salvarea e gratuită ({count} de salvate azi).',
      },
    },
  },

  account: {
    title: 'Datele tale',
    signOut: 'Deconectează-te',
    export: {
      button: 'Descarcă datele mele',
      busy: 'Se pregătește…',
      intro:
        'Descarcă tot ce stochează Chefer despre tine, ca arhivă ZIP cu fișiere de tip tabel, sau șterge-ți definitiv contul.',
      ready: 'Exportul tău este gata.',
      failed: 'Nu am putut pregăti datele tale. Încearcă din nou.',
      tooSoon: 'Ți-ai descărcat datele de câteva ori chiar acum. Încearcă din nou peste 15 minute.',
    },
    delete: {
      button: 'Șterge contul',
      title: 'Îți ștergi contul?',
      permanent: 'Contul tău Chefer va fi șters definitiv. Acțiunea nu poate fi anulată.',
      listHeading: 'Se șterg definitiv:',
      deleted: {
        profile: 'Profilul, preferințele, alergiile, obiectivele și măsurătorile corporale',
        plans:
          'Planurile de mese, listele de cumpărături, jurnalul alimentar, cântăririle, măsurătorile corporale și cămara',
        recipes:
          'Rețetele proprii și cele importate, fotografiile încărcate, favoritele și evaluările',
        workouts: 'Antrenamentele, rutinele și exercițiile personalizate',
        household: 'Membrii gospodăriei, feedbackul și conectarea ta pe toate dispozitivele',
      },
      backups: 'Copiile de rezervă expiră în aproximativ 30 de zile.',
      progressPhotos:
        'Fotografiile de progres sunt doar pe telefonul tău. Dacă îți ștergi contul din aplicație, se șterg și ele; la fel dacă ștergi aplicația.',
      passwordLabel: 'Parola ta',
      forgotPassword: 'Ți-ai uitat parola?',
      resetSending: 'Se trimite…',
      resetSent:
        'Am trimis un link de resetare la {email}. Expiră într-o oră. Resetează-ți parola, apoi revino ca să ștergi contul.',
      reauthTitle: 'Confirmă că ești tu',
      reauthHint:
        'Conectează-te cu contul pe care îl folosești pentru Chefer, iar contul tău va fi șters.',
      reauthTypeFirst: 'Mai întâi, tastează {word} mai jos.',
      reauthApple: 'Confirmă cu Apple și șterge',
      reauthGoogle: 'Confirmă cu Google și șterge',
      reauthA11y: '{action} ({provider})',
      reauthUnavailable:
        'Acest browser nu poate confirma cu contul conectat. Folosește aplicația Chefer sau setează o parolă cu emailul de resetare de mai jos, apoi revino.',
      reauthUnavailableApp:
        'Nu putem deschide conectarea cu contul tău pe acest dispozitiv. Setează o parolă cu emailul de resetare de mai sus, apoi revino ca să ștergi contul.',
      sdkError:
        'Nu am putut contacta serviciul de conectare. Verifică-ți conexiunea și încearcă din nou.',
      confirmLabel: 'Tastează {word} ca să confirmi',
      submit: 'Șterge-mi contul',
      submitting: 'Se șterge…',
      cancel: 'Renunță',
    },
  },

  unsubscribe: {
    invalid: 'Acest link de dezabonare nu este valid sau a expirat.',
    invalidHint: 'Poți opri emailurile săptămânale din Preferințe, după ce te conectezi.',
    openPreferences: 'Deschide Preferințele',
    updating: 'Se actualizează setările de email…',
    unsubscribed: {
      WEEK_READY: 'Te-ai dezabonat de la emailul de luni „Săptămâna ta este gata”.',
      WEEKLY_RECAP: 'Te-ai dezabonat de la emailul de duminică „Săptămâna ta pe scurt”.',
      ALL: 'Te-ai dezabonat de la emailurile săptămânale.',
      COACHING_CHECK_IN:
        'Te-ai dezabonat de la emailurile săptămânale de verificare de la antrenorul tău.',
      COACHING_QUIET_DIGEST: 'Te-ai dezabonat de la emailul zilnic „Clienți inactivi”.',
    },
    resubscribed: {
      WEEK_READY: 'Te-ai abonat din nou la emailul de luni „Săptămâna ta este gata”.',
      WEEKLY_RECAP: 'Te-ai abonat din nou la emailul de duminică „Săptămâna ta pe scurt”.',
      ALL: 'Te-ai abonat din nou la emailurile săptămânale.',
      COACHING_CHECK_IN:
        'Te-ai abonat din nou la emailurile săptămânale de verificare de la antrenorul tău.',
      COACHING_QUIET_DIGEST: 'Te-ai abonat din nou la emailul zilnic „Clienți inactivi”.',
    },
    undo: 'Anulează',
    manageAll: 'Gestionează toate setările de email',
  },
};
