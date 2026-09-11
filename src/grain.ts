import { createThrustCurve } from './curve.js';
import type { Result, ThrustCurve, ThrustPoint } from './types.js';

export type GrainProfileId = 'tubular' | 'rod-and-tube' | 'double-anchor' | 'star' | 'multi-fin' | 'dual-composition';
export interface GrainProfileDefinition {
  readonly id: GrainProfileId;
  readonly name: string;
  readonly behavior: string;
  readonly description: string;
  /** Dimensionless illustration coordinates: [fraction of burn time, relative thrust]. */
  readonly knots: readonly (readonly [number, number])[];
}

/** Qualitative teaching templates based on the supplied reference diagram, not motor measurements. */
export const GRAIN_PROFILES: readonly GrainProfileDefinition[] = Object.freeze(([
  {
    id: 'tubular', name: 'Tubular', behavior: 'Progressive', description: 'Thrust builds toward the end of the burn.',
    knots: [[0, 0], [0.02, 0.4], [0.1, 0.45], [0.45, 0.8], [0.9, 1.5], [0.94, 1.65], [1, 0]],
  },
  {
    id: 'rod-and-tube', name: 'Rod and tube', behavior: 'Neutral', description: 'A level thrust plateau delivers impulse steadily.',
    knots: [[0, 0], [0.025, 1], [0.92, 1], [1, 0]],
  },
  {
    id: 'double-anchor', name: 'Double anchor', behavior: 'Regressive', description: 'Thrust starts high and falls through the burn.',
    knots: [[0, 0], [0.025, 1.6], [0.15, 1.35], [0.65, 0.65], [0.94, 0.4], [1, 0]],
  },
  {
    id: 'star', name: 'Star', behavior: 'Near-neutral', description: 'Thrust stays nearly level, with a shallow dip in the middle.',
    knots: [[0, 0], [0.03, 1], [0.12, 1.04], [0.35, 0.95], [0.65, 0.95], [0.8, 1.06], [0.87, 1.03], [1, 0]],
  },
  {
    id: 'multi-fin', name: 'Multi-fin', behavior: 'Boost then sustain', description: 'A short initial boost is followed by sustained lower thrust.',
    knots: [[0, 0], [0.02, 2.5], [0.055, 2.3], [0.12, 0.65], [0.22, 0.35], [0.9, 0.35], [1, 0]],
  },
  {
    id: 'dual-composition', name: 'Dual composition', behavior: 'Two-step thrust', description: 'An initial boost and a later second pulse surround a low-thrust interval. Composition is not modeled.',
    knots: [[0, 0], [0.025, 2.3], [0.065, 1.5], [0.14, 0.35], [0.55, 0.35], [0.65, 0.45], [0.72, 1.3], [0.78, 1.45], [0.86, 0.55], [1, 0]],
  },
] satisfies GrainProfileDefinition[]).map(profile => Object.freeze({
  ...profile, knots: Object.freeze(profile.knots.map(knot => Object.freeze(knot))),
})));

export function grainProfileFor(id: unknown): GrainProfileDefinition | null {
  return GRAIN_PROFILES.find(profile => profile.id === id) ?? null;
}

export interface GrainCurveRequest {
  readonly profile: GrainProfileId;
  readonly totalImpulseNs: number;
  readonly averageThrustN: number;
}

/** Changes impulse delivery timing while preserving requested impulse and I / Favg burn duration. */
export function generateGrainThrustCurve(request: GrainCurveRequest): Result<ThrustCurve> {
  const profile = grainProfileFor(request.profile);
  if (!profile) return { ok: false, errors: [{ code: 'grain-profile', message: 'Choose a supported grain profile.' }] };
  const { totalImpulseNs, averageThrustN } = request;
  if (!Number.isFinite(totalImpulseNs) || totalImpulseNs <= 0 || !Number.isFinite(averageThrustN) || averageThrustN <= 0) {
    return { ok: false, errors: [{ code: 'curve-parameters', message: 'Total impulse and average thrust must be finite and greater than zero.' }] };
  }
  const burnTimeS = totalImpulseNs / averageThrustN;
  if (!Number.isFinite(burnTimeS) || burnTimeS <= 0) {
    return { ok: false, errors: [{ code: 'burn-time', message: 'Derived burn time is outside the finite numeric range.' }] };
  }
  let segment = 0;
  const points: ThrustPoint[] = Array.from({ length: 1001 }, (_, index) => {
    const fraction = index / 1000;
    while (segment < profile.knots.length - 2 && profile.knots[segment + 1]![0] < fraction) segment++;
    const [leftTime, leftThrust] = profile.knots[segment]!;
    const [rightTime, rightThrust] = profile.knots[segment + 1]!;
    const blend = (fraction - leftTime) / (rightTime - leftTime);
    return { timeS: fraction * burnTimeS, thrustN: leftThrust * (1 - blend) + rightThrust * blend };
  });
  const unscaled = createThrustCurve(points, 'synthesized');
  if (!unscaled.ok) return unscaled;
  const scale = totalImpulseNs / unscaled.value.totalImpulseNs;
  return createThrustCurve(points.map(point => ({ ...point, thrustN: point.thrustN * scale })), 'synthesized');
}
