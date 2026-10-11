// Small hand-written expression evaluator for the scientific calculator.
// Recursive descent: no eval / Function.

export type AngleMode = 'deg' | 'rad';

export class CalcError extends Error {}
export const DIV_ZERO = 'Cannot divide by zero';
export const INVALID = 'Invalid input';

type Tok =
  | { t: 'num'; v: number }
  | { t: 'const'; v: number }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string } // + - * / ^ ! % ( )

const FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt']);

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    if (c === '×') { out.push({ t: 'op', v: '*' }); i++; continue; }
    if (c === '÷') { out.push({ t: 'op', v: '/' }); i++; continue; }
    if (c === '√') { out.push({ t: 'fn', v: 'sqrt' }); i++; continue; }
    if (c === 'π') { out.push({ t: 'const', v: Math.PI }); i++; continue; }
    if (c === 'ℯ') { out.push({ t: 'const', v: Math.E }); i++; continue; }
    if ('+-*/^!%()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    const id = /^[a-z]+/.exec(src.slice(i));
    if (id) {
      const w = id[0];
      if (FUNCS.has(w)) out.push({ t: 'fn', v: w });
      else if (w === 'pi') out.push({ t: 'const', v: Math.PI });
      else if (w === 'e') out.push({ t: 'const', v: Math.E });
      else throw new CalcError(INVALID);
      i += w.length;
      continue;
    }
    throw new CalcError(INVALID);
  }
  return out;
}

function snap(v: number): number {
  return Math.abs(v) < 1e-12 ? 0 : v;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new CalcError(INVALID);
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function callFn(name: string, x: number, mode: AngleMode): number {
  const toRad = (d: number) => (mode === 'deg' ? (d * Math.PI) / 180 : d);
  const fromRad = (r: number) => (mode === 'deg' ? (r * 180) / Math.PI : r);
  switch (name) {
    case 'sin': return snap(Math.sin(toRad(x)));
    case 'cos': return snap(Math.cos(toRad(x)));
    case 'tan': {
      const c = snap(Math.cos(toRad(x)));
      if (c === 0) throw new CalcError(INVALID);
      return snap(Math.tan(toRad(x)));
    }
    case 'asin':
      if (x < -1 || x > 1) throw new CalcError(INVALID);
      return snap(fromRad(Math.asin(x)));
    case 'acos':
      if (x < -1 || x > 1) throw new CalcError(INVALID);
      return snap(fromRad(Math.acos(x)));
    case 'atan': return snap(fromRad(Math.atan(x)));
    case 'log':
      if (x <= 0) throw new CalcError(INVALID);
      return Math.log10(x);
    case 'ln':
      if (x <= 0) throw new CalcError(INVALID);
      return Math.log(x);
    case 'sqrt':
      if (x < 0) throw new CalcError(INVALID);
      return Math.sqrt(x);
  }
  throw new CalcError(INVALID);
}

/** Evaluate an expression string. Missing closing parentheses are auto-closed. Throws CalcError. */
export function evaluate(src: string, mode: AngleMode = 'deg'): number {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return t !== undefined && t.t === 'op' && t.v === v; };
  const startsPrimary = () => {
    const t = toks[p];
    return t !== undefined && (t.t === 'num' || t.t === 'const' || t.t === 'fn' || (t.t === 'op' && t.v === '('));
  };

  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const o = (toks[p++] as { v: string }).v;
      const r = term();
      v = o === '+' ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const o = (toks[p++] as { v: string }).v;
        const r = unary();
        if (o === '/') {
          if (r === 0) throw new CalcError(DIV_ZERO);
          v /= r;
        } else v *= r;
      } else if (startsPrimary()) {
        v *= unary(); // implicit multiplication: 2(3+4), 2π
      } else break;
    }
    return v;
  }
  function unary(): number {
    if (isOp('-')) { p++; return -unary(); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power(): number {
    const base = postfix();
    if (isOp('^')) {
      p++;
      const e = unary(); // right associative, allows 2^-3
      if (base === 0 && e < 0) throw new CalcError(DIV_ZERO);
      const r = Math.pow(base, e);
      if (Number.isNaN(r)) throw new CalcError(INVALID);
      return r;
    }
    return base;
  }
  function postfix(): number {
    let v = primary();
    for (;;) {
      if (isOp('!')) { p++; v = factorial(v); }
      else if (isOp('%')) { p++; v /= 100; }
      else break;
    }
    return v;
  }
  function primary(): number {
    const t = peek();
    if (!t) throw new CalcError(INVALID);
    p++;
    if (t.t === 'num' || t.t === 'const') return t.v;
    if (t.t === 'fn') {
      if (!isOp('(')) throw new CalcError(INVALID);
      p++;
      const x = expr();
      if (isOp(')')) p++;
      else if (p < toks.length) throw new CalcError(INVALID);
      return callFn(t.v, x, mode);
    }
    if (t.v === '(') {
      const x = expr();
      if (isOp(')')) p++;
      else if (p < toks.length) throw new CalcError(INVALID);
      return x;
    }
    throw new CalcError(INVALID);
  }

  const result = expr();
  if (p < toks.length) throw new CalcError(INVALID);
  if (!Number.isFinite(result)) throw new CalcError(INVALID);
  return result;
}
