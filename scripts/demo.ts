import { readFileSync } from 'node:fs';
import { motorPerformance, parseEng, simulateFlight } from '../src/index.js';

const parsed = parseEng(readFileSync(new URL('../tests/fixtures/estes-c6.eng', import.meta.url), 'utf8'), 'estes-c6.eng');
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
const motor = parsed.value[0]!;
const airframe = { dryMassKg: 0.0709, bodyDiameterM: 0.042, dragCoefficient: 0.45, railLengthM: 1.8 };
const flight = simulateFlight({ curve: motor.curve, motor, airframe });
const dragFree = simulateFlight({ curve: motor.curve, motor, airframe: { ...airframe, dragCoefficient: 0 } });
const performance = motorPerformance(motor.curve, motor);
const rounded = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  typeof item === 'number' ? Number(item.toFixed(6)) : item, 2);

console.log('Checkpoint 1 — NAR C6, Big Bertha-sized reference airframe');
console.log(rounded({
  configuration: { motor: motor.designation, airframe },
  motor: { totalImpulseNs: motor.curve.totalImpulseNs, averageThrustN: motor.curve.averageThrustN, ...(performance.ok ? performance.value : {}) },
  status: flight.status,
  metrics: flight.metrics,
  liftoffTimeS: flight.events.liftoff?.timeS,
  railExitTimeS: flight.events.railExit?.timeS,
  dragFreeApogeeM: dragFree.metrics?.apogeeM,
  manufacturerReferenceM: 152,
  samples: flight.samples.length,
  diagnostics: flight.diagnostics,
}));
console.log('Average thrust-to-weight uses average thrust / initial loaded weight.');
console.log('152 m is an approximate manufacturer comparison, not a flight calibration. See README.md.');
if (flight.status !== 'apogee' || dragFree.status !== 'apogee') process.exitCode = 1;
