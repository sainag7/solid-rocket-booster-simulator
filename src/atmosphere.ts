import { AIR_GAS_CONSTANT, AIR_HEAT_CAPACITY_RATIO, G0, SEA_LEVEL_PRESSURE_PA, SEA_LEVEL_TEMPERATURE_K } from './constants.js';
import type { Atmosphere } from './types.js';

const LAPSE_RATE_K_M = 0.0065;
const TROPOPAUSE_M = 11000;
const TROPOPAUSE_K = SEA_LEVEL_TEMPERATURE_K - LAPSE_RATE_K_M * TROPOPAUSE_M;
const TROPOPAUSE_PA = SEA_LEVEL_PRESSURE_PA * (TROPOPAUSE_K / SEA_LEVEL_TEMPERATURE_K) ** (G0 / (AIR_GAS_CONSTANT * LAPSE_RATE_K_M));

/** Sea-level launch. Negative RK-stage heights use ground-level atmosphere. */
export function atmosphereAt(altitudeM: number): Atmosphere {
  if (!Number.isFinite(altitudeM)) throw new RangeError('Atmosphere altitude must be finite.');
  const height = Math.max(0, altitudeM);
  const temperatureK = height < TROPOPAUSE_M ? SEA_LEVEL_TEMPERATURE_K - LAPSE_RATE_K_M * height : TROPOPAUSE_K;
  const pressurePa = height < TROPOPAUSE_M
    ? SEA_LEVEL_PRESSURE_PA * (temperatureK / SEA_LEVEL_TEMPERATURE_K) ** (G0 / (AIR_GAS_CONSTANT * LAPSE_RATE_K_M))
    : TROPOPAUSE_PA * Math.exp(-(height - TROPOPAUSE_M) * (G0 / (AIR_GAS_CONSTANT * TROPOPAUSE_K)));
  return {
    temperatureK, pressurePa, densityKgM3: pressurePa / (AIR_GAS_CONSTANT * temperatureK),
    speedOfSoundMS: Math.sqrt(AIR_HEAT_CAPACITY_RATIO * AIR_GAS_CONSTANT * temperatureK),
    extrapolated: height > 20000,
  };
}

/** Signed force opposing motion is subtracted in the equation of motion. */
export function dragForceN(velocityMS: number, densityKgM3: number, dragCoefficient: number, areaM2: number): number {
  if (dragCoefficient === 0 || densityKgM3 === 0 || velocityMS === 0) return 0;
  return (0.5 * densityKgM3 * dragCoefficient * areaM2 * velocityMS) * Math.abs(velocityMS);
}
