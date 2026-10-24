import { common } from './common';
import { email } from './email';
import { settings } from './settings';

/**
 * The source catalog. One file per namespace; add a namespace here, in
 * ../ro/index.ts and in ../review-status.ts.
 */
export const en = {
  common,
  settings,
  email,
} as const;
