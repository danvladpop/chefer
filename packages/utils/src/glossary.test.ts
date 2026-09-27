import { describe, expect, it } from 'vitest';
import { GLOSSARY, glossaryDefinition } from './glossary';

describe('glossaryDefinition', () => {
  it('returns the definition for a known term', () => {
    expect(glossaryDefinition('rir')).toEqual(GLOSSARY['rir']);
  });

  it('returns null for an unknown id', () => {
    expect(glossaryDefinition('not-a-term')).toBeNull();
  });

  it('every entry has non-empty term and definition text', () => {
    for (const entry of Object.values(GLOSSARY)) {
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(0);
    }
  });
});
