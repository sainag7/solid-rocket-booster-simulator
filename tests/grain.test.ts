import { describe, expect, test } from 'vitest';
import { createCurveEvaluator, generateGrainThrustCurve, GRAIN_PROFILES, IMPULSE_CLASSES, simulateFlight } from '../src/index.js';
import type { GrainProfileId } from '../src/index.js';
import { c6Configuration, unwrap } from './helpers.js';

const cases = GRAIN_PROFILES.flatMap(profile => IMPULSE_CLASSES.flatMap(band =>
  [band.minNs, band.maxNs].map(impulse => ({ name: profile.name, profile: profile.id, band: band.letter, impulse }))));

describe('normalized grain profiles across A–O', () => {
  test.each(cases)('$name at class $band boundary $impulse N·s', ({ profile, impulse }) => {
    const curve = unwrap(generateGrainThrustCurve({ profile, totalImpulseNs: impulse, averageThrustN: impulse / 1.8 }));
    expect(curve.points).toHaveLength(1001);
    expect(Math.abs(curve.totalImpulseNs - impulse) / impulse).toBeLessThan(0.001);
    expect(curve.burnTimeS).toBeCloseTo(1.8, 12);
    expect(curve.averageThrustN).toBeCloseTo(impulse / 1.8, 8);
    expect(curve.points[0]).toEqual({ timeS: 0, thrustN: 0 });
    expect(curve.points.at(-1)!.thrustN).toBe(0);
    expect(curve.points.every((point, i) => Number.isFinite(point.timeS) && Number.isFinite(point.thrustN) && point.thrustN >= 0 && (i === 0 || point.timeS > curve.points[i - 1]!.timeS))).toBe(true);
    const evaluate = createCurveEvaluator(curve);
    const delivered = Array.from({ length: 201 }, (_, i) => evaluate(curve.burnTimeS * i / 200).impulseNs);
    expect(delivered.every((value, i) => Number.isFinite(value) && (i === 0 || value >= delivered[i - 1]!))).toBe(true);
    expect(delivered[0]).toBe(0);
    expect(delivered.at(-1)).toBeCloseTo(impulse, 8);

    // Similar flight dynamics at every class: mass and frontal area scale with impulse.
    const scale = impulse / 8.8;
    const motor = { totalMassKg: 0.0231 * scale, propellantMassKg: 0.0108 * scale };
    const result = simulateFlight({ curve, motor, airframe: {
      ...c6Configuration.airframe, dryMassKg: 0.0709 * scale, bodyDiameterM: 0.042 * Math.sqrt(scale),
    } });
    expect(result.events.burnout).not.toBeNull();
    expect(result.events.burnout!.massKg).toBeCloseTo((0.0709 + 0.0231 - 0.0108) * scale, 9);
  });
});

describe('profile behavior matches the qualitative reference', () => {
  const at = (profile: GrainProfileId, fraction: number) => {
    const curve = unwrap(generateGrainThrustCurve({ profile, totalImpulseNs: 10, averageThrustN: 10 }));
    return createCurveEvaluator(curve)(fraction).thrustN;
  };
  test('tubular rises; double anchor falls', () => {
    expect(at('tubular', 0.8)).toBeGreaterThan(at('tubular', 0.5));
    expect(at('tubular', 0.5)).toBeGreaterThan(at('tubular', 0.2));
    expect(at('double-anchor', 0.2)).toBeGreaterThan(at('double-anchor', 0.5));
    expect(at('double-anchor', 0.5)).toBeGreaterThan(at('double-anchor', 0.8));
  });
  test('rod and tube is level; star has a shallow middle dip', () => {
    expect(at('rod-and-tube', 0.2)).toBeCloseTo(at('rod-and-tube', 0.8), 12);
    const starMiddle = at('star', 0.5);
    expect(starMiddle).toBeLessThan(at('star', 0.12));
    expect(starMiddle).toBeLessThan(at('star', 0.8));
    expect(starMiddle / at('star', 0.8)).toBeGreaterThan(0.85);
  });
  test('multi-fin has a boost followed by a low plateau', () => {
    expect(at('multi-fin', 0.02)).toBeGreaterThan(at('multi-fin', 0.5) * 5);
    expect(at('multi-fin', 0.3)).toBeCloseTo(at('multi-fin', 0.85), 12);
  });
  test('dual composition has two pulses separated by low positive thrust', () => {
    expect(at('dual-composition', 0.025)).toBeGreaterThan(at('dual-composition', 0.4) * 5);
    expect(at('dual-composition', 0.78)).toBeGreaterThan(at('dual-composition', 0.4) * 3);
    expect(at('dual-composition', 0.4)).toBeGreaterThan(0);
    expect(at('dual-composition', 0.9)).toBeLessThan(at('dual-composition', 0.78));
  });
  test.each(GRAIN_PROFILES)('$name retains scaling invariants and is deterministic', ({ id: profile }) => {
    const request = { profile, totalImpulseNs: 8.8, averageThrustN: 6 };
    const first = unwrap(generateGrainThrustCurve(request));
    expect(generateGrainThrustCurve(request)).toEqual({ ok: true, value: first });
    const doubled = unwrap(generateGrainThrustCurve({ ...request, averageThrustN: 12 }));
    expect(doubled.totalImpulseNs).toBeCloseTo(first.totalImpulseNs, 12);
    expect(doubled.burnTimeS).toBe(first.burnTimeS / 2);
    expect(doubled.peakThrustN).toBeCloseTo(first.peakThrustN * 2, 10);
  });
  test('invalid profile and numeric inputs return readable diagnostics', () => {
    expect(generateGrainThrustCurve({ profile: 'unknown' as GrainProfileId, totalImpulseNs: 10, averageThrustN: 5 })).toMatchObject({ ok: false, errors: [{ code: 'grain-profile' }] });
    for (const value of [NaN, Infinity, -1, 0]) {
      expect(generateGrainThrustCurve({ profile: 'star', totalImpulseNs: value, averageThrustN: 5 }).ok).toBe(false);
      expect(generateGrainThrustCurve({ profile: 'star', totalImpulseNs: 10, averageThrustN: value }).ok).toBe(false);
    }
    expect(generateGrainThrustCurve({ profile: 'star', totalImpulseNs: 1e308, averageThrustN: 1e-308 })).toMatchObject({ ok: false, errors: [{ code: 'burn-time' }] });
  });
});
