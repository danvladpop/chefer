import type { Catalog } from '../../types';
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

export const ro: Catalog = {
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
};
