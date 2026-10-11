import { useEffect, useRef, useState } from 'react';
import './tita.css';

const MAX_LEN = 20;

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

const DIGIT_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['0', '.', '-'],
];

export function TitaKeypad({ value, onChange, disabled }: Props) {
  const [caret, setCaret] = useState(value.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef(value);
  const userActed = useRef(false);

  // If the value was changed from outside (e.g. question switch), move caret to end.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setCaret(value.length);
    }
  }, [value]);

  const pos = Math.min(caret, value.length);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (userActed.current) el.focus();
    el.setSelectionRange(pos, pos);
  }, [pos, value]);

  const commit = (next: string, nextCaret: number) => {
    userActed.current = true;
    lastEmitted.current = next;
    setCaret(nextCaret);
    if (next !== value) onChange(next);
  };

  const insert = (ch: string) => {
    if (disabled || value.length >= MAX_LEN) return;
    const hasNeg = value.startsWith('-');
    if (ch === '-') {
      if (pos !== 0 || hasNeg) return;
    } else {
      if (hasNeg && pos === 0) return; // nothing may precede the minus sign
      if (ch === '.' && value.includes('.')) return;
    }
    commit(value.slice(0, pos) + ch + value.slice(pos), pos + 1);
  };

  const backspace = () => {
    if (disabled || pos === 0) return;
    commit(value.slice(0, pos - 1) + value.slice(pos), pos - 1);
  };

  const move = (delta: number) => {
    if (disabled) return;
    userActed.current = true;
    setCaret(Math.max(0, Math.min(value.length, pos + delta)));
  };

  const clearAll = () => {
    if (disabled) return;
    commit('', 0);
  };

  return (
    <div className="tita">
      <input
        ref={inputRef}
        className="tita-input"
        type="text"
        readOnly
        value={value}
        disabled={disabled}
        inputMode="none"
        autoComplete="off"
        aria-label="Answer"
        onSelect={(e) => {
          // Keep caret under keypad control; ignore mouse-placed selections.
          const el = e.currentTarget;
          if (el.selectionStart !== pos || el.selectionEnd !== pos) el.setSelectionRange(pos, pos);
        }}
      />
      <div className="tita-panel" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" className="tita-btn tita-wide" disabled={disabled} onClick={backspace}>
          Backspace
        </button>
        <div className="tita-grid">
          {DIGIT_ROWS.flat().map((k) => (
            <button
              key={k}
              type="button"
              className="tita-btn tita-key"
              disabled={disabled}
              onClick={() => insert(k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="tita-arrows">
          <button
            type="button"
            className="tita-btn tita-key"
            disabled={disabled}
            onClick={() => move(-1)}
            aria-label="Move caret left"
          >
            ←
          </button>
          <button
            type="button"
            className="tita-btn tita-key"
            disabled={disabled}
            onClick={() => move(1)}
            aria-label="Move caret right"
          >
            →
          </button>
        </div>
        <button type="button" className="tita-btn tita-wide" disabled={disabled} onClick={clearAll}>
          Clear All
        </button>
      </div>
    </div>
  );
}
