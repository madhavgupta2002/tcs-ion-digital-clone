import { useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { ExamConfig, QStatus, ResponseValue } from '../types';
import type { Action, EngineState } from '../engine/reducer';
import { countStatuses } from '../engine/reducer';
import { marksFor } from '../engine/result';
import { StatusIcon } from '../components/StatusIcon';
import { Calculator } from '../components/Calculator';
import { TitaKeypad } from '../components/TitaKeypad';
import { InstructionsModal } from '../components/InstructionsModal';
import { QuestionPaperModal } from '../components/QuestionPaperModal';
import { SubmitConfirm } from '../components/SubmitConfirm';
import { Avatar } from '../components/Avatar';
import './exam.css';

const LEGEND: { status: QStatus; label: string }[] = [
  { status: 'notVisited', label: 'Not Visited' },
  { status: 'notAnswered', label: 'Not Answered' },
  { status: 'answered', label: 'Answered' },
  { status: 'marked', label: 'Marked for Review' },
  { status: 'answeredMarked', label: 'Answered & Marked for Review(will be considered for evaluation)' },
];

export function fmtClock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export function ExamPage({ cfg, state, dispatch }: { cfg: ExamConfig; state: EngineState; dispatch: Dispatch<Action> }) {
  const [calcOpen, setCalcOpen] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [instrOpen, setInstrOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteHidden, setPaletteHidden] = useState(false);
  const [legendFor, setLegendFor] = useState<number | null>(null);
  const [split, setSplit] = useState(50);

  const si = state.activeSection;
  const section = cfg.sections[si];
  const secState = state.sections[si];
  const qi = secState.currentQ;
  const q = section.questions[qi];
  const passage = q.passageId ? section.passages?.find((p) => p.id === q.passageId) : undefined;
  const { plus, minus } = marksFor(cfg, section, q);
  const features = cfg.features ?? {};
  const sectional = cfg.timing.mode === 'sectional';
  const isLast = si === cfg.sections.length - 1;
  const remaining = sectional ? secState.remainingMs : state.globalRemainingMs;
  const warn = remaining <= (cfg.timing.warnAtSec ?? 300) * 1000;
  const minLeft = sectional && section.minTimeSec ? section.minTimeSec * 1000 - secState.timeSpentMs : 0;
  const calcAllowed = features.calculator !== false && section.calculator !== false;
  const counts = countStatuses(state.q[si]);
  const now = () => Date.now();

  // Close the calculator when moving to a section that doesn't allow it.
  useEffect(() => {
    if (!calcAllowed) setCalcOpen(false);
  }, [calcAllowed]);

  // Reset scroll when the question changes.
  const qPaneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    qPaneRef.current?.scrollTo(0, 0);
  }, [si, qi]);

  const draft = state.draft;
  const setDraft = (v: ResponseValue | null) => dispatch({ type: 'SET_DRAFT', value: v });

  const submitLabel = sectional && !isLast ? 'Submit Section' : 'Submit Exam';
  const doSubmit = () => {
    setConfirmOpen(false);
    if (sectional) dispatch({ type: 'SUBMIT_SECTION', now: now(), reason: 'manual' });
    else dispatch({ type: 'SUBMIT_EXAM', now: now(), reason: 'manual' });
  };

  // Drag the passage / question divider.
  const bodyRef = useRef<HTMLDivElement>(null);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const box = bodyRef.current!.getBoundingClientRect();
    const move = (ev: MouseEvent) => setSplit(Math.min(80, Math.max(20, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const marksStrip = features.showMarks !== false && (
    <div className="marks-strip">
      Mark/s: <span className="pos">{plus.toFixed(2)}</span> | Negative Mark/s: <span className="neg">{minus.toFixed(2)}</span>
    </div>
  );

  const questionBlock = (
    <>
      {marksStrip}
      <div className="q-no">Question No. {qi + 1}.</div>
      <div className="q-scroll" ref={qPaneRef}>
        <div className="q-text" dangerouslySetInnerHTML={{ __html: q.html }} />
        <AnswerArea key={`${si}:${qi}`} type={q.type} options={q.options} value={draft} onChange={setDraft} />
      </div>
    </>
  );

  return (
    <div className={`exam ${paletteHidden ? 'palette-hidden' : ''}`}>
      {/* ---------------- top bar ---------------- */}
      <header className="topbar">
        <div className="exam-title">{cfg.title}</div>
        <div className="tools">
          {calcAllowed && (
            <button
              className="tool"
              onClick={() => {
                setCalcOpen((o) => !o);
                dispatch({ type: 'LOG', event: { t: now(), type: 'open_calculator', section: section.id } });
              }}
            >
              <span className="ico ico-calc" /> Calculator
            </button>
          )}
          {features.questionPaper !== false && (
            <button
              className="tool"
              onClick={() => {
                setPaperOpen(true);
                dispatch({ type: 'LOG', event: { t: now(), type: 'open_question_paper', section: section.id } });
              }}
            >
              <span className="ico ico-paper" /> Question Paper
            </button>
          )}
          {features.viewInstructions !== false && (
            <button
              className="tool"
              onClick={() => {
                setInstrOpen(true);
                dispatch({ type: 'LOG', event: { t: now(), type: 'open_instructions' } });
              }}
            >
              <span className="ico ico-info">i</span> View Instruction
            </button>
          )}
        </div>
      </header>

      <div className="exam-body">
        {/* ---------------- main column ---------------- */}
        <main className="main">
          <div className="sections-row">
            <span className="sections-label">Sections</span>
            <span className={`time-left ${warn ? 'warn' : ''}`}>
              Time Left : <b>{fmtClock(remaining)}</b>
            </span>
          </div>

          <nav className="tabs">
            {cfg.sections.map((s, i) => {
              const active = i === si;
              const locked = sectional && !active;
              return (
                <div
                  key={s.id}
                  className={`tab ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
                  onClick={() => !locked && dispatch({ type: 'GOTO_SECTION', index: i, now: now() })}
                  onMouseLeave={() => setLegendFor(null)}
                >
                  {locked && <span className="lock" aria-label="locked" />}
                  <span>{s.name}</span>
                  {!locked && (
                    <span className="tab-info" onMouseEnter={() => setLegendFor(i)}>
                      i
                    </span>
                  )}
                  {legendFor === i && <SectionLegend name={s.name} counts={countStatuses(state.q[i])} />}
                </div>
              );
            })}
          </nav>

          <div className="q-body" ref={bodyRef}>
            {passage ? (
              <>
                <div className="passage-pane" style={{ width: `${split}%` }}>
                  {passage.directions && (
                    <div className="passage-directions" dangerouslySetInnerHTML={{ __html: passage.directions }} />
                  )}
                  <div className="passage-text" dangerouslySetInnerHTML={{ __html: passage.html }} />
                </div>
                <div className="divider" onMouseDown={startDrag}>
                  <span />
                </div>
                <div className="question-pane">{questionBlock}</div>
              </>
            ) : (
              <div className="question-pane full">{questionBlock}</div>
            )}
          </div>

          <button
            className="collapse"
            title={paletteHidden ? 'Show palette' : 'Hide palette'}
            onClick={() => setPaletteHidden((h) => !h)}
          >
            {paletteHidden ? '‹' : '›'}
          </button>
        </main>

        {/* ---------------- right column ---------------- */}
        {!paletteHidden && (
          <aside className="side">
            <div className="profile">
              <Avatar url={cfg.candidate.photoUrl} size={110} />
              <div className="cand-name">{cfg.candidate.name}</div>
            </div>

            <div className="side-box">
              <div className="legend">
                {LEGEND.map((l) => (
                  <div key={l.status} className={`legend-item ${l.status === 'answeredMarked' ? 'wide' : ''}`}>
                    <StatusIcon status={l.status} label={counts[l.status]} size="sm" />
                    <span>{l.label}</span>
                  </div>
                ))}
              </div>
              <div className="side-bar">{section.name}</div>
              <div className="palette">
                <div className="palette-title">Choose a question</div>
                <div className="palette-grid">
                  {state.q[si].map((qs, i) => (
                    <StatusIcon
                      key={i}
                      status={qs.status}
                      label={i + 1}
                      onClick={() => dispatch({ type: 'GOTO_QUESTION', index: i, now: now() })}
                      title={`Question ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ---------------- bottom bar ---------------- */}
      <footer className="bottombar">
        <div className="bb-main">
          <button className="btn" onClick={() => dispatch({ type: 'MARK_NEXT', now: now() })}>
            Mark for review and Next
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'CLEAR', now: now() })}>
            Clear Response
          </button>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'SAVE_NEXT', now: now() })}>
            Save &amp; Next
          </button>
        </div>
        <div className="bb-side">
          <button
            className="btn btn-primary"
            disabled={minLeft > 0}
            title={minLeft > 0 ? `You can submit after ${fmtClock(minLeft)}` : undefined}
            onClick={() => (features.confirmSubmit === false ? doSubmit() : setConfirmOpen(true))}
          >
            {submitLabel}
          </button>
        </div>
      </footer>

      {calcOpen && <Calculator onClose={() => setCalcOpen(false)} />}
      {paperOpen && <QuestionPaperModal cfg={cfg} sectionIndex={si} onClose={() => setPaperOpen(false)} />}
      {instrOpen && <InstructionsModal cfg={cfg} onClose={() => setInstrOpen(false)} />}
      {confirmOpen && (
        <SubmitConfirm
          cfg={cfg}
          state={state}
          scope={sectional ? 'section' : 'exam'}
          onYes={doSubmit}
          onNo={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function SectionLegend({ name, counts }: { name: string; counts: Record<QStatus, number> }) {
  return (
    <div className="section-legend" onClick={(e) => e.stopPropagation()}>
      <div className="sl-title">{name}</div>
      {LEGEND.map((l) => (
        <div className="sl-row" key={l.status}>
          <StatusIcon status={l.status} label={counts[l.status]} size="sm" />
          <span>{l.status === 'answeredMarked' ? 'Answered & Marked for Review (will be considered for evaluation)' : l.label}</span>
        </div>
      ))}
    </div>
  );
}

function AnswerArea({
  type,
  options,
  value,
  onChange,
}: {
  type: 'MCQ' | 'MSQ' | 'TITA';
  options?: { id: string; html: string }[];
  value: ResponseValue | null;
  onChange: (v: ResponseValue | null) => void;
}) {
  if (type === 'TITA') {
    return (
      <div className="tita">
        <TitaKeypad value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v === '' ? null : v)} />
      </div>
    );
  }
  const selected = Array.isArray(value) ? value : [];
  return (
    <div className="options">
      {options?.map((o) => {
        const checked = selected.includes(o.id);
        return (
          <label key={o.id} className="option">
            <input
              type={type === 'MCQ' ? 'radio' : 'checkbox'}
              name="answer"
              checked={checked}
              onChange={() => {
                if (type === 'MCQ') onChange([o.id]);
                else onChange(checked ? selected.filter((x) => x !== o.id) : [...selected, o.id]);
              }}
            />
            <span dangerouslySetInnerHTML={{ __html: o.html }} />
          </label>
        );
      })}
    </div>
  );
}
