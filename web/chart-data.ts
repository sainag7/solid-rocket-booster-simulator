import { G0 } from '../src/constants.js';
import type { SimulationResult } from '../src/types.js';

/** Presentation conversion only: the original 1 ms/event samples stay intact. */
export function flightPlotData(result: SimulationResult) {
  return result.samples.map(sample => ({ ...sample, accelerationG: sample.accelerationMS2 / G0 }));
}

export interface AxisRange { readonly domain: [number, number]; readonly ticks: number[] }

/** Stable, legible numeric bounds shared by every time axis. Always includes zero. */
export function axisRange(minimum: number, maximum: number, targetIntervals = 5): AxisRange {
  const min = Number.isFinite(minimum) ? Math.min(0, minimum) : 0;
  const max = Number.isFinite(maximum) ? Math.max(0, maximum) : 1;
  const span = max - min || 1;
  const roughStep = span / Math.max(2, targetIntervals);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const lower = Math.floor(min / step) * step;
  const upper = Math.max(lower + step, Math.ceil(max / step) * step);
  const count = Math.round((upper - lower) / step);
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number((lower + index * step).toPrecision(12)));
  return { domain: [ticks[0]!, ticks.at(-1)!], ticks };
}

export function axisLabel(value: number): string {
  if (Math.abs(value) >= 10000) return `${Number((value / 1000).toPrecision(3))}k`;
  if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(1);
  return Number(value.toPrecision(4)).toString();
}
