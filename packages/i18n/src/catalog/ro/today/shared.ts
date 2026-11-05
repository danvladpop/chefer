import type { Catalog } from '../../../types';

type Today = Catalog['today'];

// Romanian draft (review-status.ts: machine-draft). Lanes D and E: blând,
// fără vinovăție și fără „ai ratat” (today-copy-audit.test.ts).
export const todayShared: Pick<
  Today,
  | 'photos'
  | 'measurements'
  | 'partlyLogged'
  | 'coachWhy'
  | 'reminders'
  | 'recap'
  | 'hideNumbers'
  | 'numbersMode'
> = {
  photos: {
    title: 'Fotografii de progres',
    privacy:
      'Salvate doar pe acest telefon, nu se încarcă niciodată. Dacă ștergi aplicația, se șterg și ele — distribuie o fotografie ca să păstrezi o copie.',
    exportNote: 'Fotografiile de progres rămân pe telefon, așa că nu sunt incluse în export.',
    web: 'Fotografiile de progres sunt pe telefonul tău: deschide aplicația Chefer ca să le faci și să le compari. Nu se încarcă niciodată.',
    empty:
      'Nicio fotografie încă. Fă-le mereu în același loc și în aceeași lumină, apoi compară-le una lângă alta.',
    takePhoto: 'Fă o fotografie',
    choosePhoto: 'Alege o fotografie',
    compare: 'Compară',
    pickTwo: 'Atinge două fotografii ca să le compari.',
    share: 'Distribuie',
    delete: 'Șterge fotografia',
    deleteConfirmTitle: 'Ștergi această fotografie?',
    deleteConfirmBody: 'Există doar pe acest telefon, așa că nu poate fi recuperată.',
    shareFailed: 'Nu am putut distribui fotografia din această versiune a aplicației.',
    saveFailed: 'Nu am putut salva fotografia. Încearcă din nou.',
    cameraDenied: 'Accesul la cameră este oprit. Permite-l din Setări sau alege o fotografie.',
  },

  measurements: {
    title: 'Măsurători corporale',
    intro:
      'Urmărește talia, șoldurile, pieptul, brațele, coapsele și grăsimea corporală — gratuit și în unitățile tale.',
    add: 'Adaugă măsurători',
    save: 'Salvează măsurătorile',
    saving: 'Se salvează…',
    saved: 'Măsurătorile au fost salvate',
    empty: 'Nicio măsurătoare încă. Măsoară ce vrei — toate câmpurile sunt opționale.',
    oneEntry: 'Adaugă o nouă înregistrare într-o zi viitoare ca să vezi schimbarea.',
    declined:
      'Măsurătorile tale nu au fost salvate, pentru că Chefer nu are permisiunea de a stoca informații despre sănătate.',
    deleteLabel: 'Șterge măsurătorile din {day}',
    deleteError: 'Nu am putut șterge înregistrarea. Încearcă din nou peste puțin timp.',
    entries: 'Înregistrări',
    labels: {
      waist: 'Talie',
      hips: 'Șolduri',
      chest: 'Piept',
      upperArm: 'Braț',
      thigh: 'Coapsă',
      bodyFat: 'Grăsime corporală',
    },
    errors: {
      format: 'Folosește un număr, de exemplu 82,5.',
      bodyFatRange: 'Grăsimea corporală trebuie să fie între {min} și {max} %.',
      lengthRange: 'Trebuie să fie între {min} și {max} {unit}.',
      empty: 'Introdu cel puțin o măsurătoare.',
    },
    change: {
      none: 'Nicio schimbare față de prima înregistrare',
      since: '{change} față de prima înregistrare',
    },
  },

  partlyLogged: {
    label: 'Zi înregistrată parțial',
    detail: 'Analiza săptămânală nu include această zi în medii.',
    saveError: 'Nu am putut salva. Încearcă din nou peste puțin timp.',
  },

  coachWhy: {
    title: 'De ce această sugestie',
    span: {
      days: { one: '{count} zi', few: '{count} zile', other: '{count} de zile' },
      weeks: {
        one: '{count} săptămână',
        few: '{count} săptămâni',
        other: '{count} de săptămâni',
      },
    },
    trendSteady: 'Tendința greutății tale a rămas stabilă, de la {from} la {to}, în {span}.',
    trendDown:
      'Tendința greutății tale a coborât de la {from} la {to} în {span}, cu aproximativ {rate} pe săptămână.',
    trendUp:
      'Tendința greutății tale a urcat de la {from} la {to} în {span}, cu aproximativ {rate} pe săptămână.',
    noTrend: 'Nu sunt încă destule cântăriri ca să citesc tendința greutății tale.',
    leftOut: {
      one: 'O zi înregistrată parțial nu a fost inclusă.',
      few: '{count} zile înregistrate parțial nu au fost incluse.',
      other: '{count} de zile înregistrate parțial nu au fost incluse.',
    },
    averaged: {
      kcal: {
        one: 'În ziua ta completă ai avut {avg} kcal, cu un obiectiv de {target} kcal.',
        few: 'În cele {count} zile complete ai avut în medie {avg} kcal, cu un obiectiv de {target} kcal.',
        other:
          'În cele {count} de zile complete ai avut în medie {avg} kcal, cu un obiectiv de {target} kcal.',
      },
    },
    noCompleteDays: 'Săptămâna aceasta nu există zile complete pentru o medie.',
    decision: {
      plateauWithheld:
        'Tendința ta nu a coborât la două analize săptămânale la rând. Cu Premium, bucătarul tău transformă asta într-o sugestie de buget pentru săptămâna viitoare.',
      plateau: {
        kcal: 'Tendința ta nu a coborât la două analize săptămânale la rând, așa că îți sugerez {change} kcal pe zi săptămâna viitoare.',
      },
      gainStallWithheld:
        'Tendința ta nu urcă încă. Cu Premium, bucătarul tău transformă asta într-o sugestie de buget pentru săptămâna viitoare.',
      gainStall: {
        kcal: 'Tendința ta nu urcă încă, așa că îți sugerez {change} kcal pe zi ca să ai energie pentru antrenamentele de săptămâna viitoare.',
      },
      plateauWatch:
        'Tendința ta nu a coborât săptămâna aceasta. O săptămână poate însemna doar apă, așa că mă uit din nou duminica viitoare înainte să sugerez ceva.',
      onTrack: 'Tendința ta merge în direcția dorită, așa că bugetul rămâne la fel.',
      fewCompleteDays:
        'Sugerez schimbări pe baza a cel puțin {min} zile complete, așa că bugetul rămâne la fel săptămâna aceasta.',
      noTrend:
        'Cântărește-te de câteva ori pe săptămână și îți pot citi tendința. Până atunci, bugetul rămâne la fel.',
      atFloor: 'Bugetul tău este deja la minimul pe care îl sugerez, așa că rămâne la fel.',
      atCeiling: 'Bugetul tău este deja la maximul pe care îl sugerez, așa că rămâne la fel.',
      under18: 'Pentru cei sub 18 ani păstrez bugetul la nivel de menținere, așa că rămâne la fel.',
      noBodyMetrics:
        'Adaugă înălțimea, vârsta și nivelul de activitate în Obiectivele tale și îți pot sugera schimbări. Până atunci, bugetul rămâne la fel.',
      noDirection: 'Obiectivul tău nu cere o schimbare de buget, așa că rămâne la fel.',
    },
    data: {
      trendWeight: 'Tendința greutății',
      trendWeightValue: '{from} → {to}',
      weeklyRate: 'Ritm săptămânal',
      steady: 'stabil',
      weighIns: 'Cântăriri',
      weighInsValue: '{count} în {span}',
      averageIntake: 'Aport mediu',
      averageIntakeValue: { kcal: '{value} kcal' },
      dailyTarget: 'Obiectiv zilnic',
      dailyTargetValue: { kcal: '{value} kcal' },
      completeDays: 'Zile complete',
      completeDaysPartly: '{complete} (+{partly} înregistrate parțial)',
    },
  },

  reminders: {
    slots: {
      breakfast: 'Mic dejun',
      lunch: 'Prânz',
      snack: 'Gustare',
      dinner: 'Cină',
    },
    notification: {
      breakfast: {
        title: 'E ora micului dejun',
        body: 'Poftă bună la micul dejun. Atinge ca să vezi mesele de azi.',
      },
      lunch: {
        title: 'E ora prânzului',
        body: 'E timpul pentru o pauză de prânz. Atinge ca să vezi mesele de azi.',
      },
      snack: {
        title: 'E ora gustării',
        body: 'Un moment bun pentru o gustare. Atinge ca să vezi mesele de azi.',
      },
      dinner: {
        title: 'E ora cinei',
        body: 'E timpul să te gândești la cină. Atinge ca să vezi mesele de azi.',
      },
    },
    stepTitle: 'Îți amintim la ora mesei?',
    stepBody:
      'Un semnal discret când e timpul să mănânci, ca planul să fie acolo când ai nevoie de el. Nimic în zilele în care ai înregistrat deja masa respectivă.',
    stepYes: 'Da, amintește-mi',
    stepNo: 'Nu acum',
    stepLater: 'Poți schimba orele oricând din Setări → Notificări.',
    cardTitle: 'Mementouri la ora mesei',
    cardBody: 'Un memento discret pentru fiecare masă, omis după ce masa e înregistrată.',
    masterLabel: 'Amintește-mi la ora mesei',
    webNote: 'Mementourile ajung pe telefon, prin aplicația Chefer.',
    off: 'Mementourile la ora mesei sunt oprite',
  },

  recap: {
    title: 'Săptămâna ta pe scurt',
    todayCardTitle: 'Săptămâna ta pe scurt',
    todayCardBody: 'Ce ai gătit și cum te-ai antrenat săptămâna trecută.',
    foodHeading: 'Mâncare',
    gymHeading: 'Antrenament',
    newRecipesHeading: 'Rețete noi pe care le-ai încercat',
    quietTitle: 'O săptămână liniștită',
    quietBody: 'Rezumatul se completează pe măsură ce gătești, înregistrezi și te antrenezi.',
    foodQuiet: 'Nimic gătit sau înregistrat din plan în acea săptămână.',
    share: 'Distribuie săptămâna',
    shareSheetTitle: 'Ce apare pe card?',
    shareCooking: 'Gătit',
    shareProtein: 'Zile cu proteine',
    shareTraining: 'Antrenament',
    shareNote: 'Cardul tău nu arată niciodată greutatea, alergiile sau ce ai înregistrat.',
    previousWeek: 'Săptămâna anterioară',
    nextWeek: 'Săptămâna următoare',
    shareMessage: 'Săptămâna mea cu Chefer: {label}',
    food: {
      cookedFromPlan: {
        one: '{count} masă gătită din plan',
        few: '{count} mese gătite din plan',
        other: '{count} de mese gătite din plan',
      },
      newRecipesTried: {
        one: '{count} rețetă nouă încercată',
        few: '{count} rețete noi încercate',
        other: '{count} de rețete noi încercate',
      },
      proteinDays: {
        one: 'Obiectivul de proteine atins în {hit} din {count} zi înregistrată',
        few: 'Obiectivul de proteine atins în {hit} din {count} zile înregistrate',
        other: 'Obiectivul de proteine atins în {hit} din {count} de zile înregistrate',
      },
    },
    gym: {
      sessions: {
        one: '{count} antrenament',
        few: '{count} antrenamente',
        other: '{count} de antrenamente',
      },
      prCount: {
        one: '{count} record personal nou',
        few: '{count} recorduri personale noi',
        other: '{count} de recorduri personale noi',
      },
      streakWeeks: {
        one: '{count} săptămână la rând',
        few: '{count} săptămâni la rând',
        other: '{count} de săptămâni la rând',
      },
    },
  },

  hideNumbers: {
    onPlanTitle: 'Azi, până acum',
    onPlanEmpty: 'Mesele de azi sunt planificate. Bifează-le pe măsură ce mănânci.',
    onPlanDone: 'Ai mâncat azi toate mesele planificate.',
    noPlan: 'Înregistrează ce mănânci ca să-ți vezi ziua aici.',
    onPlanLine: {
      one: '{eaten} din {count} masă planificată, mâncată',
      few: '{eaten} din {count} mese planificate, mâncate',
      other: '{eaten} din {count} de mese planificate, mâncate',
    },
    recipeNutritionHidden: 'Valorile nutriționale sunt ascunse din setări.',
    weekOnPlan: 'Planificată pe gustul tău, toată săptămâna.',
    estimateHidden: 'Le estimăm noi pentru tine.',
    portion: { single: '{portion} porție', multiple: '{portion} porții' },
  },

  numbersMode: {
    question: 'Ce vrei să urmărești?',
    fullTitle: 'Calorii și macronutrienți',
    fullDetail: 'Calorii, proteine, carbohidrați și grăsimi în Azi și în jurnal.',
    proteinTitle: 'Doar proteine',
    proteinDetail: 'Un singur număr: proteinele. Săptămâna ta echilibrează restul în fundal.',
    noneTitle: 'Ascunde cifrele',
    noneDetail:
      'Fără calorii sau macronutrienți nicăieri: porții și bife în schimb. Săptămâna ta se echilibrează în fundal.',
    protein: '{value} g proteine',
    kcal: '{value} kcal',
    proteinAverage: 'Săptămâna aceasta ai avut în medie {value} g proteine pe zi',
    proteinRing: '{eaten} din {target} g proteine',
  },
};
