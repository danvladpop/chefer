import type { Catalog } from '../../types';

export const consent: Catalog['consent'] = {
  health: {
    eyebrow: 'Informații despre sănătate',
    title: 'Poate Chefer să folosească aceste date ca să îți planifice mesele?',
    intro:
      'Alergiile, dietele, obiectivul și măsurătorile corporale sunt considerate informații despre sănătate conform legislației UE, de aceea avem nevoie de permisiunea ta clară.',
    whatLabel: 'Ce',
    whatText:
      'alergiile, dietele și măsurătorile pe care le introduci pentru tine și gospodăria ta',
    whyLabel: 'De ce',
    whyText: 'ca să verificăm și să planificăm mesele și obiectivele tale',
    whereLabel: 'Unde',
    whereText:
      'stocate pe serverele noastre din UE; trimise furnizorilor noștri de IA doar când folosești o funcție bazată pe IA (vei fi întrebat separat)',
    choiceLabel: 'Alegerea ta',
    choiceText:
      'o poți retrage oricând din Profil › Confidențialitate și date, iar noi ștergem datele',
    allow: 'Permite și salvează',
    decline: 'Nu salva',
    saving: 'Se salvează…',
    saveError: 'Nu am putut salva alegerea. Încearcă din nou.',
    declinedNotice: 'Fără acest acord, Chefer nu poate verifica planurile în funcție de alergii.',
    declinedBody:
      'Obiectivul și măsurătorile tale nu au fost salvate, așa că obiectivele folosesc valorile implicite.',
    declinedWeight:
      'Greutatea ta nu a fost salvată, pentru că Chefer nu are permisiunea de a stoca informații despre sănătate.',
    todayCardTitle: 'Planurile nu sunt verificate în funcție de alergii',
    todayCardAction: 'Permite informațiile despre sănătate',
    dismiss: 'Închide',
    rowTitle: 'Informații despre sănătate',
    rowAllowed: 'Permis la {date}',
    rowNotAllowed: 'Nepermis. Alergiile, obiectivul și măsurătorile nu sunt stocate.',
    rowAllowAction: 'Permite informațiile despre sănătate',
    withdraw: 'Retrage și șterge',
    withdrawTitle: 'Ștergi informațiile despre sănătate?',
    withdrawBody:
      'Se vor elimina alergiile, dietele, ingredientele neagreate, obiectivul, măsurătorile și cântăririle pentru tine și gospodăria ta. Planurile nu vor mai fi verificate în funcție de alergii.',
    withdrawKeep: 'Păstrează',
    withdrawDone: 'Informațiile tale despre sănătate au fost șterse.',
    withdrawError: 'Nu am putut șterge informațiile despre sănătate. Încearcă din nou.',
  },
  ai: {
    title: 'Permiți IA să folosească datele tale?',
    intro:
      'Ca să {action}, Chefer trimite o parte din datele tale către {primary}, un serviciu de inteligență artificială terț, care le folosește doar pentru a produce rezultatul.',
    sentHeading: 'Ce se trimite',
    noTraining: 'Datele tale nu sunt folosite pentru antrenarea modelelor de IA.',
    backupProvider:
      'Dacă {primaryShort} este ocupat, o cerere poate fi preluată în schimb de {backups}, un serviciu de IA de rezervă.',
    control: 'Te întrebăm o singură dată. Poți dezactiva oricând din Profil → IA și datele tale.',
    privacyLabel: 'Politica de confidențialitate',
    allow: 'Permite',
    notNow: 'Nu acum',
    saving: 'Se salvează…',
    saveError: 'Nu am putut salva alegerea. Încearcă din nou.',
    cardTitle: 'IA și datele tale',
    toggleTitle: 'Permite funcțiilor IA să îmi prelucreze datele',
    toggleOn:
      'Planurile de mese, înlocuirile de mese, scanările de fotografii, importurile de rețete și de videoclipuri, chatul, completarea ingredientelor, ordonarea listei de cumpărături cu IA și rezumatul săptămânal al antrenorului trimit către {providers} datele de care au nevoie. Nu sunt folosite pentru antrenare.',
    toggleOff: 'Dezactivat. Te vom întreba din nou înainte ca o funcție IA să îți trimită datele.',
    coachReviewNote:
      'Rezumatul săptămânal al antrenorului (Premium) folosește și el această setare: trimite evoluția greutății, obiectivul și media de calorii. Fără ea, rezumatul este scris dintr-un șablon și nu se trimite nimic.',
    features: {
      'meal-plan': {
        action: 'construiești planul de mese',
        line1: 'Preferințele alimentare, alergiile și ingredientele pe care nu le agreezi',
        line2:
          'Obiectivul și măsurătorile corporale (vârstă, sex, înălțime, greutate, nivel de activitate, țintă de calorii)',
        line3: 'Nevoile membrilor gospodăriei și rețetele pe care le-ai notat',
      },
      'meal-swap': {
        action: 'găsești o masă de înlocuire',
        line1: 'Preferințele alimentare, alergiile și bucătăriile preferate',
        line2: 'Masa pe care o înlocuiești',
      },
      'meal-scan': {
        action: 'estimezi valorile nutriționale din fotografie',
        line1: 'Fotografia pe care o faci sau o alegi',
      },
      'recipe-import': {
        action: 'citești și adaptezi rețeta',
        line1: 'Linkul, textul sau fotografia pe care le trimiți',
        line2:
          'Pentru un link video: descrierea și subtitrările lui sau audio-ul transcris de Groq (șters imediat după)',
        line3: 'Alergiile, restricțiile alimentare și ingredientele pe care nu le agreezi',
      },
      chat: {
        action: 'răspunzi la mesajul tău',
        line1: 'Mesajele pe care le trimiți',
        line2: 'Obiectivele, alergiile, restricțiile, mesele de azi și notele recente',
      },
      'shopping-list': {
        action: 'ordonezi lista de cumpărături',
        line1: 'Ingredientele din planul tău de mese',
      },
      'ingredient-estimate': {
        action: 'completezi valorile nutriționale ale ingredientului',
        line1: 'Denumirea ingredientului pe care ai scris-o',
      },
    },
  },
  aiGenerated: {
    label: 'Generat cu IA',
    a11y: 'Această rețetă a fost generată cu IA',
    reviewA11y: 'Acest rezumat a fost scris cu IA',
  },
  history: {
    title: 'Istoricul consimțămintelor',
    loadError: 'Nu am putut încărca istoricul consimțămintelor',
    empty: 'Nu s-a înregistrat nimic încă.',
    termsAccepted: 'Termeni acceptați',
    termsAcceptedVersion: 'Termeni acceptați (v{version})',
    termsDeclined: 'Termeni refuzați',
    privacyAccepted: 'Politica de confidențialitate acceptată',
    privacyAcceptedVersion: 'Politica de confidențialitate acceptată (v{version})',
    privacyDeclined: 'Politica de confidențialitate refuzată',
    age: 'Ai confirmat că ai cel puțin 16 ani',
    aiAllowed: 'Funcții IA permise',
    aiAllowedProviders: 'Funcții IA permise ({providers})',
    aiRevoked: 'Funcții IA retrase',
    analyticsAnonOn: 'Analiza utilizării: anonimă activată',
    analyticsAnonOff: 'Analiza utilizării: anonimă dezactivată',
    analyticsLinked: 'Analiza utilizării: legată de cont',
    analyticsUnlinked: 'Analiza utilizării: dezlegată de cont',
    emailWeekReadyOn: 'Email săptămânal (luni): activat',
    emailWeekReadyOff: 'Email săptămânal (luni): dezactivat',
    emailRecapOn: 'Email săptămânal (rezumat de duminică): activat',
    emailRecapOff: 'Email săptămânal (rezumat de duminică): dezactivat',
    autoPlanOn: 'Planifică-mi săptămâna în fiecare duminică: activat',
    autoPlanOff: 'Planifică-mi săptămâna în fiecare duminică: dezactivat',
    healthAllowed: 'Informații despre sănătate permise',
    healthWithdrawn: 'Informații despre sănătate retrase',
  },
  section: {
    heading: 'Confidențialitate și date',
    gymSettings: 'Setări pentru sală',
  },
};
