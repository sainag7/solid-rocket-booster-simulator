import { expect, test } from 'vitest';
import { createLabTools } from '../web/lab-tools.js';
import { createLabStore, initialConfiguration } from '../web/configuration.js';
import { c6 } from './helpers.js';

test('tool definitions configure the same store as class buttons and read back SI values', () => {
  const store = createLabStore(initialConfiguration(c6));
  let updates = 0;
  const [read, configure] = createLabTools(store, action => { action(); updates++; });
  expect(read!.name).toBe('read_flight_configuration');
  expect(read!.annotations.readOnlyHint).toBe(true);
  expect(configure!.name).toBe('configure_motor_class');
  expect(configure!.annotations.readOnlyHint).toBe(false);
  expect(configure!.inputSchema).toMatchObject({ required: ['impulseClass'], additionalProperties: false });
  expect(configure!.execute({ impulseClass: 'H' })).toMatchObject({ status: 'configuration-applied', configuration: { impulseClass: 'H', railLengthM: 2.4 } });
  expect(updates).toBe(1);
  expect(read!.execute({})).toEqual(store.getState().configuration);
});

test('invalid tool input never changes the configuration', () => {
  const initial = initialConfiguration(c6);
  const store = createLabStore(initial);
  const [read, configure] = createLabTools(store, action => action());
  for (const input of [null, [], {}, { impulseClass: 'P' }, { impulseClass: 'C', extra: true }]) {
    expect(() => configure!.execute(input)).toThrow('A through O');
    expect(store.getState().configuration).toEqual(initial);
  }
  expect(() => read!.execute({ extra: true })).toThrow('empty object');
});
