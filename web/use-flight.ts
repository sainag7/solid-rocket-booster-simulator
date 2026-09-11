import { useEffect, useState } from 'react';
import type { Configuration } from './configuration.js';
import type { FlightView, WorkerReply } from './flight-view.js';

export function useFlight(configuration: Configuration, retry: number) {
  const [completed, setCompleted] = useState<{ configuration: Configuration; retry: number; value: FlightView | null; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    let worker: Worker | undefined;
    const failed = (message: string) => {
      if (active) setCompleted({ configuration, retry, value: null, error: message });
    };
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('./flight.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          if (!active) return;
          const reply = event.data;
          if (reply.ok) setCompleted({ configuration, retry, value: reply.value, error: null });
          else failed(reply.message);
          worker?.terminate();
        };
        worker.onerror = () => { failed('The flight calculation could not start. Reload the page or retry.'); worker?.terminate(); };
        worker.postMessage(configuration);
      } catch (error) { failed(error instanceof Error ? error.message : 'This browser could not start a flight calculation.'); }
    }, 50);
    // Cancel superseded work; an older flight must never replace the latest result.
    return () => { active = false; window.clearTimeout(timer); worker?.terminate(); };
  }, [configuration, retry]);
  return { view: completed?.value ?? null, error: completed?.error ?? null, pending: completed?.configuration !== configuration || completed?.retry !== retry };
}
