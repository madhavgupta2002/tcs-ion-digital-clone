import type { ExamConfig } from '../types';
import { marksFor } from '../engine/result';
import { Modal } from './Modal';

export function QuestionPaperModal({
  cfg,
  sectionIndex,
  onClose,
}: {
  cfg: ExamConfig;
  sectionIndex: number;
  onClose: () => void;
}) {
  const section = cfg.sections[sectionIndex];
  const seen = new Set<string>();
  return (
    <Modal title="Question Paper" onClose={onClose} closeLabel="close ×">
      <div style={{ fontFamily: 'var(--q-font)', fontSize: 17 }}>
        <div style={{ color: '#e0201d', fontSize: 19, marginBottom: 12 }}>
          The timer is still running. Close this window to return to your questions.
        </div>
        {section?.questions.map((q, i) => {
          const passage = q.passageId ? section.passages?.find((p) => p.id === q.passageId) : undefined;
          const first = passage ? !seen.has(passage.id) : false;
          if (passage) seen.add(passage.id);
          const { plus, minus } = marksFor(cfg, section, q);
          return (
            <div key={q.id}>
              <div style={{ fontWeight: 'bold', fontSize: 13, margin: '8px 0' }}>(Question Number {i + 1}):</div>
              {passage?.directions && (
                <div style={{ fontWeight: 'bold', margin: '6px 0' }} dangerouslySetInnerHTML={{ __html: passage.directions }} />
              )}
              {passage && first && <div style={{ margin: '6px 0' }} dangerouslySetInnerHTML={{ __html: passage.html }} />}
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', margin: '8px 0' }}>
                <span style={{ fontSize: 13, flex: 'none' }}>Q.{i + 1})</span>
                <div dangerouslySetInnerHTML={{ __html: q.html }} />
              </div>
              <div style={{ fontStyle: 'italic', fontSize: 13 }}>
                Marks for correct answer <span style={{ color: 'var(--green-num)' }}>{plus.toFixed(2)}</span> ; Negative Marks{' '}
                <span style={{ color: 'var(--red-num)' }}>{minus.toFixed(2)}</span>
              </div>
              <hr />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
