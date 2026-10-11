import type { ExamConfig } from '../types';
import type { EngineState } from '../engine/reducer';
import { countStatuses } from '../engine/reducer';
import { Modal } from './Modal';

/** Summary table + Yes/No shown before submitting a section (sectional mode) or the whole exam (global mode). */
export function SubmitConfirm({
  cfg,
  state,
  scope,
  onYes,
  onNo,
}: {
  cfg: ExamConfig;
  state: EngineState;
  scope: 'section' | 'exam';
  onYes: () => void;
  onNo: () => void;
}) {
  const rows = scope === 'section' ? [state.activeSection] : cfg.sections.map((_, i) => i);
  const isLast = state.activeSection === cfg.sections.length - 1;
  const question =
    scope === 'exam' || isLast
      ? 'Are you sure you want to submit the exam? You will not be able to change your answers after this.'
      : 'Are you sure you want to submit this section? You will not be able to return to it.';

  return (
    <Modal title="Exam Summary" onClose={onNo} width="min(900px, 90vw)">
      <table className="summary-table">
        <thead>
          <tr>
            <th>Section Name</th>
            <th>No. of Questions</th>
            <th>Answered</th>
            <th>Not Answered</th>
            <th>Marked for Review</th>
            <th>Answered &amp; Marked for Review (will be considered for evaluation)</th>
            <th>Not Visited</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const c = countStatuses(state.q[i]);
            return (
              <tr key={i}>
                <td className="left">{cfg.sections[i].name}</td>
                <td>{cfg.sections[i].questions.length}</td>
                <td>{c.answered}</td>
                <td>{c.notAnswered}</td>
                <td>{c.marked}</td>
                <td>{c.answeredMarked}</td>
                <td>{c.notVisited}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="summary-q">{question}</p>
      <div className="summary-actions">
        <button className="btn btn-primary" onClick={onYes}>
          Yes
        </button>
        <button className="btn" onClick={onNo}>
          No
        </button>
      </div>
    </Modal>
  );
}
