import { describe, expect, it } from 'vitest';
import {
  buildTranscriptText,
  captionCarriesRecipe,
  findNotFoundFields,
  pickSubtitleTrack,
  speechToText,
  subtitlesToText,
  unverifiedQuantityIndexes,
} from './text.js';
import type { VideoInfo } from './ytdlp.js';

function info(overrides: Partial<VideoInfo> = {}): VideoInfo {
  return {
    title: 'Pasta',
    description: '',
    creator: null,
    webpageUrl: 'https://www.youtube.com/watch?v=abcdef123',
    durationSecs: 60,
    thumbnailUrl: null,
    language: 'en',
    isLive: false,
    subtitleLangs: [],
    autoCaptionLangs: [],
    ...overrides,
  };
}

describe('captionCarriesRecipe', () => {
  it('accepts a caption with an ingredient list AND a method', () => {
    expect(
      captionCarriesRecipe(`Creamy tomato pasta
- 200 g pasta
- 1 can tomatoes
- 2 cloves garlic
Boil the pasta. Fry the garlic, add the tomatoes and simmer 10 min.`),
    ).toBe(true);
  });

  it('rejects an ingredient list with no method (the common reel caption)', () => {
    expect(
      captionCarriesRecipe(`Chicken tenders
• 1.5 lbs chicken
• 1/4 cup honey
• 2 garlic cloves`),
    ).toBe(false);
  });

  it('rejects hashtags and short captions', () => {
    expect(captionCarriesRecipe('#pasta #dinner #easyrecipes')).toBe(false);
  });
});

describe('pickSubtitleTrack', () => {
  it('prefers uploaded subtitles in the video language', () => {
    expect(pickSubtitleTrack(info({ language: 'fr', subtitleLangs: ['en', 'fr-FR'] }))).toEqual({
      lang: 'fr-FR',
      auto: false,
    });
  });

  it('falls back to English uploaded subtitles, then any', () => {
    expect(pickSubtitleTrack(info({ language: 'de', subtitleLangs: ['es', 'en-US'] }))).toEqual({
      lang: 'en-US',
      auto: false,
    });
    expect(pickSubtitleTrack(info({ language: null, subtitleLangs: ['es'] }))?.lang).toBe('es');
  });

  it('takes the ORIGINAL auto-caption track, never a machine translation', () => {
    expect(
      pickSubtitleTrack(info({ language: 'ro', autoCaptionLangs: ['af', 'de', 'ro-orig', 'ro'] })),
    ).toEqual({ lang: 'ro-orig', auto: true });
    expect(pickSubtitleTrack(info({ language: 'ro', autoCaptionLangs: ['af', 'de'] }))).toBeNull();
  });

  it('returns null when there is nothing', () => {
    expect(pickSubtitleTrack(info())).toBeNull();
  });
});

describe('subtitlesToText', () => {
  it('flattens YouTube rolling auto-captions without repeating lines', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000 align:start position:0%
so<00:00:00.500><c> today</c><00:00:01.000><c> we</c>

00:00:02.000 --> 00:00:02.010 align:start position:0%
so today we

00:00:02.010 --> 00:00:04.000 align:start position:0%
so today we
make<00:00:02.500><c> pasta</c> [Music]

00:00:04.000 --> 00:00:06.000
make pasta
add 200 grams &amp; salt`;
    expect(subtitlesToText(vtt)).toBe('so today we make pasta add 200 grams & salt');
  });

  it('reads SRT too', () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000
Chop two onions.

2
00:00:02,000 --> 00:00:03,000
Fry them in butter.`;
    expect(subtitlesToText(srt)).toBe('Chop two onions. Fry them in butter.');
  });

  it('skips NOTE and STYLE blocks', () => {
    expect(
      subtitlesToText(
        'WEBVTT\n\nNOTE made by hand\nstill a note\n\n00:01.000 --> 00:02.000\nHello',
      ),
    ).toBe('Hello');
  });
});

describe('speechToText', () => {
  it('drops segments Whisper marks as non-speech', () => {
    expect(
      speechToText({
        text: 'ignored',
        language: 'en',
        segments: [
          { text: 'Add two eggs.', noSpeechProb: 0.05 },
          { text: 'Thank you.', noSpeechProb: 0.9 },
          { text: 'Whisk well.', noSpeechProb: 0.1 },
        ],
      }),
    ).toBe('Add two eggs. Whisk well.');
  });

  it('treats a music-only "thanks for watching" as no speech', () => {
    expect(
      speechToText({
        text: '',
        language: 'en',
        segments: [{ text: 'Thanks for watching!', noSpeechProb: 0.3 }],
      }),
    ).toBe('');
  });
});

describe('buildTranscriptText', () => {
  it('labels each part so the extractor knows what it is reading', () => {
    const text = buildTranscriptText({
      title: 'Garlic noodles',
      caption: 'Recipe below',
      transcript: 'boil the noodles',
      source: 'speech',
    });
    expect(text).toContain('VIDEO TITLE: Garlic noodles');
    expect(text).toContain("CREATOR'S CAPTION:\nRecipe below");
    expect(text).toMatch(/SPEECH TRANSCRIPT \(automatic.*\):\nboil the noodles/);
  });

  it('omits what is empty', () => {
    const text = buildTranscriptText({
      title: '',
      caption: 'x',
      transcript: null,
      source: 'caption',
    });
    expect(text).not.toContain('VIDEO TITLE');
    expect(text).not.toContain('TRANSCRIPT');
  });
});

const COMPLETE = {
  name: 'Pasta',
  ingredients: [{ name: 'pasta', quantity: 200, unit: 'g' }],
  instructions: ['Boil it.'],
  prepTimeMins: 5,
  cookTimeMins: 10,
};

describe('findNotFoundFields', () => {
  it('is empty when the words stated everything', () => {
    expect(findNotFoundFields(COMPLETE, 'Serves 2. Boil 200 g pasta for 10 minutes.')).toEqual([]);
  });

  it('flags what the words did not cover, whatever the model filled in', () => {
    expect(
      findNotFoundFields(
        { ...COMPLETE, name: '', ingredients: [], instructions: [] },
        'some pasta, boiled',
      ),
    ).toEqual(['name', 'ingredients', 'instructions', 'servings', 'time']);
  });

  it('flags time when the model says 0 minutes even if the text mentions time', () => {
    expect(
      findNotFoundFields({ ...COMPLETE, prepTimeMins: 0, cookTimeMins: 0 }, 'Serves 4. 20 minutes'),
    ).toEqual(['time']);
  });
});

describe('unverifiedQuantityIndexes', () => {
  const ingredients = [
    { name: 'spaghetti', quantity: 400, unit: 'g' },
    { name: 'olive oil', quantity: 3, unit: 'tbsp' },
    { name: 'butter', quantity: 0.5, unit: 'cup' },
    { name: 'salt', quantity: 1, unit: 'pinch' },
    { name: 'tomatoes', quantity: 2, unit: 'piece' },
  ];

  it('flags amounts that appear nowhere in the words', () => {
    // "a glug of olive oil" → 3 tbsp was the model's guess; "2" only appears
    // inside "250", which must not count.
    const text =
      'four hundred grams of spaghetti, a glug of olive oil, half a cup of butter, salt, 250 ml water';
    expect(unverifiedQuantityIndexes(ingredients, text)).toEqual([1, 4]);
  });

  it('accepts digits, fractions and number words', () => {
    const text = '400g spaghetti, three tbsp oil, 1/2 cup butter, two tomatoes';
    expect(unverifiedQuantityIndexes(ingredients, text)).toEqual([]);
  });

  it('does not flag metric amounts converted from imperial', () => {
    const text = '1 lb chicken';
    expect(
      unverifiedQuantityIndexes([{ name: 'chicken', quantity: 454, unit: 'g' }], text),
    ).toEqual([]);
  });

  it('matches whole words only', () => {
    expect(
      unverifiedQuantityIndexes([{ name: 'egg', quantity: 1.5, unit: 'piece' }], 'someone said'),
    ).toEqual([0]);
  });
});
