import { Fragment, useEffect, useRef, useState } from 'react';
import { backspaceKey, insertKey, moveLeft, moveRight } from './titaInput';
import type { TitaState } from './titaInput';
import './tita.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

type Key = { label: string; kind: 'char' | 'backspace' | 'left' | 'right' | 'clear'; aria?: string };

/** Same rows as the TCS iON numeric keypad. */
const ROWS: Key[][] = [
  [{ label: 'Backspace', kind: 'backspace' }],
  ['7', '8', '9'].map((d) => ({ label: d, kind: 'char' as const, aria: `Number ${d}` })),
  ['4', '5', '6'].map((d) => ({ label: d, kind: 'char' as const, aria: `Number ${d}` })),
  ['1', '2', '3'].map((d) => ({ label: d, kind: 'char' as const, aria: `Number ${d}` })),
  [
    { label: '0', kind: 'char', aria: 'Number 0' },
    { label: '.', kind: 'char', aria: 'point' },
    { label: '-', kind: 'char', aria: 'negative' },
  ],
  [
    { label: '←', kind: 'left', aria: 'Move caret left' },
    { label: '→', kind: 'right', aria: 'Move caret right' },
  ],
  [{ label: 'Clear All', kind: 'clear' }],
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

  const apply = (next: TitaState) => {
    userActed.current = true;
    lastEmitted.current = next.value;
    setCaret(next.caret);
    if (next.value !== value) onChange(next.value);
  };

  const press = (key: Key) => {
    if (disabled) return;
    const state = { value, caret: pos };
    if (key.kind === 'char') apply(insertKey(state, key.label));
    else if (key.kind === 'backspace') apply(backspaceKey(state));
    else if (key.kind === 'left') apply(moveLeft(state));
    else if (key.kind === 'right') apply(moveRight(state));
    else apply({ value: '', caret: 0 });
  };

  return (
    <div className="tita-keypad">
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
        {ROWS.map((row, i) => (
          <Fragment key={i}>
            {row.map((key) => (
              <button
                key={key.label}
                type="button"
                className={`tita-btn ${key.kind === 'char' ? 'tita-key' : 'tita-spl'}${
                  key.kind === 'left' || key.kind === 'right' ? ' tita-arrow' : ''
                }`}
                disabled={disabled}
                aria-label={key.aria}
                onClick={() => press(key)}
              >
                {key.label}
              </button>
            ))}
            <br />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
