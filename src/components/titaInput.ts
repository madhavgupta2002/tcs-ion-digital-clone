/**
 * Editing rules of the TCS iON numeric keypad (type-in-the-answer questions).
 * Mirrors the console's own behaviour: at most 15 characters, one decimal point,
 * a single minus sign and only as the first character, Backspace with the caret
 * at the start removes the last character, and the arrow keys wrap around.
 */
export const TITA_MAX_LEN = 15;

export interface TitaState {
  value: string;
  caret: number;
}

function isValid(text: string): boolean {
  if (text.length > TITA_MAX_LEN) return false;
  if (text.indexOf('-') > 0 || text.split('-').length > 2) return false;
  if (text.split('.').length > 2) return false;
  return true;
}

export function insertKey({ value, caret }: TitaState, ch: string): TitaState {
  const pos = Math.min(caret, value.length);
  const next = value.slice(0, pos) + ch + value.slice(pos);
  return isValid(next) ? { value: next, caret: pos + 1 } : { value, caret: pos };
}

export function backspaceKey({ value, caret }: TitaState): TitaState {
  if (value.length === 0) return { value, caret: 0 };
  const pos = Math.min(caret, value.length);
  if (pos === 0) return { value: value.slice(0, -1), caret: value.length - 1 };
  return { value: value.slice(0, pos - 1) + value.slice(pos), caret: pos - 1 };
}

export function moveLeft({ value, caret }: TitaState): TitaState {
  const pos = Math.min(caret, value.length);
  return { value, caret: pos - 1 > -1 ? pos - 1 : value.length };
}

export function moveRight({ value, caret }: TitaState): TitaState {
  const pos = Math.min(caret, value.length);
  return { value, caret: pos + 1 > value.length ? 0 : pos + 1 };
}
