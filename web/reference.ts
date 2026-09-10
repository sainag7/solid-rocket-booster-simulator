import c6Text from '../tests/fixtures/estes-c6.eng?raw';
import { motorPerformance, parseEng, simulateFlight } from '../src/index.js';
import { axisRange, flightPlotData } from './chart-data.js';

function loadReference() {
  const parsed = parseEng(c6Text, 'NAR C6 certification data');
  if (!parsed.ok) throw new Error(parsed.errors.map(error => error.message).join(' '));
  const motor = parsed.value[0]!;
  const airframe = { dryMassKg: 0.0709, bodyDiameterM: 0.042, dragCoefficient: 0.45, railLengthM: 1.8 };
  const flight = simulateFlight({ curve: motor.curve, motor, airframe });
  if (flight.status !== 'apogee' || !flight.metrics) throw new Error('The reference flight did not reach apogee.');
  const performance = motorPerformance(motor.curve, motor);
  if (!performance.ok) throw new Error('The reference motor data could not be evaluated.');
  const data = flightPlotData(flight);
  const minAcceleration = data.reduce((min, sample) => Math.min(min, sample.accelerationG), 0);
  return {
    motor, airframe, flight, metrics: flight.metrics, performance: performance.value, data,
    axes: {
      time: axisRange(0, flight.metrics.timeToApogeeS!, 7),
      thrust: axisRange(0, motor.curve.peakThrustN * 1.1, 4),
      altitude: axisRange(0, flight.metrics.apogeeM! * 1.1, 4),
      velocity: axisRange(0, flight.metrics.maxVelocityMS * 1.1, 4),
      acceleration: axisRange(minAcceleration, flight.metrics.maxAccelerationG * 1.1, 4),
    },
  };
}

export type ReferenceFlight = ReturnType<typeof loadReference>;

// One deterministic run per module load; theme changes never repeat the simulation.
export const reference = (() => {
  try { return { ok: true as const, value: loadReference() }; }
  catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : 'Reference data is unavailable.' }; }
})();
