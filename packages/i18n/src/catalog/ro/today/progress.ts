import type { Catalog } from '../../../types';

// Romanian draft (review-status.ts: machine-draft). „Progres”, greutate,
// cântărire, tendința greutății; the review is written by „bucătarul tău”.
export const todayProgress: Catalog['today']['progress'] = {
  page: {
    eyebrow: 'Statistici',
    title: 'Progres',
    daysLogged: 'Zile înregistrate',
    avg: { kcal: 'Medie kcal' },
    vsTarget: 'față de obiectiv',
    timeRange: 'Interval de timp',
    moreDays: {
      one: 'Înregistrează încă {count} zi ca să-ți vezi media',
      few: 'Înregistrează încă {count} zile ca să-ți vezi media',
      other: 'Înregistrează încă {count} de zile ca să-ți vezi media',
    },
    loadError: 'Nu am putut încărca progresul tău',
    calories: {
      title: 'Calorii — ultimele {span}',
      titleWeekly: 'Calorii — medii săptămânale, ultimele {span}',
      titleDays: {
        one: 'Calorii — ultima {count} zi',
        few: 'Calorii — ultimele {count} zile',
        other: 'Calorii — ultimele {count} de zile',
      },
      tooltip: { kcal: '{value} kcal' },
      target: 'Obiectiv',
      logged: 'Înregistrat',
      chartA11y: {
        kcal: {
          one: 'Calorii înregistrate în {logged} din ultima {count} zi, în medie {avg}, față de un obiectiv de {target}',
          few: 'Calorii înregistrate în {logged} din ultimele {count} zile, în medie {avg}, față de un obiectiv de {target}',
          other:
            'Calorii înregistrate în {logged} din ultimele {count} de zile, în medie {avg}, față de un obiectiv de {target}',
        },
      },
    },
    macros: {
      title: 'Macronutrienți — ultimele {span} (g)',
      titleWeekly: 'Macronutrienți — medii săptămânale, ultimele {span} (g)',
      titleDays: {
        one: 'Macronutrienți — ultima {count} zi (g)',
        few: 'Macronutrienți — ultimele {count} zile (g)',
        other: 'Macronutrienți — ultimele {count} de zile (g)',
      },
      protein: 'Proteine',
      carbs: 'Carbohidrați',
      fat: 'Grăsimi',
      empty: 'Încă nu ai nimic înregistrat.',
      emptyApp: 'Înregistrează o masă ca să vezi aici proteinele, carbohidrații și grăsimile.',
      chartA11y: {
        one: 'Proteine, carbohidrați și grăsimi pe zi, în grame, în ultima {count} zi',
        few: 'Proteine, carbohidrați și grăsimi pe zi, în grame, în ultimele {count} zile',
        other: 'Proteine, carbohidrați și grăsimi pe zi, în grame, în ultimele {count} de zile',
      },
    },
    noData: 'Încă nu ai nimic înregistrat — începe din {tracker}.',
    noDataApp: 'Încă nu ai nimic înregistrat — începe din Jurnal.',
    trackerLink: 'Jurnal',
    openTracker: 'Deschide Jurnalul',
    week: {
      onTarget: 'Săptămâna aceasta ești cam la obiectiv',
      under: 'Săptămâna aceasta ești cu aproximativ {pct} % sub obiectiv',
      over: 'Săptămâna aceasta ești cu aproximativ {pct} % peste obiectiv',
    },
  },

  range: {
    label: { d7: '1S', d30: '1L', d90: '3L', d365: '1A' },
    span: { d7: '7 zile', d30: '30 de zile', d90: '90 de zile', d365: 'un an' },
  },

  photos: {
    photoFrom: 'Fotografie de progres din {date}',
    photoHint: 'O selectează pentru comparare. Ține apăsat ca s-o deschizi.',
    keep: 'Păstreaz-o',
  },

  measure: 'Măsurătoare',

  weight: {
    title: 'Evoluția greutății',
    heading: 'Evoluția greutății',
    lastWeighIn: 'Ultima cântărire:',
    trend: 'Tendință:',
    current: 'Acum:',
    trendChange90: 'Schimbarea tendinței (90 z):',
    towardGoal: '{change}, în direcția obiectivului tău',
    trendSteady: 'Tendință stabilă în {span}',
    trendChange: 'Tendință {change} în {span}',
    perWeek: '{change}/săpt.',
    steady: 'stabil',
    explainer:
      'Linia este tendința greutății tale. Netezește variațiile de la o zi la alta date de apă, sare și momentul cântăririi.',
    legendWeighIn: 'Cântărire',
    legendTrend: 'Tendință',
    fewInRange: 'Cântărește-te de două ori în {span} ca să-ți vezi aici tendința.',
    empty: 'Nicio cântărire încă. Înregistrează-ți prima greutate mai jos.',
    loadError: 'Nu am putut încărca cântăririle tale',
    chartA11y: 'Greutatea în ultimele 90 de zile, acum {weight}',
  },

  card: {
    title: 'Greutate',
    delta30: '({change} / 30 z)',
    hint: 'Cântărește-te de câteva ori pe săptămână și bucătarul tău îți poate citi tendința.',
    loggedToday: 'Înregistrat azi: {weight}',
    todayPlaceholder: 'Azi: {weight}?',
    editEntries: 'Editează sau șterge cântăririle',
    hideEntries: 'Ascunde cântăririle',
    seeProgress: 'Vezi progresul',
    reviewHint: {
      one: 'Înregistrează mesele încă {count} zi săptămâna aceasta și bucătarul tău îți va scrie o analiză duminică.',
      few: 'Înregistrează mesele încă {count} zile săptămâna aceasta și bucătarul tău îți va scrie o analiză duminică.',
      other:
        'Înregistrează mesele încă {count} de zile săptămâna aceasta și bucătarul tău îți va scrie o analiză duminică.',
    },
    sparklineA11y: {
      one: 'Greutatea în ultima {count} zi: {summary}',
      few: 'Greutatea în ultimele {count} zile: {summary}',
      other: 'Greutatea în ultimele {count} de zile: {summary}',
    },
    sparklineSummary: '{start} → {end} {unit}',
  },

  form: {
    placeholderKg: '{value} kg',
    placeholderLb: '{value} lb',
    placeholderApp: 'Greutatea de azi ({unit})',
    labelKg: 'Greutatea de azi, în kilograme',
    labelLb: 'Greutatea de azi, în livre',
    log: 'Salvează',
    saved: '✓ Salvat',
    logA11y: 'Înregistrează greutatea',
    logged: 'Am înregistrat {weight}',
    undo: 'Anulează',
    alreadyLogged: 'Ai înregistrat deja {weight} azi',
    errors: {
      empty: 'Introdu greutatea.',
      format: 'Folosește un număr, de exemplu {example}.',
      range: 'Greutatea trebuie să fie între {min} și {max} {unit}.',
    },
  },

  entries: {
    title: 'Cântăriri',
    inputKg: 'Greutatea din {date}, în kilograme',
    inputLb: 'Greutatea din {date}, în livre',
    save: 'Salvează greutatea',
    cancel: 'Renunță la editare',
    edit: 'Editează {weight} din {date}',
    delete: 'Șterge {weight} din {date}',
    confirm: 'Ștergi {weight} din {date}?',
    confirmTitle: 'Ștergi cântărirea?',
    confirmBody: '{weight} din {date}',
    keep: 'Păstrează',
    showFewer: 'Arată mai puține',
    showAll: 'Arată toate cele {count}',
  },

  review: {
    noticed: 'Bucătarul tău a observat ceva despre săptămâna ta…',
    teaser:
      'Bucătarul tău a mai scris câteva rânduri despre săptămâna ta — tendința, tiparul din spatele ei și ce ar trebui să schimbe săptămâna viitoare.',
    teaserApp:
      'Restul analizei vorbește despre cum ai mâncat proteine, despre cele două cine care merită repetate și despre o schimbare pentru săptămâna viitoare.',
    locked: 'Analiza completă și obiectivele care se ajustează singure sunt Premium',
    lockedApp: 'Analiza completă și obiectivele care se ajustează singure fac parte din Premium.',
    seePremium: 'Vezi ce adaugă Premium',
    title: 'Analiza săptămânală a bucătarului tău',
    aiA11y: 'Această analiză a fost scrisă de IA',
    logged: '{value} din zile înregistrate',
    avgPerDay: { kcal: 'în medie {value} kcal/zi' },
    budget: { kcal: 'buget {value} kcal' },
    seeFull: 'Vezi analiza completă →',
    showLess: 'Arată mai puțin',
    weekOf: 'Săptămâna din {date}',
    statDaysLogged: 'Zile înregistrate',
    statAvgProtein: 'Medie proteine',
    statProteinValue: '{value} g',
    statAvgIntake: 'Aport mediu',
    statIntake: { kcal: '{value} kcal' },
    statWeightTrend: 'Tendința greutății',
    budgetChanged: {
      kcal: 'Bugetul tău zilnic de calorii s-a schimbat cu {value} kcal — panoul, jurnalul și următoarea săptămână generată folosesc toate noua valoare.',
    },
    why: 'De ce?',
    whyA11y: 'De ce aceste cifre',
    explainEyebrow: 'Analiza ta săptămânală',
    explainTitle: 'De unde vin aceste cifre',
    explainSentence: {
      kcal: 'Bucătarul tău s-a uitat la ultimele 7 zile: ai înregistrat {days} dintre ele, cu o medie de {avg} kcal în acele zile.',
    },
    explainSentenceBudget: {
      kcal: 'Bucătarul tău s-a uitat la ultimele 7 zile: ai înregistrat {days} dintre ele, cu o medie de {avg} kcal în acele zile. Bugetul tău zilnic s-a schimbat cu {change} kcal: un pas mic la fiecare analiză și doar când ai înregistrat cel puțin jumătate din zile.',
    },
    explainSentenceProtein:
      'Bucătarul tău s-a uitat la ultimele 7 zile: ai înregistrat {days} dintre ele.',
    rowDaysLogged: 'Zile înregistrate',
    rowDaysLoggedValue: '{days} din 7 ({pct} %)',
    rowAverage: 'Media în zilele înregistrate',
    rowAverageValue: { kcal: '{value} kcal' },
    rowWeightTrend: 'Tendința greutății',
    rowBudgetChange: 'Schimbarea bugetului zilnic',
    rowBudgetChangeValue: { kcal: '{value} kcal' },
    rowAverageProtein: 'Medie proteine',
    rowAverageProteinValue: '{value} g pe zi',
    footnote: 'Mediile țin cont doar de zilele în care ai înregistrat.',
  },
};
