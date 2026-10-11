import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ExamConfig, ExamResult } from './types';
import { initState, makeReducer } from './engine/reducer';
import type { EngineState } from './engine/reducer';
import { buildResult, deliverResult } from './engine/result';
import { loadConfigFromEnvironment, validateConfig } from './engine/loadConfig';
import { InstructionsPage1, InstructionsPage2 } from './screens/Instructions';
import { ExamPage } from './screens/ExamPage';
import { Done } from './screens/Done';
import { ExamPicker } from './screens/ExamPicker';
import { MSG, hasHost, isEmbedded, sendToHost, waitForHostConfig } from './engine/host';

export default function App() {
  const [cfg, setCfg] = useState<ExamConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (isEmbedded() ? waitForHostConfig() : loadConfigFromEnvironment())
      .then(setCfg)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return isEmbedded() ? <div className="embed-wait">Connecting to exam host…</div> : null;
  if (error) return <pre style={{ padding: 20, color: '#b00', whiteSpace: 'pre-wrap' }}>{error}</pre>;
  if (!cfg) {
    return (
      <ExamPicker
        onPick={(raw) => {
          try {
            setCfg(validateConfig(raw));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
    );
  }
  return <Engine key={cfg.id} cfg={cfg} />;
}

const stateKey = (id: string) => `tcs-clone-state:${id}`;

function restore(cfg: ExamConfig): EngineState {
  try {
    const raw = sessionStorage.getItem(stateKey(cfg.id));
    if (raw) {
      const s = JSON.parse(raw) as EngineState;
      if (s.q.length === cfg.sections.length && s.phase !== 'done') return s;
    }
  } catch {
    /* ignore corrupt state */
  }
  return initState(cfg);
}

function Engine({ cfg }: { cfg: ExamConfig }) {
  const reducer = useMemo(() => makeReducer(cfg), [cfg]);
  const [state, dispatch] = useReducer(reducer, cfg, restore);
  const [result, setResult] = useState<ExamResult | null>(null);
  const delivered = useRef(false);

  // Clock. Elapsed time is computed from wall-clock deltas, so a refresh or throttled tab
  // still consumes real time (the persisted lastTick carries over).
  useEffect(() => {
    if (state.phase !== 'exam') return;
    dispatch({ type: 'TICK', now: Date.now() });
    const id = window.setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), 250);
    return () => window.clearInterval(id);
  }, [state.phase]);

  // Persist progress so an accidental refresh resumes the attempt.
  useEffect(() => {
    if (state.phase === 'done') sessionStorage.removeItem(stateKey(cfg.id));
    else sessionStorage.setItem(stateKey(cfg.id), JSON.stringify(state));
  }, [state, cfg.id]);

  // Warn before leaving during the exam.
  useEffect(() => {
    if (state.phase !== 'exam') return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [state.phase]);

  // While hosted, stream a partial snapshot so the host keeps something if the window is closed early.
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (!hasHost() || state.phase !== 'exam') return;
    const id = window.setInterval(() => {
      if (latest.current.phase === 'exam') sendToHost(MSG.progress, { result: buildResult(cfg, latest.current) });
    }, 10000);
    return () => window.clearInterval(id);
  }, [state.phase, cfg]);

  useEffect(() => {
    if (state.phase === 'done' && !delivered.current) {
      delivered.current = true;
      const r = buildResult(cfg, state);
      setResult(r);
      void deliverResult(cfg, r);
    }
  }, [state, cfg]);

  switch (state.phase) {
    case 'instructions1':
      return <InstructionsPage1 cfg={cfg} onNext={() => dispatch({ type: 'GOTO_PHASE', phase: 'instructions2' })} />;
    case 'instructions2':
      return (
        <InstructionsPage2
          cfg={cfg}
          onPrev={() => dispatch({ type: 'GOTO_PHASE', phase: 'instructions1' })}
          onBegin={() => dispatch({ type: 'START_EXAM', now: Date.now() })}
        />
      );
    case 'exam':
      return <ExamPage cfg={cfg} state={state} dispatch={dispatch} />;
    case 'done':
      return result ? (
        <Done
          cfg={cfg}
          result={result}
          hosted={hasHost()}
          onRestart={() => {
            sessionStorage.removeItem(stateKey(cfg.id));
            location.reload();
          }}
        />
      ) : null;
  }
}
