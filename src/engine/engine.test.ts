import { describe, it, expect } from 'vitest';
import type { ExamConfig, Question } from '../types';
import { initState, makeReducer, type Action, type EngineState } from './reducer';
import { buildResult } from './result';
import { validateConfig } from './loadConfig';

const T0 = 1_000_000;

function mkQuestions(prefix: string): Question[] {
  const opts = [
    { id: 'A', html: 'a' },
    { id: 'B', html: 'b' },
    { id: 'C', html: 'c' },
  ];
  return [
    { id: `${prefix}1`, type: 'MCQ', html: 'q1', options: opts, passageId: 'p1', answer: 'B' },
    { id: `${prefix}2`, type: 'MSQ', html: 'q2', options: opts, answer: ['A', 'C'] },
    { id: `${prefix}3`, type: 'TITA', html: 'q3', answer: '42' },
  ];
}

function mkConfig(mode: 'sectional' | 'global', withKeys = true): ExamConfig {
  const strip = (qs: Question[]) => (withKeys ? qs : qs.map(({ answer: _a, ...rest }) => rest));
  return {
    id: 'exam',
    title: 'Test',
    candidate: { name: 'Tester' },
    timing: mode === 'sectional' ? { mode } : { mode, totalDurationSec: 100 },
    defaults: { marks: 3, negativeMarks: 1, titaNegativeMarks: 0 },
    sections: [
      {
        id: 's1',
        name: 'S1',
        durationSec: mode === 'sectional' ? 60 : undefined,
        passages: [{ id: 'p1', html: 'passage' }],
        questions: strip(mkQuestions('a')),
      },
      {
        id: 's2',
        name: 'S2',
        durationSec: mode === 'sectional' ? 60 : undefined,
        passages: [{ id: 'p1', html: 'passage' }],
        questions: strip(mkQuestions('b')),
      },
    ],
  };
}

function setup(mode: 'sectional' | 'global' = 'sectional', withKeys = true) {
  const cfg = mkConfig(mode, withKeys);
  const reducer = makeReducer(cfg);
  let st: EngineState = initState(cfg);
  const run = (...actions: Action[]) => {
    for (const a of actions) st = reducer(st, a);
    return st;
  };
  run({ type: 'START_EXAM', now: T0 });
  return { cfg, run, get st() { return st; } };
}

const statusOf = (st: EngineState, si: number, qi: number) => st.q[si][qi].status;

describe('visiting', () => {
  it('starts in instructions with everything not visited', () => {
    const st = initState(mkConfig('sectional'));
    expect(st.phase).toBe('instructions1');
    expect(st.q.flat().every((q) => q.status === 'notVisited')).toBe(true);
    expect(st.sections.every((s) => s.status === 'locked')).toBe(true);
  });

  it('START_EXAM visits Q1 of section 0', () => {
    const h = setup();
    expect(h.st.phase).toBe('exam');
    expect(h.st.sections[0].status).toBe('active');
    expect(h.st.sections[1].status).toBe('locked');
    expect(statusOf(h.st, 0, 0)).toBe('notAnswered');
    expect(h.st.q[0][0].visits).toBe(1);
    expect(statusOf(h.st, 0, 1)).toBe('notVisited');
  });

  it('GOTO_QUESTION flips notVisited to notAnswered', () => {
    const h = setup();
    h.run({ type: 'GOTO_QUESTION', index: 2, now: T0 + 1000 });
    expect(statusOf(h.st, 0, 2)).toBe('notAnswered');
    expect(h.st.sections[0].currentQ).toBe(2);
  });
});

describe('save / mark / clear', () => {
  it('SAVE_NEXT with draft -> answered and advances', () => {
    const h = setup();
    h.run({ type: 'SET_DRAFT', value: ['B'] }, { type: 'SAVE_NEXT', now: T0 + 1000 });
    expect(statusOf(h.st, 0, 0)).toBe('answered');
    expect(h.st.q[0][0].saved).toEqual(['B']);
    expect(h.st.sections[0].currentQ).toBe(1);
  });

  it('SAVE_NEXT without draft -> notAnswered', () => {
    const h = setup();
    h.run({ type: 'SAVE_NEXT', now: T0 + 1000 });
    expect(statusOf(h.st, 0, 0)).toBe('notAnswered');
    expect(h.st.q[0][0].saved).toBeNull();
  });

  it('MARK_NEXT with draft -> answeredMarked', () => {
    const h = setup();
    h.run({ type: 'SET_DRAFT', value: ['A'] }, { type: 'MARK_NEXT', now: T0 + 1000 });
    expect(statusOf(h.st, 0, 0)).toBe('answeredMarked');
    expect(h.st.q[0][0].saved).toEqual(['A']);
  });

  it('MARK_NEXT without draft -> marked', () => {
    const h = setup();
    h.run({ type: 'MARK_NEXT', now: T0 + 1000 });
    expect(statusOf(h.st, 0, 0)).toBe('marked');
  });

  it('treats whitespace-only TITA draft as empty', () => {
    const h = setup();
    h.run({ type: 'GOTO_QUESTION', index: 2, now: T0 + 10 }, { type: 'SET_DRAFT', value: '   ' }, { type: 'SAVE_NEXT', now: T0 + 20 });
    expect(statusOf(h.st, 0, 2)).toBe('notAnswered');
    expect(h.st.q[0][2].saved).toBeNull();
  });

  it('GOTO_QUESTION discards an unsaved draft', () => {
    const h = setup();
    h.run({ type: 'SET_DRAFT', value: ['A'] }, { type: 'SAVE_NEXT', now: T0 + 1000 }); // Q1 saved A
    h.run({ type: 'GOTO_QUESTION', index: 0, now: T0 + 2000 });
    expect(h.st.draft).toEqual(['A']);
    h.run({ type: 'SET_DRAFT', value: ['B'] }, { type: 'GOTO_QUESTION', index: 1, now: T0 + 3000 });
    expect(h.st.q[0][0].saved).toEqual(['A']);
    expect(statusOf(h.st, 0, 0)).toBe('answered');
    expect(h.st.draft).toBeNull();
    h.run({ type: 'GOTO_QUESTION', index: 0, now: T0 + 4000 });
    expect(h.st.draft).toEqual(['A']);
  });

  it('CLEAR on answered -> notAnswered with saved null', () => {
    const h = setup();
    h.run({ type: 'SET_DRAFT', value: ['A'] }, { type: 'SAVE_NEXT', now: T0 + 1000 }, { type: 'GOTO_QUESTION', index: 0, now: T0 + 2000 });
    h.run({ type: 'CLEAR', now: T0 + 3000 });
    expect(statusOf(h.st, 0, 0)).toBe('notAnswered');
    expect(h.st.q[0][0].saved).toBeNull();
    expect(h.st.draft).toBeNull();
  });

  it('CLEAR on answeredMarked -> marked', () => {
    const h = setup();
    h.run({ type: 'SET_DRAFT', value: ['A'] }, { type: 'MARK_NEXT', now: T0 + 1000 }, { type: 'GOTO_QUESTION', index: 0, now: T0 + 2000 });
    h.run({ type: 'CLEAR', now: T0 + 3000 });
    expect(statusOf(h.st, 0, 0)).toBe('marked');
    expect(h.st.q[0][0].saved).toBeNull();
  });
});

describe('navigation at last question', () => {
  it('sectional: wraps to Q1', () => {
    const h = setup('sectional');
    h.run({ type: 'GOTO_QUESTION', index: 2, now: T0 + 1 }, { type: 'SAVE_NEXT', now: T0 + 2 });
    expect(h.st.activeSection).toBe(0);
    expect(h.st.sections[0].currentQ).toBe(0);
  });

  it('global: moves to next section and activates it', () => {
    const h = setup('global');
    h.run({ type: 'GOTO_QUESTION', index: 2, now: T0 + 1 }, { type: 'SAVE_NEXT', now: T0 + 2 });
    expect(h.st.activeSection).toBe(1);
    expect(h.st.sections[1].status).toBe('active');
    expect(statusOf(h.st, 1, 0)).toBe('notAnswered');
  });

  it('GOTO_SECTION is ignored in sectional mode', () => {
    const h = setup('sectional');
    const before = h.st;
    h.run({ type: 'GOTO_SECTION', index: 1, now: T0 + 1 });
    expect(h.st).toBe(before);
    expect(h.st.activeSection).toBe(0);
  });

  it('GOTO_SECTION works in global mode', () => {
    const h = setup('global');
    h.run({ type: 'GOTO_SECTION', index: 1, now: T0 + 1 });
    expect(h.st.activeSection).toBe(1);
    expect(h.st.sections[1].status).toBe('active');
    expect(statusOf(h.st, 1, 0)).toBe('notAnswered');
    h.run({ type: 'GOTO_SECTION', index: 0, now: T0 + 2 });
    expect(h.st.activeSection).toBe(0);
  });
});

describe('timing', () => {
  it('sectional TICK accrues to question, section, and section clock only', () => {
    const h = setup('sectional');
    h.run({ type: 'TICK', now: T0 + 5000 });
    expect(h.st.q[0][0].timeSpentMs).toBe(5000);
    expect(h.st.sections[0].timeSpentMs).toBe(5000);
    expect(h.st.sections[0].remainingMs).toBe(55_000);
    expect(h.st.sections[1].remainingMs).toBe(60_000);
    expect(h.st.globalRemainingMs).toBe(0);
  });

  it('time is attributed to the question that was on screen', () => {
    const h = setup('sectional');
    h.run({ type: 'GOTO_QUESTION', index: 1, now: T0 + 3000 }, { type: 'TICK', now: T0 + 5000 });
    expect(h.st.q[0][0].timeSpentMs).toBe(3000);
    expect(h.st.q[0][1].timeSpentMs).toBe(2000);
  });

  it('global TICK decrements global clock', () => {
    const h = setup('global');
    h.run({ type: 'TICK', now: T0 + 7000 });
    expect(h.st.globalRemainingMs).toBe(93_000);
    expect(h.st.q[0][0].timeSpentMs).toBe(7000);
    expect(h.st.sections[0].timeSpentMs).toBe(7000);
  });

  it('section timeout auto-submits and starts the next section', () => {
    const h = setup('sectional');
    h.run({ type: 'TICK', now: T0 + 61_000 });
    expect(h.st.sections[0].status).toBe('submitted');
    expect(h.st.sections[0].submitReason).toBe('timeout');
    expect(h.st.sections[1].status).toBe('active');
    expect(h.st.activeSection).toBe(1);
    expect(h.st.phase).toBe('exam');
    expect(statusOf(h.st, 1, 0)).toBe('notAnswered');
    expect(h.st.sections[1].remainingMs).toBe(60_000);
  });

  it('timeout of the last section ends the exam', () => {
    const h = setup('sectional');
    h.run({ type: 'TICK', now: T0 + 61_000 }, { type: 'TICK', now: T0 + 122_000 });
    expect(h.st.phase).toBe('done');
    expect(h.st.sections[1].status).toBe('submitted');
    expect(h.st.sections[1].submitReason).toBe('timeout');
    expect(h.st.submitReason).toBe('timeout');
  });

  it('global timeout finishes the exam', () => {
    const h = setup('global');
    h.run({ type: 'TICK', now: T0 + 101_000 });
    expect(h.st.phase).toBe('done');
    expect(h.st.submitReason).toBe('timeout');
    expect(h.st.sections.every((s) => s.status === 'submitted')).toBe(true);
  });

  it('TICK is a no-op outside the exam phase', () => {
    const st = initState(mkConfig('sectional'));
    expect(makeReducer(mkConfig('sectional'))(st, { type: 'TICK', now: T0 })).toBe(st);
  });
});

describe('buildResult scoring', () => {
  /** Answers all three questions of section 0 with the given values, using explicit navigation. */
  function answer(h: ReturnType<typeof setup>, vals: Array<{ v: string[] | string | null; mark?: boolean }>) {
    vals.forEach((x, i) => {
      h.run({ type: 'GOTO_QUESTION', index: i, now: T0 + 100 * (i + 1) });
      h.run({ type: 'SET_DRAFT', value: x.v });
      h.run({ type: x.mark ? 'MARK_NEXT' : 'SAVE_NEXT', now: T0 + 100 * (i + 1) + 50 });
    });
  }

  it('scores correct answers and applies negative marks', () => {
    const h = setup();
    answer(h, [{ v: ['B'] }, { v: ['A', 'B'] }, { v: '41' }]);
    h.run({ type: 'SUBMIT_EXAM', now: T0 + 5000, reason: 'manual' });
    const r = buildResult(h.cfg, h.st);
    const s = r.sections[0];
    expect(s.questions[0]).toMatchObject({ correct: true, marksAwarded: 3, evaluated: true });
    expect(s.questions[1]).toMatchObject({ correct: false, marksAwarded: -1 }); // MSQ wrong, negative 1
    expect(s.questions[2]).toMatchObject({ correct: false, marksAwarded: 0 }); // TITA negative 0
    expect(s.score).toEqual({ marks: 2, maxMarks: 9, correct: 1, incorrect: 2, unattempted: 0 });
    expect(r.score).toEqual({ marks: 2, maxMarks: 18, correct: 1, incorrect: 2, unattempted: 3 });
  });

  it('MSQ requires exact set match regardless of order', () => {
    const h = setup();
    answer(h, [{ v: ['A'] }, { v: ['C', 'A'] }, { v: '42' }]);
    const r = buildResult(h.cfg, h.st);
    expect(r.sections[0].questions[0].correct).toBe(false);
    expect(r.sections[0].questions[1].correct).toBe(true);
    expect(r.sections[0].questions[2].correct).toBe(true);
  });

  it('MSQ subset is incorrect', () => {
    const h = setup();
    answer(h, [{ v: null }, { v: ['A'] }, { v: null }]);
    expect(buildResult(h.cfg, h.st).sections[0].questions[1].correct).toBe(false);
  });

  it('TITA matches by trimmed string and by numeric equality', () => {
    const h = setup();
    answer(h, [{ v: null }, { v: null }, { v: ' 42.0 ' }]);
    expect(buildResult(h.cfg, h.st).sections[0].questions[2].correct).toBe(true);
  });

  it('TITA honours tolerance', () => {
    const h = setup();
    h.cfg.sections[0].questions[2].answer = 3.14;
    h.cfg.sections[0].questions[2].tolerance = 0.01;
    answer(h, [{ v: null }, { v: null }, { v: '3.145' }]);
    expect(buildResult(h.cfg, h.st).sections[0].questions[2].correct).toBe(true);
    h.run({ type: 'GOTO_QUESTION', index: 2, now: T0 + 900 }, { type: 'SET_DRAFT', value: '3.2' }, { type: 'SAVE_NEXT', now: T0 + 950 });
    expect(buildResult(h.cfg, h.st).sections[0].questions[2].correct).toBe(false);
  });

  it('TITA accepts numeric answer keys', () => {
    const h = setup();
    h.cfg.sections[0].questions[2].answer = 42;
    answer(h, [{ v: null }, { v: null }, { v: '42' }]);
    expect(buildResult(h.cfg, h.st).sections[0].questions[2].correct).toBe(true);
  });

  it('answeredMarked counts as evaluated; marked without answer does not', () => {
    const h = setup();
    answer(h, [{ v: ['B'], mark: true }, { v: null, mark: true }, { v: null }]);
    const r = buildResult(h.cfg, h.st);
    const qs = r.sections[0].questions;
    expect(qs[0]).toMatchObject({ status: 'answeredMarked', evaluated: true, correct: true, marksAwarded: 3 });
    expect(qs[1]).toMatchObject({ status: 'marked', evaluated: false, correct: null, marksAwarded: 0 });
    expect(qs[2]).toMatchObject({ status: 'notAnswered', evaluated: false });
    expect(r.sections[0].score).toMatchObject({ marks: 3, correct: 1, incorrect: 0, unattempted: 2 });
  });

  it('counts per status', () => {
    const h = setup();
    answer(h, [{ v: ['B'] }, { v: null, mark: true }, { v: null }]);
    const c = buildResult(h.cfg, h.st).sections[0].counts;
    expect(c).toEqual({ notVisited: 0, notAnswered: 1, answered: 1, marked: 1, answeredMarked: 0, total: 3 });
    const c2 = buildResult(h.cfg, h.st).sections[1].counts;
    expect(c2).toMatchObject({ notVisited: 3, total: 3 });
  });

  it('omits score when no answer keys exist', () => {
    const h = setup('sectional', false);
    answer(h, [{ v: ['B'] }, { v: null }, { v: '1' }]);
    const r = buildResult(h.cfg, h.st);
    expect(r.score).toBeUndefined();
    expect(r.sections[0].score).toBeUndefined();
    expect(r.sections[0].questions[0].correct).toBeUndefined();
  });

  it('reports submit reasons and timing', () => {
    const h = setup();
    h.run({ type: 'TICK', now: T0 + 61_000 }, { type: 'TICK', now: T0 + 122_000 });
    const r = buildResult(h.cfg, h.st);
    expect(r.submitReason).toBe('timeout');
    expect(r.sections.map((s) => s.submitReason)).toEqual(['timeout', 'timeout']);
    expect(r.totalTimeSpentSec).toBe(120); // two 61s ticks, each clamped to the 60s section clock
  });
});

describe('validateConfig', () => {
  const clone = (): ExamConfig => JSON.parse(JSON.stringify(mkConfig('sectional')));

  it('accepts a valid config', () => {
    expect(() => validateConfig(clone())).not.toThrow();
    expect(() => validateConfig(JSON.parse(JSON.stringify(mkConfig('global'))))).not.toThrow();
  });

  it('rejects missing section durations in sectional mode', () => {
    const c = clone();
    delete c.sections[1].durationSec;
    expect(() => validateConfig(c)).toThrow(/durationSec is required for sectional mode/);
  });

  it('rejects missing options for MCQ', () => {
    const c = clone();
    delete c.sections[0].questions[0].options;
    expect(() => validateConfig(c)).toThrow(/options required for MCQ/);
  });

  it('rejects unknown passageId', () => {
    const c = clone();
    c.sections[0].questions[0].passageId = 'nope';
    expect(() => validateConfig(c)).toThrow(/passage "nope" not found/);
  });

  it('rejects global mode without total duration', () => {
    const c = JSON.parse(JSON.stringify(mkConfig('global'))) as ExamConfig;
    delete c.timing.totalDurationSec;
    expect(() => validateConfig(c)).toThrow(/totalDurationSec/);
  });
});

describe('partial MSQ scoring', () => {
  const cfg: ExamConfig = {
    id: 'p', title: 'p', candidate: { name: 'x' }, timing: { mode: 'global', totalDurationSec: 600 },
    sections: [{
      id: 's', name: 's', msqScoring: 'partial', marks: 2, negativeMarks: 1,
      questions: [{ id: 'q', type: 'MSQ', html: 'q', options: [{ id: 'A', html: 'a' }, { id: 'B', html: 'b' }, { id: 'C', html: 'c' }], answer: ['A', 'B'] }],
    }],
  };
  const award = (saved: string[]) => {
    const st = initState(cfg);
    st.q[0][0].saved = saved;
    st.q[0][0].status = 'answered';
    return buildResult(cfg, st).sections[0].questions[0].marksAwarded;
  };
  it('gives full, half and zero marks without negatives', () => {
    expect(award(['A', 'B'])).toBe(2);
    expect(award(['A'])).toBe(1);
    expect(award(['A', 'C'])).toBe(0);
    expect(award(['C'])).toBe(0);
  });
});
