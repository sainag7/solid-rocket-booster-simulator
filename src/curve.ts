import { G0 } from './constants.js';
import type { CurveShape, Diagnostic, MotorMass, Result, ThrustCurve, ThrustPoint } from './types.js';

export function validateMotorMass(motor: MotorMass): Diagnostic[] {
  const errors: Diagnostic[] = [];
  if (!Number.isFinite(motor.totalMassKg) || motor.totalMassKg <= 0) {
    errors.push({ code: 'motor-mass', message: 'Total motor mass must be finite and greater than zero.' });
  }
  if (!Number.isFinite(motor.propellantMassKg) || motor.propellantMassKg < 0 || motor.propellantMassKg >= motor.totalMassKg) {
    errors.push({ code: 'propellant-mass', message: 'Propellant mass must be finite, nonnegative, and less than total motor mass.' });
  }
  return errors;
}

export function createThrustCurve(points: readonly ThrustPoint[], source: ThrustCurve['source'] = 'custom'): Result<ThrustCurve> {
  const fail = (message: string): Result<ThrustCurve> => ({ ok: false, errors: [{ code: 'thrust-curve', message }] });
  if (points.length < 2) return fail('A thrust curve needs at least two points.');
  let previousTime = -1;
  let totalImpulseNs = 0;
  let peakThrustN = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    if (!Number.isFinite(point.timeS) || point.timeS < 0 || point.timeS <= previousTime) {
      return fail(`Curve point ${i + 1}: times must be finite, nonnegative, and strictly increasing.`);
    }
    if (!Number.isFinite(point.thrustN) || point.thrustN < 0) {
      return fail(`Curve point ${i + 1}: thrust must be finite and nonnegative.`);
    }
    if (i > 0) {
      const previous = points[i - 1]!;
      totalImpulseNs += (0.5 * previous.thrustN + 0.5 * point.thrustN) * (point.timeS - previous.timeS);
    }
    peakThrustN = Math.max(peakThrustN, point.thrustN);
    previousTime = point.timeS;
  }
  if (points[0]!.timeS !== 0) return fail('A thrust curve must start at time zero.');
  if (points.at(-1)!.thrustN !== 0) return fail('A thrust curve must end at zero thrust.');
  const burnTimeS = points.at(-1)!.timeS;
  const averageThrustN = totalImpulseNs / burnTimeS;
  if (!Number.isFinite(totalImpulseNs) || totalImpulseNs <= 0 || !Number.isFinite(averageThrustN) || averageThrustN <= 0) {
    return fail('Integrated impulse and average thrust must be positive and finite.');
  }
  return { ok: true, value: {
    source, points: points.map(point => ({ ...point })), totalImpulseNs, averageThrustN, peakThrustN, burnTimeS,
  } };
}

export interface CurveRequest {
  readonly totalImpulseNs: number;
  readonly averageThrustN: number;
  readonly shape: CurveShape;
}

/** Dimensionless presentation presets, unrelated to internal motor ballistics. */
export function generateThrustCurve(request: CurveRequest): Result<ThrustCurve> {
  const { totalImpulseNs, averageThrustN, shape } = request;
  if (!Number.isFinite(totalImpulseNs) || totalImpulseNs <= 0 || !Number.isFinite(averageThrustN) || averageThrustN <= 0) {
    return { ok: false, errors: [{ code: 'curve-parameters', message: 'Total impulse and average thrust must be finite and greater than zero.' }] };
  }
  if (!['neutral', 'progressive', 'regressive'].includes(shape)) {
    return { ok: false, errors: [{ code: 'curve-shape', message: 'Choose neutral, progressive, or regressive.' }] };
  }
  const burnTimeS = totalImpulseNs / averageThrustN;
  if (!Number.isFinite(burnTimeS) || burnTimeS <= 0) {
    return { ok: false, errors: [{ code: 'burn-time', message: 'Derived burn time is outside the finite numeric range.' }] };
  }
  const points: ThrustPoint[] = Array.from({ length: 1001 }, (_, i) => {
    const x = i / 1000;
    const body = shape === 'neutral' ? 1 : shape === 'progressive' ? 0.45 + 1.4 * x : 1.7 - 1.15 * x;
    const ignitionRamp = Math.min(1, x / 0.015);
    const ignitionTransient = 0.65 * Math.max(0, 1 - Math.abs(x - 0.025) / 0.015);
    const tail = Math.min(1, (1 - x) / 0.08);
    return { timeS: x * burnTimeS, thrustN: (body * ignitionRamp + ignitionTransient) * tail };
  });
  const unscaled = createThrustCurve(points, 'synthesized');
  if (!unscaled.ok) return unscaled;
  const scale = totalImpulseNs / unscaled.value.totalImpulseNs;
  return createThrustCurve(points.map(p => ({ ...p, thrustN: p.thrustN * scale })), 'synthesized');
}

export interface CurveState { readonly thrustN: number; readonly impulseNs: number }

/** Build once per flight. Integrals within segments use the trapezoid exactly. */
export function createCurveEvaluator(curve: ThrustCurve): (timeS: number) => CurveState {
  const points = curve.points;
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(cumulative[i - 1]! + (a.thrustN * 0.5 + b.thrustN * 0.5) * (b.timeS - a.timeS));
  }
  return (timeS: number): CurveState => {
    if (!Number.isFinite(timeS)) throw new RangeError('Curve evaluation time must be finite.');
    if (timeS < 0) return { thrustN: 0, impulseNs: 0 };
    if (timeS >= curve.burnTimeS) return { thrustN: 0, impulseNs: cumulative.at(-1)! };
    let low = 0;
    let high = points.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >>> 1;
      if (points[mid]!.timeS <= timeS) low = mid;
      else high = mid;
    }
    const a = points[low]!;
    const b = points[high]!;
    const elapsed = timeS - a.timeS;
    const fraction = elapsed / (b.timeS - a.timeS);
    const thrustN = a.thrustN * (1 - fraction) + b.thrustN * fraction;
    return { thrustN, impulseNs: cumulative[low]! + (a.thrustN * 0.5 + thrustN * 0.5) * elapsed };
  };
}

export function motorPerformance(curve: ThrustCurve, motor: MotorMass): Result<{
  burnTimeS: number; peakThrustN: number; specificImpulseS: number | null; propellantMassFraction: number;
}> {
  const errors = validateMotorMass(motor);
  if (errors.length) return { ok: false, errors };
  const specificImpulseS = motor.propellantMassKg === 0 ? null : curve.totalImpulseNs / motor.propellantMassKg / G0;
  if (specificImpulseS !== null && !Number.isFinite(specificImpulseS)) {
    return { ok: false, errors: [{ code: 'specific-impulse', message: 'Specific impulse is outside the finite numeric range.' }] };
  }
  return { ok: true, value: {
    burnTimeS: curve.burnTimeS, peakThrustN: curve.peakThrustN, specificImpulseS,
    propellantMassFraction: motor.propellantMassKg / motor.totalMassKg,
  } };
}
