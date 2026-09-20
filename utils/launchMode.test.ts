import { describe, it, expect } from 'vitest';
import { parseRenderMode } from './launchMode';

describe('parseRenderMode', () => {
  it('selects the settings panel for ?mode=settings', () => {
    expect(parseRenderMode('?mode=settings')).toBe('settings');
  });

  it('still finds the mode among other params', () => {
    expect(parseRenderMode('?foo=1&mode=settings&bar=2')).toBe('settings');
  });

  it.each([
    ['empty', ''],
    ['no mode param', '?foo=1'],
    ['an unknown mode', '?mode=whatever'],
    ['an empty mode', '?mode='],
    ['the keyboard mode spelled out', '?mode=keyboard'],
  ])('falls back to the keyboard for %s', (_label, search) => {
    expect(parseRenderMode(search)).toBe('keyboard');
  });
});
