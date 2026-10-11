import type { ExamConfig, ExamResult } from '../types';
import { downloadJson } from '../engine/result';
import { fmtClock } from './ExamPage';
import './done.css';

export function Done({
  cfg,
  result,
  onRestart,
  hosted = false,
}: {
  cfg: ExamConfig;
  result: ExamResult;
  onRestart: () => void;
  hosted?: boolean;
}) {
  const showSummary = cfg.features?.showResultSummary !== false;
  return (
    <div className="done">
      <div className="done-band" />
      <div className="done-card">
        <h2>Thank you, {cfg.candidate.name}.</h2>
        <p>
          Your responses for <b>{cfg.title}</b> have been submitted
          {result.submitReason === 'timeout' ? ' automatically because the time ran out' : ''}.
        </p>

        {showSummary && (
          <table className="summary-table done-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Questions</th>
                <th>Answered</th>
                <th>Not Answered</th>
                <th>Marked for Review</th>
                <th>Answered &amp; Marked</th>
                <th>Not Visited</th>
                <th>Time Spent</th>
                {result.score && <th>Score</th>}
              </tr>
            </thead>
            <tbody>
              {result.sections.map((s) => (
                <tr key={s.id}>
                  <td className="left">{s.name}</td>
                  <td>{s.counts.total}</td>
                  <td>{s.counts.answered}</td>
                  <td>{s.counts.notAnswered}</td>
                  <td>{s.counts.marked}</td>
                  <td>{s.counts.answeredMarked}</td>
                  <td>{s.counts.notVisited}</td>
                  <td>{fmtClock(s.timeSpentSec * 1000)}</td>
                  {result.score && <td>{s.score ? `${s.score.marks} / ${s.score.maxMarks}` : '—'}</td>}
                </tr>
              ))}
            </tbody>
            {result.score && (
              <tfoot>
                <tr>
                  <td className="left" colSpan={7}>
                    <b>Total</b> (correct {result.score.correct}, incorrect {result.score.incorrect}, unattempted{' '}
                    {result.score.unattempted})
                  </td>
                  <td>{fmtClock(result.totalTimeSpentSec * 1000)}</td>
                  <td>
                    <b>
                      {result.score.marks} / {result.score.maxMarks}
                    </b>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        <div className="done-actions">
          {hosted ? (
            <button className="btn btn-primary" onClick={() => window.close()}>
              Close
            </button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => downloadJson(`${cfg.id}-result.json`, result)}>
                Download Result (JSON)
              </button>
              <button className="btn" onClick={onRestart}>
                Take Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
