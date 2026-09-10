import { describe, expect, test } from 'vitest';
import { classifyImpulse, IMPULSE_CLASSES, motorDesignation } from '../src/index.js';

describe('impulse class source of truth', () => {
  test('includes exactly A–O with the specified tiers and certifications', () => {
    expect(IMPULSE_CLASSES.map(b => b.letter).join('')).toBe('ABCDEFGHIJKLMNO');
    expect(IMPULSE_CLASSES.map(b => b.tier)).toEqual([
      ...Array<string>(4).fill('model'), ...Array<string>(3).fill('mid-power'), ...Array<string>(8).fill('high power'),
    ]);
    expect(IMPULSE_CLASSES.map(b => b.certification)).toEqual(['none', 'none', 'none', 'none', 'none', 'none', 'none', 'L1', 'L1', 'L2', 'L2', 'L2', 'L3', 'L3', 'L3']);
  });
  test.each(IMPULSE_CLASSES)('$letter upper boundary belongs to the lower class', band => {
    expect(classifyImpulse(band.maxNs)?.letter).toBe(band.letter);
    expect(classifyImpulse((band.minNs + band.maxNs) / 2)?.letter).toBe(band.letter);
    const next = IMPULSE_CLASSES[IMPULSE_CLASSES.indexOf(band) + 1];
    expect(classifyImpulse(band.maxNs + 1e-7)?.letter ?? null).toBe(next?.letter ?? null);
  });
  test.each([0, 1.25, 1.259, -1, 40960.1, NaN, Infinity])('does not clamp unsupported impulse %s', impulse => {
    expect(classifyImpulse(impulse)).toBeNull();
  });
  test('supports the A lower endpoint and designation metadata', () => {
    expect(classifyImpulse(1.26)?.letter).toBe('A');
    expect(motorDesignation(240, 128, 'W')).toBe('H128W');
    expect(motorDesignation(8.8, 4.74)).toBe('C5');
    expect(motorDesignation(8.8, NaN)).toBeNull();
    expect(motorDesignation(50000, 5)).toBeNull();
  });
});
