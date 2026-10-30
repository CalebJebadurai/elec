import { describe, it, expect } from 'vitest';
import { GLOSSARY, findGlossaryEntry } from '../glossary';

describe('glossary', () => {
  it('has unique, URL-safe ids', () => {
    const ids = GLOSSARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+$/));
  });

  it('covers the terms the persona review asked for', () => {
    ['enop', 'swing', 'anti-incumbency'].forEach((id) =>
      expect(findGlossaryEntry(id)).toBeDefined()
    );
  });
});
