import { describe, expect, test } from 'vitest';
import { createCurveEvaluator, createThrustCurve, generateThrustCurve, IMPULSE_CLASSES, motorPerformance } from '../src/index.js';
import type { CurveShape } from '../src/index.js';
import { c6, unwrap } from './helpers.js';

const shapes: CurveShape[] = ['neutral', 'progressive', 'regressive'];

describe('synthesized curves', () => {
  test.each(IMPULSE_CLASSES.flatMap(band => shapes.map(shape => ({ band, shape }))))('$band.letter $shape normalizes at both band endpoints', ({ band, shape }) => {
    for (const impulse of [band.minNs, band.maxNs]) {
      const curve = unwrap(generateThrustCurve({ totalImpulseNs: impulse, averageThrustN: impulse / 1.7, shape }));
      const evaluate = createCurveEvaluator(curve);
      let independentIntegral = 0;
      const dt = curve.burnTimeS / 4000;
      // Composite midpoint integration exercises evaluation rather than trusting metadata.
      for (let i = 0; i < 4000; i++) independentIntegral += evaluate((i + 0.5) * dt).thrustN * dt;
      expect(Math.abs(independentIntegral / impulse - 1)).toBeLessThan(0.001);
      expect(curve.burnTimeS).toBeCloseTo(1.7, 12);
      expect(curve.points.every(point => Number.isFinite(point.thrustN) && point.thrustN >= 0)).toBe(true);
      expect(curve.points[0]!.thrustN).toBe(0);
      expect(curve.points.at(-1)!.thrustN).toBe(0);
    }
  });
  test.each(shapes)('doubling %s thrust preserves impulse and halves burn time', shape => {
    const slow = unwrap(generateThrustCurve({ totalImpulseNs: 240, averageThrustN: 128, shape }));
    const fast = unwrap(generateThrustCurve({ totalImpulseNs: 240, averageThrustN: 256, shape }));
    expect(fast.totalImpulseNs).toBeCloseTo(slow.totalImpulseNs, 10);
    expect(fast.burnTimeS).toBe(slow.burnTimeS / 2);
    expect(fast.peakThrustN).toBeCloseTo(slow.peakThrustN * 2, 10);
  });
  test('shape presets communicate the intended burn progression', () => {
    const at = (shape: CurveShape) => createCurveEvaluator(unwrap(generateThrustCurve({ totalImpulseNs: 10, averageThrustN: 10, shape })));
    expect(at('neutral')(0.25).thrustN).toBeCloseTo(at('neutral')(0.7).thrustN);
    expect(at('neutral')(0.025).thrustN).toBeGreaterThan(at('neutral')(0.25).thrustN);
    expect(at('progressive')(0.8).thrustN).toBeGreaterThan(at('progressive')(0.2).thrustN);
    expect(at('regressive')(0.2).thrustN).toBeGreaterThan(at('regressive')(0.8).thrustN);
    const progressive = unwrap(generateThrustCurve({ totalImpulseNs: 10, averageThrustN: 10, shape: 'progressive' }));
    expect(progressive.points.find(p => p.thrustN === progressive.peakThrustN)!.timeS).toBeGreaterThan(0.8);
  });
  test.each([0, -1, NaN, Infinity])('rejects invalid impulse/thrust %s', value => {
    expect(generateThrustCurve({ totalImpulseNs: value, averageThrustN: 5, shape: 'neutral' }).ok).toBe(false);
    expect(generateThrustCurve({ totalImpulseNs: 5, averageThrustN: value, shape: 'neutral' }).ok).toBe(false);
  });
  test('reports overflowing burn time and unknown shapes', () => {
    expect(generateThrustCurve({ totalImpulseNs: 1e300, averageThrustN: 1e-300, shape: 'neutral' }).ok).toBe(false);
    expect(generateThrustCurve({ totalImpulseNs: 10, averageThrustN: 5, shape: 'invalid' as CurveShape }).ok).toBe(false);
  });
});

describe('tabulated curve evaluation', () => {
  const curve = unwrap(createThrustCurve([{ timeS: 0, thrustN: 0 }, { timeS: 1, thrustN: 10 }, { timeS: 3, thrustN: 0 }]));
  const evaluate = createCurveEvaluator(curve);
  test('matches exact triangular area and partial integrals', () => {
    expect(curve.totalImpulseNs).toBe(15);
    expect(evaluate(0.5)).toEqual({ thrustN: 5, impulseNs: 1.25 });
    expect(evaluate(1)).toEqual({ thrustN: 10, impulseNs: 5 });
    expect(evaluate(2)).toEqual({ thrustN: 5, impulseNs: 12.5 });
    expect(evaluate(3)).toEqual({ thrustN: 0, impulseNs: 15 });
    expect(evaluate(20)).toEqual({ thrustN: 0, impulseNs: 15 });
    expect(evaluate(-1)).toEqual({ thrustN: 0, impulseNs: 0 });
    expect(() => evaluate(NaN)).toThrow(/finite/);
  });
  test('derived motor performance retains zero-propellant analytical fixtures', () => {
    const performance = unwrap(motorPerformance(c6.curve, c6));
    expect(performance.specificImpulseS).toBeCloseTo(83.250746, 5);
    expect(performance.propellantMassFraction).toBeCloseTo(0.0108 / 0.0231, 10);
    expect(unwrap(motorPerformance(curve, { totalMassKg: 1, propellantMassKg: 0 })).specificImpulseS).toBeNull();
    expect(motorPerformance(curve, { totalMassKg: 1, propellantMassKg: 1 }).ok).toBe(false);
  });
  test('rejects nonfinite, nonmonotonic, incomplete, and zero-area curves', () => {
    for (const points of [[], [{ timeS: 0, thrustN: 1 }], [{ timeS: 0, thrustN: 0 }, { timeS: 1, thrustN: 0 }],
      [{ timeS: 0, thrustN: 1 }, { timeS: NaN, thrustN: 0 }], [{ timeS: 0, thrustN: 1 }, { timeS: 0, thrustN: 0 }],
      [{ timeS: 0, thrustN: -1 }, { timeS: 1, thrustN: 0 }], [{ timeS: 0, thrustN: 1 }, { timeS: 1, thrustN: 1 }]]) {
      expect(createThrustCurve(points).ok).toBe(false);
    }
  });
});
