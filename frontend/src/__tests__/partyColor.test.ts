import { describe, it, expect, afterEach } from 'vitest';
import { partyColor, setColourBlindSafe, OKABE_ITO, CB_PARTY_COLORS } from '../constants';

const SAFE = new Set<string>([...Object.values(OKABE_ITO), '#999999', '#bbbbbb']);

describe('colour-blind-safe palette', () => {
  afterEach(() => setColourBlindSafe(false));

  it('uses only Okabe-Ito colours when switched on', () => {
    setColourBlindSafe(true);
    ['BJP', 'INC', 'DMK', 'ADK', 'SOME_NEW_PARTY', null].forEach((p) =>
      expect(SAFE.has(partyColor(p))).toBe(true)
    );
  });

  it('gives main state rivals different colours', () => {
    const rivals = [
      ['BJP', 'INC'],
      ['DMK', 'ADMK'],
      ['AITC', 'BJP'],
      ['SP', 'BSP'],
      ['TDP', 'YSRCP'],
      ['RJD', 'JD(U)'],
      ['BJD', 'BJP'],
      ['AAP', 'INC'],
    ];
    rivals.forEach(([a, b]) => expect(CB_PARTY_COLORS[a]).not.toBe(CB_PARTY_COLORS[b]));
  });

  it('keeps the default palette when off', () => {
    expect(partyColor('BJP')).toBe('#ff9933');
  });
});
