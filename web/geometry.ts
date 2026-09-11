import type { ImportedMotor } from '../src/types.js';

export interface RocketGeometry {
  bodyLengthM: number;
  noseLengthM: number;
  noseShape: 'conical' | 'ogive' | 'parabolic';
  finCount: 3 | 4;
  finRootM: number;
  finTipM: number;
  finSweepM: number;
  finSpanM: number;
  finOffsetM: number;
}
export const referenceGeometry: RocketGeometry = {
  bodyLengthM: 0.38, noseLengthM: 0.14, noseShape: 'ogive', finCount: 4,
  finRootM: 0.105, finTipM: 0.05, finSweepM: 0.045, finSpanM: 0.07, finOffsetM: 0.015,
};

/** Illustrative airframes, not kit specifications or a structural/stability model. */
export function exampleAirframe(motor: ImportedMotor) {
  const diameter = Math.max(0.025, motor.diameterM * (motor.diameterM <= 0.024 ? 2 : 1.8));
  const bodyLengthM = Math.max(diameter * 9, motor.lengthM * 1.65);
  // Entered mass is independent of geometry. This seed gives examples a useful thrust/weight range.
  const dryMassKg = Math.max(0.018, motor.curve.averageThrustN / (7 * 9.80665) - motor.totalMassKg);
  return {
    bodyDiameterM: diameter, dryMassKg, dragCoefficient: 0.45,
    bodyLengthM, noseLengthM: diameter * 2.8, noseShape: 'ogive' as const, finCount: 4 as const,
    finRootM: diameter * 2.5, finTipM: diameter * 1.1, finSweepM: diameter,
    finSpanM: diameter * 1.5, finOffsetM: diameter * 0.3,
  };
}

export function geometryIssues(c: RocketGeometry & { motorDiameterM: number; motorLengthM: number; bodyDiameterM: number }): string[] {
  const issues: string[] = [];
  if (c.motorDiameterM >= c.bodyDiameterM) issues.push('The motor is wider than the available body. Increase body diameter or reduce motor diameter.');
  if (c.motorLengthM > c.bodyLengthM) issues.push('The motor is longer than the body tube. Increase body length or reduce motor length.');
  if (c.finOffsetM + c.finRootM > c.bodyLengthM || c.finOffsetM + c.finRootM - c.finSweepM - c.finTipM < 0) issues.push('The fins extend beyond the body tube. Adjust fin dimensions or body length.');
  return issues;
}
