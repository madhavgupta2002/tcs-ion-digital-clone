import { useId } from 'react';
import type { QStatus } from '../types';

/**
 * Palette badge for a question status, drawn as SVG so the shape, gradient and
 * 1px border all render crisply.
 *
 * Geometry is defined once at palette size (md) and scaled for the legend (sm/xs).
 *   notVisited     54×53  grey rounded square
 *   notAnswered    61×51  orange, flat top, chamfered bottom (current question: rounded top)
 *   answered       62×52  green, chamfered top, flat bottom
 *   marked         59×59  purple disc
 *   answeredMarked 59×59  purple disc + green note badge bottom-right
 */
const DIMS: Record<QStatus, [number, number]> = {
  notVisited: [54, 53],
  notAnswered: [61, 51],
  answered: [62, 52],
  marked: [59, 59],
  answeredMarked: [59, 59],
};

const SCALE = { md: 1, sm: 0.62, xs: 0.44 } as const;

export function StatusIcon({
  status,
  label,
  size = 'md',
  current = false,
  onClick,
  title,
}: {
  status: QStatus;
  label?: string | number;
  size?: keyof typeof SCALE;
  /** Current question renders the "not answered" badge with a rounded top. */
  current?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const [w, h] = DIMS[status];
  const k = SCALE[size];
  const Tag = onClick ? 'button' : 'span';
  const text = status === 'notVisited' ? '#333' : '#fff';
  // Vertical position of the label inside each badge (fraction of height).
  const ty = status === 'answered' ? 0.56 : status === 'notAnswered' ? 0.47 : 0.5;

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`qs qs-${size}`}
      style={{ width: w * k, height: h * k }}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <svg width={w * k} height={h * k} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <defs>
          <linearGradient id={`${gid}g`} x1="0" y1="0" x2="0" y2="1">
            {status === 'notVisited' && (
              <>
                <stop offset="0" stopColor="#f6f6f6" />
                <stop offset="1" stopColor="#cfcfcf" />
              </>
            )}
            {status === 'notAnswered' && (
              <>
                <stop offset="0" stopColor="#ff5a05" />
                <stop offset="1" stopColor="#b22808" />
              </>
            )}
            {status === 'answered' && (
              <>
                <stop offset="0" stopColor="#b7e43c" />
                <stop offset="1" stopColor="#47a212" />
              </>
            )}
            {(status === 'marked' || status === 'answeredMarked') && (
              <>
                <stop offset="0" stopColor="#8c63aa" />
                <stop offset="1" stopColor="#5b387d" />
              </>
            )}
          </linearGradient>
        </defs>

        {status === 'notVisited' && (
          <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="3" fill={`url(#${gid}g)`} stroke="#9c9c9c" />
        )}
        {status === 'notAnswered' &&
          (current ? (
            <path
              d="M0.5 30 C0.5 11 14 0.5 30.5 0.5 C47 0.5 60.5 11 60.5 30 L60.5 33 L44 50.5 L17 50.5 L0.5 33 Z"
              fill={`url(#${gid}g)`}
              stroke="#dc5a28"
            />
          ) : (
            <path d="M0.5 0.5 H60.5 V32 L44 50.5 H17 L0.5 32 Z" fill={`url(#${gid}g)`} stroke="#dc5a28" />
          ))}
        {status === 'answered' && (
          <path d="M17 0.5 H45 L61.5 19 V51.5 H0.5 V19 Z" fill={`url(#${gid}g)`} stroke="#8fd04c" />
        )}
        {(status === 'marked' || status === 'answeredMarked') && (
          <circle cx={w / 2} cy={h / 2} r={w / 2 - 0.5} fill={`url(#${gid}g)`} stroke="#7c5b9b" />
        )}
        {status === 'answeredMarked' && (
          <g transform="translate(46 46)">
            <circle r="12" fill="#8dc63f" stroke="#c5e59a" strokeWidth="1.5" />
            <rect x="-5.5" y="-6" width="11" height="12" rx="1.5" fill="none" stroke="#fff" strokeWidth="1.6" />
            <path d="M-3 -2.5 H3 M-3 0.5 H3 M-3 3.5 H3" stroke="#fff" strokeWidth="1.3" />
          </g>
        )}

        {label !== undefined && label !== '' && (
          <text
            x={status === 'answeredMarked' ? w / 2 - 1 : w / 2}
            y={h * ty}
            textAnchor="middle"
            dominantBaseline="central"
            fill={text}
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize={size === 'md' ? 26 : 22}
            fontWeight={size === 'md' ? 400 : 700}
          >
            {label}
          </text>
        )}
      </svg>
    </Tag>
  );
}
