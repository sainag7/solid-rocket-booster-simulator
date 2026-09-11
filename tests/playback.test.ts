import { describe, expect, test } from 'vitest';
import { IMPULSE_CLASSES, createCurveEvaluator, simulateFlight, G0 } from '../src/index.js';
import { advancePlayback, createPlaybackEvaluator, flightPhase, playbackSamples } from '../web/playback.js';
import { initialConfiguration, selectClass, changeNumber, createLabStore } from '../web/configuration.js';
import { calculateFlight } from '../web/flight-view.js';
import { motorPresets } from '../web/motor-presets.js';
import { geometryIssues } from '../web/geometry.js';
import { motorData } from '../web/motor-data.js';
import { c6, c6Configuration } from './helpers.js';

const reference = initialConfiguration(c6);
describe('real motor catalog and geometry', () => {
  test.each(IMPULSE_CLASSES)('$letter loads sourced data with a complete, usable example flight', band => {
    const c = selectClass(reference, band.letter);
    const preset = motorPresets[band.letter];
    const data = motorData.find(record => record.id === band.letter)!;
    expect(preset.sourceUrl).toMatch(/^https:\/\/www.thrustcurve.org\//);
    expect(data.eng).toContain(';');
    expect(preset.motor.propellantMassKg).toBeLessThan(preset.motor.totalMassKg);
    expect(geometryIssues(c)).toEqual([]);
    const view = calculateFlight(c, c6);
    expect(view.motor.curve).toEqual(preset.motor.curve);
    expect(view.flight.status).toBe('apogee');
    expect(view.flight.events.burnout?.timeS).toBe(view.motor.curve.burnTimeS);
    expect(view.playback.at(-1)?.timeS).toBe(view.flight.events.apogee?.timeS);
    expect(view.metrics!.averageThrustToWeight).toBeGreaterThan(3);
  });
  test('higher classes use actual bigger casings; adjacent sizes can match', () => {
    expect(selectClass(reference, 'O').motorLengthM).toBeGreaterThan(selectClass(reference, 'A').motorLengthM);
    expect(selectClass(reference, 'O').motorDiameterM).toBeGreaterThan(selectClass(reference, 'A').motorDiameterM);
    expect(selectClass(reference, 'A').motorDiameterM).toBe(selectClass(reference, 'B').motorDiameterM);
  });
  test('mass and geometry edits keep the source curve and mark the example modified', () => {
    const store = createLabStore(selectClass(reference, 'J'));
    const before = calculateFlight(store.getState().configuration, c6).motor.curve;
    store.getState().setNumber('bodyLengthM', 1.7);
    store.getState().setNumber('dryMassKg', 1.2);
    store.getState().setGeometryChoice('noseShape', 'parabolic');
    store.getState().setGeometryChoice('finCount', 3);
    const c = store.getState().configuration;
    expect(c).toMatchObject({ source: 'preset', modified: true, bodyLengthM: 1.7, noseShape: 'parabolic', finCount: 3 });
    expect(calculateFlight(c, c6).motor.curve).toEqual(before);
    store.getState().setNumber('averageThrustN', 400);
    expect(store.getState().configuration.source).toBe('synthesized');
    store.getState().selectClass('J');
    expect(store.getState().configuration.modified).toBe(false);
  });
  test('reports motor and fin fit problems without changing geometry', () => {
    expect(geometryIssues({ ...reference, motorLengthM: 2, motorDiameterM: 1, finRootM: 2 })).toHaveLength(3);
    expect(geometryIssues({ ...reference, finSweepM: 1 })).toHaveLength(1);
  });
});

describe('simulation-driven playback', () => {
  test('C6 keeps all exact events and thrust knots, with a dedicated compact stream', () => {
    const result = simulateFlight(c6Configuration);
    const samples = playbackSamples(result, c6.curve);
    expect(samples.length).toBeLessThan(result.samples.length / 5);
    for (const event of Object.values(result.events)) if (event) expect(samples.some(sample => sample.timeS === event.timeS)).toBe(true);
    for (const point of c6.curve.points) expect(samples.some(sample => sample.timeS === point.timeS)).toBe(true);
    const evaluate = createPlaybackEvaluator(samples, c6.curve);
    for (const event of Object.values(result.events)) if (event) {
      const state = evaluate(event.timeS);
      expect(state.altitudeM).toBe(event.altitudeM);
      expect(state.velocityMS).toBe(event.velocityMS);
    }
    const atBurnout = evaluate(c6.curve.burnTimeS);
    expect(atBurnout.thrustN).toBe(0);
    expect(atBurnout.impulseNs).toBeCloseTo(8.817238, 6);
    expect(atBurnout.altitudeM).toBeCloseTo(72.732, 3);
    expect(evaluate(1e9).timeS).toBe(result.events.apogee!.timeS);
    expect(evaluate(-1).timeS).toBe(0);
    expect(evaluate(NaN).timeS).toBe(0);
  });
  test('interpolated motion tracks full physics within a small error', () => {
    const result = simulateFlight(c6Configuration);
    const evaluate = createPlaybackEvaluator(playbackSamples(result, c6.curve), c6.curve);
    const curve = createCurveEvaluator(c6.curve);
    for (let i = 1; i < result.samples.length; i += 31) {
      const actual = result.samples[i]!;
      const played = evaluate(actual.timeS);
      expect(Math.abs(played.altitudeM - actual.altitudeM)).toBeLessThan(0.01);
      expect(Math.abs(played.velocityMS - actual.velocityMS)).toBeLessThan(0.02);
      expect(played.thrustN).toBe(curve(actual.timeS).thrustN);
      expect(played.impulseNs).toBe(curve(actual.timeS).impulseNs);
    }
  });
  test.each([0.25, 1, 4])('speed %s changes time only and stops exactly at endpoint', speed => {
    let t = 0;
    for (let frame = 0; frame < 60; frame++) t = advancePlayback(t, 1 / 60, speed, 10);
    expect(t).toBeCloseTo(speed, 10);
    expect(advancePlayback(t, 100, speed, 10)).toBe(10);
    expect(advancePlayback(2, 0, speed, 10)).toBe(2);
  });
  test('no liftoff burns on the pad and retains total delivered impulse', () => {
    const view = calculateFlight(changeNumber(reference, 'dryMassKg', 1000), c6);
    const evaluate = createPlaybackEvaluator(view.playback, view.motor.curve);
    expect(view.flight.status).toBe('no-liftoff');
    expect(evaluate(0.2).thrustN).toBeGreaterThan(0);
    expect(evaluate(0.2).altitudeM).toBe(0);
    expect(evaluate(view.lastTimeS).impulseNs).toBeCloseTo(c6.curve.totalImpulseNs, 10);
    expect(flightPhase(view.lastTimeS, view.flight, view.lastTimeS, c6.curve.burnTimeS)).toBe('No liftoff');
  });
  test('normal flight labels follow ignition, liftoff, burnout, and apogee', () => {
    const v = calculateFlight(reference, c6);
    expect(flightPhase(0, v.flight, v.lastTimeS, c6.curve.burnTimeS)).toBe('Ready on pad');
    expect(flightPhase(v.flight.events.liftoff!.timeS / 2, v.flight, v.lastTimeS, c6.curve.burnTimeS)).toBe('Ignition · on pad');
    expect(flightPhase(0.4, v.flight, v.lastTimeS, c6.curve.burnTimeS)).toBe('Powered ascent');
    expect(flightPhase(c6.curve.burnTimeS, v.flight, v.lastTimeS, c6.curve.burnTimeS)).toBe('Coasting');
    expect(flightPhase(v.lastTimeS, v.flight, v.lastTimeS, c6.curve.burnTimeS)).toBe('Apogee');
  });
  test('partial flight stops at its real endpoint with only delivered impulse', () => {
    const c = { ...selectClass(reference, 'O'), source: 'synthesized' as const, totalImpulseNs: 30000, averageThrustN: 0.01, dryMassKg: 0.01 };
    const v = calculateFlight(c, c6);
    const evaluate = createPlaybackEvaluator(v.playback, v.motor.curve);
    expect(v.flight.status).toBe('simulation-limit');
    expect(evaluate(1e9).timeS).toBe(v.lastTimeS);
    expect(evaluate(v.lastTimeS).impulseNs).toBeLessThan(c.totalImpulseNs);
    expect(flightPhase(v.lastTimeS, v.flight, v.lastTimeS, v.motor.curve.burnTimeS)).toBe('Simulation limit');
  });
  test('zero propellant remains finite', () => {
    const v = calculateFlight(changeNumber(reference, 'propellantMassKg', 0), c6);
    const state = createPlaybackEvaluator(v.playback, v.motor.curve)(0.5);
    expect(state.massKg).toBeCloseTo(reference.totalMassKg + reference.dryMassKg, 10);
    expect(Number.isFinite(state.accelerationMS2 / G0)).toBe(true);
  });
});
