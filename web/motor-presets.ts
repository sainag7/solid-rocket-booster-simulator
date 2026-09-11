import { parseEng } from '../src/eng.js';
import { classifyImpulse, IMPULSE_CLASSES } from '../src/impulse.js';
import type { ImpulseClass } from '../src/impulse.js';
import type { ImportedMotor } from '../src/types.js';
import { motorData } from './motor-data.js';

export interface MotorPreset {
  id: ImpulseClass;
  name: string;
  sourceUrl: string;
  motorUrl: string;
  source: string;
  license: string;
  motor: ImportedMotor;
}
const presets: Partial<Record<ImpulseClass, MotorPreset>> = {};
for (const record of motorData) {
  const parsed = parseEng(record.eng, record.sourceUrl);
  if (!parsed.ok) throw new Error(`Invalid bundled ${record.id} motor: ${parsed.errors.map(error => error.message).join(' ')}`);
  const motor = parsed.value[0]!;
  if (parsed.value.length !== 1 || classifyImpulse(motor.curve.totalImpulseNs)?.letter !== record.id) throw new Error(`Bundled motor class mismatch: ${record.id}`);
  const id = record.id as ImpulseClass;
  presets[id] = { id, name: record.name, sourceUrl: record.sourceUrl, motorUrl: record.motorUrl, source: record.source, license: record.license, motor };
}
for (const band of IMPULSE_CLASSES) if (!presets[band.letter]) throw new Error(`Missing class ${band.letter} motor preset`);
export const motorPresets = presets as Record<ImpulseClass, MotorPreset>;
