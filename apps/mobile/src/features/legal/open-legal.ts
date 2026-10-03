import { router } from 'expo-router';
import { legalHref, type LegalDoc } from './legal-docs';

/** Opens a legal document in the app (UX-ACC-19). Not for use from inside a Modal sheet. */
export function openLegal(doc: LegalDoc, anchor?: string): void {
  router.push(legalHref(doc, anchor));
}
