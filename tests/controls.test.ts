import { describe, expect, test } from 'vitest';
import { classifyImpulse, IMPULSE_CLASSES, simulateFlight } from '../src/index.js';
import { boundsFor, changeNumber, createLabStore, fromSlider, impulseBounds, initialConfiguration, selectClass, toSlider } from '../web/configuration.js';
import type { NumericParameter } from '../web/configuration.js';
import { calculateFlight, configuredMotor, selectPlotSamples } from '../web/flight-view.js';
import type { FlightView } from '../web/flight-view.js';
import { motorPresets } from '../web/motor-presets.js';
import { c6, c6Configuration } from './helpers.js';

const initial = initialConfiguration(c6);
function expectUsable(view: FlightView) {
  expect(view.flight.status).not.toBe('invalid-input');
  expect(view.data.length).toBeGreaterThan(1);
  expect(view.data.length).toBeLessThan(2700);
  expect(view.data.every(point => Object.values(point).every(value => value === null || Number.isFinite(value)))).toBe(true);
  expect(view.data.every((point, index) => index === 0 || point.timeS > view.data[index - 1]!.timeS)).toBe(true);
  for (const axis of Object.values(view.axes)) {
    expect(axis.domain.every(Number.isFinite)).toBe(true);
    expect(axis.domain[1]).toBeGreaterThan(axis.domain[0]);
    expect(axis.ticks.every(Number.isFinite)).toBe(true);
    expect(axis.ticks.length).toBeLessThan(12);
  }
  expect(Object.values(view.metrics!).every(value => value === null || Number.isFinite(value))).toBe(true);
}

describe('editable configuration', () => {
  test.each(IMPULSE_CLASSES)('class $letter keeps both slider endpoints in its band', band => {
    const configuration = selectClass(initial, band.letter);
    expect(configuration.source).toBe(band.letter === 'C' ? 'reference' : 'preset');
    expect(classifyImpulse(configuration.totalImpulseNs)?.letter).toBe(band.letter);
    for (const endpoint of impulseBounds(band.letter)) expect(classifyImpulse(endpoint)?.letter).toBe(band.letter);
    const motor = motorPresets[band.letter].motor;
    expect(configuration.totalMassKg).toBe(motor.totalMassKg);
    expect(configuration.motorDiameterM).toBe(motor.diameterM);
    expect(configuration.motorLengthM).toBe(motor.lengthM);
    expect(configuration.bodyDiameterM).toBeGreaterThan(motor.diameterM);
    expect(configuration.totalImpulseNs / configuration.averageThrustN).toBeCloseTo(motor.curve.burnTimeS, 12);
  });
  test('doubling thrust with hold on halves duration, doubles peak, and preserves impulse', () => {
    const first = { ...initial, source: 'synthesized' as const };
    const doubled = changeNumber(first, 'averageThrustN', first.averageThrustN * 2);
    const a = configuredMotor(first, c6).motor.curve;
    const b = configuredMotor(doubled, c6).motor.curve;
    expect(b.totalImpulseNs).toBeCloseTo(a.totalImpulseNs, 10);
    expect(b.burnTimeS).toBeCloseTo(a.burnTimeS / 2, 12);
    expect(b.peakThrustN).toBeCloseTo(a.peakThrustN * 2, 10);
    const resultA = calculateFlight(first, c6), resultB = calculateFlight(doubled, c6);
    expect(resultB.metrics!.maxAccelerationG / resultA.metrics!.maxAccelerationG).toBeGreaterThan(1.8);
    expect(resultB.metrics!.maxAccelerationG / resultA.metrics!.maxAccelerationG).toBeLessThan(2.5);
  });
  test('hold off changes impulse with thrust and preserves duration at both band limits', () => {
    const configuration = { ...initial, holdImpulse: false };
    for (const thrust of boundsFor('averageThrustN', configuration)) {
      const changed = changeNumber(configuration, 'averageThrustN', thrust);
      expect(changed.totalImpulseNs / changed.averageThrustN).toBeCloseTo(c6.curve.burnTimeS, 12);
      expect(classifyImpulse(changed.totalImpulseNs)?.letter).toBe('C');
    }
  });
  test('log sliders span geometric midpoints and round-trip all classes', () => {
    for (const band of IMPULSE_CLASSES) {
      const bounds = impulseBounds(band.letter);
      expect(fromSlider(500, bounds, true)).toBeCloseTo(Math.sqrt(bounds[0] * bounds[1]), 9);
      for (const position of [0, 100, 500, 900, 1000]) expect(toSlider(fromSlider(position, bounds, true), bounds, true)).toBeCloseTo(position, 8);
    }
  });
  test('mass edits preserve casing mass, zero propellant remains valid, nonfinite inputs are ignored', () => {
    const light = changeNumber(initial, 'totalMassKg', 0.001);
    expect(light.propellantMassKg).toBeLessThan(light.totalMassKg);
    expect(configuredMotor(changeNumber(light, 'propellantMassKg', 0), c6).performance.specificImpulseS).toBeNull();
    for (const value of [NaN, Infinity, -Infinity]) expect(changeNumber(initial, 'dryMassKg', value)).toBe(initial);
  });
  test('default rails follow tier; explicitly entered rails persist', () => {
    expect(selectClass(initial, 'H').railLengthM).toBe(2.4);
    expect(selectClass(selectClass(initial, 'H'), 'G').railLengthM).toBe(1.8);
    expect(selectClass(changeNumber(initial, 'railLengthM', 5), 'H').railLengthM).toBe(5);
  });
  test('unrepresentable derived motor values have readable diagnostics', () => {
    expect(() => configuredMotor(changeNumber(initial, 'propellantMassKg', 1e-310), c6)).toThrow('Specific impulse is outside the finite numeric range');
  });
  test('store restores the measured reference and keeps airframe edits on measured thrust', () => {
    const store = createLabStore(initial);
    store.getState().setNumber('dryMassKg', 0.1);
    expect(store.getState().configuration.source).toBe('reference');
    store.getState().setShape('progressive');
    expect(store.getState().configuration.source).toBe('synthesized');
    store.getState().selectClass('O');
    store.getState().setHoldImpulse(false);
    store.getState().reset();
    expect(store.getState().configuration).toEqual(initial);
  });
});

describe('live chart snapshots', () => {
  test('retains all plotted extrema and exact event times while reducing render data', () => {
    const result = simulateFlight(c6Configuration);
    const samples = selectPlotSamples(result);
    expect(samples.length).toBeLessThan(result.samples.length / 2);
    for (const key of ['thrustN', 'altitudeM', 'velocityMS', 'accelerationMS2'] as const) {
      expect(Math.max(...samples.map(point => point[key]))).toBe(Math.max(...result.samples.map(point => point[key])));
      expect(Math.min(...samples.map(point => point[key]))).toBe(Math.min(...result.samples.map(point => point[key])));
    }
    for (const event of Object.values(result.events)) if (event) expect(samples).toContainEqual(event);
    const view = calculateFlight(initial, c6);
    expectUsable(view);
    expect(view.metrics!.apogeeM).toBeCloseTo(194.381, 3);
    expect(view.data.some(point => point.thrustN === 14.09)).toBe(true);
    expect(view.shownImpulseNs).toBe(c6.curve.totalImpulseNs);
  });
  test.each(IMPULSE_CLASSES)('class $letter produces a finite chart snapshot', band => {
    expectUsable(calculateFlight(selectClass(initial, band.letter), c6));
  });
  const keys: NumericParameter[] = ['totalImpulseNs', 'averageThrustN', 'totalMassKg', 'propellantMassKg', 'motorDiameterM', 'motorLengthM', 'dryMassKg', 'bodyDiameterM', 'dragCoefficient', 'railLengthM'];
  test.each(keys)('class O handles both extremes of %s', key => {
    const configuration = selectClass(initial, 'O');
    for (const endpoint of boundsFor(key, configuration)) expectUsable(calculateFlight(changeNumber(configuration, key, endpoint), c6));
  }, 15000);
  test('no liftoff leaves unreached events null and motion flat', () => {
    const view = calculateFlight(changeNumber(initial, 'dryMassKg', 1000), c6);
    expectUsable(view);
    expect(view.flight.status).toBe('no-liftoff');
    expect(view.metrics!.apogeeM).toBeNull();
    expect(view.metrics!.railExitVelocityMS).toBeNull();
    expect(view.data.every(point => point.altitudeM === 0 && point.velocityMS === 0)).toBe(true);
  });
  test('long low thrust flight shows finite partial data with a useful 600 s time axis', () => {
    const view = calculateFlight(changeNumber(selectClass(initial, 'O'), 'averageThrustN', 0.01), c6);
    expectUsable(view);
    expect(view.flight.status).toBe('simulation-limit');
    expect(view.flight.events.burnout).toBeNull();
    expect(view.fullBurnShown).toBe(false);
    expect(view.axes.time.domain).toEqual([0, 600]);
    expect(view.shownImpulseNs).toBeLessThan(view.motor.curve.totalImpulseNs);
    expect(view.data.at(-1)!.timeS).toBe(600);
  }, 15000);
});
