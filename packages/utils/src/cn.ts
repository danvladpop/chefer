import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
