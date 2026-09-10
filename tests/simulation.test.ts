import { describe, expect, test } from 'vitest';
import { atmosphereAt, createCurveEvaluator, createThrustCurve, generateThrustCurve, G0, IMPULSE_CLASSES, MAX_SIMULATION_TIME_S, simulateFlight } from '../src/index.js';
import type { CurveShape, FlightConfiguration } from '../src/index.js';
import { c6, c6Configuration, expectFiniteResult, syntheticFlight, unwrap } from './helpers.js';

describe('analytical flight references', () => {
  test('constant-mass powered motion and ballistic coast match closed forms', () => {
    const thrustN = 30;
    const massKg = 2;
    const burnTimeS = 1.001;
    const curve = unwrap(createThrustCurve([
      { timeS: 0, thrustN }, { timeS: 1, thrustN }, { timeS: burnTimeS, thrustN: 0 },
    ]));
    const result = simulateFlight({ curve, motor: { totalMassKg: 1, propellantMassKg: 0 },
      airframe: { dryMassKg: 1, bodyDiameterM: 0.1, dragCoefficient: 0, railLengthM: 0.37 } });
    expectFiniteResult(result);
    expect(result.status).toBe('apogee');
    const acceleration = thrustN / massKg - G0;
    const atHalfSecond = result.samples.find(sample => sample.timeS === 0.5)!;
    expect(atHalfSecond.velocityMS).toBeCloseTo(acceleration * 0.5, 9);
    expect(atHalfSecond.altitudeM).toBeCloseTo(0.5 * acceleration * 0.5 ** 2, 9);
    const burnoutVelocity = (30 * 1 + 30 * 0.001 / 2) / massKg - G0 * burnTimeS;
    // Exact convolution integral of the constant thrust and linear tail segments.
    const burnoutAltitude = (30 * (burnTimeS - 0.5) + 30 * 0.001 ** 2 / 3) / massKg - 0.5 * G0 * burnTimeS ** 2;
    expect(result.events.burnout!.velocityMS).toBeCloseTo(burnoutVelocity, 9);
    expect(result.events.burnout!.altitudeM).toBeCloseTo(burnoutAltitude, 9);
    expect(result.metrics!.apogeeM).toBeCloseTo(burnoutAltitude + burnoutVelocity ** 2 / (2 * G0), 5);
    expect(result.metrics!.timeToApogeeS).toBeCloseTo(burnTimeS + burnoutVelocity / G0, 9);
    expect(result.events.railExit!.timeS).toBeCloseTo(Math.sqrt(2 * 0.37 / acceleration), 5);
    expect(result.events.railExit!.velocityMS).toBeCloseTo(Math.sqrt(2 * 0.37 * acceleration), 5);
  });

  test('impulse-based depletion matches the ideal rocket equation for a varying curve', () => {
    const curve = unwrap(createThrustCurve([
      { timeS: 0, thrustN: 30 }, { timeS: 0.1, thrustN: 50 }, { timeS: 0.8, thrustN: 20 }, { timeS: 1, thrustN: 0 },
    ]));
    const result = simulateFlight({ curve, motor: { totalMassKg: 0.1, propellantMassKg: 0.05 },
      airframe: { dryMassKg: 0.9, bodyDiameterM: 0.05, dragCoefficient: 0, railLengthM: 1.8 } });
    const expectedVelocity = (curve.totalImpulseNs / 0.05) * Math.log(1 / 0.95) - G0;
    expect(result.events.burnout!.velocityMS).toBeCloseTo(expectedVelocity, 7);
    expect(result.events.burnout!.massKg).toBeCloseTo(0.95, 12);
    expectFiniteResult(result);
  });

  test('resolves a complete thrust pulse shorter than the 1 ms output grid', () => {
    const curve = unwrap(createThrustCurve([
      { timeS: 0, thrustN: 0 }, { timeS: 0.00001, thrustN: 100000 }, { timeS: 0.00002, thrustN: 0 },
    ]));
    const result = simulateFlight({ curve, motor: { totalMassKg: 0.01, propellantMassKg: 0 },
      airframe: { dryMassKg: 0.01, bodyDiameterM: 0.01, dragCoefficient: 0, railLengthM: 1.8 } });
    expect(result.status).toBe('apogee');
    expect(result.events.burnout!.timeS).toBe(0.00002);
    expect(result.events.burnout!.velocityMS).toBeCloseTo(50 - G0 * 0.00002, 5);
    expectFiniteResult(result);
  });
});

describe('C6 manufacturer comparison and headline metrics', () => {
  test('roughly 60–71 g airframes reach low hundreds of metres', () => {
    for (const dryMassKg of [0.06, 0.0709]) {
      const result = simulateFlight({ ...c6Configuration, airframe: { ...c6Configuration.airframe, dryMassKg } });
      expect(result.status).toBe('apogee');
      // Estes Big Bertha: 152 m published maximum, 42 mm diameter, 70.9 g kit weight.
      // Broad teaching-model agreement, not calibration to an exact flight.
      expect(result.metrics!.apogeeM).toBeGreaterThan(100);
      expect(result.metrics!.apogeeM).toBeLessThan(250);
      if (dryMassKg === 0.0709) expect(Math.abs(result.metrics!.apogeeM! / 152 - 1)).toBeLessThan(0.4);
      expectFiniteResult(result);
    }
  });
  test('drag makes a substantial difference without changing motor consumption', () => {
    const withDrag = simulateFlight(c6Configuration);
    const withoutDrag = simulateFlight({ ...c6Configuration, airframe: { ...c6Configuration.airframe, dragCoefficient: 0 } });
    expect(withDrag.metrics!.apogeeM!).toBeLessThan(withoutDrag.metrics!.apogeeM! * 0.7);
    expect(withDrag.events.burnout!.massKg).toBe(withoutDrag.events.burnout!.massKg);
    expect(withDrag.metrics!.averageThrustToWeight).toBeCloseTo(c6.curve.averageThrustN / (0.0709 + 0.0231) / G0, 12);
    const fastest = withDrag.samples.reduce((best, sample) => sample.velocityMS > best.velocityMS ? sample : best);
    expect(withDrag.metrics!.machAtMaxVelocity).toBeCloseTo(fastest.velocityMS / atmosphereAt(fastest.altitudeM).speedOfSoundMS, 12);
    expect(withDrag.events.railExit!.altitudeM).toBe(1.8);
    expect(withDrag.events.apogee!.velocityMS).toBe(0);
    expect(withDrag.samples.at(-1)).toBe(withDrag.events.apogee);
  });
  test.each(['neutral', 'progressive', 'regressive'] as CurveShape[])('doubling %s thrust roughly doubles peak net acceleration', shape => {
    const slow = syntheticFlight(240, 128, shape);
    const fast = syntheticFlight(240, 256, shape);
    const airframe = { ...slow.airframe, dryMassKg: 0.5, dragCoefficient: 0 };
    const motor = { totalMassKg: 0.25, propellantMassKg: 0.12 };
    const a = simulateFlight({ ...slow, airframe, motor });
    const b = simulateFlight({ ...fast, airframe, motor });
    expect(b.metrics!.burnTimeS).toBe(a.metrics!.burnTimeS / 2);
    expect(b.metrics!.maxAccelerationG / a.metrics!.maxAccelerationG).toBeGreaterThan(1.8);
    expect(b.metrics!.maxAccelerationG / a.metrics!.maxAccelerationG).toBeLessThan(2.3);
  });
});

describe('launch, event, and limit edge cases', () => {
  test('holds the rocket at ground level until thrust exceeds its changing weight', () => {
    const curve = unwrap(createThrustCurve([
      { timeS: 0, thrustN: 0 }, { timeS: 1, thrustN: 0 }, { timeS: 2, thrustN: 30 }, { timeS: 3, thrustN: 0 },
    ]));
    const result = simulateFlight({ curve, motor: { totalMassKg: 0.5, propellantMassKg: 0 },
      airframe: { dryMassKg: 0.5, bodyDiameterM: 0.03, dragCoefficient: 0, railLengthM: 1.8 } });
    const expectedLiftoff = 1 + G0 / 30;
    expect(result.events.liftoff!.timeS).toBeCloseTo(expectedLiftoff, 12);
    expect(result.samples.filter(sample => sample.timeS <= expectedLiftoff).every(sample => sample.altitudeM === 0 && sample.velocityMS === 0)).toBe(true);
    expect(result.samples.find(sample => sample.timeS === 0.5)!.accelerationMS2).toBe(0);
    expectFiniteResult(result);
  });
  test('detects an interior liftoff threshold on a regressive segment as mass falls', () => {
    // At both segment ends F < mg, but impulse-driven mass loss makes F > mg inside.
    const curve = unwrap(createThrustCurve([{ timeS: 0, thrustN: 9.7 }, { timeS: 1, thrustN: 0 }]));
    const result = simulateFlight({ curve, motor: { totalMassKg: 0.99, propellantMassKg: 0.9 },
      airframe: { dryMassKg: 0.01, bodyDiameterM: 0.03, dragCoefficient: 0, railLengthM: 1.8 } });
    expect(result.events.liftoff).not.toBeNull();
    expect(result.events.liftoff!.timeS).toBeGreaterThan(0);
    expect(result.events.liftoff!.timeS).toBeLessThan(0.1);
    expectFiniteResult(result);
  });
  test('burns on the pad with finite zero motion when the rocket cannot lift', () => {
    const result = simulateFlight({ ...c6Configuration, airframe: { ...c6Configuration.airframe, dryMassKg: 20 } });
    expect(result.status).toBe('no-liftoff');
    expect(result.events.liftoff).toBeNull();
    expect(result.events.railExit).toBeNull();
    expect(result.events.apogee).toBeNull();
    expect(result.metrics!.apogeeM).toBeNull();
    expect(result.events.burnout!.massKg).toBeCloseTo(20 + 0.0231 - 0.0108, 12);
    expect(result.samples.every(sample => sample.altitudeM === 0 && sample.velocityMS === 0 && sample.accelerationMS2 === 0)).toBe(true);
    expectFiniteResult(result);
  });
  test('an unreached rail exit is null, not zero', () => {
    const result = simulateFlight({ ...c6Configuration, airframe: { ...c6Configuration.airframe, railLengthM: 10000 } });
    expect(result.status).toBe('apogee');
    expect(result.metrics!.railExitVelocityMS).toBeNull();
    expect(result.events.railExit).toBeNull();
  });
  test('stops at the first apogee even when a weak thrust tail remains', () => {
    const curve = unwrap(createThrustCurve([
      { timeS: 0, thrustN: 20 }, { timeS: 0.1, thrustN: 20 }, { timeS: 0.2, thrustN: 0.1 }, { timeS: 10, thrustN: 0 },
    ]));
    const result = simulateFlight({ curve, motor: { totalMassKg: 0.5, propellantMassKg: 0 },
      airframe: { dryMassKg: 0.5, bodyDiameterM: 0.03, dragCoefficient: 0, railLengthM: 1.8 } });
    expect(result.status).toBe('apogee');
    expect(result.events.burnout).toBeNull();
    expect(result.metrics!.burnoutAltitudeM).toBeNull();
    expect(result.events.apogee!.timeS).toBeLessThan(curve.burnTimeS);
    expectFiniteResult(result);
  });
  test('returns finite partial results for a burn extending beyond 600 seconds', () => {
    const result = simulateFlight(syntheticFlight(40960, 50, 'neutral'));
    expect(result.status).toBe('simulation-limit');
    expect(result.samples.at(-1)!.timeS).toBe(MAX_SIMULATION_TIME_S);
    expect(result.events.burnout).toBeNull();
    expect(result.metrics!.apogeeM).toBeNull();
    expect(result.metrics!.timeToApogeeS).toBeNull();
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'time-limit')).toBe(true);
    expectFiniteResult(result);
  }, 15000);
  test('does not falsely report no liftoff before a long burn finishes', () => {
    const configuration = syntheticFlight(1.26, 0.001, 'neutral');
    const result = simulateFlight(configuration);
    expect(result.status).toBe('simulation-limit');
    expect(result.events.liftoff).toBeNull();
    expect(result.events.burnout).toBeNull();
    expectFiniteResult(result);
  }, 15000);
  test('rejects invalid values and malformed runtime configurations without throwing', () => {
    for (const field of ['dryMassKg', 'bodyDiameterM', 'railLengthM'] as const) {
      for (const value of [NaN, Infinity, 0, -1]) {
        const result = simulateFlight({ ...c6Configuration, airframe: { ...c6Configuration.airframe, [field]: value } });
        expect(result.status).toBe('invalid-input');
        expect(result.metrics).toBeNull();
        expect(result.diagnostics.length).toBeGreaterThan(0);
      }
    }
    for (const configuration of [null, {}, { ...c6Configuration, curve: { points: [null] } }]) {
      expect(simulateFlight(configuration as unknown as FlightConfiguration).status).toBe('invalid-input');
    }
    expect(simulateFlight({ ...c6Configuration, motor: { totalMassKg: 0.01, propellantMassKg: 0.02 } }).status).toBe('invalid-input');
    expect(simulateFlight({ ...c6Configuration, airframe: { ...c6Configuration.airframe, dragCoefficient: -1 } }).status).toBe('invalid-input');
  });
  test('reports numerical limits instead of a false apogee for extremely stiff drag', () => {
    const result = simulateFlight({
      curve: unwrap(generateThrustCurve({ totalImpulseNs: 40960, averageThrustN: 1e6, shape: 'regressive' })),
      motor: { totalMassKg: 0.001, propellantMassKg: 0.00099 },
      airframe: { dryMassKg: 0.001, bodyDiameterM: 2, dragCoefficient: 1, railLengthM: 1.8 },
    });
    expect(result.status).toBe('simulation-limit');
    expect(result.events.apogee).toBeNull();
    expect(result.diagnostics.some(diagnostic => diagnostic.code === 'numerical-limit')).toBe(true);
    expectFiniteResult(result);
  });
  test('recomputes curve metadata and never mutates caller data', () => {
    const config = structuredClone(c6Configuration);
    const tampered = { ...config, curve: { ...config.curve, totalImpulseNs: 1, burnTimeS: 1, peakThrustN: 1, averageThrustN: 1 } };
    const before = JSON.stringify(tampered);
    const result = simulateFlight(tampered);
    expect(result.metrics!.burnTimeS).toBe(1.86);
    expect(result.events.burnout!.massKg).toBeCloseTo(0.0832, 12);
    expect(JSON.stringify(tampered)).toBe(before);
  });
});

describe('A–O numerical envelope', () => {
  const shapes: CurveShape[] = ['neutral', 'progressive', 'regressive'];
  test.each(IMPULSE_CLASSES.flatMap(band => shapes.map(shape => ({ band, shape }))))('$band.letter $shape retains finite samples and correct depletion', ({ band, shape }) => {
    const impulse = band.maxNs;
    const motor = { totalMassKg: impulse * 0.002, propellantMassKg: impulse * 0.001 };
    const configuration = {
      curve: unwrap(generateThrustCurve({ totalImpulseNs: impulse, averageThrustN: impulse, shape })), motor,
      airframe: { dryMassKg: impulse * 0.006, bodyDiameterM: 0.018 * (impulse / 8.8) ** (1 / 3), dragCoefficient: 0.45, railLengthM: 1.8 },
    };
    const result = simulateFlight(configuration);
    expect(result.status).toBe('apogee');
    expectFiniteResult(result);
    expect(result.events.burnout!.massKg).toBeCloseTo(configuration.airframe.dryMassKg + motor.totalMassKg - motor.propellantMassKg, 9);
    const halfway = result.samples.find(sample => sample.timeS === 0.5)!;
    const fraction = createCurveEvaluator(configuration.curve)(0.5).impulseNs / configuration.curve.totalImpulseNs;
    expect(halfway.massKg).toBeCloseTo(configuration.airframe.dryMassKg + motor.totalMassKg - motor.propellantMassKg * fraction, 9);
    if (shape !== 'neutral') expect(Math.abs(fraction - 0.5)).toBeGreaterThan(0.05);
    expect(result.samples.every((sample, index, all) => index === 0 || sample.massKg <= all[index - 1]!.massKg + 1e-12)).toBe(true);
  });
  test.each([
    { impulse: 1.26, thrust: 1000, dry: 0.005, total: 0.005, prop: 0.001, diameter: 0.01, cd: 1, rail: 0.1 },
    { impulse: 40960, thrust: 50000, dry: 50, total: 30, prop: 20, diameter: 0.3, cd: 0.2, rail: 20 },
    { impulse: 40960, thrust: 4000, dry: 1, total: 2, prop: 1.9, diameter: 0.03, cd: 0.2, rail: 0.1 },
    { impulse: 20480.001, thrust: 100, dry: 1000, total: 100, prop: 90, diameter: 2, cd: 1, rail: 20 },
  ])('handles impulse=$impulse N·s thrust=$thrust N extremes', values => {
    const result = simulateFlight({
      curve: unwrap(generateThrustCurve({ totalImpulseNs: values.impulse, averageThrustN: values.thrust, shape: 'regressive' })),
      motor: { totalMassKg: values.total, propellantMassKg: values.prop },
      airframe: { dryMassKg: values.dry, bodyDiameterM: values.diameter, dragCoefficient: values.cd, railLengthM: values.rail },
    });
    expectFiniteResult(result);
    if (values.total === 2) {
      // Intentionally extreme mass/impulse combination is still climbing at the cap.
      expect(result.status).toBe('simulation-limit');
      expect(result.samples.at(-1)!.timeS).toBe(600);
      expect(result.samples.at(-1)!.velocityMS).toBeGreaterThan(0);
      expect(result.diagnostics.some(diagnostic => diagnostic.code === 'time-limit')).toBe(true);
    } else {
      expect(['apogee', 'no-liftoff']).toContain(result.status);
    }
    if (result.samples.some(sample => sample.altitudeM > 20000)) {
      expect(result.diagnostics.some(diagnostic => diagnostic.code === 'atmosphere-extrapolation')).toBe(true);
    }
  });
});
