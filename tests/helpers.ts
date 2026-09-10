import { readFileSync } from 'node:fs';
import { generateThrustCurve, parseEng } from '../src/index.js';
import type { CurveShape, FlightConfiguration, Result, SimulationResult } from '../src/index.js';
import { expect } from 'vitest';

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}
export const c6Text = readFileSync(new URL('./fixtures/estes-c6.eng', import.meta.url), 'utf8');
export const c6 = unwrap(parseEng(c6Text, 'estes-c6.eng'))[0]!;
export const referenceAirframe = { dryMassKg: 0.0709, bodyDiameterM: 0.042, dragCoefficient: 0.45, railLengthM: 1.8 };
export const c6Configuration: FlightConfiguration = { curve: c6.curve, motor: c6, airframe: referenceAirframe };

export function syntheticFlight(impulseNs = 8.8, averageThrustN = 6, shape: CurveShape = 'neutral'): FlightConfiguration {
  return { ...c6Configuration, curve: unwrap(generateThrustCurve({ totalImpulseNs: impulseNs, averageThrustN, shape })) };
}

export function expectFiniteResult(result: SimulationResult): void {
  expect(result.status).not.toBe('invalid-input');
  expect(result.samples.length).toBeGreaterThan(0);
  expect(result.metrics).not.toBeNull();
  // One assertion per collection avoids millions of test framework calls.
  expect(result.samples.every(sample => Object.values(sample).every(Number.isFinite))).toBe(true);
  expect(Object.values(result.metrics!).every(value => value === null || Number.isFinite(value))).toBe(true);
  expect(Object.values(result.events).every(event => event === null || Object.values(event).every(Number.isFinite))).toBe(true);
  expect(result.samples.every((sample, i, all) => i === 0 || sample.timeS > all[i - 1]!.timeS)).toBe(true);
  expect(result.samples.every(sample => sample.altitudeM >= 0 && sample.velocityMS >= 0 && sample.massKg > 0)).toBe(true);
}
