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

const LEGEND: { status: QStatus; key: string; label: string }[] = [
  { status: 'notVisited', key: 'nv', label: 'Not Visited' },
  { status: 'notAnswered', key: 'na', label: 'Not Answered' },
  { status: 'answered', key: 'a', label: 'Answered' },
  { status: 'marked', key: 'm', label: 'Marked for Review' },
  { status: 'answeredMarked', key: 'am', label: 'Answered & Marked for Review(will be considered for evaluation)' },
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
  const [split, setSplit] = useState(59.4);

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
      Mark/s:<span className="pos">{plus.toFixed(2)}</span>| Negative Mark/s:<span className="neg">{minus.toFixed(2)}</span>
    </div>
  );

  const questionBlock = (
    <>
      {marksStrip}
      <div className="q-no">Question No. {qi + 1}.</div>
      <div className="q-content">
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
              <CalcIcon /> Calculator
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
              <PaperIcon /> Question Paper
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
              <InfoIcon /> View Instruction
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
              Time Left : <span className="clock">{fmtClock(remaining)}</span>
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
                  {locked && <LockIcon />}
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
                <div className="question-pane" ref={qPaneRef}>
                  {questionBlock}
                </div>
              </>
            ) : (
              <div className="question-pane full" ref={qPaneRef}>
                {questionBlock}
              </div>
            )}

          <button
            className="collapse"
            title={paletteHidden ? 'Show palette' : 'Hide palette'}
            onClick={() => setPaletteHidden((h) => !h)}
          >
            <Chevron left={paletteHidden} />
          </button>
          </div>
        </main>

        {/* ---------------- right column ---------------- */}
        {!paletteHidden && (
          <aside className="side">
            <div className="profile">
              <div className="avatar">
                <Avatar url={cfg.candidate.photoUrl} width={113} height={100} />
              </div>
              <div className="cand-name">{cfg.candidate.name}</div>
            </div>

            <div className="side-box">
              <div className="legend">
                {LEGEND.map((l) => (
                  <span key={l.status}>
                    <span className={`lg lg-${l.key}`}>
                      <StatusIcon status={l.status} label={counts[l.status]} size="sm" />
                    </span>
                    <span className={`lg-text t-${l.key}`}>{l.label}</span>
                  </span>
                ))}
              </div>
              <div className="side-bar" />
              <div className="palette">
                <div className="palette-title">Choose a question</div>
                <div className="palette-grid">
                  {state.q[si].map((qs, i) => (
                    <StatusIcon
                      key={i}
                      status={qs.status}
                      label={i + 1}
                      current={i === qi}
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
          <button className="bbtn" onClick={() => dispatch({ type: 'MARK_NEXT', now: now() })}>
            Mark for review and Next
          </button>
          <button className="bbtn" onClick={() => dispatch({ type: 'CLEAR', now: now() })}>
            Clear Response
          </button>
          <span className="spacer" />
          <button className="bbtn blue" onClick={() => dispatch({ type: 'SAVE_NEXT', now: now() })}>
            Save &amp; Next
          </button>
        </div>
        <div className="bb-side">
          <button
            className="bbtn blue"
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

function CalcIcon() {
  return (
    <svg className="ico" width="22" height="26" viewBox="0 0 22 26" aria-hidden>
      <rect width="22" height="26" rx="3" fill="#f6a01a" />
      <rect x="3" y="3" width="16" height="6" rx="1" fill="#5b3300" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={3.5 + c * 5.5} y={12 + r * 4.5} width="4" height="3" rx="0.6" fill="#5b3300" />))}
    </svg>
  );
}
function PaperIcon() {
  return (
    <svg className="ico" width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="11" fill="#3fbf6f" />
      <rect x="6.5" y="5" width="9" height="12" rx="1" fill="#fff" />
      <path d="M8.5 8.5h5M8.5 11h5M8.5 13.5h5" stroke="#3fbf6f" strokeWidth="1.3" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg className="ico" width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="11" fill="#2f8be6" />
      <text x="11" y="16.5" textAnchor="middle" fill="#fff" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="bold" fontSize="16">
        i
      </text>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg className="lock" width="11" height="14" viewBox="0 0 10 13" aria-label="locked">
      <path d="M2.3 6V4.2a2.7 2.7 0 0 1 5.4 0V6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="0" y="5.6" width="10" height="7.4" rx="1.2" fill="currentColor" />
    </svg>
  );
}
function Chevron({ left }: { left: boolean }) {
  return (
    <svg width="9" height="14" viewBox="0 0 9 14" aria-hidden style={{ transform: left ? 'scaleX(-1)' : undefined }}>
      <path d="M1.5 1.5 7 7l-5.5 5.5" fill="none" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}
