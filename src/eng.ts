import { createThrustCurve, validateMotorMass } from './curve.js';
import type { ImportedMotor, Result, ThrustCurve, ThrustPoint } from './types.js';

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const numeric = (token: string | undefined): number => token && DECIMAL.test(token) ? Number(token) : NaN;

interface Entry {
  designation: string;
  manufacturer: string;
  diameterM: number;
  lengthM: number;
  delays: string;
  propellantMassKg: number;
  totalMassKg: number;
  headerLine: number;
  rawHeader: string;
  comments: string[];
  points: ThrustPoint[];
  explicitOrigin: boolean;
  curve: ThrustCurve | null;
}

/** Atomic import: one malformed entry rejects the file, never silently drops a motor. */
export function parseEng(text: string, sourceName?: string): Result<readonly ImportedMotor[]> {
  const fail = (line: number, message: string): Result<readonly ImportedMotor[]> => ({
    ok: false, errors: [{ code: 'eng-format', line, message: `Line ${line}: ${message}` }],
  });
  if (typeof text !== 'string') return fail(1, 'Expected RASP file text.');
  const motors: ImportedMotor[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
  let entry: Entry | null = null;
  let pendingComments: string[] = [];
  const finish = (complete: Entry): void => {
    motors.push({
      designation: complete.designation, manufacturer: complete.manufacturer,
      diameterM: complete.diameterM, lengthM: complete.lengthM, delays: complete.delays,
      propellantMassKg: complete.propellantMassKg, totalMassKg: complete.totalMassKg,
      curve: complete.curve!, metadata: {
        sourceName: sourceName ?? null, headerLine: complete.headerLine,
        rawHeader: complete.rawHeader, comments: complete.comments,
      },
    });
  };

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index]!.trim();
    if (!line) continue;
    if (line.startsWith(';')) {
      if (entry && !entry.curve) entry.comments.push(line);
      else pendingComments.push(line);
      continue;
    }
    const tokens = line.split(/\s+/);
    if (!entry || entry.curve) {
      if (tokens.length !== 7) return fail(lineNumber, 'Expected a seven-field motor header; data cannot follow terminal zero thrust.');
      const diameterMm = numeric(tokens[1]);
      const lengthMm = numeric(tokens[2]);
      if (!Number.isFinite(diameterMm) || diameterMm <= 0 || !Number.isFinite(lengthMm) || lengthMm <= 0
        || diameterMm / 1000 === 0 || lengthMm / 1000 === 0) {
        return fail(lineNumber, 'Motor diameter and length must be positive finite millimetres.');
      }
      const delays = tokens[3]!;
      if (!delays.split('-').every(delay => delay === 'P' || (Number.isFinite(numeric(delay)) && numeric(delay) >= 0))) {
        return fail(lineNumber, 'Delays must be nonnegative numbers separated by hyphens, or P.');
      }
      const motor = { propellantMassKg: numeric(tokens[4]), totalMassKg: numeric(tokens[5]) };
      const massErrors = validateMotorMass(motor);
      if (massErrors.length) return fail(lineNumber, massErrors.map(error => error.message).join(' '));
      if (entry) finish(entry);
      entry = {
        ...motor, designation: tokens[0]!, manufacturer: tokens[6]!,
        diameterM: diameterMm / 1000, lengthM: lengthMm / 1000, delays,
        headerLine: lineNumber, rawHeader: line, comments: pendingComments,
        points: [{ timeS: 0, thrustN: 0 }], explicitOrigin: false, curve: null,
      };
      pendingComments = [];
      continue;
    }
    if (tokens.length !== 2) return fail(lineNumber, 'Expected time and thrust; the motor must end with zero thrust before another header.');
    const timeS = numeric(tokens[0]);
    const thrustN = numeric(tokens[1]);
    if (!Number.isFinite(timeS) || timeS < 0 || !Number.isFinite(thrustN) || thrustN < 0) {
      return fail(lineNumber, 'Time and thrust must be finite, nonnegative decimal numbers.');
    }
    // Tolerate an explicit origin, a common nonstandard but unambiguous export.
    if (entry.points.length === 1 && timeS === 0 && thrustN === 0) {
      if (entry.explicitOrigin) return fail(lineNumber, 'Duplicate origin point.');
      entry.explicitOrigin = true;
      continue;
    }
    if (timeS <= entry.points.at(-1)!.timeS) return fail(lineNumber, 'Sample times must be strictly increasing.');
    entry.points.push({ timeS, thrustN });
    if (thrustN === 0) {
      const curve = createThrustCurve(entry.points, 'imported');
      if (!curve.ok) return fail(lineNumber, curve.errors[0]!.message);
      entry.curve = curve.value;
    }
  }
  if (entry && !entry.curve) return fail(lines.length, `Motor ${entry.designation} is missing a terminal zero-thrust point.`);
  if (entry) {
    entry.comments.push(...pendingComments);
    finish(entry);
  }
  if (!motors.length) return fail(1, 'No motor records were found.');
  return { ok: true, value: motors };
}
