import c6Text from '../tests/fixtures/estes-c6.eng?raw';
import { parseEng } from '../src/index.js';
import { createLabStore, initialConfiguration } from './configuration.js';

const parsed = parseEng(c6Text, 'NAR C6 certification data');
if (!parsed.ok) throw new Error(parsed.errors.map(error => error.message).join(' '));
export const referenceMotor = parsed.value[0]!;
export const labStore = createLabStore(initialConfiguration(referenceMotor));
