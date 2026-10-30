import { describe, it, expect } from 'vitest';
import { isLowData, setLowData, networkPrefersLowData } from '../lowData';

describe('lowData', () => {
  it('toggles, persists and marks the document', () => {
    setLowData(true);
    expect(isLowData()).toBe(true);
    expect(localStorage.getItem('low_data')).toBe('1');
    expect(document.documentElement.classList.contains('low-data')).toBe(true);
    setLowData(false);
    expect(isLowData()).toBe(false);
    expect(document.documentElement.classList.contains('low-data')).toBe(false);
  });

  it('is false when the browser exposes no connection info', () => {
    expect(networkPrefersLowData()).toBe(false);
  });
});
