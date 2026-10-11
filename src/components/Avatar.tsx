/** Candidate photo, or a generic "candidate" pictogram on a light-grey ellipse. */
export function Avatar({
  url,
  size,
  width = size ?? 113,
  height = size ?? 100,
}: {
  url?: string;
  size?: number;
  width?: number;
  height?: number;
}) {
  if (url) {
    return <img src={url} alt="" width={width} height={height} style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }} />;
  }
  return (
    <svg width={width} height={height} viewBox="0 0 113 100" aria-hidden style={{ display: 'block' }}>
      <ellipse cx="56.5" cy="50" rx="56.5" ry="50" fill="#f7f7f7" />
      {/* head */}
      <circle cx="56.5" cy="36" r="10" fill="#000" />
      {/* shoulders */}
      <path d="M38 64c1.5-11 9-17 18.5-17S73.5 53 75 64z" fill="#000" />
      {/* open book */}
      <path d="M30 64.5h53v3.2c-9-1.3-18-.3-26.5 3.3C48 67.4 39 66.4 30 67.7z" fill="#000" />
      <path d="M30 69.5c9-1.3 18-.3 26.5 3.3 8.5-3.6 17.5-4.6 26.5-3.3v2.3c-9-1.2-18-.2-26.5 3.2-8.5-3.4-17.5-4.4-26.5-3.2z" fill="#000" />
    </svg>
  );
}
