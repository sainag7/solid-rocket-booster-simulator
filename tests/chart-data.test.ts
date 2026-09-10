import { describe, expect, test } from 'vitest';
import { G0, simulateFlight } from '../src/index.js';
import { axisLabel, axisRange, flightPlotData } from '../web/chart-data.js';
import { c6Configuration } from './helpers.js';

describe('chart data preserves the reference flight', () => {
  test('retains every physics sample, narrow thrust peak, and event', () => {
    const flight = simulateFlight(c6Configuration);
    const plotted = flightPlotData(flight);
    expect(plotted).toHaveLength(flight.samples.length);
    for (const event of Object.values(flight.events)) {
      if (event) {
        const sample = plotted.find(point => point.timeS === event.timeS)!;
        const { accelerationMS2, ...eventState } = event;
        expect(sample).toMatchObject(eventState);
        // At liftoff, support drops away; roundoff can leave a tiny net acceleration.
        expect(sample.accelerationMS2).toBeCloseTo(accelerationMS2, 12);
      }
    }
    expect(plotted.reduce((peak, sample) => Math.max(peak, sample.thrustN), 0)).toBe(14.09);
    expect(plotted.every((sample, index) => sample.accelerationG === flight.samples[index]!.accelerationMS2 / G0)).toBe(true);
    expect(plotted.at(-1)!.altitudeM).toBe(flight.metrics!.apogeeM);
    expect(plotted.at(-1)!.velocityMS).toBe(0);
  });
  test('uses identical numeric time limits for a full C6 flight', () => {
    const flight = simulateFlight(c6Configuration);
    const time = axisRange(0, flight.metrics!.timeToApogeeS!, 7);
    expect(time.domain).toEqual([0, 7]);
    expect(time.ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('legible finite axis bounds', () => {
  test.each([[0, 0], [0, 0.000001], [0, 0.0025], [-1, 14.5], [0, 40960], [0, 600], [0, 1e10], [-100, -20]])('contains the plotted range [%s, %s]', (min, max) => {
    const axis = axisRange(min, max);
    expect(axis.domain[0]).toBeLessThanOrEqual(min);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(max);
    expect(axis.domain[1]).toBeGreaterThan(axis.domain[0]);
    expect(axis.ticks.every(Number.isFinite)).toBe(true);
    expect(axis.ticks.length).toBeGreaterThan(1);
    expect(axis.ticks.length).toBeLessThanOrEqual(10);
    expect(axis.ticks.every((tick, i) => i === 0 || tick > axis.ticks[i - 1]!)).toBe(true);
  });
  test('provides a defined empty/invalid-data fallback', () => {
    expect(axisRange(NaN, Infinity).domain).toEqual([0, 1]);
    expect(axisLabel(40960)).toBe('41k');
    expect(axisLabel(0.000001)).toBe('1.0e-6');
    expect(axisLabel(0)).toBe('0');
  });
});
