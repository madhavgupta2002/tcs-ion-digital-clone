import type {
  ExamConfig,
  ExamEvent,
  Phase,
  QState,
  QStatus,
  ResponseValue,
  SectionState,
} from '../types';

export interface EngineState {
  phase: Phase;
  activeSection: number;
  sections: SectionState[];
  /** q[sectionIdx][questionIdx] */
  q: QState[][];
  /** Unsaved selection for the question currently on screen. */
  draft: ResponseValue | null;
  /** Remaining time for global mode. */
  globalRemainingMs: number;
  startedAt?: number;
  submittedAt?: number;
  submitReason?: 'manual' | 'timeout';
  /** Last tick timestamp; elapsed time is derived from wall clock so throttled tabs stay accurate. */
  lastTick?: number;
  events: ExamEvent[];
}

export type Action =
  | { type: 'GOTO_PHASE'; phase: Phase }
  | { type: 'START_EXAM'; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'SET_DRAFT'; value: ResponseValue | null }
  | { type: 'SAVE_NEXT'; now: number }
  | { type: 'MARK_NEXT'; now: number }
  | { type: 'CLEAR'; now: number }
  | { type: 'GOTO_QUESTION'; index: number; now: number }
  | { type: 'GOTO_SECTION'; index: number; now: number }
  | { type: 'SUBMIT_SECTION'; now: number; reason: 'manual' | 'timeout' }
  | { type: 'SUBMIT_EXAM'; now: number; reason: 'manual' | 'timeout' }
  | { type: 'LOG'; event: ExamEvent };

export function isEmptyResponse(v: ResponseValue | null | undefined): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return v.trim() === '';
}

function sameResponse(a: ResponseValue | null, b: ResponseValue | null): boolean {
  if (isEmptyResponse(a) && isEmptyResponse(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  }
  return a === b;
}

export function initState(cfg: ExamConfig): EngineState {
  const sectional = cfg.timing.mode === 'sectional';
  return {
    phase: 'instructions1',
    activeSection: 0,
    sections: cfg.sections.map((s) => ({
      status: 'locked',
      remainingMs: (s.durationSec ?? 0) * 1000,
      timeSpentMs: 0,
      currentQ: 0,
    })),
    q: cfg.sections.map((s) =>
      s.questions.map(() => ({ status: 'notVisited', saved: null, timeSpentMs: 0, visits: 0, changes: 0 })),
    ),
    draft: null,
    globalRemainingMs: sectional ? 0 : (cfg.timing.totalDurationSec ?? 0) * 1000,
    events: [],
  };
}

// ---------------------------------------------------------------------------
// helpers (all return new objects; never mutate input)
// ---------------------------------------------------------------------------

function patchQ(s: EngineState, si: number, qi: number, patch: Partial<QState>): EngineState {
  const q = s.q.map((row, i) => (i === si ? row.map((x, j) => (j === qi ? { ...x, ...patch } : x)) : row));
  return { ...s, q };
}

function patchSection(s: EngineState, si: number, patch: Partial<SectionState>): EngineState {
  return { ...s, sections: s.sections.map((x, i) => (i === si ? { ...x, ...patch } : x)) };
}

function log(s: EngineState, e: ExamEvent): EngineState {
  return { ...s, events: [...s.events, e] };
}

/** Puts the question on screen: counts the visit, flips notVisited -> notAnswered, loads its saved response into the draft. */
function visit(s: EngineState, cfg: ExamConfig, si: number, qi: number, now: number): EngineState {
  const cur = s.q[si][qi];
  let next = patchQ(s, si, qi, {
    visits: cur.visits + 1,
    status: cur.status === 'notVisited' ? 'notAnswered' : cur.status,
    firstVisitedAt: cur.firstVisitedAt ?? now,
  });
  next = patchSection(next, si, { currentQ: qi });
  next = { ...next, activeSection: si, draft: cur.saved };
  return log(next, { t: now, type: 'visit', section: cfg.sections[si].id, question: cfg.sections[si].questions[qi].id });
}

function startSection(s: EngineState, cfg: ExamConfig, si: number, now: number): EngineState {
  let next = s;
  if (next.sections[si].status === 'locked') {
    next = patchSection(next, si, { status: 'active', startedAt: now });
    next = log(next, { t: now, type: 'section_start', section: cfg.sections[si].id });
  }
  return visit(next, cfg, si, next.sections[si].currentQ, now);
}

function commit(s: EngineState, cfg: ExamConfig, marked: boolean, now: number): EngineState {
  const si = s.activeSection;
  const qi = s.sections[si].currentQ;
  const cur = s.q[si][qi];
  const value = isEmptyResponse(s.draft) ? null : s.draft;
  const status: QStatus = value ? (marked ? 'answeredMarked' : 'answered') : marked ? 'marked' : 'notAnswered';
  const changed = !sameResponse(cur.saved, value);
  const next = patchQ(s, si, qi, {
    saved: value,
    status,
    changes: cur.changes + (changed && value ? 1 : 0),
    lastSavedAt: value ? now : cur.lastSavedAt,
  });
  return log(next, {
    t: now,
    type: marked ? 'mark' : 'save',
    section: cfg.sections[si].id,
    question: cfg.sections[si].questions[qi].id,
    response: value,
  });
}

/** After Save & Next / Mark & Next: next question in section; on the last one, wrap to the first (sectional) or move to the next section (global). */
function advance(s: EngineState, cfg: ExamConfig, now: number): EngineState {
  const si = s.activeSection;
  const qi = s.sections[si].currentQ;
  const count = cfg.sections[si].questions.length;
  if (qi + 1 < count) return visit(s, cfg, si, qi + 1, now);
  if (cfg.timing.mode === 'global') {
    const nsi = (si + 1) % cfg.sections.length;
    return startSection(s, cfg, nsi, now);
  }
  return visit(s, cfg, si, 0, now);
}

/** Wall-clock time accounting: active question, active section, and the relevant countdown. */
function accrue(s: EngineState, now: number): EngineState {
  if (s.phase !== 'exam' || s.lastTick == null) return { ...s, lastTick: now };
  const si = s.activeSection;
  const sec = s.sections[si];
  // Never accrue past the clock that is running out.
  const limit = s.globalRemainingMs > 0 ? s.globalRemainingMs : sec.remainingMs;
  const dt = Math.min(Math.max(0, now - s.lastTick), limit);
  let next = patchQ(s, si, sec.currentQ, { timeSpentMs: s.q[si][sec.currentQ].timeSpentMs + dt });
  next = patchSection(next, si, {
    timeSpentMs: sec.timeSpentMs + dt,
    remainingMs: Math.max(0, sec.remainingMs - dt),
  });
  return { ...next, globalRemainingMs: Math.max(0, next.globalRemainingMs - dt), lastTick: now };
}

function finishExam(s: EngineState, _cfg: ExamConfig, now: number, reason: 'manual' | 'timeout'): EngineState {
  let next = s;
  next.sections.forEach((sec, i) => {
    if (sec.status !== 'submitted') {
      next = patchSection(next, i, { status: 'submitted', submittedAt: now, submitReason: reason, startedAt: sec.startedAt });
    }
  });
  next = log(next, { t: now, type: 'exam_submit', reason });
  return { ...next, phase: 'done', submittedAt: now, submitReason: reason, draft: null };
}

// ---------------------------------------------------------------------------

export function makeReducer(cfg: ExamConfig) {
  return function reducer(state: EngineState, action: Action): EngineState {
    switch (action.type) {
      case 'GOTO_PHASE':
        return { ...state, phase: action.phase };

      case 'START_EXAM': {
        const s: EngineState = { ...state, phase: 'exam', startedAt: action.now, lastTick: action.now };
        return startSection(log(s, { t: action.now, type: 'exam_start' }), cfg, 0, action.now);
      }

      case 'TICK': {
        if (state.phase !== 'exam') return state;
        const s = accrue(state, action.now);
        if (cfg.timing.mode === 'global') {
          return s.globalRemainingMs <= 0 ? finishExam(s, cfg, action.now, 'timeout') : s;
        }
        if (s.sections[s.activeSection].remainingMs <= 0) {
          return makeReducer(cfg)(s, { type: 'SUBMIT_SECTION', now: action.now, reason: 'timeout' });
        }
        return s;
      }

      case 'SET_DRAFT':
        return { ...state, draft: action.value };

      case 'SAVE_NEXT':
        return advance(commit(accrue(state, action.now), cfg, false, action.now), cfg, action.now);

      case 'MARK_NEXT':
        return advance(commit(accrue(state, action.now), cfg, true, action.now), cfg, action.now);

      case 'CLEAR': {
        const si = state.activeSection;
        const qi = state.sections[si].currentQ;
        const cur = state.q[si][qi];
        const status: QStatus = cur.status === 'answeredMarked' || cur.status === 'marked' ? 'marked' : 'notAnswered';
        const s = patchQ(state, si, qi, { saved: null, status });
        return log(
          { ...s, draft: null },
          { t: action.now, type: 'clear', section: cfg.sections[si].id, question: cfg.sections[si].questions[qi].id },
        );
      }

      case 'GOTO_QUESTION': {
        // Unsaved draft is discarded, exactly like the real interface.
        const s = accrue(state, action.now);
        return visit(s, cfg, s.activeSection, action.index, action.now);
      }

      case 'GOTO_SECTION': {
        if (cfg.timing.mode !== 'global' || action.index === state.activeSection) return state;
        return startSection(accrue(state, action.now), cfg, action.index, action.now);
      }

      case 'SUBMIT_SECTION': {
        let s = accrue(state, action.now);
        const si = s.activeSection;
        s = patchSection(s, si, { status: 'submitted', submittedAt: action.now, submitReason: action.reason });
        s = log(s, { t: action.now, type: 'section_submit', section: cfg.sections[si].id, reason: action.reason });
        if (si + 1 >= cfg.sections.length) return finishExam(s, cfg, action.now, action.reason);
        return startSection({ ...s, draft: null }, cfg, si + 1, action.now);
      }

      case 'SUBMIT_EXAM':
        return finishExam(accrue(state, action.now), cfg, action.now, action.reason);

      case 'LOG':
        return log(state, action.event);
    }
  };
}

export function countStatuses(row: QState[]): Record<QStatus, number> {
  const c: Record<QStatus, number> = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 };
  for (const q of row) c[q.status]++;
  return c;
}
