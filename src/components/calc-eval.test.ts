import { describe, expect, it } from 'vitest';
import { evaluate } from './calcEval';

describe('calcEval', () => {
  it('respects precedence', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('(1+2)*(3+4)')).toBe(21);
    expect(evaluate('-2^2')).toBe(-4);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('2^-1')).toBe(0.5);
    expect(evaluate('2(3+4)')).toBe(14);
  });
  it('handles postfix ops and auto-closing', () => {
    expect(evaluate('5!')).toBe(120);
    expect(evaluate('50%')).toBe(0.5);
    expect(evaluate('sqrt(16')).toBe(4);
    expect(evaluate('2×3÷6')).toBe(1);
  });
  it('trig honours angle mode', () => {
    expect(evaluate('sin(30)', 'deg')).toBeCloseTo(0.5, 12);
    expect(evaluate('cos(90)', 'deg')).toBe(0);
    expect(evaluate('tan(45)', 'deg')).toBeCloseTo(1, 12);
    expect(evaluate('sin(π)', 'rad')).toBe(0);
    expect(evaluate('asin(1)', 'deg')).toBeCloseTo(90, 10);
    expect(evaluate('atan(1)', 'rad')).toBeCloseTo(Math.PI / 4, 12);
  });
  it('logs and constants', () => {
    expect(evaluate('log(1000)')).toBeCloseTo(3, 12);
    expect(evaluate('ln(ℯ)')).toBeCloseTo(1, 12);
    expect(evaluate('10^2')).toBe(100);
  });
  it('rejects invalid input', () => {
    expect(() => evaluate('1/0')).toThrow();
    expect(() => evaluate('sqrt(-1)')).toThrow();
    expect(() => evaluate('log(0)')).toThrow();
    expect(() => evaluate('2.5!')).toThrow();
    expect(() => evaluate('2+')).toThrow();
    expect(() => evaluate('()')).toThrow();
    expect(() => evaluate('abc')).toThrow();
  });
});
