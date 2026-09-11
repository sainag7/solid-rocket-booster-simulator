import { createCurveEvaluator, generateThrustCurve, generateGrainThrustCurve, grainProfileFor, motorDesignation, motorPerformance, simulateFlight, G0 } from '../src/index.js';
import type { FlightSample, ImportedMotor, SimulationResult } from '../src/types.js';
import type { Configuration } from './configuration.js';
import { motorPresets } from './motor-presets.js';
import { playbackSamples } from './playback.js';
import { axisRange } from './chart-data.js';

export function configuredMotor(configuration: Configuration, referenceMotor: ImportedMotor) {
  const generated = configuration.grainProfile === null ? generateThrustCurve(configuration) : generateGrainThrustCurve({
    profile: configuration.grainProfile, totalImpulseNs: configuration.totalImpulseNs, averageThrustN: configuration.averageThrustN,
  });
  if (!generated.ok) throw new Error(generated.errors.map(error => error.message).join(' '));
  const preset = motorPresets[configuration.impulseClass];
  const curve = configuration.source === 'reference' ? referenceMotor.curve : configuration.source === 'preset' ? preset.motor.curve : generated.value;
  const motor = {
    curve, designation: configuration.source !== 'synthesized' ? preset.name : `Custom ${motorDesignation(configuration.totalImpulseNs, configuration.averageThrustN)}`,
    profileLabel: configuration.source !== 'synthesized' ? `${configuration.source === 'reference' ? 'Measured C6' : preset.name} · grain unknown` : configuration.grainProfile === null ? `${configuration.shape} basic curve` : `${grainProfileFor(configuration.grainProfile)!.name} profile`,
    totalMassKg: configuration.totalMassKg, propellantMassKg: configuration.propellantMassKg,
    diameterM: configuration.motorDiameterM, lengthM: configuration.motorLengthM,
  };
  const performance = motorPerformance(curve, motor);
  if (!performance.ok) throw new Error(performance.errors.map(error => error.message).join(' '));
  const halfwayImpulseNs = createCurveEvaluator(curve)(curve.burnTimeS / 2).impulseNs;
  return { motor, performance: performance.value, halfwayImpulsePercent: 100 * halfwayImpulseNs / curve.totalImpulseNs };
}

/** Bound rendering cost while retaining extrema of every plotted channel and exact events. */
export function selectPlotSamples(result: SimulationResult, buckets = 200): FlightSample[] {
  const samples = result.samples;
  if (samples.length <= buckets * 8) return [...samples];
  const selected = new Set<number>([0, samples.length - 1]);
  const keys = ['thrustN', 'altitudeM', 'velocityMS', 'accelerationMS2'] as const;
  const size = Math.ceil(samples.length / buckets);
  for (let start = 0; start < samples.length; start += size) {
    const end = Math.min(start + size, samples.length);
    for (const key of keys) {
      let min = start, max = start;
      for (let index = start + 1; index < end; index++) {
        if (samples[index]![key] < samples[min]![key]) min = index;
        if (samples[index]![key] > samples[max]![key]) max = index;
      }
      selected.add(min); selected.add(max);
    }
  }
  const retained = [...selected].map(index => samples[index]!);
  for (const event of Object.values(result.events)) if (event) retained.push(event);
  return [...new Map(retained.map(sample => [sample.timeS, sample])).values()].sort((a, b) => a.timeS - b.timeS);
}
export interface PlotSample {
  timeS: number;
  thrustN: number;
  altitudeM: number | null;
  velocityMS: number | null;
  accelerationG: number | null;
  cumulativeImpulseNs: number;
}
export function calculateFlight(configuration: Configuration, referenceMotor: ImportedMotor) {
  const { motor, performance, halfwayImpulsePercent } = configuredMotor(configuration, referenceMotor);
  const airframe = {
    dryMassKg: configuration.dryMassKg, bodyDiameterM: configuration.bodyDiameterM,
    dragCoefficient: configuration.dragCoefficient, railLengthM: configuration.railLengthM,
  };
  const result = simulateFlight({ curve: motor.curve, motor, airframe });
  const evaluate = createCurveEvaluator(motor.curve);
  const displayEnd = result.samples.at(-1)?.timeS ?? motor.curve.burnTimeS;
  const data = new Map<number, PlotSample>();
  for (const sample of selectPlotSamples(result)) {
    data.set(sample.timeS, { ...sample, accelerationG: sample.accelerationMS2 / G0, cumulativeImpulseNs: 0 });
  }
  // Keep every visible thrust knot. Restrict all plots to the integrated interval
  // so an extremely long burn does not compress a partial flight into one pixel.
  let index = 0;
  for (const point of motor.curve.points) {
    if (point.timeS > displayEnd) break;
    if (data.has(point.timeS)) continue;
    while (index + 1 < result.samples.length && result.samples[index + 1]!.timeS < point.timeS) index++;
    const left = result.samples[index], right = result.samples[index + 1];
    const interpolate = (key: 'altitudeM' | 'velocityMS' | 'accelerationMS2') => {
      if (left?.timeS === point.timeS) return left[key];
      if (!left || !right || point.timeS < left.timeS || point.timeS > right.timeS) return null;
      return left[key] + (right[key] - left[key]) * (point.timeS - left.timeS) / (right.timeS - left.timeS);
    };
    const acceleration = interpolate('accelerationMS2');
    data.set(point.timeS, {
      timeS: point.timeS, thrustN: point.thrustN, cumulativeImpulseNs: 0, altitudeM: interpolate('altitudeM'),
      velocityMS: interpolate('velocityMS'), accelerationG: acceleration === null ? null : acceleration / G0,
    });
  }
  const points = [...data.values()].sort((a, b) => a.timeS - b.timeS);
  for (const point of points) {
    const state = evaluate(point.timeS);
    point.thrustN = state.thrustN;
    point.cumulativeImpulseNs = state.impulseNs;
  }
  const extent = (key: 'altitudeM' | 'velocityMS' | 'accelerationG') => points.reduce<[number, number]>((range, point) => {
    const value = point[key];
    return value === null ? range : [Math.min(range[0], value), Math.max(range[1], value)];
  }, [0, 0]);
  const range = (key: 'altitudeM' | 'velocityMS' | 'accelerationG') => {
    const [min, max] = extent(key);
    return axisRange(min * 1.1, max * 1.1, 4);
  };
  return {
    configuration, motor, airframe, performance, halfwayImpulsePercent, data: points, metrics: result.metrics,
    playback: playbackSamples(result, motor.curve),
    flight: { status: result.status, events: result.events, diagnostics: result.diagnostics },
    lastTimeS: result.samples.at(-1)?.timeS ?? 0,
    shownImpulseNs: evaluate(displayEnd).impulseNs,
    fullBurnShown: displayEnd >= motor.curve.burnTimeS,
    axes: {
      time: axisRange(0, points.at(-1)?.timeS ?? motor.curve.burnTimeS, 7),
      thrust: axisRange(0, points.reduce((max, point) => Math.max(max, point.thrustN), 0) * 1.1, 4),
      impulse: axisRange(0, motor.curve.totalImpulseNs, 4),
      altitude: range('altitudeM'), velocity: range('velocityMS'), acceleration: range('accelerationG'),
    },
  };
}
export type FlightView = ReturnType<typeof calculateFlight>;
export type WorkerReply = { ok: true; value: FlightView } | { ok: false; message: string };
