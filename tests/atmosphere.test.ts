import { describe, expect, test } from 'vitest';
import { atmosphereAt, dragForceN } from '../src/index.js';

describe('two-layer ISA atmosphere', () => {
  test.each([
    [0, 288.15, 101325, 1.225000, 340.294],
    [11000, 216.65, 22632.04, 0.363918, 295.069],
    [20000, 216.65, 5474.88, 0.088035, 295.069],
  ])('matches reference values at %s m', (altitude, temperature, pressure, density, sound) => {
    const result = atmosphereAt(altitude);
    expect(result.temperatureK).toBeCloseTo(temperature, 2);
    expect(result.pressurePa / pressure).toBeCloseTo(1, 5);
    expect(result.densityKgM3).toBeCloseTo(density, 5);
    expect(result.speedOfSoundMS).toBeCloseTo(sound, 2);
  });
  test('density decreases monotonically through both layers', () => {
    let previous = atmosphereAt(0).densityKgM3;
    for (let altitude = 100; altitude <= 100000; altitude += 100) {
      const current = atmosphereAt(altitude).densityKgM3;
      expect(current).toBeLessThan(previous);
      expect(current).toBeGreaterThan(0);
      previous = current;
    }
  });
  test('temperature, density and sound are continuous at the tropopause', () => {
    const below = atmosphereAt(11000 - 1e-5);
    const above = atmosphereAt(11000 + 1e-5);
    expect(below.temperatureK).toBeCloseTo(above.temperatureK, 6);
    expect(below.densityKgM3).toBeCloseTo(above.densityKgM3, 8);
    expect(below.speedOfSoundMS).toBeCloseTo(above.speedOfSoundMS, 6);
  });
  test('marks extrapolation and remains finite far outside ordinary flights', () => {
    expect(atmosphereAt(20000).extrapolated).toBe(false);
    expect(atmosphereAt(20001).extrapolated).toBe(true);
    expect(atmosphereAt(-1)).toEqual(atmosphereAt(0));
    expect(atmosphereAt(1e300).densityKgM3).toBe(0);
    expect(() => atmosphereAt(NaN)).toThrow(/finite/);
    expect(() => atmosphereAt(Infinity)).toThrow(/finite/);
  });
});

test('drag has correct dimensions, quadratic speed dependence, and direction', () => {
  expect(dragForceN(10, 1.2, 0.5, 0.01)).toBeCloseTo(0.3, 12);
  expect(dragForceN(20, 1.2, 0.5, 0.01)).toBeCloseTo(1.2, 12);
  expect(dragForceN(-10, 1.2, 0.5, 0.01)).toBeCloseTo(-0.3, 12);
  expect(dragForceN(100, 1.2, 0, 0.01)).toBe(0);
});
