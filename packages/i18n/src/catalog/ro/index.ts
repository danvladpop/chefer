import type { Catalog } from '../../types';
import { auth } from './auth';
import { coaching } from './coaching';
import { common } from './common';
import { consent } from './consent';
import { cook } from './cook';
import { email } from './email';
import { friends } from './friends';
import { gym } from './gym';
import { household } from './household';
import { legal } from './legal';
import { nav } from './nav';
import { plan } from './plan';
import { recipes } from './recipes';
import { settings } from './settings';
import { today } from './today';
import { tracker } from './tracker';
import { trainer } from './trainer';

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
  tracker,
  plan,
  household,
  today,
  coaching,
  trainer,
};
