import { createCurveEvaluator } from '../src/curve.js';
import type { FlightSample, SimulationResult, ThrustCurve } from '../src/types.js';

export type PlaybackSample = Pick<FlightSample, 'timeS' | 'altitudeM' | 'velocityMS' | 'accelerationMS2' | 'massKg'>;

/** Dedicated 100 Hz motion stream plus every knot/event, independent of chart decimation. */
export function playbackSamples(result: SimulationResult, curve: ThrustCurve): PlaybackSample[] {
  const retained = new Map<number, PlaybackSample>();
  let nextTime = 0, knot = 0;
  for (const sample of result.samples) {
    const atKnot = curve.points[knot]?.timeS === sample.timeS;
    if (sample.timeS >= nextTime || atKnot) {
      retained.set(sample.timeS, pick(sample));
      nextTime = Math.max(nextTime, sample.timeS + 0.01 - 1e-10);
    }
    while (knot < curve.points.length && curve.points[knot]!.timeS <= sample.timeS) knot++;
  }
  for (const event of Object.values(result.events)) if (event) retained.set(event.timeS, pick(event));
  const last = result.samples.at(-1);
  if (last) retained.set(last.timeS, pick(last));
  return [...retained.values()].sort((a, b) => a.timeS - b.timeS);
}
function pick(s: FlightSample): PlaybackSample {
  return { timeS: s.timeS, altitudeM: s.altitudeM, velocityMS: s.velocityMS, accelerationMS2: s.accelerationMS2, massKg: s.massKg };
}
export function createPlaybackEvaluator(samples: readonly PlaybackSample[], curve: ThrustCurve) {
  const evaluateCurve = createCurveEvaluator(curve);
  return (requestedTime: number) => {
    const timeS = Math.max(0, Math.min(Number.isFinite(requestedTime) ? requestedTime : 0, samples.at(-1)?.timeS ?? 0));
    let low = 0, high = samples.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >>> 1;
      if (samples[middle]!.timeS <= timeS) low = middle; else high = middle;
    }
    const a = samples[low], b = samples[high];
    const fraction = a && b && b.timeS > a.timeS ? (timeS - a.timeS) / (b.timeS - a.timeS) : 0;
    const lerp = (key: Exclude<keyof PlaybackSample, 'timeS'>) => a ? a[key] + ((b?.[key] ?? a[key]) - a[key]) * fraction : 0;
    return { timeS, altitudeM: lerp('altitudeM'), velocityMS: lerp('velocityMS'), accelerationMS2: lerp('accelerationMS2'), massKg: lerp('massKg'), ...evaluateCurve(timeS) };
  };
}
export function advancePlayback(timeS: number, elapsedS: number, speed: number, endS: number) {
  return Math.min(endS, Math.max(0, timeS + Math.max(0, elapsedS) * speed));
}
export function flightPhase(timeS: number, result: Pick<SimulationResult, 'status' | 'events'>, endS: number, burnTimeS: number): string {
  if (timeS >= endS && endS > 0) return result.status === 'apogee' ? 'Apogee' : result.status === 'no-liftoff' ? 'No liftoff' : 'Simulation limit';
  if (timeS === 0) return 'Ready on pad';
  if (!result.events.liftoff || timeS < result.events.liftoff.timeS) return 'Ignition · on pad';
  return timeS < burnTimeS ? 'Powered ascent' : 'Coasting';
}
