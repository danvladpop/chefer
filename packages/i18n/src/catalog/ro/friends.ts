import type { Catalog } from '../../types';

// Romanian draft (review-status.ts: machine-draft). The feature is "Urmărire"
// ("Following"): a person you follow is someone you „urmărești”, and the
// people who follow you are „urmăritori”.
export const friends: Catalog['friends'] = {
  common: {
    retry: 'Încearcă din nou',
    tryAgain: 'Încearcă din nou',
    undo: 'Anulează',
    cancel: 'Renunță',
    goBack: 'Înapoi',
    followBack: 'Urmărește și tu',
  },

  nav: { label: 'Urmărire' },

  intro: {
    title: 'Urmărește oamenii cu care gătești și te antrenezi',
    body: 'Vezi săptămâna lor de mese, salvează-le rețetele și vezi-le antrenamentele.',
    nameHeading: 'Cum te vor vedea ceilalți',
    firstName: 'Prenume',
    lastName: 'Nume',
    firstNameError: 'Adaugă-ți prenumele',
    lastNameError: 'Adaugă-ți numele',
    nameRejected: 'Alege, te rog, alt nume. Unele cuvinte nu sunt permise pe profilurile Chefer.',
    whoHeading: 'Cine te poate urmări',
    whatHeading: 'Ce văd urmăritorii',
    what: {
      plan: 'Mesele din această săptămână, cu calorii și macronutrienți',
      recipes: 'Rețetele pe care le-ai scris sau importat',
      workouts: 'Rutina ta și antrenamentele din ultimele 7 zile',
      change: 'Poți schimba oricând aceste setări.',
    },
    neverHeading: 'Nu se distribuie niciodată',
    never:
      'Emailul tău, alergiile și dietele, măsurătorile corporale și greutatea, obiectivele, ce ai înregistrat, gospodăria ta.',
    findable:
      'Oamenii care îți caută numele te pot găsi. Conținutul raportat de mai multe persoane este ascuns automat.',
    policy: 'Politica de confidențialitate',
    cta: 'Activează urmărirea',
    notNow: 'Nu acum',
    error: 'Nu am putut activa urmărirea. Nu s-a schimbat nimic.',
  },

  visibility: {
    private: 'Privat — tu aprobi fiecare urmăritor',
    public: 'Public — oricine de pe Chefer te poate urmări',
  },

  activated: {
    private:
      'Urmărirea este activată. Doar persoanele pe care le aprobi îți pot vedea mesele și antrenamentele.',
    public: 'Urmărirea este activată. Persoanele care te urmăresc pot vedea ce distribui.',
    filterHidden: {
      one: 'O rețetă de-a ta nu va fi afișată urmăritorilor din cauza unor cuvinte din nume sau din descriere.',
      few: '{count} rețete de-ale tale nu vor fi afișate urmăritorilor din cauza unor cuvinte din nume sau din descriere.',
      other:
        '{count} de rețete de-ale tale nu vor fi afișate urmăritorilor din cauza unor cuvinte din nume sau din descriere.',
    },
  },

  home: {
    title: 'Urmărire',
    searchPlaceholder: 'Caută după nume',
    searchLabel: 'Caută persoane după nume',
    requests: 'Cereri · {n}',
    seeAllRequests: 'Vezi toate cele {n}',
    youFollow: 'Urmărești {n}',
    followers: 'Urmăritori {n}',
    suggested: 'Sugestii pentru tine',
    seeAll: 'Vezi tot',
    activityLabel: 'Activitate',
    activityLabelNew: 'Activitate, {unread} noi',
    settingsLabel: 'Distribuire și confidențialitate',
    hideSuggestion: 'Ascunde sugestia {name}',
    sectionError: {
      requests: 'Nu am putut încărca cererile tale.',
      list: 'Nu am putut încărca această listă.',
      suggestions: 'Nu am putut încărca sugestiile.',
    },
  },

  empty: {
    youFollow: {
      title: 'Găsește oameni pe care îi cunoști',
      body: 'Caută după nume sau urmărește pe cineva de mai jos.',
    },
    followers: {
      title: 'Încă nu ai urmăritori',
      body: 'Povestește despre Chefer persoanelor pe care le cunoști, ca să te poată găsi.',
    },
  },

  invite: {
    cta: 'Invită pe cineva',
    card: {
      title: 'Chefer e mai bun împreună',
      body: 'Invită pe cineva cu care gătești sau te antrenezi.',
    },
    message:
      'Folosesc Chefer ca să-mi planific mesele și antrenamentele. Urmărește-mă în Chefer: {myName}. {appLink}',
  },

  reason: {
    mutualOne: 'Urmărit de {name}',
    mutualMany: {
      one: 'Urmărit de {name} și încă {count} persoană',
      few: 'Urmărit de {name} și încă {count} persoane',
      other: 'Urmărit de {name} și încă {count} de persoane',
    },
    followsYou: 'Te urmărește',
    popular: 'Popular pe Chefer',
  },

  requestRow: {
    accept: 'Acceptă',
    decline: 'Refuză',
    acceptLabel: 'Acceptă-l pe {name}',
    declineLabel: 'Refuză-l pe {name}',
  },

  accepted: {
    snackbar: '{first} îți poate vedea acum mesele și antrenamentele.',
    action: 'Urmărește și tu',
  },

  relation: {
    follow: 'Urmărește',
    followBack: 'Urmărește și tu',
    requested: 'Cerere trimisă',
    following: 'Urmărești',
    editSharing: 'Schimbă ce distribui',
    error: 'Nu am putut actualiza. Încearcă din nou.',
    errorAction: 'Încearcă din nou',
    a11y: {
      follow: 'Urmărește-l pe {name}',
      followBack: 'Urmărește-l și tu pe {name}',
      requested: 'Cerere trimisă. Atinge de două ori pentru a anula cererea către {name}',
      following: 'Îl urmărești pe {name}. Atinge de două ori pentru a nu-l mai urmări',
      self: 'Schimbă ce văd urmăritorii',
    },
  },

  confirm: {
    unfollow: {
      title: 'Nu îl mai urmărești pe {first}?',
      bodyPrivate: 'Va trebui să ceri din nou accesul pentru a-i vedea mesele și antrenamentele.',
      cta: 'Nu mai urmări',
    },
    cancelRequest: {
      title: 'Anulezi cererea?',
      cta: 'Anulează cererea',
      keep: 'Păstrează cererea',
    },
  },

  search: {
    keepTyping: 'Continuă să scrii…',
    noResults: {
      title: 'Nu am găsit pe nimeni pentru „{query}”',
      body: 'Poate nu și-au activat încă urmărirea.',
    },
    rateLimited: 'Prea multe căutări. Încearcă din nou peste un minut.',
    error: 'Nu am putut căuta acum.',
    offline: 'Căutarea are nevoie de conexiune',
    announceNone: 'Nu am găsit pe nimeni',
    announce: {
      one: 'A fost găsită {count} persoană',
      few: 'Au fost găsite {count} persoane',
      other: 'Au fost găsite {count} de persoane',
    },
  },

  requests: {
    title: 'Cereri de urmărire',
    subtitle: 'Doar tu poți vedea această listă.',
    empty: {
      title: 'Nicio cerere',
      body: 'Când cineva cere să te urmărească, cererea apare aici.',
    },
  },

  activity: {
    title: 'Activitate',
    new: 'Noi',
    earlier: 'Mai devreme',
    request: '{name} vrea să te urmărească',
    newFollower: '{name} a început să te urmărească',
    accepted: '{name} ți-a acceptat cererea',
    youAccepted: 'Ai acceptat',
    youDeclined: 'Ai refuzat',
    empty: {
      title: 'Încă nimic',
      body: 'Cererile de urmărire și urmăritorii noi apar aici.',
    },
    retention: 'Activitatea se păstrează 90 de zile.',
    age: {
      minutes: '{n} min',
      hours: '{n} h',
      yesterday: 'Ieri',
      days: { one: '{count} zi', few: '{count} zile', other: '{count} de zile' },
      date: '{day} {month}',
    },
  },

  profile: {
    counts: {
      one: '{count} urmăritor · urmărește {following}',
      few: '{count} urmăritori · urmărește {following}',
      other: '{count} de urmăritori · urmărește {following}',
    },
    followsYou: 'Te urmărește',
    moreOptions: 'Mai multe opțiuni pentru {name}',
    food: 'Mâncare',
    gym: 'Sală',
    foodOrGym: 'Mâncare sau Sală',
    loadingLabel: 'Se încarcă',
    badgePrivate: 'Privat',
    badgePublic: 'Public',
    error: 'Nu am putut încărca acest profil.',
  },

  locked: {
    private: {
      title: 'Acest profil este privat',
      body: 'Urmărește-l pe {first} ca să-i vezi mesele și antrenamentele.',
    },
    requested: {
      title: 'Cerere trimisă',
      body: 'Îi vei vedea mesele și antrenamentele după ce {first} acceptă.',
    },
    public: {
      body: 'Urmărește-l pe {first} ca să-i vezi mesele și antrenamentele.',
    },
  },

  notShared: {
    plan: '{first} nu își distribuie planul de mese',
    recipes: '{first} nu își distribuie rețetele',
    workouts: '{first} nu își distribuie antrenamentele',
  },

  preview: {
    banner: 'Așa te văd urmăritorii.',
    hidden: 'Ascuns urmăritorilor',
    forcedPrivate: 'Profilul tău este privat pentru că mai multe persoane l-au raportat.',
  },

  notAvailable: {
    title: 'Profil indisponibil',
    body: 'Acest profil nu există sau nu este disponibil pentru tine.',
    cta: 'Înapoi',
  },

  food: {
    thisWeek: 'Săptămâna aceasta',
    recipes: 'Rețete',
    recipesCount: 'Rețete {n}',
    weekOf: 'Săptămâna din {dMMM}',
    avg: 'în medie {kcal} kcal/zi',
    portion: {
      one: '{count} porție',
      few: '{count} porții',
      other: '{count} de porții',
    },
    macros: '{kcal} kcal · P {p} g · C {c} g · G {f} g',
    macroLine: 'P {p} g · C {c} g · G {f} g',
    todayDay: '{weekday}, azi',
    dayTotal: 'Total zi {kcal} kcal',
    target: 'Obiectiv {kcal} kcal · P {p} g',
    hiddenRecipe: 'Rețetă ascunsă',
    hiddenRecipeLabel: 'Rețetă ascunsă, {kcal} kcal',
    leftoversFrom: 'Rămășițe de la {day}',
    emptyDay: 'Nimic planificat pentru {weekday}.',
    noPlan: '{first} nu și-a planificat încă această săptămână.',
  },

  recipes: {
    search: 'Caută în rețetele lui {first}',
    empty: '{first} nu a distribuit încă nicio rețetă.',
    save: 'Salvează {recipe}',
    unsave: 'Scoate {recipe} din salvate',
    saved: 'Salvat în carnetul tău de rețete',
    removed: 'Scos din salvate',
    perServing: '{kcal} kcal · {mins} min',
  },

  recipe: {
    by: 'De {name}',
    byLabel: 'De {name}. Deschide profilul',
    from: 'De la {first}',
    fromGone: 'De la un alt bucătar Chefer',
    source: 'Sursă: {domain}',
    sourceLabel: 'Deschide rețeta originală pe {domain}',
    addToWeek: 'Adaugă la săptămâna mea',
    report: 'Raportează rețeta',
    hidden: {
      title: 'Ascunsă persoanelor care te urmăresc',
      reports: 'Mai multe persoane au raportat această rețetă, așa că nu mai este afișată altora.',
      filter:
        'Unele cuvinte din numele sau din descrierea ei nu sunt permise în rețetele distribuite. Modific-o ca să o poți distribui din nou.',
    },
  },

  addToWeek: {
    title: 'Adaugă la săptămâna ta',
    eyebrow: '{recipe} · {kcal} kcal',
    thisWeek: 'Săptămâna aceasta',
    nextWeek: 'Săptămâna viitoare',
    addHere: 'Adaugă aici',
    addAsSide: 'Adaugă ca garnitură',
    replace: 'Înlocuiește',
    replaceThisMeal: 'Înlocuiește această masă',
    cta: 'Adaugă la {day}, {meal}',
    noPlan: 'Nu ai încă un plan pentru această săptămână.',
    makePlan: 'Creează un plan',
    replaceTitle: 'Înlocuiești {meal}?',
    replaceBody: '{recipe} va fi la {day}, {meal}, în locul actualei mese.',
    done: 'Adăugat la {day}, {meal}',
    useAnyway: 'Folosește oricum',
  },

  meal: {
    breakfast: 'mic dejun',
    lunch: 'prânz',
    dinner: 'cină',
    snack: 'gustare',
  },

  format: {
    dayMonth: '{day} {month}',
    weekdayDayMonth: '{weekday} {dayMonth}',
  },

  gym: {
    routine: 'Rutină',
    lastSevenDays: 'Ultimele 7 zile',
    showAll: 'Arată tot',
    showSets: 'Arată seriile',
    hideSets: 'Ascunde seriile',
    customName: '{name} (personalizat)',
    exercises: {
      one: '{count} exercițiu',
      few: '{count} exerciții',
      other: '{count} de exerciții',
    },
    noRoutine: '{first} nu are încă o rutină de antrenament.',
    noWorkouts: 'Niciun antrenament în ultimele 7 zile.',
    routineDay: '{dayName} · {weekday}',
    setsLabel: {
      one: '{count} serie de {repMin}–{repMax} repetări',
      few: '{count} serii de {repMin}–{repMax} repetări',
      other: '{count} de serii de {repMin}–{repMax} repetări',
    },
  },

  settings: {
    title: 'Distribuire și confidențialitate',
    who: 'Cine te poate urmări',
    what: 'Ce pot vedea urmăritorii',
    safety: 'Siguranță',
    plan: 'Planul de mese din această săptămână',
    recipes: 'Rețetele pe care le-ai scris sau importat',
    workouts: 'Rutina și antrenamentele tale',
    targets: 'Obiectivele tale zilnice',
    targetsDetail: 'Obiectivele de calorii și macronutrienți, lângă planul tău de mese.',
    preview: 'Vezi ce văd urmăritorii',
    blocked: 'Persoane blocate ({n})',
    turnOff: 'Dezactivează urmărirea',
    forcedPrivate:
      'Profilul tău este privat pentru că mai multe persoane l-au raportat. Nu poate fi făcut public.',
    saveError: 'Nu am putut salva. Încearcă din nou.',
    notActivated: 'Activează urmărirea ca să folosești această funcție.',
  },

  targets: {
    confirm: {
      title: 'Distribui obiectivele tale zilnice?',
      body: 'Urmăritorii vor vedea obiectivele tale zilnice de calorii și macronutrienți, lângă planul tău de mese.',
      cta: 'Distribuie obiectivele',
    },
  },

  public: {
    sections: {
      meals: 'mesele',
      recipes: 'rețetele',
      workouts: 'antrenamentele',
      targets: 'obiectivele zilnice',
      profileOnly: 'numele și poza ta',
    },
    sectionsAnd: '{head} și {last}',
    confirm: {
      title: 'Faci profilul public?',
      body: 'Oricine de pe Chefer te va putea urmări fără să ceară acces și va vedea ce distribui: {sections}.',
      pending: {
        one: 'Cererea ta în așteptare va fi acceptată.',
        few: 'Cele {count} cereri ale tale în așteptare vor fi acceptate.',
        other: 'Cele {count} de cereri ale tale în așteptare vor fi acceptate.',
      },
      cta: 'Fă-l public',
    },
  },

  private: {
    confirm: {
      title: 'Faci profilul privat?',
      body: {
        one: 'Urmăritorii noi vor avea nevoie de aprobarea ta. Singurul tău urmăritor actual poate vedea în continuare ce distribui. Îl poți elimina.',
        few: 'Urmăritorii noi vor avea nevoie de aprobarea ta. Cei {count} urmăritori actuali pot vedea în continuare ce distribui. Îi poți elimina pe oricare dintre ei.',
        other:
          'Urmăritorii noi vor avea nevoie de aprobarea ta. Cei {count} de urmăritori actuali pot vedea în continuare ce distribui. Îi poți elimina pe oricare dintre ei.',
      },
      cta: 'Fă-l privat',
      reviewFollowers: 'Verifică urmăritorii',
    },
  },

  privacyRow: {
    label: 'Vizibilitatea profilului',
    private: 'Privat',
    public: 'Public',
    off: 'Dezactivat',
  },

  remove: {
    menu: 'Elimină urmăritorul',
    title: 'Îl elimini pe {first} din urmăritori?',
    body: 'Nu va fi anunțat. Te poate urmări din nou sau poate cere acces, dacă profilul tău este privat.',
    cta: 'Elimină',
    done: '{first} a fost eliminat',
  },

  block: {
    title: 'Îl blochezi pe {first}?',
    body: 'Nu te va putea găsi și nu îți va vedea profilul, iar tu nu îl vei vedea pe al lui și nici rețetele lui. Orice urmărire dintre voi este eliminată. Nu va fi anunțat.',
    cta: 'Blochează',
    profileAction: 'Blochează-l pe {first}',
    done: '{first} a fost blocat',
  },

  unblock: {
    title: 'Îl deblochezi pe {first}?',
    body: 'Te va putea găsi din nou. Urmăririle nu se restabilesc.',
    cta: 'Deblochează',
  },

  report: {
    titleUser: 'Raportează-l pe {first}',
    titleRecipe: 'Raportează această rețetă',
    body: 'Atinge un motiv. Îl blocăm imediat pe {first}, așa că nu vei mai vedea nici profilul, nici rețetele lui.',
    reasons: {
      INAPPROPRIATE: 'Nume sau rețetă jignitoare',
      SPAM: 'Spam sau cont fals',
      HARASSMENT: 'Hărțuire',
      UNSAFE: 'Conținut periculos sau dăunător',
      OTHER: 'Altceva',
    },
    reasonHint: 'Îl raportează și îl blochează pe {name}',
    profileAction: 'Raportează și blochează-l pe {first}',
    done: 'Raportat și blocat. Nu vei mai vedea profilul lui {first} și nici rețetele lui.',
    error: 'Nu am putut trimite. Încearcă din nou.',
  },

  blocked: {
    title: 'Persoane blocate',
    empty: 'Nu ai blocat pe nimeni.',
    unblockLabel: 'Deblochează-l pe {name}',
  },

  consent: {
    labelOn: 'Urmărire și distribuire: activate',
    labelOff: 'Urmărire și distribuire: dezactivate',
  },

  turnOff: {
    title: 'Dezactivezi urmărirea?',
    intro: 'Aceasta te elimină imediat din Urmărire:',
    bulletFind: 'Oamenii nu te mai pot găsi sau urmări',
    bulletFollows: 'Nu mai urmărești pe nimeni, iar nimeni nu te mai urmărește',
    bulletRecipes:
      'Rețetele tale dispar din listele salvate ale altor persoane (copiile pe care le-au adăugat deja în săptămânile lor rămân ale lor)',
    bulletActivity: 'Cererile și activitatea ta sunt șterse',
    outro: 'Poți activa urmărirea din nou mai târziu, de la zero.',
    cta: 'Dezactivează urmărirea',
    done: 'Urmărirea este dezactivată.',
  },

  offline: {
    line: 'Offline · se afișează ce s-a salvat {time}',
    needsConnection: 'Necesită conexiune',
  },

  unavailable: 'Urmărirea nu este disponibilă acum.',

  announce: {
    requestAccepted: 'Cererea de la {name} a fost acceptată',
    nowFollowing: 'Acum îl urmărești pe {name}',
    requestSent: 'Cerere trimisă către {name}',
    reportedAndBlocked: 'Raportat și blocat',
    personRowHint: 'Deschide profilul',
  },

  appeal: {
    prompt: 'Crezi că este o greșeală?',
    action: 'Trimite email la {email}',
    a11y: 'Crezi că este o greșeală? Trimite email la {email} pentru a contesta',
    subjectRecipe: 'Contestație: rețetă ascunsă',
    subjectProfile: 'Contestație: profil privat',
  },
};
