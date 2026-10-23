import type { Catalog } from '../../types';

export const email: Catalog['email'] = {
  greeting: 'Bună, {name},',
  greetingNoName: 'Bună,',
  weeklyFooter: {
    reasonMonday:
      'Primești acest email de luni pentru că ai activat emailurile săptămânale în contul Chefer.',
    reasonSunday:
      'Primești acest rezumat de duminică pentru că ai activat emailurile săptămânale în contul Chefer.',
    unsubscribe: 'Dezabonează-te',
    preferences: 'Preferințe email',
  },
  weekReady: {
    subjectWithTotal: 'Săptămâna ta este gata: {dinners}, listă de cumpărături de {total}',
    subject: 'Săptămâna ta este gata: {dinners} în plan',
    intro: 'Săptămâna ta, {week}, este gata.',
    sourceChefRated: {
      one: 'Bucătarul tău a planificat-o duminică, după obiectivele tale și preparatul pe care l-ai notat.',
      few: 'Bucătarul tău a planificat-o duminică, după obiectivele tale și cele {count} preparate pe care le-ai notat.',
      other:
        'Bucătarul tău a planificat-o duminică, după obiectivele tale și cele {count} de preparate pe care le-ai notat.',
    },
    sourceChef: 'Bucătarul tău a planificat-o duminică, după obiectivele și preferințele tale.',
    sourceCurated:
      'Duminică ți-am ales o săptămână nouă de rețete, potrivite cu alergiile și obiectivele tale zilnice.',
    sourceTemplate: 'Săptămâna salvată pe care o urmezi în Săptămânile mele se repetă și acum.',
    sourceYours: 'Iată săptămâna pe care ți-ai planificat-o.',
    dinnersHeading: 'Cinele din această săptămână:',
    listTotal: 'Lista de cumpărături estimată: {total}.',
    listReady: 'Și lista de cumpărături este gata.',
    seeWeek: 'Vezi săptămâna',
    openList: 'Deschide lista de cumpărături',
    shoppingList: 'Lista de cumpărături',
    upsell:
      'Săptămânile Premium învață din preparatele pe care le notezi și din ce ai deja în cămară.',
    preheader: '{dinners} în planul pentru {week}.',
  },
  recap: {
    subjectLogged: 'Săptămâna ta pe scurt: {meals}, {days} în obiectiv',
    subject: 'Săptămâna ta pe scurt',
    intro: 'Iată săptămâna ta, {week}.',
    mealsAcrossDays: 'Ai înregistrat {meals} în {days}',
    daysOnTarget: {
      one: '{count} zi în obiectivul de calorii',
      few: '{count} zile în obiectivul de calorii',
      other: '{count} de zile în obiectivul de calorii',
    },
    weight: 'Greutate: {change}',
    workouts: {
      one: '{count} antrenament terminat',
      few: '{count} antrenamente terminate',
      other: '{count} de antrenamente terminate',
    },
    quiet:
      'Săptămâna aceasta nu ai înregistrat nicio masă, și este în regulă. Chiar și câteva zile înregistrate săptămâna viitoare fac rezumatul (și obiectivele tale) mult mai utile.',
    chefReview: 'Analiza săptămânală a bucătarului te așteaptă în Progres.',
    upsell:
      'Premium adaugă o analiză săptămânală a bucătarului, care îți ajustează obiectivele pe baza acestor cifre.',
    nextWeekPlanned: 'Săptămâna viitoare este deja planificată: {dinners}.',
    seeProgress: 'Vezi progresul',
    seeNextWeek: 'Vezi săptămâna viitoare',
    weightChangeSince: '{change} față de cântărirea anterioară',
    weightSteady: 'la fel ca la cântărirea anterioară',
  },
  verify: {
    subject: 'Confirmă-ți adresa de email pentru Chefer',
    intro:
      'Confirmă această adresă ca să primești emailul de luni „Săptămâna ta este gata” și rezumatul de duminică.',
    linkText: 'Confirmă-ți adresa de email (linkul este valabil 7 zile):',
    button: 'Confirmă adresa',
    validity: 'Linkul este valabil 7 zile.',
    notYou: 'Dacă nu ți-ai creat un cont Chefer, ignoră acest email.',
    preheader: 'O singură atingere ca să primești planul săptămânal pe email.',
  },
  passwordReset: {
    subject: 'Resetează-ți parola Chefer',
    intro: 'Cineva a cerut resetarea parolei pentru contul tău Chefer.',
    linkText: 'Resetează-ți parola (linkul este valabil o oră):',
    notYou: 'Dacă nu ai fost tu, ignoră acest email — parola ta rămâne neschimbată.',
  },
};
