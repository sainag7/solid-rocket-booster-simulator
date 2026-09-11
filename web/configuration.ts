import { createStore } from 'zustand/vanilla';
import { IMPULSE_CLASSES } from '../src/impulse.js';
import { grainProfileFor } from '../src/grain.js';
import type { GrainProfileId } from '../src/grain.js';
import type { ImpulseClass } from '../src/impulse.js';
import { motorPresets } from './motor-presets.js';
import { exampleAirframe, referenceGeometry } from './geometry.js';
import type { RocketGeometry } from './geometry.js';
import type { CurveShape, ImportedMotor } from '../src/types.js';

export interface Configuration extends RocketGeometry {
  presetId: string;
  modified: boolean;
  source: 'reference' | 'preset' | 'synthesized';
  impulseClass: ImpulseClass;
  totalImpulseNs: number;
  averageThrustN: number;
  shape: CurveShape;
  grainProfile: GrainProfileId | null;
  holdImpulse: boolean;
  totalMassKg: number;
  propellantMassKg: number;
  motorDiameterM: number;
  motorLengthM: number;
  dryMassKg: number;
  bodyDiameterM: number;
  dragCoefficient: number;
  railLengthM: number;
  railIsCustom: boolean;
}
export type NumericParameter = 'totalImpulseNs' | 'averageThrustN' | 'totalMassKg' | 'propellantMassKg' |
  'motorDiameterM' | 'motorLengthM' | 'dryMassKg' | 'bodyDiameterM' | 'dragCoefficient' | 'railLengthM' | 'bodyLengthM' | 'noseLengthM' | 'finRootM' | 'finTipM' | 'finSweepM' | 'finSpanM' | 'finOffsetM';
export type Bounds = readonly [number, number];
export const clamp = (value: number, bounds: Bounds) => Math.max(bounds[0], Math.min(bounds[1], value));
export const bandFor = (letter: ImpulseClass) => IMPULSE_CLASSES.find(band => band.letter === letter)!;

// A 0.001 N·s entry resolution keeps shared boundaries in the lower class.
export function impulseBounds(letter: ImpulseClass): Bounds {
  const band = bandFor(letter);
  return [letter === 'A' ? band.minNs : band.minNs + 0.001, band.maxNs];
}
export function boundsFor(key: NumericParameter, configuration: Configuration): Bounds {
  if (key === 'totalImpulseNs') return impulseBounds(configuration.impulseClass);
  if (key === 'averageThrustN') {
    if (configuration.holdImpulse) return [0.01, 100000];
    const duration = configuration.totalImpulseNs / configuration.averageThrustN;
    const [min, max] = impulseBounds(configuration.impulseClass);
    return [Math.max(0.01, min / duration), Math.min(100000, max / duration)];
  }
  const bounds: Record<Exclude<NumericParameter, 'totalImpulseNs' | 'averageThrustN'>, Bounds> = {
    bodyLengthM: [0.05, 30], noseLengthM: [0.01, 10], finRootM: [0.005, 10], finTipM: [0.001, 10],
    finSweepM: [0, 10], finSpanM: [0.005, 5], finOffsetM: [0, 10],
    totalMassKg: [0.001, 500], propellantMassKg: [0, configuration.totalMassKg * 0.99],
    motorDiameterM: [0.005, 1], motorLengthM: [0.02, 6], dryMassKg: [0.005, 1000],
    bodyDiameterM: [0.01, 2], dragCoefficient: [0.2, 1], railLengthM: [0.1, 20],
  };
  return bounds[key];
}
export function initialConfiguration(motor: ImportedMotor): Configuration {
  return {
    ...referenceGeometry, presetId: 'C', modified: false,
    source: 'reference', impulseClass: 'C', totalImpulseNs: motor.curve.totalImpulseNs,
    averageThrustN: motor.curve.averageThrustN, shape: 'neutral', grainProfile: null, holdImpulse: true,
    totalMassKg: motor.totalMassKg, propellantMassKg: motor.propellantMassKg,
    motorDiameterM: motor.diameterM, motorLengthM: motor.lengthM,
    dryMassKg: 0.0709, bodyDiameterM: 0.042, dragCoefficient: 0.45,
    railLengthM: 1.8, railIsCustom: false,
  };
}
export function selectClass(current: Configuration, letter: ImpulseClass): Configuration {
  const preset = motorPresets[letter];
  const motor = preset.motor;
  const reference = letter === 'C';
  return {
    ...current, ...(reference ? { ...referenceGeometry, dryMassKg: 0.0709, bodyDiameterM: 0.042, dragCoefficient: 0.45 } : exampleAirframe(motor)),
    // A chosen grain remains active when a new class seeds motor/airframe values.
    source: current.grainProfile ? 'synthesized' : reference ? 'reference' : 'preset',
    presetId: letter, modified: current.grainProfile !== null, impulseClass: letter,
    totalImpulseNs: motor.curve.totalImpulseNs, averageThrustN: motor.curve.averageThrustN,
    totalMassKg: motor.totalMassKg, propellantMassKg: motor.propellantMassKg,
    motorDiameterM: motor.diameterM, motorLengthM: motor.lengthM, shape: 'neutral',
    railLengthM: current.railIsCustom ? current.railLengthM : bandFor(letter).tier === 'high power' ? 2.4 : 1.8,
  };
}

export function changeNumber(current: Configuration, key: NumericParameter, input: number): Configuration {
  if (!Number.isFinite(input)) return current;
  const value = clamp(input, boundsFor(key, current));
  const next = { ...current, [key]: value, modified: true };
  if (key === 'averageThrustN' || key === 'totalImpulseNs') next.source = 'synthesized';
  if (key === 'averageThrustN' && !current.holdImpulse) {
    next.totalImpulseNs = clamp(value * current.totalImpulseNs / current.averageThrustN, impulseBounds(current.impulseClass));
  }
  if (key === 'totalMassKg') next.propellantMassKg = Math.min(current.propellantMassKg, value * 0.99);
  if (key === 'railLengthM') next.railIsCustom = true;
  return next;
}

export function selectGrainProfile(current: Configuration, profile: GrainProfileId): Configuration {
  if (!grainProfileFor(profile)) throw new RangeError('Choose a supported grain profile.');
  return { ...current, source: 'synthesized', modified: true, grainProfile: profile };
}
export function fromSlider(position: number, bounds: Bounds, logarithmic: boolean): number {
  const fraction = clamp(position, [0, 1000]) / 1000;
  if (fraction === 0) return bounds[0];
  if (fraction === 1) return bounds[1];
  return logarithmic ? bounds[0] * (bounds[1] / bounds[0]) ** fraction : bounds[0] + (bounds[1] - bounds[0]) * fraction;
}
export function toSlider(value: number, bounds: Bounds, logarithmic: boolean): number {
  if (bounds[0] === bounds[1]) return 0;
  return 1000 * (logarithmic ? Math.log(value / bounds[0]) / Math.log(bounds[1] / bounds[0]) : (value - bounds[0]) / (bounds[1] - bounds[0]));
}
export function createLabStore(initial: Configuration) {
  return createStore<{
    configuration: Configuration;
    selectClass: (letter: ImpulseClass) => void;
    setNumber: (key: NumericParameter, value: number) => void;
    setShape: (shape: CurveShape) => void;
    setGrainProfile: (profile: GrainProfileId) => void;
    setHoldImpulse: (hold: boolean) => void;
    setGeometryChoice: (key: 'noseShape' | 'finCount', value: RocketGeometry['noseShape'] | RocketGeometry['finCount']) => void;
    reset: () => void;
  }>()(set => ({
    configuration: initial,
    selectClass: letter => set(state => ({ configuration: selectClass(state.configuration, letter) })),
    setNumber: (key, value) => set(state => ({ configuration: changeNumber(state.configuration, key, value) })),
    setShape: shape => set(state => ({ configuration: { ...state.configuration, source: 'synthesized', modified: true, shape, grainProfile: null } })),
    setGrainProfile: profile => set(state => ({ configuration: selectGrainProfile(state.configuration, profile) })),
    setHoldImpulse: holdImpulse => set(state => ({ configuration: { ...state.configuration, holdImpulse } })),
    setGeometryChoice: (key, value) => set(state => {
      if (key === 'finCount' && (value === 3 || value === 4)) return { configuration: { ...state.configuration, finCount: value, modified: true } };
      if (key === 'noseShape' && (value === 'conical' || value === 'ogive' || value === 'parabolic')) return { configuration: { ...state.configuration, noseShape: value, modified: true } };
      return state;
    }),
    reset: () => set({ configuration: initial }),
  }));
}
