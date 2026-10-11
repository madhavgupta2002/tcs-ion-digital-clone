import { useEffect } from 'react';
import type { ReactNode } from 'react';
import './modal.css';

export function Modal({
  title,
  onClose,
  closeLabel = '×',
  children,
  width,
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
  width?: string | number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: width ?? '78vw' }} role="dialog" aria-label={title}>
        <div className="modal-title">
          <span>{title}</span>
          <button type="button" className="modal-close" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
