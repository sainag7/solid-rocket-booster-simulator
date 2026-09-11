import { calculateFlight } from './flight-view.js';
import { referenceMotor } from './reference.js';
import type { Configuration } from './configuration.js';
import type { WorkerReply } from './flight-view.js';

self.onmessage = (event: MessageEvent<Configuration>) => {
  let reply: WorkerReply;
  try { reply = { ok: true, value: calculateFlight(event.data, referenceMotor) }; }
  catch (error) { reply = { ok: false, message: error instanceof Error ? error.message : 'The flight calculation failed.' }; }
  self.postMessage(reply);
};
