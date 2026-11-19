import { describe, expect, it } from 'vitest';
import { TITA_MAX_LEN, backspaceKey, insertKey, moveLeft, moveRight } from './titaInput';

describe('TITA keypad editing', () => {
  it('inserts at the caret', () => {
    expect(insertKey({ value: '13', caret: 1 }, '2')).toEqual({ value: '123', caret: 2 });
  });

  it('allows one decimal point', () => {
    expect(insertKey({ value: '1.5', caret: 3 }, '.')).toEqual({ value: '1.5', caret: 3 });
  });

  it('allows a single minus sign, only first', () => {
    expect(insertKey({ value: '', caret: 0 }, '-')).toEqual({ value: '-', caret: 1 });
    expect(insertKey({ value: '12', caret: 2 }, '-')).toEqual({ value: '12', caret: 2 });
    expect(insertKey({ value: '-12', caret: 0 }, '-')).toEqual({ value: '-12', caret: 0 });
    expect(insertKey({ value: '-12', caret: 0 }, '5')).toEqual({ value: '-12', caret: 0 });
  });

  it(`caps the answer at ${TITA_MAX_LEN} characters`, () => {
    const full = '1'.repeat(TITA_MAX_LEN);
    expect(insertKey({ value: full, caret: full.length }, '2').value).toBe(full);
  });

  it('deletes before the caret, or the last character when the caret is at the start', () => {
    expect(backspaceKey({ value: '123', caret: 2 })).toEqual({ value: '13', caret: 1 });
    expect(backspaceKey({ value: '123', caret: 0 })).toEqual({ value: '12', caret: 2 });
    expect(backspaceKey({ value: '', caret: 0 })).toEqual({ value: '', caret: 0 });
  });

  it('wraps the caret around with the arrow keys', () => {
    expect(moveLeft({ value: '12', caret: 0 })).toEqual({ value: '12', caret: 2 });
    expect(moveRight({ value: '12', caret: 2 })).toEqual({ value: '12', caret: 0 });
    expect(moveRight({ value: '12', caret: 0 })).toEqual({ value: '12', caret: 1 });
  });
});
