import type { ExamConfig } from '../types';
import { Modal } from './Modal';
import { GeneralInstructionsBody } from '../screens/Instructions';

export function InstructionsModal({ cfg, onClose }: { cfg: ExamConfig; onClose: () => void }) {
  return (
    <Modal title="Instructions" onClose={onClose}>
      <div style={{ fontSize: 13, lineHeight: 1.45 }}>
        <b>Please read the following instructions carefully</b>
        <GeneralInstructionsBody cfg={cfg} />
      </div>
    </Modal>
  );
}
