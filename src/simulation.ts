import { atmosphereAt, dragForceN } from './atmosphere.js';
import { G0, MAX_SIMULATION_TIME_S, TIME_STEP_S } from './constants.js';
import { createCurveEvaluator, createThrustCurve, validateMotorMass } from './curve.js';
import type { CurveState } from './curve.js';
import type { Diagnostic, FlightConfiguration, FlightEvents, FlightSample, SimulationResult, SimulationStatus, ThrustCurve } from './types.js';

interface State { altitudeM: number; velocityMS: number }
class NumericalLimit extends Error {}
const finite = (value: number): number => {
  if (!Number.isFinite(value)) throw new NumericalLimit('This configuration exceeded the finite numeric range during integration.');
  return value;
};

/** Earliest F(t) > m(t)g, including possible interior maxima on falling segments. */
function findLiftoff(curve: ThrustCurve, evaluate: (timeS: number) => CurveState, massAt: (timeS: number) => number, propellantMassKg: number): number | null {
  const force = (t: number): number => evaluate(t).thrustN - massAt(t) * G0;
  if (force(0) > 0) return 0;
  for (let i = 1; i < curve.points.length; i++) {
    const a = curve.points[i - 1]!;
    const b = curve.points[i]!;
    const slope = (b.thrustN - a.thrustN) / (b.timeS - a.timeS);
    const k = G0 * (propellantMassKg / curve.totalImpulseNs);
    const criticalOffset = slope !== 0 && k > 0 ? -(slope + k * a.thrustN) / (k * slope) : NaN;
    const boundaries = [a.timeS];
    if (criticalOffset > 0 && criticalOffset < b.timeS - a.timeS) boundaries.push(a.timeS + criticalOffset);
    boundaries.push(b.timeS);
    for (let j = 1; j < boundaries.length; j++) {
      let left = boundaries[j - 1]!;
      let right = boundaries[j]!;
      if (force(left) > 0) return left;
      if (force(right) <= 0) continue;
      for (let iteration = 0; iteration < 50; iteration++) {
        const middle = left + (right - left) * 0.5;
        if (force(middle) > 0) right = middle;
        else left = middle;
      }
      return right;
    }
  }
  return null;
}

function rk4(timeS: number, state: State, stepS: number, acceleration: (t: number, state: State) => number): State {
  const derivative = (t: number, s: State): State => ({ altitudeM: finite(s.velocityMS), velocityMS: acceleration(t, s) });
  const offset = (k: State, factor: number): State => ({
    altitudeM: finite(state.altitudeM + k.altitudeM * factor),
    velocityMS: finite(state.velocityMS + k.velocityMS * factor),
  });
  const k1 = derivative(timeS, state);
  const k2 = derivative(timeS + stepS * 0.5, offset(k1, stepS * 0.5));
  const k3 = derivative(timeS + stepS * 0.5, offset(k2, stepS * 0.5));
  const k4 = derivative(timeS + stepS, offset(k3, stepS));
  return {
    altitudeM: finite(state.altitudeM + stepS * (k1.altitudeM / 6 + k2.altitudeM / 3 + k3.altitudeM / 3 + k4.altitudeM / 6)),
    velocityMS: finite(state.velocityMS + stepS * (k1.velocityMS / 6 + k2.velocityMS / 3 + k3.velocityMS / 3 + k4.velocityMS / 6)),
  };
}

/** Browser-independent synchronous entry point, also suitable for a future Worker. */
export function simulateFlight(configuration: FlightConfiguration): SimulationResult {
  const events: { -readonly [K in keyof FlightEvents]: FlightEvents[K] } = {
    liftoff: null, railExit: null, burnout: null, apogee: null,
  };
  const invalid = (diagnostics: readonly Diagnostic[]): SimulationResult => ({
    status: 'invalid-input', samples: [], events, metrics: null, diagnostics,
  });
  // The public TS signature is precise; imports from JSON can still be incomplete at runtime.
  if (!configuration?.motor || !configuration.airframe || !Array.isArray(configuration.curve?.points)
    || configuration.curve.points.some(point => !point || typeof point !== 'object')) {
    return invalid([{ code: 'configuration', message: 'Supply a motor, airframe, and a curve containing time/thrust points.' }]);
  }
  const canonical = createThrustCurve(configuration.curve.points, configuration.curve.source);
  if (!canonical.ok) return invalid(canonical.errors);
  const curve = canonical.value;
  const { motor, airframe } = configuration;
  const errors = validateMotorMass(motor);
  for (const [field, value] of Object.entries({ dryMassKg: airframe.dryMassKg, bodyDiameterM: airframe.bodyDiameterM, railLengthM: airframe.railLengthM })) {
    if (!Number.isFinite(value) || value <= 0) errors.push({ code: field, message: `${field} must be finite and greater than zero.` });
  }
  if (!Number.isFinite(airframe.dragCoefficient) || airframe.dragCoefficient < 0) {
    errors.push({ code: 'drag-coefficient', message: 'Drag coefficient must be finite and nonnegative.' });
  }
  const initialMassKg = airframe.dryMassKg + motor.totalMassKg;
  const emptyMassKg = airframe.dryMassKg + (motor.totalMassKg - motor.propellantMassKg);
  const areaM2 = Math.PI * (airframe.bodyDiameterM / 2) ** 2;
  const averageThrustToWeight = curve.averageThrustN / initialMassKg / G0;
  if (![initialMassKg, emptyMassKg, areaM2].every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(averageThrustToWeight) || !Number.isFinite(curve.peakThrustN / emptyMassKg)) {
    errors.push({ code: 'numeric-range', message: 'Derived mass, frontal area, or acceleration is outside the finite numeric range.' });
  }
  if (errors.length) return invalid(errors);

  const evaluate = createCurveEvaluator(curve);
  const massAt = (timeS: number): number => {
    const spent = Math.max(0, Math.min(1, evaluate(timeS).impulseNs / curve.totalImpulseNs));
    return emptyMassKg + motor.propellantMassKg * (1 - spent);
  };
  const liftoffTimeS = findLiftoff(curve, evaluate, massAt, motor.propellantMassKg);
  const acceleration = (timeS: number, state: State): number => {
    const atmosphere = atmosphereAt(finite(state.altitudeM));
    const drag = dragForceN(finite(state.velocityMS), atmosphere.densityKgM3, airframe.dragCoefficient, areaM2);
    return finite((evaluate(timeS).thrustN - drag) / massAt(timeS) - G0);
  };
  const sampleAt = (timeS: number, state: State, supported = false): FlightSample => {
    const atmosphere = atmosphereAt(finite(state.altitudeM));
    return {
      timeS, altitudeM: finite(state.altitudeM), velocityMS: finite(state.velocityMS),
      accelerationMS2: supported ? 0 : acceleration(timeS, state),
      thrustN: evaluate(timeS).thrustN, massKg: massAt(timeS), densityKgM3: atmosphere.densityKgM3,
      mach: finite(Math.abs(state.velocityMS) / atmosphere.speedOfSoundMS),
    };
  };

  const samples: FlightSample[] = [];
  const diagnostics: Diagnostic[] = [];
  let maxVelocityMS = 0;
  let machAtMaxVelocity = 0;
  let maxMach = 0;
  let maxAccelerationG = 0;
  let extrapolated = false;
  const record = (sample: FlightSample): void => {
    if (samples.at(-1)?.timeS === sample.timeS) samples[samples.length - 1] = sample;
    else samples.push(sample);
    if (sample.velocityMS > maxVelocityMS) {
      maxVelocityMS = sample.velocityMS;
      machAtMaxVelocity = sample.mach;
    }
    maxMach = Math.max(maxMach, sample.mach);
    maxAccelerationG = Math.max(maxAccelerationG, sample.accelerationMS2 / G0);
    extrapolated ||= sample.altitudeM > 20000;
  };

  let timeS = 0;
  let state: State = { altitudeM: 0, velocityMS: 0 };
  let status: SimulationStatus = 'simulation-limit';
  let nextGridIndex = 1;
  let nextKnotIndex = 1;
  let integrationSteps = 0;
  try {
    record(sampleAt(0, state, liftoffTimeS !== 0));
    if (liftoffTimeS === 0) events.liftoff = samples[0]!;
    while (timeS < MAX_SIMULATION_TIME_S) {
      // Keep a 1 ms grid. Shorten steps only at thrust knots/liftoff/burnout,
      // so narrow imported pulses cannot disappear between RK sample times.
      while (nextGridIndex * TIME_STEP_S <= timeS) nextGridIndex++;
      while (nextKnotIndex < curve.points.length && curve.points[nextKnotIndex]!.timeS <= timeS) nextKnotIndex++;
      const nextKnot = curve.points[nextKnotIndex]?.timeS ?? Infinity;
      const nextLiftoff = !events.liftoff && liftoffTimeS !== null && liftoffTimeS > timeS ? liftoffTimeS : Infinity;
      const nextTimeS = Math.min(nextGridIndex * TIME_STEP_S, nextKnot, nextLiftoff, MAX_SIMULATION_TIME_S);
      const airborne = events.liftoff !== null;
      const nextState = airborne ? rk4(timeS, state, nextTimeS - timeS, acceleration) : state;
      const reachesApogee = airborne && state.velocityMS > 0 && nextState.velocityMS <= 0;
      let endTimeS = nextTimeS;
      let endState = nextState;
      if (reachesApogee) {
        const fraction = state.velocityMS / (state.velocityMS - nextState.velocityMS);
        endTimeS = timeS + fraction * (nextTimeS - timeS);
        // Integrate the linearly interpolated velocity up to its zero crossing.
        // Linear interpolation of height can put the reported apogee below the
        // preceding sample when the full RK step overshoots the turning point.
        endState = { altitudeM: state.altitudeM + 0.5 * state.velocityMS * (endTimeS - timeS), velocityMS: 0 };
        if (acceleration(endTimeS, endState) > 0) {
          throw new NumericalLimit('The fixed-step solver could not resolve this extreme configuration reliably (a false velocity reversal).');
        }
      }
      if (endState.altitudeM < state.altitudeM || endState.velocityMS < 0) {
        throw new NumericalLimit('The fixed-step solver could not resolve this extreme configuration reliably (nonphysical downward motion).');
      }
      if (!events.railExit && airborne && state.altitudeM < airframe.railLengthM && endState.altitudeM >= airframe.railLengthM) {
        const fraction = (airframe.railLengthM - state.altitudeM) / (endState.altitudeM - state.altitudeM);
        events.railExit = sampleAt(timeS + fraction * (endTimeS - timeS), {
          altitudeM: airframe.railLengthM, velocityMS: state.velocityMS + fraction * (endState.velocityMS - state.velocityMS),
        });
        record(events.railExit);
      }
      if (!events.liftoff && liftoffTimeS === endTimeS) events.liftoff = sampleAt(endTimeS, endState, true);
      const sample = sampleAt(endTimeS, endState, !events.liftoff);
      record(sample);
      if (!events.burnout && endTimeS === curve.burnTimeS) events.burnout = sample;
      if (reachesApogee) {
        events.apogee = sample;
        status = 'apogee';
        break;
      }
      if (!events.liftoff && events.burnout) {
        status = 'no-liftoff';
        diagnostics.push({ code: 'no-liftoff', message: 'Thrust never exceeded the rocket weight; it remained on the pad through burnout.' });
        break;
      }
      timeS = endTimeS;
      state = endState;
      integrationSteps++;
      if (integrationSteps >= 2_000_000) {
        diagnostics.push({ code: 'step-limit', message: 'The integration work limit was reached. Results describe only the completed portion.' });
        break;
      }
    }
  } catch (error) {
    if (!(error instanceof NumericalLimit)) throw error;
    diagnostics.push({ code: 'numerical-limit', message: error.message + ' Results stop at the last finite sample.' });
  }
  if (status === 'simulation-limit' && diagnostics.length === 0) {
    diagnostics.push({ code: 'time-limit', message: 'The 600-second simulation limit was reached before apogee. Results are partial.' });
  }
  if (extrapolated) diagnostics.push({ code: 'atmosphere-extrapolation', message: 'Above 20 km, the isothermal atmosphere is an extrapolation, not the full ISA.' });
  return {
    status, samples, events, diagnostics,
    metrics: {
      apogeeM: events.apogee?.altitudeM ?? null,
      maxVelocityMS, machAtMaxVelocity, maxMach, maxAccelerationG,
      burnTimeS: curve.burnTimeS,
      burnoutAltitudeM: events.burnout?.altitudeM ?? null,
      burnoutVelocityMS: events.burnout?.velocityMS ?? null,
      timeToApogeeS: events.apogee?.timeS ?? null,
      averageThrustToWeight, railExitVelocityMS: events.railExit?.velocityMS ?? null,
    },
  };
}
