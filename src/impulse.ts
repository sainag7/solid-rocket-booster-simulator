export type ImpulseClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O';
export interface ImpulseBand {
  readonly letter: ImpulseClass;
  readonly minNs: number;
  readonly maxNs: number;
  readonly tier: 'model' | 'mid-power' | 'high power';
  readonly certification: 'none' | 'L1' | 'L2' | 'L3';
}

/** starter.md is the source of truth. Lower endpoints are exclusive except A. */
export const IMPULSE_CLASSES: readonly ImpulseBand[] = Object.freeze([
  { letter: 'A', minNs: 1.26, maxNs: 2.5, tier: 'model', certification: 'none' },
  { letter: 'B', minNs: 2.5, maxNs: 5, tier: 'model', certification: 'none' },
  { letter: 'C', minNs: 5, maxNs: 10, tier: 'model', certification: 'none' },
  { letter: 'D', minNs: 10, maxNs: 20, tier: 'model', certification: 'none' },
  { letter: 'E', minNs: 20, maxNs: 40, tier: 'mid-power', certification: 'none' },
  { letter: 'F', minNs: 40, maxNs: 80, tier: 'mid-power', certification: 'none' },
  { letter: 'G', minNs: 80, maxNs: 160, tier: 'mid-power', certification: 'none' },
  { letter: 'H', minNs: 160, maxNs: 320, tier: 'high power', certification: 'L1' },
  { letter: 'I', minNs: 320, maxNs: 640, tier: 'high power', certification: 'L1' },
  { letter: 'J', minNs: 640, maxNs: 1280, tier: 'high power', certification: 'L2' },
  { letter: 'K', minNs: 1280, maxNs: 2560, tier: 'high power', certification: 'L2' },
  { letter: 'L', minNs: 2560, maxNs: 5120, tier: 'high power', certification: 'L2' },
  { letter: 'M', minNs: 5120, maxNs: 10240, tier: 'high power', certification: 'L3' },
  { letter: 'N', minNs: 10240, maxNs: 20480, tier: 'high power', certification: 'L3' },
  { letter: 'O', minNs: 20480, maxNs: 40960, tier: 'high power', certification: 'L3' },
].map(band => Object.freeze(band)) as ImpulseBand[]);

export function classifyImpulse(totalImpulseNs: number): ImpulseBand | null {
  if (!Number.isFinite(totalImpulseNs) || totalImpulseNs < 1.26) return null;
  return IMPULSE_CLASSES.find(band => totalImpulseNs <= band.maxNs) ?? null;
}

/** Propellant codes are optional metadata; no code is inferred from a curve. */
export function motorDesignation(totalImpulseNs: number, averageThrustN: number, propellantCode = ''): string | null {
  const band = classifyImpulse(totalImpulseNs);
  if (!band || !Number.isFinite(averageThrustN) || averageThrustN <= 0) return null;
  const thrust = averageThrustN >= 1 ? Math.round(averageThrustN).toString() : averageThrustN.toPrecision(2);
  return `${band.letter}${thrust}${propellantCode}`;
}
