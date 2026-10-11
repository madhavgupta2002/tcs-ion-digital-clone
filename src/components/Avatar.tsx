/** Candidate photo, or a generic person silhouette on a grey disc. */
export function Avatar({ url, size = 110 }: { url?: string; size?: number }) {
  if (url) {
    return (
      <img src={url} alt="" width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: 'block' }}>
      <circle cx="50" cy="50" r="50" fill="#f1f1f1" />
      <circle cx="50" cy="36" r="13" fill="#111" />
      <path d="M24 72c3-14 14-21 26-21s23 7 26 21z" fill="#111" />
      <path d="M22 74h56v4H22z" fill="#111" />
      <path d="M50 58l-6 14h12z" fill="#f1f1f1" />
    </svg>
  );
}
