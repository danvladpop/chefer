import type { Catalog } from '../../../types';

// Romanian draft (review-status.ts: machine-draft). `span.*` is written so it
// reads after „în”, „pe” and „din ultimele” („12 luni” rather than „un an”).
export const todayShell: Catalog['today']['shell'] = {
  today: {
    loading: 'Se încarcă ziua de azi',
    loadError: 'Nu am putut încărca ziua ta',
    weekReady: {
      title: 'Săptămâna ta este gata',
      rated: {
        one: 'Pornește de la {count} preparat pe care l-ai notat.',
        few: 'Pornește de la {count} preparate pe care le-ai notat.',
        other: 'Pornește de la {count} de preparate pe care le-ai notat.',
      },
      sunday: 'Bucătarul a pregătit-o duminică.',
    },
    profileNudge: {
      label: 'Completează-ți profilul',
      hint: 'Obiectivele, măsurătorile corporale și nevoile tale alimentare îți modelează planurile',
    },
    nextMeal: 'Următoarea masă',
    caughtUp: 'Ești la zi cu mesele de azi.',
    noMeals: 'Nicio masă planificată încă.',
    openMeals: 'Deschide Mese',
  },

  chrome: {
    askChef: 'Întreabă bucătarul',
    askChefLabel: 'Întreabă bucătarul',
    addLabel: 'Adaugă mâncare',
  },
  add: {
    title: 'Adaugă la ziua de azi',
    food: 'Mâncare',
    training: 'Antrenament',
    search: 'Caută alimente',
    snap: 'Fotografiază o masă',
    copy: 'Copiază ziua de ieri',
    recipe: 'Salvează o rețetă',
    logWorkout: 'Înregistrează un antrenament',
  },
  logWorkout: {
    title: 'Înregistrează un antrenament',
    eyebrowToday: 'Azi',
    eyebrowElsewhere: 'Făcut în altă parte sau mai devreme',
    gymWorkout: 'Antrenament de sală pe care l-ai făcut',
    freestyle: 'Liber',
    doneElsewhere: 'Făcut în altă parte',
    resume: 'Reia antrenamentul',
    startFreestyle: 'Începe acum un antrenament liber',
  },
  miniBar: {
    resume: 'Reia',
    detail: {
      one: '{minutes} min · {done} din {count} exercițiu',
      few: '{minutes} min · {done} din {count} exerciții',
      other: '{minutes} min · {done} din {count} de exerciții',
    },
    coachedDetail: '{minutes} min · {day}',
    spoken: {
      one: '{name}, în desfășurare, {count} minut',
      few: '{name}, în desfășurare, {count} minute',
      other: '{name}, în desfășurare, {count} de minute',
    },
    hint: 'Deschide antrenamentul tău',
    coachedHint: 'Deschide antrenamentul cu clientul',
  },
  trainLinks: {
    title: 'Antrenamentul tău',
    routine: 'Rutină',
    exercises: 'Exerciții',
    stats: 'Statistici și istoric',
    gymSettings: 'Setări sală',
  },
  preview: {
    section: 'Previzualizare',
    footer:
      'Încearcă noul design al aplicației pe acest telefon. Doar administratorii și versiunile de test văd asta.',
    row: 'Design nou',
    switchLabel: 'Previzualizează noul design',
  },

  gauge: {
    kcalEaten: 'kcal mâncate',
    kcalLeft: 'rămase',
    kcalOver: 'în plus',
    kcalTarget: 'obiectiv',
    spoken: {
      kcalLeft: '{value} din {target} kcal mâncate, {remaining} rămase',
      kcalOver: '{value} din {target} kcal mâncate, {over} în plus',
      kcalNoTarget: '{value} kcal mâncate',
    },
  },

  macros: {
    names: { protein: 'Proteine', carbs: 'Carbohidrați', fat: 'Grăsimi' },
    overGrams: '{value} g în plus',
    spoken: {
      withTarget: {
        one: '{name}, {value} din {target} gram',
        few: '{name}, {value} din {target} grame',
        other: '{name}, {value} din {target} de grame',
      },
      over: {
        one: '{name}, {value} din {target} gram, {over} în plus',
        few: '{name}, {value} din {target} grame, {over} în plus',
        other: '{name}, {value} din {target} de grame, {over} în plus',
      },
      noTarget: {
        one: '{name}, {value} gram',
        few: '{name}, {value} grame',
        other: '{name}, {value} de grame',
      },
    },
  },

  nutrition: {
    proteinGrams: '{value} g',
    proteinOfTarget: 'din {target} g proteine',
  },

  training: {
    title: 'Antrenament',
    paused: 'Antrenament în pauză',
    inProgress: 'Antrenament în desfășurare',
    exercisesDone: {
      one: '{done} din {count} exercițiu',
      few: '{done} din {count} exerciții',
      other: '{done} din {count} de exerciții',
    },
    resume: 'Reia',
    doneAt: 'Terminat la {time}',
    summary: 'Rezumat',
    summaryOf: 'Rezumatul pentru {name}',
    duration: 'Durată',
    minutesUnit: 'min',
    sets: 'Serii',
    exercises: 'Exerciții',
    logAnother: 'Înregistrează alt antrenament',
    plannedToday: 'Planificat azi',
    upNext: 'Urmează · de obicei {weekday}',
    noFixedDay: 'fără zi fixă',
    start: 'Începe',
    startWorkout: 'Începe antrenamentul',
    logWorkout: 'Înregistrează un antrenament',
    doneNext: 'Gata azi · Urmează: {day}, {weekday}',
    restNext: 'Zi de odihnă · Urmează: {day}, {weekday}',
    openTrain: 'Deschide Antrenament',
    train: 'Antrenează-te',
    trainAnyway: 'Antrenează-te oricum',
    workoutMeta: {
      one: '{count} exercițiu · ~{min} min',
      few: '{count} exerciții · ~{min} min',
      other: '{count} de exerciții · ~{min} min',
    },
    burn: {
      estimate: {
        value: '~{value}',
        label: { kcal: 'kcal arse (estimat)' },
        spoken: { kcal: 'Aproximativ {value} kilocalorii arse, estimat' },
        hint: 'Estimat din greutatea ta corporală și durata antrenamentului',
      },
      logged: {
        label: { kcal: 'kcal înregistrate de tine' },
        spoken: { kcal: '{value} kilocalorii arse, cum le-ai înregistrat' },
        hint: 'Caloriile pe care le-ai introdus pentru acest antrenament',
      },
    },
  },

  stats: {
    tabs: { eating: 'Alimentație', strength: 'Forță' },
    tabsLabel: 'Statistici pentru',
    rangeLabel: 'Interval de timp',
    range: { w1: '1S', m1: '1L', m3: '3L', y1: '1A' },
    span: { w1: '7 zile', m1: '30 de zile', m3: '90 de zile', y1: '12 luni' },
    review: {
      teaserHint: 'Vezi ce adaugă Premium',
      teaserFallback: 'Bucătarul tău a observat ceva despre săptămâna ta…',
      showLess: 'Arată mai puțin',
      showFull: 'Arată analiza completă',
    },
    eating: 'Alimentație',
    loadError: 'Nu am putut încărca statisticile despre alimentație',
    daysLogged: 'zile înregistrate',
    avg: {
      protein: 'medie proteine / zi',
      kcal: 'medie kcal / zi',
    },
    vsTarget: 'față de obiectiv',
    moreDays: {
      one: 'Înregistrează încă {count} zi ca să-ți vezi mediile',
      few: 'Înregistrează încă {count} zile ca să-ți vezi mediile',
      other: 'Înregistrează încă {count} de zile ca să-ți vezi mediile',
    },
    nothingLogged: 'Nimic înregistrat încă în aceste zile.',
    openDay: 'Deschide ziua ta',
    chart: {
      daily: {
        kcal: {
          one: 'Calorii înregistrate în {logged} din ultima {count} zi, față de un obiectiv de {target}',
          few: 'Calorii înregistrate în {logged} din ultimele {count} zile, față de un obiectiv de {target}',
          other:
            'Calorii înregistrate în {logged} din ultimele {count} de zile, față de un obiectiv de {target}',
        },
        protein: {
          one: 'Proteine înregistrate în {logged} din ultima {count} zi, față de un obiectiv de {target}',
          few: 'Proteine înregistrate în {logged} din ultimele {count} zile, față de un obiectiv de {target}',
          other:
            'Proteine înregistrate în {logged} din ultimele {count} de zile, față de un obiectiv de {target}',
        },
      },
      weekly: {
        kcal: {
          one: 'Calorii înregistrate în {logged} din ultima {count} zi, ca medii săptămânale, față de un obiectiv de {target}',
          few: 'Calorii înregistrate în {logged} din ultimele {count} zile, ca medii săptămânale, față de un obiectiv de {target}',
          other:
            'Calorii înregistrate în {logged} din ultimele {count} de zile, ca medii săptămânale, față de un obiectiv de {target}',
        },
        protein: {
          one: 'Proteine înregistrate în {logged} din ultima {count} zi, ca medii săptămânale, față de un obiectiv de {target}',
          few: 'Proteine înregistrate în {logged} din ultimele {count} zile, ca medii săptămânale, față de un obiectiv de {target}',
          other:
            'Proteine înregistrate în {logged} din ultimele {count} de zile, ca medii săptămânale, față de un obiectiv de {target}',
        },
      },
    },
    targetLineProtein: '{value} g',
    weeklyBars: 'Fiecare bară este o săptămână: media zilnică a zilelor înregistrate',
    dailyAverages: 'Medii zilnice în zilele înregistrate',
    weight: 'Greutate',
    noWeighIns: 'Nicio cântărire încă.',
    trend: 'Tendință {weight}',
    trendSteady: 'Tendință stabilă în ultimele {span}',
    trendChange: 'Tendință {change} în ultimele {span}',
    logWeight: 'Înregistrează greutatea',
    closeWeighIn: 'Închide cântărirea',
    weightLoadError: 'Nu am putut încărca cântăririle',
    weightChart: 'Greutatea din ultimele {span}, ultima cântărire {weight}',
    weightChartTrend: 'Greutatea din ultimele {span}, ultima cântărire {weight}, tendință {trend}',
    trendExplainer:
      'Linia este tendința greutății tale. Netezește variațiile de la o zi la alta, cauzate de apă, sare și momentul cântăririi.',
    weighInTwice: 'Cântărește-te de două ori în {span} ca să-ți vezi tendința aici.',
    hideEntries: 'Ascunde înregistrările',
    editEntries: 'Editează înregistrările',
  },

  you: {
    progressSection: 'Progresul tău',
    settingsSection: 'Setări',
    peopleSection: 'Oameni',
    meals: 'Mese',
    mealsDetail: 'Mese, zile, alergii, buget',
    training: 'Antrenament',
    trainingDetail: 'Unități, echipament, mementouri',
    notifications: 'Notificări',
    account: 'Cont',
    accountDetail: 'Obiectiv, ținte, Premium, confidențialitate',
    household: 'Gospodărie',
    householdNames: 'Tu + {names}',
    householdCount: 'Tu + {count}',
    previewFooter: 'Doar pentru administratori și versiuni de test.',
  },
};
