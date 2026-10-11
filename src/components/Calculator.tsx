import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
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

export function Calculator({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<CalcState>(INIT);
  const [pos, setPos] = useState({ x: 10, y: 90 });
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const press = useCallback((key: string) => setState((s) => reduce(s, key)), []);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = /^[0-9]$/.test(e.key) ? e.key : KEY_MAP[e.key];
    if (key) {
      e.preventDefault();
      press(key);
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

  const fontSize = state.cur.length > 18 ? 14 : state.cur.length > 12 ? 18 : 24;

  return (
    <div
      ref={panelRef}
      className="calc-panel"
      style={{ left: pos.x, top: pos.y }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label="Normal Calculator"
    >
      <div
        className="calc-title"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="calc-title-text">Normal Calculator</span>
        <button type="button" className="calc-close" onClick={onClose} aria-label="Close calculator">
          ×
        </button>
      </div>
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
    </div>
  );
}
