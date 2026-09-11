import { IMPULSE_CLASSES } from '../src/impulse.js';
import { GRAIN_PROFILES, grainProfileFor } from '../src/grain.js';
import type { ImpulseClass } from '../src/impulse.js';
import type { createLabStore } from './configuration.js';

export interface LabTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}

/** Another entry point to the same selection actions as the visible buttons. */
export function createLabTools(store: ReturnType<typeof createLabStore>, updateVisible: (action: () => void) => void): LabTool[] {
  return [
    {
      name: 'read_flight_configuration',
      description: 'Read the current in-memory rocket configuration in SI units. Flight results may still be calculating.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Provide an empty object.');
        return { ...store.getState().configuration };
      },
    },
    {
      name: 'configure_motor_class',
      description: 'Select a motor class A–O, updating the visible controls and starting a new flight calculation. Loads a sourced motor and matching example airframe, replacing impulse, thrust, motor mass/dimensions, airframe mass/dimensions, and geometry. Preserves an explicitly entered rail length. Returns configuration, not completed flight results.',
      inputSchema: { type: 'object', properties: { impulseClass: { type: 'string', enum: IMPULSE_CLASSES.map(band => band.letter) } }, required: ['impulseClass'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('impulseClass' in input) ||
          !IMPULSE_CLASSES.some(band => band.letter === input.impulseClass)) throw new Error('Provide impulseClass as one letter from A through O.');
        updateVisible(() => store.getState().selectClass(input.impulseClass as ImpulseClass));
        return { status: 'configuration-applied', configuration: { ...store.getState().configuration } };
      },
    },
    {
      name: 'configure_grain_profile',
      description: 'Select an illustrative grain profile, updating the visible controls and starting a flight calculation. Preserves total impulse, average thrust, burn duration, and masses. Returns configuration, not completed flight results.',
      inputSchema: { type: 'object', properties: { profile: { type: 'string', enum: GRAIN_PROFILES.map(profile => profile.id) } }, required: ['profile'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('profile' in input)) {
          throw new Error('Provide one supported grain profile.');
        }
        const profile = grainProfileFor(input.profile);
        if (!profile) throw new Error('Provide one supported grain profile.');
        updateVisible(() => store.getState().setGrainProfile(profile.id));
        return { status: 'configuration-applied', configuration: { ...store.getState().configuration } };
      },
    },
  ];
}
