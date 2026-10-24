import { auth } from './auth';
import { common } from './common';
import { consent } from './consent';
import { cook } from './cook';
import { email } from './email';
import { friends } from './friends';
import { gym } from './gym';
import { legal } from './legal';
import { nav } from './nav';
import { recipes } from './recipes';
import { settings } from './settings';

/**
 * The source catalog. One file per namespace; add a namespace here, in
 * ../ro/index.ts and in ../review-status.ts.
 */
export const en = {
  common,
  settings,
  email,
  auth,
  legal,
  consent,
  recipes,
  cook,
  gym,
  friends,
  nav,
} as const;
