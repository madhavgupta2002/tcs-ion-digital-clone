import type { QStatus } from '../types';

/**
 * Palette badge for a question status.
 *  notVisited     – grey rounded square
 *  notAnswered    – orange-red badge, chamfered bottom
 *  answered       – green badge, chamfered top
 *  marked         – purple circle
 *  answeredMarked – purple circle with a small green tick badge
 */
export function StatusIcon({
  status,
  label,
  size = 'md',
  onClick,
  title,
}: {
  status: QStatus;
  label?: string | number;
  size?: 'xs' | 'sm' | 'md';
  onClick?: () => void;
  title?: string;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`qs qs-${status} qs-${size}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <span className="qs-num">{label}</span>
      {status === 'answeredMarked' && <span className="qs-tick" aria-hidden />}
    </Tag>
  );
}
