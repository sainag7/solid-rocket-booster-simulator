import { useEffect, useMemo, useRef, useState } from 'react';
import type { FlightView } from './flight-view.js';
import { advancePlayback, createPlaybackEvaluator } from './playback.js';

export function usePlayback(view: FlightView | null, pending: boolean) {
  const [timeS, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clock = useRef(0);
  const evaluate = useMemo(() => view ? createPlaybackEvaluator(view.playback, view.motor.curve) : null, [view]);
  const endS = view?.lastTimeS ?? 0;
  const valid = !!view && !pending && view.flight.status !== 'invalid-input' && endS > 0;
  useEffect(() => { clock.current = 0; setTime(0); setPlaying(false); }, [view, pending]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { setTime(clock.current); setPlaying(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (!playing || !valid) return;
    let previous = performance.now(), frame = 0, lastPublished = previous;
    const tick = (now: number) => {
      clock.current = advancePlayback(clock.current, (now - previous) / 1000, speed, endS);
      previous = now;
      // Mesh motion reads the clock at display rate; React telemetry/charts update at 20 Hz.
      if (now - lastPublished >= 50 || clock.current >= endS) { setTime(clock.current); lastPublished = now; }
      if (clock.current >= endS) setPlaying(false); else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, valid, speed, endS]);
  const seek = (time: number) => {
    setPlaying(false);
    clock.current = Math.max(0, Math.min(time, endS));
    setTime(clock.current);
  };
  const toggle = () => {
    if (!valid) return;
    if (clock.current >= endS) { clock.current = 0; setTime(0); }
    if (playing) setTime(clock.current);
    setPlaying(current => !current);
  };
  const readyTime = pending ? 0 : timeS;
  return { timeS: readyTime, clock, playing: playing && valid, speed, setSpeed, seek, toggle, valid,
    replay: () => { if (valid) { clock.current = 0; setTime(0); setPlaying(true); } },
    state: evaluate?.(readyTime) ?? null, evaluate };
}
export type Playback = ReturnType<typeof usePlayback>;
