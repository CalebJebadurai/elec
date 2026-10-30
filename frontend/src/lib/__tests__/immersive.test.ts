import { describe, it, expect, afterEach } from 'vitest';
import { isImmersive, setImmersive } from '../immersive';

describe('immersive mode', () => {
  afterEach(() => setImmersive(false));

  it('toggles the root class used to hide the app chrome', () => {
    setImmersive(true);
    expect(isImmersive()).toBe(true);
    expect(document.documentElement.classList.contains('immersive')).toBe(true);
    setImmersive(false);
    expect(document.documentElement.classList.contains('immersive')).toBe(false);
  });

  it('leaves on Escape when the browser is not in full screen', () => {
    setImmersive(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(isImmersive()).toBe(false);
  });
});
