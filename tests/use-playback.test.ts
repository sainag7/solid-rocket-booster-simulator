/// <reference lib="dom" />
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { usePlayback } from '../web/use-playback.js';
import type { Playback } from '../web/use-playback.js';
import { calculateFlight } from '../web/flight-view.js';
import type { FlightView } from '../web/flight-view.js';
import { initialConfiguration, selectClass } from '../web/configuration.js';
import { c6 } from './helpers.js';
const flight = calculateFlight(initialConfiguration(c6), c6);
let current: Playback, root: ReactTestRenderer;
let now = 0, nextId = 1;
let callbacks: Map<number, FrameRequestCallback>;
let documentMock: EventTarget & { hidden: boolean };
function Probe(props: { view: FlightView | null; pending: boolean }) { current = usePlayback(props.view, props.pending); return null; }
function mount(view: FlightView | null = flight, pending = false) { act(() => { root = create(createElement(Probe, { view, pending })); }); }
function advance(seconds: number) {
  // One display frame at a time, including telemetry's publication interval.
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i++) {
    now += seconds * 1000 / steps;
    const scheduled = [...callbacks.values()]; callbacks.clear();
    act(() => { scheduled.forEach(callback => callback(now)); });
  }
}
beforeEach(() => {
  now = 0; nextId = 1; callbacks = new Map();
  documentMock = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', documentMock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = nextId++; callbacks.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => { if (root) act(() => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('launch, pause, resume, scrub, and replay share one clock', () => {
  mount(); expect(current.playing).toBe(false); expect(current.timeS).toBe(0);
  act(() => current.toggle()); advance(1);
  expect(current.clock.current).toBeCloseTo(1, 8);
  act(() => current.toggle()); const paused = current.timeS; advance(1);
  expect(current.timeS).toBe(paused); expect(current.clock.current).toBe(paused);
  act(() => current.toggle()); advance(0.5);
  expect(current.clock.current).toBeCloseTo(1.5, 8);
  act(() => current.seek(flight.motor.curve.burnTimeS));
  expect(current.playing).toBe(false);
  expect(current.state!.thrustN).toBe(0);
  expect(current.state!.impulseNs).toBeCloseTo(flight.motor.curve.totalImpulseNs, 10);
  act(() => current.replay());
  expect(current.timeS).toBe(0); expect(current.playing).toBe(true);
});
test.each([0.25, 1, 4])('actual playback speed %s reaches the correct timestamp', speed => {
  mount(); act(() => current.setSpeed(speed)); act(() => current.toggle()); advance(1);
  expect(current.clock.current).toBeCloseTo(speed, 8);
  advance(30);
  expect(current.clock.current).toBe(flight.lastTimeS);
  expect(current.timeS).toBe(flight.lastTimeS);
  expect(current.playing).toBe(false);
  expect(callbacks.size).toBe(0);
});
test('editing during flight resets and disables launch until the matching result arrives', () => {
  mount(); act(() => current.toggle()); advance(0.5);
  act(() => root.update(createElement(Probe, { view: flight, pending: true })));
  expect(current.timeS).toBe(0); expect(current.clock.current).toBe(0);
  expect(current.playing).toBe(false); expect(current.valid).toBe(false);
  act(() => current.toggle()); expect(current.playing).toBe(false);
  const updated = calculateFlight(selectClass(initialConfiguration(c6), 'O'), c6);
  act(() => root.update(createElement(Probe, { view: updated, pending: false })));
  expect(current.timeS).toBe(0); expect(current.playing).toBe(false); expect(current.valid).toBe(true);
  act(() => current.toggle()); advance(0.5);
  expect(current.clock.current).toBeCloseTo(0.5, 8);
  expect(current.state!.massKg).toBeGreaterThan(10);
});
test('hidden tabs pause without catching up on return', () => {
  mount(); act(() => current.toggle()); advance(0.3);
  act(() => { documentMock.hidden = true; documentMock.dispatchEvent(new Event('visibilitychange')); });
  const paused = current.timeS;
  advance(5); expect(current.timeS).toBe(paused); expect(current.playing).toBe(false);
  act(() => { documentMock.hidden = false; documentMock.dispatchEvent(new Event('visibilitychange')); });
  advance(1); expect(current.timeS).toBe(paused);
  act(() => current.toggle()); advance(0.2); expect(current.clock.current).toBeCloseTo(paused + 0.2, 8);
});
test('calculation failure leaves playback unavailable', () => {
  mount(null, false); expect(current.valid).toBe(false); expect(current.state).toBeNull();
  act(() => current.replay()); expect(current.playing).toBe(false);
});
