import { describe, it, expect } from 'vitest';
import { getTheme, setTheme } from '../theme';

describe('theme', () => {
  it('applies and persists each theme', () => {
    setTheme('light');
    expect(getTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');

    setTheme('contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('contrast');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    setTheme('dark');
  });
});
