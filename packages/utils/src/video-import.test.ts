import { describe, expect, it } from 'vitest';
import {
  finalizeVideoDraft,
  isSupportedVideoUrl,
  parseQuantityInput,
  parseVideoUrl,
  videoDraftProblems,
  videoDraftToForm,
  videoFormToDraft,
  type VideoDraftLike,
} from './video-import';

describe('parseVideoUrl', () => {
  it.each([
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/abcDEF12345', 'https://www.youtube.com/shorts/abcDEF12345'],
    ['http://instagram.com/reel/C1a2b3/?igsh=x', 'https://www.instagram.com/reel/C1a2b3/'],
    ['https://www.instagram.com/p/C1a2b3/', 'https://www.instagram.com/p/C1a2b3/'],
  ])('canonicalises %s', (input, expected) => {
    expect(parseVideoUrl(input)?.url).toBe(expected);
  });

  it('recognises TikTok video and short links', () => {
    expect(parseVideoUrl('https://www.tiktok.com/@chef/video/7312345678901234567')?.platform).toBe(
      'tiktok',
    );
    expect(parseVideoUrl('https://vm.tiktok.com/ZMabc123/')?.platform).toBe('tiktok');
    expect(parseVideoUrl('https://www.tiktok.com/t/ZT8abc/')?.platform).toBe('tiktok');
  });

  it.each([
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@somechannel',
    'https://www.tiktok.com/@chef',
    'https://www.instagram.com/somechef/',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
    'not a url',
  ])('rejects %s', (input) => {
    expect(isSupportedVideoUrl(input)).toBe(false);
  });
});

describe('parseQuantityInput', () => {
  it.each([
    ['2', 2],
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['½', 0.5],
    ['1½', 1.5],
    ['.25', 0.25],
  ])('%s → %d', (input, expected) => {
    expect(parseQuantityInput(input)).toBe(expected);
  });

  it.each(['', 'a pinch', '0', '-1', '1/0'])('rejects %j', (input) => {
    expect(parseQuantityInput(input)).toBeNull();
  });
});

function draft(overrides: Partial<VideoDraftLike> = {}): VideoDraftLike {
  return {
    name: 'Garlic noodles',
    ingredients: [{ name: 'noodles', quantity: 200, unit: 'g' }],
    instructions: ['Boil the noodles.'],
    nutritionInfo: { calories: 600, protein: 20, carbs: 90, fat: 18, fiber: 4 },
    servings: 2,
    prepTimeMins: 5,
    cookTimeMins: 10,
    ...overrides,
  };
}

describe('videoDraftProblems', () => {
  it('passes a complete draft', () => {
    expect(videoDraftProblems(draft())).toEqual([]);
  });

  it('lists every gap the video left', () => {
    expect(
      videoDraftProblems(draft({ name: ' ', ingredients: [], instructions: ['  '], servings: 0 })),
    ).toEqual([
      'Add a recipe name.',
      'Add at least one ingredient.',
      'Add at least one step.',
      'Servings must be between 1 and 20.',
    ]);
  });

  it('wants an amount on every named ingredient', () => {
    expect(
      videoDraftProblems(
        draft({
          ingredients: [
            { name: 'noodles', quantity: 200, unit: 'g' },
            { name: 'garlic', quantity: 0, unit: 'clove' },
          ],
        }),
      ),
    ).toEqual(['Give every ingredient an amount.']);
  });
});

describe('finalizeVideoDraft', () => {
  it('drops blank rows and trims', () => {
    const result = finalizeVideoDraft(
      draft(),
      draft({
        name: '  Noodles ',
        ingredients: [
          { name: ' noodles ', quantity: 200, unit: ' ' },
          { name: '', quantity: 1, unit: 'g' },
        ],
        instructions: ['Boil. ', ''],
      }),
    );
    expect(result.name).toBe('Noodles');
    expect(result.ingredients).toEqual([{ name: 'noodles', quantity: 200, unit: 'piece' }]);
    expect(result.instructions).toEqual(['Boil.']);
  });

  it('rescales per-serving nutrition when the serving count changes', () => {
    const result = finalizeVideoDraft(draft({ servings: 2 }), draft({ servings: 4 }));
    expect(result.nutritionInfo).toEqual({
      calories: 300,
      protein: 10,
      carbs: 45,
      fat: 9,
      fiber: 2,
    });
  });
});

describe('videoDraftToForm / videoFormToDraft', () => {
  it('gives empty lists one blank row and leaves unknown times blank', () => {
    const form = videoDraftToForm(
      draft({ ingredients: [], instructions: [], prepTimeMins: 0, cookTimeMins: 0 }),
    );
    expect(form.ingredients).toEqual([{ quantity: '', unit: '', name: '' }]);
    expect(form.instructions).toEqual(['']);
    expect(form.prepTimeMins).toBe('');
  });

  it('round-trips, parsing typed amounts and keeping untouched fields', () => {
    const original = draft();
    const form = videoDraftToForm(original);
    form.ingredients[0] = { quantity: '1 1/2', unit: 'cup', name: 'noodles' };
    form.servings = '3';
    form.cookTimeMins = '';
    const result = videoFormToDraft(original, form);
    expect(result.ingredients[0]).toEqual({ name: 'noodles', quantity: 1.5, unit: 'cup' });
    expect(result.servings).toBe(3);
    expect(result.cookTimeMins).toBe(0);
    expect(result.nutritionInfo).toEqual(original.nutritionInfo);
  });

  it('turns unreadable input into values the validator rejects', () => {
    const form = videoDraftToForm(draft());
    form.servings = '';
    form.ingredients[0] = { quantity: 'some', unit: 'g', name: 'noodles' };
    form.prepTimeMins = 'abc';
    expect(videoDraftProblems(videoFormToDraft(draft(), form))).toEqual([
      'Give every ingredient an amount.',
      'Servings must be between 1 and 20.',
      'Times cannot be negative.',
    ]);
  });
});
