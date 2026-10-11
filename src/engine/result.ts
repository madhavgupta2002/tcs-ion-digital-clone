import type { ExamConfig, ExamResult, Question, QuestionResult, ResponseValue, Section, SectionResult } from '../types';
import type { EngineState } from './reducer';
import { countStatuses, isEmptyResponse } from './reducer';

const iso = (t?: number) => (t == null ? null : new Date(t).toISOString());
const sec = (ms: number) => Math.round(ms / 100) / 10;

export function marksFor(cfg: ExamConfig, s: Section, q: Question): { plus: number; minus: number } {
  const plus = q.marks ?? s.marks ?? cfg.defaults?.marks ?? 3;
  const minus =
    q.negativeMarks ??
    (q.type === 'TITA'
      ? (s.titaNegativeMarks ?? cfg.defaults?.titaNegativeMarks ?? 0)
      : (s.negativeMarks ?? cfg.defaults?.negativeMarks ?? 1));
  return { plus, minus };
}

function isCorrect(q: Question, r: ResponseValue): boolean {
  const key = q.answer;
  if (key == null) return false;
  if (q.type === 'TITA') {
    const given = String(r).trim();
    const want = String(key).trim();
    if (q.tolerance != null) {
      const a = Number(given);
      const b = Number(want);
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= q.tolerance;
    }
    return given === want || (given !== '' && Number(given) === Number(want));
  }
  const want = (Array.isArray(key) ? key : [String(key)]).map(String).sort().join('|');
  const got = (Array.isArray(r) ? r : [r]).map(String).sort().join('|');
  return want === got;
}

export function buildResult(cfg: ExamConfig, st: EngineState): ExamResult {
  let total = { marks: 0, maxMarks: 0, correct: 0, incorrect: 0, unattempted: 0 };
  let anyKey = false;

  const sections: SectionResult[] = cfg.sections.map((s, si) => {
    const ss = st.sections[si];
    const score = { marks: 0, maxMarks: 0, correct: 0, incorrect: 0, unattempted: 0 };
    let sectionHasKey = false;

    const questions: QuestionResult[] = s.questions.map((q, qi) => {
      const qs = st.q[si][qi];
      const evaluated = (qs.status === 'answered' || qs.status === 'answeredMarked') && !isEmptyResponse(qs.saved);
      const out: QuestionResult = {
        id: q.id,
        number: qi + 1,
        type: q.type,
        status: qs.status,
        response: qs.saved,
        evaluated,
        timeSpentSec: sec(qs.timeSpentMs),
        visits: qs.visits,
        answerChanges: qs.changes,
        firstVisitedAt: iso(qs.firstVisitedAt),
        lastSavedAt: iso(qs.lastSavedAt),
      };
      if (q.answer != null) {
        sectionHasKey = true;
        const { plus, minus } = marksFor(cfg, s, q);
        score.maxMarks += plus;
        if (!evaluated) {
          out.correct = null;
          out.marksAwarded = 0;
          score.unattempted++;
        } else if (isCorrect(q, qs.saved!)) {
          out.correct = true;
          out.marksAwarded = plus;
          score.marks += plus;
          score.correct++;
        } else {
          out.correct = false;
          out.marksAwarded = minus ? -minus : 0;
          score.marks -= minus;
          score.incorrect++;
        }
      }
      return out;
    });

    const res: SectionResult = {
      id: s.id,
      name: s.name,
      startedAt: iso(ss.startedAt),
      submittedAt: iso(ss.submittedAt),
      submitReason: ss.submitReason ?? null,
      timeSpentSec: sec(ss.timeSpentMs),
      counts: { ...countStatuses(st.q[si]), total: s.questions.length },
      questions,
    };
    if (sectionHasKey) {
      anyKey = true;
      res.score = score;
      total = {
        marks: total.marks + score.marks,
        maxMarks: total.maxMarks + score.maxMarks,
        correct: total.correct + score.correct,
        incorrect: total.incorrect + score.incorrect,
        unattempted: total.unattempted + score.unattempted,
      };
    }
    return res;
  });

  const result: ExamResult = {
    examId: cfg.id,
    title: cfg.title,
    candidate: cfg.candidate,
    timingMode: cfg.timing.mode,
    startedAt: iso(st.startedAt),
    submittedAt: iso(st.submittedAt),
    submitReason: st.submitReason ?? null,
    totalTimeSpentSec: sec(st.sections.reduce((a, s) => a + s.timeSpentMs, 0)),
    sections,
    events: st.events,
  };
  if (anyKey) result.score = total;
  return result;
}

/** Delivers the result through every channel enabled in config.output. */
export async function deliverResult(cfg: ExamConfig, result: ExamResult): Promise<void> {
  const out = cfg.output ?? {};
  if (out.localStorage !== false) {
    try {
      localStorage.setItem(`tcs-clone-result:${cfg.id}`, JSON.stringify(result));
    } catch {
      /* storage full / disabled */
    }
  }
  if (out.postMessage !== false && window.parent !== window) {
    window.parent.postMessage({ type: 'tcs-clone-result', result }, '*');
  }
  window.dispatchEvent(new CustomEvent('tcs-clone-result', { detail: result }));
  if (out.postUrl) {
    try {
      await fetch(out.postUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
    } catch (e) {
      console.error('Failed to POST result', e);
    }
  }
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
