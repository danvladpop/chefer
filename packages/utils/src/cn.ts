import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The mobile revamp's type ramp (apps/mobile/tailwind.config.js fontSize):
// tailwind-merge doesn't know these names, so it read `text-display` as a
// COLOUR and dropped it next to `text-label`, leaving every new header at the
// default size. Registering them as font sizes keeps both.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'title1',
            'title2',
            'title3',
            'headline',
            'body',
            'callout',
            'subhead',
            'caption',
          ],
        },
      ],
    },
  },
});

/**
 * Merges class names using clsx and tailwind-merge.
 * Handles conditional classes and deduplicates Tailwind CSS classes.
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-blue-500', 'hover:bg-blue-600')
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
