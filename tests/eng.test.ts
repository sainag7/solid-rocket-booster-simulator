import { describe, expect, test } from 'vitest';
import { parseEng } from '../src/index.js';
import { c6, c6Text, unwrap } from './helpers.js';

const header = 'C6 18 70 0-3-5-7 .0108 .0231 E';

describe('RASP .eng import', () => {
  test('retains certification samples and metadata with SI dimensions', () => {
    expect(c6.designation).toBe('C6');
    expect(c6.manufacturer).toBe('E');
    expect(c6.diameterM).toBe(0.018);
    expect(c6.lengthM).toBe(0.07);
    expect(c6.propellantMassKg).toBe(0.0108);
    expect(c6.totalMassKg).toBe(0.0231);
    expect(c6.metadata.sourceName).toBe('estes-c6.eng');
    expect(c6.metadata.headerLine).toBe(6);
    expect(c6.metadata.rawHeader).toBe(header);
    expect(c6.metadata.comments.some(comment => comment.includes('thrustcurve.org'))).toBe(true);
    expect(c6.curve.source).toBe('imported');
    expect(c6.curve.points).toHaveLength(25);
    expect(c6.curve.points[0]).toEqual({ timeS: 0, thrustN: 0 });
    expect(c6.curve.points[4]).toEqual({ timeS: 0.192, thrustN: 14.09 });
    expect(c6.curve.totalImpulseNs).toBeCloseTo(8.82, 2);
    expect(c6.curve.averageThrustN).toBeCloseTo(4.74, 2);
    expect(c6.curve.burnTimeS).toBe(1.86);
  });
  test('handles BOM, CRLF, tabs, comments, explicit origin, scientific notation, and plugged delay', () => {
    const input = `\uFEFF; leading\r\n\r\nX1\t18 70 P .01 .02 Example\r\n0 0\r\n; inside\r\n1e-1 2e1\r\n.2 0\r\n; trailing`;
    const motor = unwrap(parseEng(input))[0]!;
    expect(motor.delays).toBe('P');
    expect(motor.curve.totalImpulseNs).toBeCloseTo(2, 12);
    expect(motor.curve.points).toHaveLength(3);
    expect(motor.metadata.comments).toEqual(['; leading', '; inside', '; trailing']);
  });
  test('imports multiple entries instead of silently selecting one', () => {
    const motors = unwrap(parseEng(`${c6Text}\n; next motor\nX1 18 70 P .01 .02 Example\n.1 20\n.2 0`));
    expect(motors.map(motor => motor.designation)).toEqual(['C6', 'X1']);
    expect(motors[1]!.metadata.comments).toContain('; next motor');
  });
  test('supports more than the historical 32-point limit', () => {
    const points = Array.from({ length: 100 }, (_, i) => `${(i + 1) / 100} ${i === 99 ? 0 : 1}`);
    expect(unwrap(parseEng(`${header}\n${points.join('\n')}`))[0]!.curve.points).toHaveLength(101);
  });
  test.each([
    { text: '', line: 1, reason: 'No motor' },
    { text: '; only comments', line: 1, reason: 'No motor' },
    { text: 'C6 18 70', line: 1, reason: 'header' },
    { text: header.replace('18', '-18'), line: 1, reason: 'diameter' },
    { text: header.replace('18', 'Infinity'), line: 1, reason: 'finite' },
    { text: header.replace('.0108', '.03'), line: 1, reason: 'Propellant' },
    { text: header.replace('.0108', '-.01'), line: 1, reason: 'Propellant' },
    { text: header.replace('.0231', '0'), line: 1, reason: 'mass' },
    { text: header.replace('0-3-5-7', 'nope'), line: 1, reason: 'Delays' },
    { text: `${header}\n.1 -1\n.2 0`, line: 2, reason: 'nonnegative' },
    { text: `${header}\n-.1 10\n.2 0`, line: 2, reason: 'nonnegative' },
    { text: `${header}\nNaN 10\n.2 0`, line: 2, reason: 'finite' },
    { text: `${header}\n0x1 10\n.2 0`, line: 2, reason: 'decimal' },
    { text: `${header}\n.1 10\n.1 5\n.2 0`, line: 3, reason: 'increasing' },
    { text: `${header}\n.1 10\n.05 5\n.2 0`, line: 3, reason: 'increasing' },
    { text: `${header}\n.1 10`, line: 2, reason: 'terminal' },
    { text: `${header}\n.1 10\n${header}`, line: 3, reason: 'zero thrust' },
    { text: `${header}\n.1 10\n.2 0\n.3 1`, line: 4, reason: 'terminal' },
    { text: `${header}\n0 0\n0 0\n.1 10\n.2 0`, line: 3, reason: 'Duplicate' },
    { text: `${header}\n.1 0`, line: 2, reason: 'impulse' },
  ])('readable error on line $line: $reason', ({ text, line, reason }) => {
    const result = parseEng(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.line).toBe(line);
      expect(result.errors[0]!.message).toContain(reason);
    }
  });
  test('a broken second motor rejects the whole file', () => {
    expect(parseEng(`${c6Text}\n${header}\n.1 5`).ok).toBe(false);
  });
});
