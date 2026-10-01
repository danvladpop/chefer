import { describe, expect, it } from 'vitest';
import { BLOCKED_TERMS } from './blocked-terms';
import { containsBlockedTerm, firstBlockedField, normalizeForFilter } from './text-filter';

describe('normalizeForFilter', () => {
  it('lowercases, strips diacritics and non-letters', () => {
    expect(normalizeForFilter('Ștefan')).toBe('stefan');
    expect(normalizeForFilter('  Ioana-Maria!  ')).toBe('ioana maria');
    expect(normalizeForFilter('Crème   Brûlée')).toBe('creme brulee');
    expect(normalizeForFilter('')).toBe('');
  });

  it('maps leet substitutions', () => {
    expect(normalizeForFilter('sh1t')).toBe('shit');
    expect(normalizeForFilter('b1tch')).toBe('bitch');
    expect(normalizeForFilter('@ss')).toBe('ass');
    expect(normalizeForFilter('$hit')).toBe('shit');
    expect(normalizeForFilter('fr34k')).toBe('freak');
    expect(normalizeForFilter('p0rn')).toBe('porn');
    expect(normalizeForFilter('5ex')).toBe('sex');
  });

  it('collapses three or more repeated letters to two', () => {
    expect(normalizeForFilter('fuuuuck')).toBe('fuuck');
    expect(normalizeForFilter('sooo good')).toBe('soo good');
    expect(normalizeForFilter('coffee')).toBe('coffee');
    expect(normalizeForFilter('sh1111t')).toBe('shiit');
  });

  it('turns every non-letter into a single space', () => {
    expect(normalizeForFilter('a_b-c.d/e')).toBe('a b c d e');
    expect(normalizeForFilter('2 tbsp, olive oil')).toBe('tbsp olive oil'); // 2 is not leet
  });
});

describe('containsBlockedTerm: catches', () => {
  it.each([
    'fuck',
    'FUCK you',
    'What the fuck',
    'you are a bitch',
    'Shit soup',
    'cunt',
    'asshole',
    'nigger',
    'faggot',
    'retard',
    'Big Porn Burger',
    'whore',
    'pussy',
  ])('plain English: %s', (text) => {
    expect(containsBlockedTerm(text)).toBe(true);
  });

  it('does not catch a word split by punctuation other than a single-letter run', () => {
    // "f*ck" is left to reports and blocks; the filter stays whole-word.
    expect(containsBlockedTerm('f*ck')).toBe(false);
  });

  it.each([
    '$hit',
    '$h1t',
    'fuck',
    'fück',
    'FÜCK',
    'shít',
    'bìtch',
    'cünt',
    'pórn',
    'wh0re',
    '5lut',
    'p0rn',
    'cunt5',
    'n1gger',
    'f4ggot',
    'fuuuuck',
    'shiiiit',
    'biiiitch',
    'niggggger',
    'fuckkkkk',
    'f u c k',
    'f.u.c.k',
    'f-u-c-k',
    'what a s h i t show',
    'you a f u c k e r',
    'ＦＵＣＫ', // full-width letters (NFKD)
    `fu${String.fromCharCode(0x200b)}ck`, // zero-width space inside the word
  ])('evasion: %s', (text) => {
    expect(containsBlockedTerm(text)).toBe(true);
  });

  it.each([
    'mother fucker',
    'Motherfucker Muffins',
    'sieg heil',
    'Heil Hitler',
    'kill yourself',
    'ching chong',
    'white power',
  ])('phrases and compounds: %s', (text) => {
    expect(containsBlockedTerm(text)).toBe(true);
  });

  it('catches a term anywhere in a longer text', () => {
    expect(containsBlockedTerm('A lovely stew, and a delicious shit of a recipe.')).toBe(true);
    expect(containsBlockedTerm('Fry the onions.\nThen fuck it, add cream.')).toBe(true);
  });

  describe('Romanian', () => {
    it.each([
      'pizdă',
      'pizda',
      'PIZDĂ',
      'p1zd4',
      'pizdaaa',
      'pulă',
      'pula',
      'PULĂ',
      'pu1a',
      'muie',
      'MUIE',
      'mu1e',
      'muie Steaua',
      'futut',
      'fut',
      'fututi',
      'fut-o',
      'futu-ți',
      'coaie',
      'cacat',
      'curvă',
      'du-te-n pula mea',
      'sugi pula',
      'pizda mă-tii',
    ])('%s', (text) => {
      expect(containsBlockedTerm(text)).toBe(true);
    });
  });
});

describe('containsBlockedTerm: does NOT catch (whole-token, never substring)', () => {
  it.each([
    'Scunthorpe',
    'Scunthorpe pies',
    'assessment',
    'cocktail',
    'Cocktail sausages',
    'Sussex',
    'Sussex pond pudding',
    'shiitake',
    'Shiitake mushroom ramen',
    'shitake', // a common misspelling
    'Dickens',
    'Charles Dickens roast',
    'cockles',
    'Cockles and mussels',
    'faggots', // British meatball dish, plural left off the list
    'Faggots and peas',
    'spotted dick',
    'Spotted Dick and custard',
    'Penistone',
    'Essex',
    'Middlesex',
    'Hancock',
    'Cockburn',
    'Sexton',
    'classic',
    'grass-fed',
    'bassoon',
    'cumin',
    'Cumin lamb',
    'analysis',
    'canal',
    'annals',
    'therapist',
    'grape',
    'scrape the bowl',
    'pulla', // Finnish cardamom bun
    'Shitaki',
    'analog',
    'passion fruit',
    'button mushrooms',
    'bitchin',
    'Tittensor',
    'Raspberry',
  ])('%s', (text) => {
    // "bitchin" is a mild adjective and not on the list; everything else is whole-word safe.
    expect(containsBlockedTerm(text)).toBe(false);
  });

  it.each([
    'ciorbă',
    'Ciorbă de burtă',
    'mici',
    'Mici cu muștar',
    'sarmale',
    'Sarmale în foi de varză',
    'cozonac',
    'Cozonac cu nucă',
    'pulpă',
    'Pulpă de pui la cuptor',
    'pulpe de pui',
    'Pulpe de pui cu cartofi',
    'mușchi',
    'Mușchi de porc',
    'ficat',
    'Ficat de pui cu ceapă',
    'papanași',
    'Papanași cu smântână',
    'mămăligă',
    'Mămăligă cu brânză',
    'cârnați',
    'Cârnați de Pleșcoi',
    'tochitură',
    'zacuscă',
    'plăcintă',
    'drob de miel',
    'salată de boeuf',
    'fasole bătută',
    'Ciorbă de fasole cu ciolan',
    'pui la tuci',
    'Pizza Margherita', // "pizza" is not "pizda"
    'Fuet', // Catalan cured sausage
  ])('Romanian food: %s', (text) => {
    expect(containsBlockedTerm(text)).toBe(false);
  });

  it('leaves real names alone', () => {
    for (const name of [
      'Ștefan',
      'Ioana-Maria',
      'Dick Van Dyke',
      'Peter Cock',
      'Fanny Cradock',
      'Hugh Fearnley-Whittingstall',
      'Gaynor',
      'Nick',
      'Randy',
      'Willy Wonka',
    ]) {
      expect(containsBlockedTerm(name)).toBe(false);
    }
  });

  it('is false for empty and whitespace', () => {
    expect(containsBlockedTerm('')).toBe(false);
    expect(containsBlockedTerm('   ')).toBe(false);
    expect(containsBlockedTerm('123 456')).toBe(false);
  });

  it('does not join single letters that do not spell a blocked word', () => {
    expect(containsBlockedTerm('Vitamins A B C D')).toBe(false);
    expect(containsBlockedTerm('Serves 4 5 or 6')).toBe(false);
  });
});

// Recipe names across cuisines, including the traps this list was trimmed around.
const DISH_NAMES = [
  'Spaghetti alla puttanesca',
  'Spaghetti carbonara',
  'Pasta e fagioli',
  'Risotto ai funghi porcini',
  'Osso buco',
  'Chicken tikka masala',
  'Butter chicken',
  'Palak paneer',
  'Dal makhani',
  'Aloo gobi',
  'Chana masala',
  'Lamb rogan josh',
  'Rice cum dal',
  'Pad thai',
  'Green curry',
  'Tom yum soup',
  'Massaman curry',
  'Vietnamese pho',
  'Bánh mì',
  'Bun cha',
  'Japanese chicken katsu curry',
  'Salmon teriyaki',
  'Tonkotsu ramen',
  'Bukkake udon',
  'Japchae',
  'Jap Chae with beef',
  'Bibimbap',
  'Kimchi jjigae',
  'Korean fried chicken',
  'Beef bulgogi',
  'Kung pao chicken',
  'Mapo tofu',
  'Sweet and sour pork',
  'Peking duck',
  'Dan dan noodles',
  'Hainanese chicken rice',
  'Beef tacos',
  'Chicken enchiladas',
  'Arroz negro',
  'Frijoles negros',
  'Guacamole',
  'Chilaquiles rojos',
  'Pozole',
  'Ceviche',
  'Feijoada',
  'Coxinha',
  'Paella valenciana',
  'Tortilla española',
  'Gazpacho',
  'Patatas bravas',
  'Coq au vin',
  'Boeuf bourguignon',
  'Ratatouille',
  'Crème brûlée',
  'Quiche Lorraine',
  'Croque monsieur',
  'Bouillabaisse',
  'Wiener schnitzel',
  'Sauerbraten',
  'Kraut and pork',
  'Käsespätzle',
  'Currywurst',
  'Pork butt carnitas',
  'Kick-ass chili',
  'Badass brownies',
  'Sex on the beach',
  'Chocolate creampie',
  'Orgasmic chocolate cake',
  'Broccoli rape with sausage',
  'Prick the potatoes and bake',
  'Jerk chicken',
  'Shepherd’s pie',
  'Toad in the hole',
  'Bubble and squeak',
  'Spotted dick',
  'Cock-a-leekie soup',
  'Cockles and laverbread',
  'Faggots in onion gravy',
  'Bangers and mash',
  'Beef Wellington',
  'Sussex pond pudding',
  'Eton mess',
  'Scotch eggs',
  'Cullen skink',
  'Full English breakfast',
  'Fish and chips',
  'Pissaladière',
  'Pulla with cardamom',
  'Karelian pasties',
  'Shakshuka',
  'Falafel',
  'Hummus',
  'Moussaka',
  'Lamb testicles',
  'Jollof rice',
  'Bobotie',
  'Injera with doro wat',
  'Ciorbă de perișoare',
  'Sarmale cu mămăligă',
  'Mici cu muștar',
  'Pulpe de pui la cuptor',
  'Pulpă de porc',
  'Mușchi de vită',
  'Papanași',
  'Cozonac moldovenesc',
  'Cârnați de Pleșcoi',
  'Ficat de pui cu ceapă',
  'Plăcintă cu brânză',
  'Gogoși',
  'Tochitură moldovenească',
  'Salată de vinete',
  'Zacuscă',
  'Lángos',
  'Goulash',
  'Pierogi ruskie',
  'Borscht',
  'Shiitake stir-fry',
  'Cassoulet',
  'Assessment-day lunch box',
  'Pavlova',
  'Banoffee pie',
];

describe('common dish names across cuisines are not blocked', () => {
  it('has ~100 names', () => {
    expect(DISH_NAMES.length).toBeGreaterThanOrEqual(100);
  });

  it.each(DISH_NAMES)('%s', (name) => {
    expect(containsBlockedTerm(name)).toBe(false);
  });

  it('also passes them inside a longer description', () => {
    for (const name of DISH_NAMES) {
      expect(containsBlockedTerm(`A family favourite: ${name}. Serves 4. Prep 15 min.`)).toBe(
        false,
      );
    }
  });
});

describe('firstBlockedField', () => {
  it('reports the name before the description, and null when clean', () => {
    expect(firstBlockedField({ name: 'Shit soup', description: 'fuck' })).toBe('name');
    expect(firstBlockedField({ name: 'Soup', description: 'Hot as fuck' })).toBe('description');
    expect(firstBlockedField({ name: 'Soup', description: 'Hearty' })).toBeNull();
    expect(firstBlockedField({ name: 'Soup', description: null })).toBeNull();
    expect(firstBlockedField({ name: 'Soup' })).toBeNull();
    expect(firstBlockedField({})).toBeNull();
  });
});

describe('BLOCKED_TERMS', () => {
  it('is a focused list, not a dump', () => {
    expect(BLOCKED_TERMS.length).toBeGreaterThan(100);
    expect(BLOCKED_TERMS.length).toBeLessThanOrEqual(400);
  });

  it('has no duplicates once normalised, and no blank entries', () => {
    const normal = BLOCKED_TERMS.map((t) => normalizeForFilter(t));
    expect(normal.every((t) => t !== '')).toBe(true);
    expect(new Set(normal).size).toBe(normal.length);
  });

  it('is written in plain lowercase letters (and spaces)', () => {
    for (const term of BLOCKED_TERMS) {
      expect(term).toMatch(/^[a-z]+( [a-z]+)*$/);
    }
  });

  it('every term is caught by the filter itself', () => {
    for (const term of BLOCKED_TERMS) {
      expect(containsBlockedTerm(term), term).toBe(true);
      expect(containsBlockedTerm(`Nana's ${term} special`), term).toBe(true);
    }
  });

  it('keeps the ambiguous food and name words off the list', () => {
    const off = [
      'dick',
      'cock',
      'fanny',
      'willy',
      'bush',
      'butt',
      'prick',
      'tit',
      'rape',
      'faggots',
      'ass',
      'badass',
      'kickass',
      'piss',
      'sex',
      'sexy',
      'creampie',
      'bukkake',
      'cum',
      'negro',
      'kraut',
      'jap',
      'coon',
      'pulpa',
      'pulpe',
      'mici',
      'ficat',
    ];
    for (const word of off) {
      expect(BLOCKED_TERMS, word).not.toContain(word);
    }
  });
});
