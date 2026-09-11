import { describe, expect, test } from 'vitest';
import { createCurveEvaluator, GRAIN_PROFILES } from '../src/index.js';
import type { GrainProfileId } from '../src/index.js';
import { changeNumber, createLabStore, initialConfiguration, selectClass, selectGrainProfile } from '../web/configuration.js';
import { calculateFlight, configuredMotor } from '../web/flight-view.js';
import { createLabTools } from '../web/lab-tools.js';
import { c6 } from './helpers.js';

const initial = initialConfiguration(c6);
describe('grain selection and impulse delivery', () => {
  test.each([true, false])('profile switching preserves the configuration with hold = %s', holdImpulse => {
    const store = createLabStore({ ...initial, holdImpulse });
    for (const profile of GRAIN_PROFILES) {
      store.getState().setGrainProfile(profile.id);
      const { source, grainProfile, modified, ...remaining } = store.getState().configuration;
      const { source: _source, grainProfile: _grain, modified: _modified, ...expected } = { ...initial, holdImpulse };
      expect(source).toBe('synthesized');
      expect(grainProfile).toBe(profile.id);
      expect(modified).toBe(true);
      expect(remaining).toEqual(expected);
      expect(configuredMotor(store.getState().configuration, c6).motor.curve.burnTimeS).toBe(c6.curve.burnTimeS);
    }
  });
  test('class/thrust/impulse edits keep the grain; basic shape and reset clear it', () => {
    const store = createLabStore(initial);
    expect(store.getState().configuration.grainProfile).toBeNull();
    expect(configuredMotor(initial, c6).motor.curve).toBe(c6.curve);
    store.getState().setGrainProfile('multi-fin');
    store.getState().selectClass('G');
    expect(store.getState().configuration.source).toBe('synthesized');
    expect(configuredMotor(store.getState().configuration, c6).motor.profileLabel).toBe('Multi-fin profile');
    store.getState().setNumber('totalImpulseNs', 100);
    store.getState().setNumber('averageThrustN', 80);
    expect(store.getState().configuration.grainProfile).toBe('multi-fin');
    store.getState().setShape('regressive');
    expect(store.getState().configuration.grainProfile).toBeNull();
    expect(store.getState().configuration.shape).toBe('regressive');
    store.getState().setGrainProfile('star');
    store.getState().reset();
    expect(store.getState().configuration).toEqual(initial);
  });
  test('invalid selection does not corrupt state', () => {
    const store = createLabStore(initial);
    expect(() => store.getState().setGrainProfile('bad' as GrainProfileId)).toThrow('supported grain profile');
    expect(store.getState().configuration).toEqual(initial);
  });
  test.each(GRAIN_PROFILES)('$name adds exact cumulative impulse to plotted and event samples', ({ id }) => {
    const view = calculateFlight(selectGrainProfile(initial, id), c6);
    const evaluate = createCurveEvaluator(view.motor.curve);
    expect(view.flight.status).toBe('apogee');
    expect(view.fullBurnShown).toBe(true);
    expect(view.data.every((point, index) => point.cumulativeImpulseNs === evaluate(point.timeS).impulseNs &&
      (index === 0 || point.cumulativeImpulseNs >= view.data[index - 1]!.cumulativeImpulseNs))).toBe(true);
    expect(view.data.at(-1)!.cumulativeImpulseNs).toBeCloseTo(initial.totalImpulseNs, 10);
    expect(view.halfwayImpulsePercent).toBeCloseTo(100 * evaluate(view.motor.curve.burnTimeS / 2).impulseNs / view.motor.curve.totalImpulseNs, 12);
    expect(view.axes.impulse.domain[1]).toBeGreaterThanOrEqual(view.motor.curve.totalImpulseNs);
    for (const event of Object.values(view.flight.events)) if (event) {
      expect(view.data.find(point => point.timeS === event.timeS)?.cumulativeImpulseNs).toBe(evaluate(event.timeS).impulseNs);
    }
  });
  test('different schedules produce distinct half-burn delivery and representative flight results', () => {
    const tubular = calculateFlight(selectGrainProfile(initial, 'tubular'), c6);
    const anchor = calculateFlight(selectGrainProfile(initial, 'double-anchor'), c6);
    const boost = calculateFlight(selectGrainProfile(initial, 'multi-fin'), c6);
    expect(tubular.halfwayImpulsePercent).toBeLessThan(45);
    expect(anchor.halfwayImpulsePercent).toBeGreaterThan(55);
    expect(boost.halfwayImpulsePercent).toBeGreaterThan(55);
    expect(Math.abs(tubular.metrics!.apogeeM! - anchor.metrics!.apogeeM!)).toBeGreaterThan(1);
    expect(Math.abs(tubular.metrics!.maxAccelerationG - boost.metrics!.maxAccelerationG)).toBeGreaterThan(1);
  });
  test.each(GRAIN_PROFILES)('$name handles no liftoff and partial flights honestly', ({ id }) => {
    const grounded = calculateFlight(changeNumber(selectGrainProfile(initial, id), 'dryMassKg', 1000), c6);
    expect(grounded.flight.status).toBe('no-liftoff');
    expect(grounded.flight.events.apogee).toBeNull();
    expect(grounded.data.at(-1)!.cumulativeImpulseNs).toBeCloseTo(initial.totalImpulseNs, 10);
    const partial = calculateFlight(changeNumber(selectClass(selectGrainProfile(initial, id), 'O'), 'averageThrustN', 0.01), c6);
    expect(partial.flight.status).toBe('simulation-limit');
    expect(partial.flight.events.burnout).toBeNull();
    expect(partial.fullBurnShown).toBe(false);
    expect(partial.data.at(-1)!.timeS).toBe(600);
    expect(partial.data.at(-1)!.cumulativeImpulseNs).toBeLessThan(partial.motor.curve.totalImpulseNs);
    expect(partial.data.every(point => Object.values(point).every(value => value === null || Number.isFinite(value)))).toBe(true);
    expect(Object.values(partial.axes).every(axis => axis.domain.every(Number.isFinite) && axis.domain[1] > axis.domain[0])).toBe(true);
  }, 15000);
});

test('grain page tool shares UI state actions and rejects invalid input', () => {
  const store = createLabStore(initial);
  let visibleUpdates = 0;
  const tools = createLabTools(store, action => { action(); visibleUpdates++; });
  const tool = tools.find(item => item.name === 'configure_grain_profile')!;
  const read = tools.find(item => item.name === 'read_flight_configuration')!;
  expect(tool.annotations.readOnlyHint).toBe(false);
  expect(tool.inputSchema).toMatchObject({ required: ['profile'], additionalProperties: false, properties: { profile: { enum: GRAIN_PROFILES.map(profile => profile.id) } } });
  expect(tool.execute({ profile: 'dual-composition' })).toMatchObject({ status: 'configuration-applied', configuration: { grainProfile: 'dual-composition', totalImpulseNs: initial.totalImpulseNs } });
  expect(read.execute({})).toEqual(store.getState().configuration);
  expect(visibleUpdates).toBe(1);
  const previous = store.getState().configuration;
  for (const input of [null, [], {}, { profile: 'unknown' }, { profile: 'star', mass: 1 }]) {
    expect(() => tool.execute(input)).toThrow('supported grain profile');
    expect(store.getState().configuration).toBe(previous);
  }
});
