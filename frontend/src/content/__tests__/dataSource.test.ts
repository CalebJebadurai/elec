import { describe, it, expect } from 'vitest';
import { formatSnapshot, viewCitation, TCPD_CITATION } from '../dataSource';

describe('dataSource', () => {
  it('formats the snapshot date', () => {
    expect(formatSnapshot('2026-04-20')).toMatch(/20 Apr 2026/);
    expect(formatSnapshot('not-a-date')).toBe('not-a-date');
  });

  it('builds a view citation with TCPD credit and access date', () => {
    const c = viewCitation(
      'Tamil Nadu overview',
      'https://x.test/a',
      new Date('2026-10-30T10:00:00Z')
    );
    expect(c).toContain('Tamil Nadu overview');
    expect(c).toContain('accessed 2026-10-30');
    expect(c).toContain(TCPD_CITATION);
  });
});
