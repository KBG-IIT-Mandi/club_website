import { describe, it, expect } from 'vitest';
import {
  mmToUm, umToMm, cmToUm, minToS, hToS, sToMin, sToH,
  formatBioClock, formatDuration, formatCount,
} from './units.js';

describe('unit conversions', () => {
  it('length round-trips', () => {
    expect(mmToUm(1)).toBe(1000);
    expect(umToMm(1000)).toBe(1);
    expect(cmToUm(1)).toBe(10000);
    expect(umToMm(mmToUm(3.7))).toBeCloseTo(3.7, 12);
  });

  it('time round-trips', () => {
    expect(minToS(2)).toBe(120);
    expect(hToS(6)).toBe(21600);
    expect(sToMin(90)).toBe(1.5);
    expect(sToH(hToS(9.25))).toBeCloseTo(9.25, 12);
  });

  it('formatBioClock renders T± HH:MM:SS', () => {
    expect(formatBioClock(0)).toBe('T+00:00:00');
    expect(formatBioClock(6 * 3600 + 12 * 60 + 44)).toBe('T+06:12:44');
    expect(formatBioClock(-3600)).toBe('T−01:00:00');
    expect(formatBioClock(100 * 3600)).toBe('T+100:00:00');
  });

  it('formatDuration picks the sensible register', () => {
    expect(formatDuration(38)).toBe('38s');
    expect(formatDuration(12 * 60)).toBe('12m');
    expect(formatDuration(6.5 * 3600)).toBe('6.5h');
    expect(formatDuration(2.1 * 86400)).toBe('2.1d');
  });

  it('formatCount compresses population numbers', () => {
    expect(formatCount(182_000_000)).toBe('182M');
    expect(formatCount(4_200_000)).toBe('4.2M');
    expect(formatCount(961_000)).toBe('961K');
    expect(formatCount(1204)).toBe('1.2K');
    expect(formatCount(87)).toBe('87');
    expect(formatCount(NaN)).toBe('—');
  });
});
