import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ExamConfig, QuestionType, QStatus } from '../types';
import { StatusIcon } from '../components/StatusIcon';
import { marksFor } from '../engine/result';
import './instructions.css';

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
const roman = (n: number) => ROMAN[n] ?? String(n + 1);

function totalSec(cfg: ExamConfig): number {
  return cfg.timing.mode === 'global'
    ? (cfg.timing.totalDurationSec ?? 0)
    : cfg.sections.reduce((a, s) => a + (s.durationSec ?? 0), 0);
}

function typesPresent(cfg: ExamConfig): QuestionType[] {
  const set = new Set<QuestionType>();
  cfg.sections.forEach((s) => s.questions.forEach((q) => set.add(q.type)));
  return (['MCQ', 'MSQ', 'TITA'] as QuestionType[]).filter((t) => set.has(t));
}

const LEGEND: { status: QStatus; label: number; text: string }[] = [
  { status: 'notVisited', label: 1, text: 'You have not opened this question yet.' },
  { status: 'notAnswered', label: 3, text: 'You opened this question but did not save an answer.' },
  { status: 'answered', label: 5, text: 'You saved an answer for this question.' },
  { status: 'marked', label: 7, text: 'You marked this question for review without saving an answer.' },
  { status: 'answeredMarked', label: 9, text: 'You saved an answer and also marked this question for review.' },
];

function Html({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function GeneralInstructionsBody({ cfg }: { cfg: ExamConfig }) {
  if (cfg.instructions?.generalHtml) return <Html html={cfg.instructions.generalHtml} />;
  const n = cfg.sections.length;
  const total = formatDuration(totalSec(cfg));
  const sectional = cfg.timing.mode === 'sectional';
  const types = typesPresent(cfg);
  const typeText: Record<QuestionType, string> = {
    MCQ: 'multiple-choice questions with exactly one correct option',
    MSQ: 'multiple-select questions where one or more options may be correct',
    TITA: 'type-in questions where you enter the answer with the on-screen keypad',
  };
  return (
    <div>
      <p><b>General Instructions:</b></p>
      <ol>
        <li>
          This test has {n} section{n === 1 ? '' : 's'} and a total duration of {total} (h:mm:ss).
        </li>
        <li>
          {sectional
            ? 'Every section has its own countdown timer shown at the top right. When a section timer reaches zero, that section is locked and submitted automatically, and you then move on to the next one. You cannot return to a section once it is closed.'
            : 'A single countdown timer, shown at the top right, covers the whole test. You may switch between sections freely at any time. When the timer reaches zero the test is submitted automatically.'}
        </li>
        <li>
          The test contains {types.length ? types.map((t) => typeText[t]).join('; ') : 'questions'}.
        </li>
        {cfg.features?.calculator !== false && (
          <li>A virtual on-screen calculator is available for calculations; open it from the top bar when needed.</li>
        )}
        <li>
          The question palette on the right uses the following symbols to show the state of each question:
          <table className="ins-table">
            <thead>
              <tr>
                <th className="c">S. No.</th>
                <th className="c">Question with Status</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {LEGEND.map((r, i) => (
                <tr key={r.status}>
                  <td className="c">{String.fromCharCode(65 + i)}</td>
                  <td className="c"><StatusIcon status={r.status} label={r.label} size="sm" /></td>
                  <td>{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>Note: a question that is both answered and marked for review will be evaluated.</div>
        </li>
      </ol>
    </div>
  );
}

function Shell({ cfg, title, footer, children }: { cfg: ExamConfig; title: string; footer: ReactNode; children: ReactNode }) {
  const photo = cfg.candidate.photoUrl;
  return (
    <div className="ins-root">
      <div className="ins-band" />
      <div className="ins-cols">
        <div className="ins-left">
          <div className="ins-header">{title}</div>
          <div className="ins-scroll">{children}</div>
          <div className="ins-footer">{footer}</div>
        </div>
        <div className="ins-right">
          <div className="ins-avatar">
            {photo ? (
              <img src={photo} alt="" />
            ) : (
              <svg viewBox="0 0 44 44" aria-hidden>
                <circle cx="22" cy="22" r="22" fill="#d9d9d9" />
                <circle cx="22" cy="17" r="7" fill="#9aa3ad" />
                <path d="M7 40c0-9 7-14 15-14s15 5 15 14z" fill="#9aa3ad" />
              </svg>
            )}
          </div>
          <div className="ins-name">{cfg.candidate.name}</div>
        </div>
      </div>
    </div>
  );
}

export function InstructionsPage1({ cfg, onNext }: { cfg: ExamConfig; onNext: () => void }) {
  return (
    <Shell
      cfg={cfg}
      title="Instructions"
      footer={
        <div className="ins-footer-row ins-end">
          <button type="button" className="btn" onClick={onNext}>Next &gt;</button>
        </div>
      }
    >
      <GeneralInstructionsBody cfg={cfg} />
    </Shell>
  );
}

function OtherBody({ cfg }: { cfg: ExamConfig }) {
  if (cfg.instructions?.otherHtml) return <Html html={cfg.instructions.otherHtml} />;
  const sectional = cfg.timing.mode === 'sectional';
  const types = typesPresent(cfg);

  // marking scheme: collect distinct (type, plus, minus) combos
  const scheme = new Map<string, { type: QuestionType; plus: number; minus: number }>();
  cfg.sections.forEach((s) =>
    s.questions.forEach((q) => {
      const { plus, minus } = marksFor(cfg, s, q);
      scheme.set(`${q.type}|${plus}|${minus}`, { type: q.type, plus, minus });
    }),
  );
  const marking = [...scheme.values()].map((m) => (
    <li key={`${m.type}${m.plus}${m.minus}`} style={{ marginBottom: 2 }}>
      {m.type}: +{m.plus} for a correct answer, {m.minus > 0 ? `−${m.minus} for a wrong answer` : 'no deduction for a wrong answer'}, 0 if unattempted.
    </li>
  ));

  return (
    <div>
      <p><b>Other Important Instructions:</b></p>
      <ol>
        <li>
          Sections in this test:
          <table className="ins-table">
            <thead>
              <tr>
                <th className="c">Section</th>
                <th>Name</th>
                <th className="c">Questions</th>
                {sectional && <th className="c">Time</th>}
              </tr>
            </thead>
            <tbody>
              {cfg.sections.map((s, i) => (
                <tr key={s.id}>
                  <td className="c">{roman(i)}</td>
                  <td>{s.name}</td>
                  <td className="c">{s.questions.length}</td>
                  {sectional && <td className="c">{formatDuration(s.durationSec ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </li>
        <li>
          Marking scheme:
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{marking}</ul>
        </li>
        <li>
          How to answer:
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            {types.includes('MCQ') && <li>MCQ: click the radio button beside the one option you choose.</li>}
            {types.includes('MSQ') && <li>MSQ: tick the checkbox beside every option you believe is correct.</li>}
            {types.includes('TITA') && <li>TITA: type your numeric answer using the on-screen keypad.</li>}
          </ul>
        </li>
        <li>
          Buttons below each question: <b>Save &amp; Next</b> stores your answer and opens the next question;{' '}
          <b>Mark for Review &amp; Next</b> stores your answer (if any), flags the question for review and moves on;{' '}
          <b>Clear Response</b> removes your current selection.
        </li>
        <li>
          A selection counts only after you press Save &amp; Next or Mark for Review &amp; Next. Anything chosen but not saved will be discarded when you leave the question.
        </li>
      </ol>
      <p><b>Declaration by Candidate:</b></p>
      <p>
        I confirm that I will attempt this test on my own, without help from any person or unauthorised material, and that I will not copy or share the questions. I accept that any breach of these rules can lead to cancellation of my attempt.
      </p>
    </div>
  );
}

export function InstructionsPage2({
  cfg,
  onPrev,
  onBegin,
}: {
  cfg: ExamConfig;
  onPrev: () => void;
  onBegin: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const decl =
    cfg.instructions?.declaration ??
    'I have read and understood the instructions and agree to follow them. I confirm that I am not carrying any prohibited devices.';
  return (
    <Shell
      cfg={cfg}
      title="Instructions"
      footer={
        <>
          <label className="ins-decl">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>{decl}</span>
          </label>
          <div className="ins-nav">
            <button type="button" className="btn" onClick={onPrev}>&lt; Previous</button>
            <button type="button" className="btn btn-primary mid" disabled={!agreed} onClick={onBegin}>
              I am ready to begin
            </button>
          </div>
        </>
      }
    >
      <OtherBody cfg={cfg} />
    </Shell>
  );
}
