import type { SupportedLocale } from '@chefer/types';
import type { Catalog } from '../types';
import { en } from './en';
import { ro } from './ro';

export const catalogs: Readonly<Record<SupportedLocale, Catalog>> = { en, ro };
