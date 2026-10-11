import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { CalcError, evaluate } from './calcEval';
import './calculator.css';

type Op = '+' | '-' | '*' | '/';

interface CalcState {
  cur: string; // current entry / displayed value
  acc: number | null; // left operand of pending operation
  op: Op | null;
  expr: string; // history line
  fresh: boolean; // next digit starts a new entry
  err: boolean;
  justEq: boolean;
  lastOp: Op | null;
  lastArg: number;
  mem: number;
}

const INIT: CalcState = {
  cur: '0',
  acc: null,
  op: null,
  expr: '',
  fresh: true,
  err: false,
  justEq: false,
  lastOp: null,
  lastArg: 0,
  mem: 0,
};

const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '-', '*': '×', '/': '÷' };
const DIV_ZERO = 'Cannot divide by zero';
const INVALID = 'Invalid input';
const MAX_DIGITS = 16;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return INVALID;
  const r = Number(n.toPrecision(12));
  return Object.is(r, -0) ? '0' : String(r);
}

function apply(a: number, op: Op, b: number): number | null {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
  }
}

function fail(s: CalcState, msg: string): CalcState {
  return { ...INIT, mem: s.mem, cur: msg, err: true };
}

function reduce(prev: CalcState, key: string): CalcState {
  // Any key (other than MC) after an error starts afresh.
  const s: CalcState = prev.err && key !== 'MC' ? { ...INIT, mem: prev.mem } : prev;
  const val = parseFloat(s.cur);

  if (/^[0-9]$/.test(key)) {
    const base = s.justEq ? { ...s, expr: '', justEq: false } : s;
    if (base.fresh) return { ...base, cur: key, fresh: false };
    if (base.cur.replace(/[-.]/g, '').length >= MAX_DIGITS) return base;
    return { ...base, cur: base.cur === '0' ? key : base.cur + key };
  }

  switch (key) {
    case '.': {
      const base = s.justEq ? { ...s, expr: '', justEq: false } : s;
      if (base.fresh) return { ...base, cur: '0.', fresh: false };
      if (base.cur.includes('.')) return base;
      return { ...base, cur: base.cur + '.' };
    }
    case '+':
    case '-':
    case '*':
    case '/': {
      const o = key as Op;
      if (s.op && s.acc !== null && s.fresh) {
        return { ...s, op: o, expr: `${fmt(s.acc)} ${OP_SYMBOL[o]}`, justEq: false };
      }
      if (s.op && s.acc !== null) {
        const r = apply(s.acc, s.op, val);
        if (r === null) return fail(s, DIV_ZERO);
        return {
          ...s, acc: r, cur: fmt(r), op: o, fresh: true, justEq: false,
          expr: `${fmt(r)} ${OP_SYMBOL[o]}`,
        };
      }
      return {
        ...s, acc: val, op: o, fresh: true, justEq: false,
        expr: `${fmt(val)} ${OP_SYMBOL[o]}`,
      };
    }
    case '=': {
      let a: number, o: Op, b: number;
      if (s.op && s.acc !== null) {
        a = s.acc; o = s.op; b = val;
      } else if (s.lastOp) {
        a = val; o = s.lastOp; b = s.lastArg;
      } else {
        return { ...s, expr: `${fmt(val)} =`, justEq: true, fresh: true };
      }
      const r = apply(a, o, b);
      if (r === null) return fail(s, DIV_ZERO);
      return {
        ...s, cur: fmt(r), acc: null, op: null, fresh: true, justEq: true,
        lastOp: o, lastArg: b,
        expr: `${fmt(a)} ${OP_SYMBOL[o]} ${fmt(b)} =`,
      };
    }
    case '%': {
      if (s.op && s.acc !== null) {
        const p = (s.acc * val) / 100;
        return { ...s, cur: fmt(p), fresh: true, expr: `${fmt(s.acc)} ${OP_SYMBOL[s.op]} ${fmt(p)}` };
      }
      return { ...s, cur: fmt(val / 100), fresh: true, expr: `${fmt(val)} %`, justEq: false };
    }
    case 'sqrt':
    case 'inv': {
      let r: number;
      if (key === 'sqrt') {
        if (val < 0) return fail(s, INVALID);
        r = Math.sqrt(val);
      } else {
        if (val === 0) return fail(s, DIV_ZERO);
        r = 1 / val;
      }
      const inner = key === 'sqrt' ? `√(${fmt(val)})` : `1/(${fmt(val)})`;
      const prefix = s.op && s.acc !== null ? `${fmt(s.acc)} ${OP_SYMBOL[s.op]} ` : '';
      return { ...s, cur: fmt(r), fresh: true, justEq: false, expr: prefix + inner };
    }
    case 'neg': {
      if (val === 0) return s;
      const cur = s.cur.startsWith('-') ? s.cur.slice(1) : '-' + s.cur;
      return { ...s, cur };
    }
    case 'back': {
      if (s.fresh) return s;
      const cur = s.cur.slice(0, -1);
      return { ...s, cur: cur === '' || cur === '-' ? '0' : cur };
    }
    case 'C':
      return { ...INIT, mem: s.mem };
    case 'MC':
      return { ...prev, mem: 0 };
    case 'MR':
      return { ...s, cur: fmt(s.mem), fresh: true };
    case 'MS':
      return { ...s, mem: val, fresh: true };
    case 'M+':
      return { ...s, mem: s.mem + val, fresh: true };
    case 'M-':
      return { ...s, mem: s.mem - val, fresh: true };
  }
  return s;
}

interface BtnDef {
  key: string;
  label: string;
  cls?: string;
  style?: React.CSSProperties;
}

const BUTTONS: BtnDef[] = [
  { key: 'MC', label: 'MC' }, { key: 'MR', label: 'MR' }, { key: 'MS', label: 'MS' },
  { key: 'M+', label: 'M+' }, { key: 'M-', label: 'M-' },
  { key: 'back', label: '←', cls: 'calc-red', style: { gridColumn: 'span 2' } },
  { key: 'C', label: 'C', cls: 'calc-red' },
  { key: 'neg', label: '+/-', cls: 'calc-red' },
  { key: 'sqrt', label: '√' },
  { key: '7', label: '7' }, { key: '8', label: '8' }, { key: '9', label: '9' },
  { key: '/', label: '/' }, { key: '%', label: '%' },
  { key: '4', label: '4' }, { key: '5', label: '5' }, { key: '6', label: '6' },
  { key: '*', label: '*' }, { key: 'inv', label: '1/x' },
  { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' },
  { key: '-', label: '-' },
  { key: '=', label: '=', cls: 'calc-green', style: { gridColumn: 5, gridRow: '5 / span 2' } },
  { key: '0', label: '0', style: { gridColumn: 'span 2' } },
  { key: '.', label: '.' },
  { key: '+', label: '+' },
];

const KEY_MAP: Record<string, string> = {
  Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', Delete: 'C',
  '+': '+', '-': '-', '*': '*', '/': '/', '.': '.', ',': '.', '%': '%',
};

/* ---------------- shared draggable window ---------------- */

function CalcShell({
  title, wide, mapKey, onPress, onClose, children,
}: {
  title: string;
  wide?: boolean;
  mapKey: (k: string) => string | undefined;
  onPress: (key: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState({ x: 10, y: 90 });
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = /^[0-9]$/.test(e.key) ? e.key : mapKey(e.key);
    if (key) {
      e.preventDefault();
      onPress(key);
    }
  };

  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const w = panelRef.current?.offsetWidth ?? 290;
    const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - w);
    const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - 40);
    setPos({ x, y });
  };
  const onDragEnd = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={panelRef}
      className={`calc-panel${wide ? ' calc-wide' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={title}
    >
      <div
        className="calc-title"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="calc-title-text">{title}</span>
        <button type="button" className="calc-close" onClick={onClose} aria-label="Close calculator">
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

const standardMapKey = (k: string) => KEY_MAP[k];

function StandardCalculator({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<CalcState>(INIT);
  const press = useCallback((key: string) => setState((s) => reduce(s, key)), []);
  const fontSize = state.cur.length > 18 ? 14 : state.cur.length > 12 ? 18 : 24;

  return (
    <CalcShell title="Normal Calculator" mapKey={standardMapKey} onPress={press} onClose={onClose}>
      <div className="calc-body">
        <div className="calc-display calc-history" aria-label="Expression">{state.expr}</div>
        <div className="calc-display calc-value" style={{ fontSize }} aria-live="polite">
          {state.mem !== 0 && <span className="calc-mem">M</span>}
          {state.cur}
        </div>
        <div className="calc-grid" onMouseDown={(e) => e.preventDefault()}>
          {BUTTONS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`calc-btn ${b.cls ?? ''}`}
              style={b.style}
              onClick={() => press(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </CalcShell>
  );
}

/* ---------------- scientific ---------------- */

interface SciState {
  expr: string; // raw expression being typed (internal symbols)
  hist: string; // history line after '='
  justEq: boolean;
  err: boolean;
  mem: number;
  inv: boolean; // 2nd / inverse trig
  deg: boolean;
}

const SCI_INIT: SciState = { expr: '', hist: '', justEq: false, err: false, mem: 0, inv: false, deg: true };

const SCI_OPS = /[+\-*/^]$/;
const SCI_BACK = /(?:a?(?:sin|cos|tan)|log|ln|sqrt)\($|.$/;

function sciShow(expr: string): string {
  return expr
    .replace(/sqrt\(/g, '√(')
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/ℯ/g, 'e')
    .replace(/(a?(?:sin|cos|tan))\(/g, (_m, f: string) => f.replace(/^a(.+)$/, '$1⁻¹') + '(');
}

function openParens(expr: string): number {
  let n = 0;
  for (const c of expr) {
    if (c === '(') n++;
    else if (c === ')') n--;
  }
  return n;
}

function sciTry(expr: string, deg: boolean): number | null {
  if (expr === '') return 0;
  try {
    return evaluate(expr, deg ? 'deg' : 'rad');
  } catch {
    return null;
  }
}

function sciFail(s: SciState, msg: string): SciState {
  return { ...SCI_INIT, mem: s.mem, deg: s.deg, expr: msg, err: true };
}

function sciReduce(prev: SciState, key: string): SciState {
  const s: SciState = prev.err && key !== 'MC' ? { ...SCI_INIT, mem: prev.mem, deg: prev.deg } : prev;
  // After '=', typing a fresh operand starts a new expression; operators continue from the result.
  const fresh: SciState = s.justEq ? { ...s, expr: '', hist: '', justEq: false } : s;
  const append = (t: string, base: SciState = fresh): SciState => ({ ...base, expr: base.expr + t, hist: '', justEq: false });

  if (/^[0-9]$/.test(key)) {
    if (/(^|[^\d.])0$/.test(fresh.expr)) return { ...fresh, expr: fresh.expr.slice(0, -1) + key };
    return append(key);
  }

  switch (key) {
    case '.': {
      const num = /[\d.]*$/.exec(fresh.expr)?.[0] ?? '';
      if (num.includes('.')) return fresh;
      return append(num === '' ? '0.' : '.');
    }
    case '+':
    case '-':
    case '*':
    case '/':
    case 'pow': {
      const o = key === 'pow' ? '^' : key;
      const base: SciState = s.justEq ? { ...s, hist: '', justEq: false } : s;
      if (base.expr === '') return o === '-' ? append('-', base) : append('0' + o, base);
      if (base.expr.endsWith('(') && o !== '-') return base;
      if (SCI_OPS.test(base.expr)) {
        if (base.expr.length === 1 && base.expr === '-') return base;
        return { ...base, expr: base.expr.slice(0, -1) + o };
      }
      return append(o, base);
    }
    case '(':
      return append('(');
    case ')':
      if (openParens(fresh.expr) <= 0 || /[+\-*/^(]$/.test(fresh.expr) || fresh.expr === '') return fresh;
      return append(')');
    case '%':
    case 'fact': {
      const base: SciState = s.justEq ? { ...s, hist: '', justEq: false } : s;
      if (!/[\d.)!%πℯ]$/.test(base.expr)) return base;
      return append(key === '%' ? '%' : '!', base);
    }
    case 'pi':
      return append('π');
    case 'econst':
      return append('ℯ');
    case 'sin':
    case 'cos':
    case 'tan':
    case 'log':
    case 'ln':
    case 'sqrt': {
      const trig = key === 'sin' || key === 'cos' || key === 'tan';
      const name = trig && s.inv ? 'a' + key : key;
      const out = s.justEq ? { ...s, expr: `${name}(${s.expr})`, hist: '', justEq: false } : append(name + '(', s);
      return { ...out, inv: false };
    }
    case 'sq':
    case 'tenx':
    case 'ex':
      if (key === 'sq') {
        const base: SciState = s.justEq ? { ...s, hist: '', justEq: false } : s;
        if (!/[\d.)!%πℯ]$/.test(base.expr)) return base;
        return append('^2', base);
      }
      return append(key === 'tenx' ? '10^' : 'ℯ^');
    case 'inv1': {
      if (s.expr === '') return s;
      return { ...s, expr: `1/(${s.expr})`, hist: '', justEq: false };
    }
    case 'neg': {
      if (s.expr === '') return s;
      if (/^-?[\d.]+$/.test(s.expr)) {
        return { ...s, expr: s.expr.startsWith('-') ? s.expr.slice(1) : '-' + s.expr, justEq: false };
      }
      if (/^-\(.*\)$/.test(s.expr)) return { ...s, expr: s.expr.slice(2, -1), justEq: false };
      return { ...s, expr: `-(${s.expr})`, justEq: false };
    }
    case 'back': {
      if (s.expr === '') return s;
      return { ...s, expr: s.expr.replace(SCI_BACK, ''), hist: '', justEq: false };
    }
    case '=': {
      if (s.expr === '') return s;
      const closed = s.expr + ')'.repeat(Math.max(0, openParens(s.expr)));
      try {
        const r = evaluate(closed, s.deg ? 'deg' : 'rad');
        return { ...s, expr: fmt(r), hist: sciShow(closed) + ' =', justEq: true };
      } catch (e) {
        return sciFail(s, e instanceof CalcError ? e.message : INVALID);
      }
    }
    case 'C':
      return { ...SCI_INIT, mem: s.mem, deg: s.deg };
    case 'inv':
      return { ...s, inv: !s.inv };
    case 'deg':
      return { ...s, deg: !s.deg };
    case 'MC':
      return { ...prev, mem: 0 };
    case 'MR': {
      const m = fmt(s.mem);
      return append(s.mem < 0 ? `(${m})` : m);
    }
    case 'MS':
    case 'M+':
    case 'M-': {
      const v = sciTry(s.expr + ')'.repeat(Math.max(0, openParens(s.expr))), s.deg);
      if (v === null) return s;
      return { ...s, mem: key === 'MS' ? v : key === 'M+' ? s.mem + v : s.mem - v };
    }
  }
  return s;
}

const SCI_LEFT: BtnDef[] = [
  { key: 'inv', label: '2nd' }, { key: 'deg', label: 'DEG' }, { key: 'pi', label: 'π' },
  { key: 'econst', label: 'e' }, { key: 'fact', label: 'n!' },
  { key: 'sin', label: 'sin' }, { key: 'cos', label: 'cos' }, { key: 'tan', label: 'tan' },
  { key: 'log', label: 'log' }, { key: 'ln', label: 'ln' },
  { key: 'sq', label: 'x²' }, { key: 'pow', label: 'xʸ' }, { key: 'tenx', label: '10ˣ' },
  { key: 'ex', label: 'eˣ' }, { key: 'sqrt', label: '√' },
  { key: '(', label: '(' }, { key: ')', label: ')' },
];

// Right-hand block: the standard keys; the √ slot becomes '(' since √ is on the scientific side.
const SCI_RIGHT: BtnDef[] = BUTTONS.map((b) => {
  if (b.key === 'sqrt') return { key: '(', label: '(' };
  if (b.key === 'inv') return { key: 'inv1', label: '1/x' };
  return b;
});

const SCI_KEY_MAP: Record<string, string> = {
  ...KEY_MAP, '^': 'pow', '(': '(', ')': ')', '!': 'fact', p: 'pi',
};
const sciMapKey = (k: string) => SCI_KEY_MAP[k];

function ScientificCalculator({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<SciState>(SCI_INIT);
  const press = useCallback((key: string) => setState((s) => sciReduce(s, key)), []);

  const shown = state.err ? state.expr : sciShow(state.expr) || '0';
  const fontSize = shown.length > 30 ? 14 : shown.length > 20 ? 18 : 24;
  const label = (b: BtnDef) => {
    if (b.key === 'deg') return state.deg ? 'DEG' : 'RAD';
    if (state.inv && (b.key === 'sin' || b.key === 'cos' || b.key === 'tan')) return b.label + '⁻¹';
    return b.label;
  };
  const cls = (b: BtnDef) => `calc-btn ${b.cls ?? ''}${b.key === 'inv' && state.inv ? ' calc-on' : ''}`;

  return (
    <CalcShell title="Scientific Calculator" wide mapKey={sciMapKey} onPress={press} onClose={onClose}>
      <div className="calc-body">
        <div className="calc-display calc-history" aria-label="Expression">{state.hist}</div>
        <div className="calc-display calc-value" style={{ fontSize }} aria-live="polite">
          {state.mem !== 0 && <span className="calc-mem">M</span>}
          {shown}
        </div>
        <div className="calc-sci-layout" onMouseDown={(e) => e.preventDefault()}>
          <div className="calc-grid calc-sci-left">
            {SCI_LEFT.map((b) => (
              <button key={b.key} type="button" className={cls(b)} style={b.style} onClick={() => press(b.key)}>
                {label(b)}
              </button>
            ))}
          </div>
          <div className="calc-grid">
            {SCI_RIGHT.map((b) => (
              <button key={b.key} type="button" className={cls(b)} style={b.style} onClick={() => press(b.key)}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </CalcShell>
  );
}

export function Calculator({ onClose, variant = 'standard' }: { onClose: () => void; variant?: 'standard' | 'scientific' }) {
  return variant === 'scientific' ? <ScientificCalculator onClose={onClose} /> : <StandardCalculator onClose={onClose} />;
}
