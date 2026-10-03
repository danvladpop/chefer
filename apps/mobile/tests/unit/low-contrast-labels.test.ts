import { readFileSync } from 'fs';
import { join } from 'path';

// Readable text must not use `text-gray-400` (about 2.5:1 on white, below the
// 4.5:1 / 3:1 floors): use `text-muted-foreground`. Placeholder / disabled
// states (chef-review teaser, a locked Preferences row) are exempt.
const FILES = [
  'app/(food)/more.tsx',
  'app/cook/[id].tsx',
  'src/features/tracker/quick-add-sheet.tsx',
  'src/features/tracker/edit-entry-sheet.tsx',
  'src/features/tracker/scan-meal-card.tsx',
];

describe('low-contrast text (UX-X-09 follow-up)', () => {
  it.each(FILES)('%s has no text-gray-400 label', (file) => {
    const source = readFileSync(join(__dirname, '..', '..', file), 'utf8');
    expect(source).not.toMatch(/text-gray-400/);
  });
});
