/* Small icons for the plan drawing tools, drawn like the lucide set (24 grid, 2px stroke). */
const base = (size) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true });

/** Some walls locked, some unlocked: a lock with one closed and one open half. */
export function LockMixed({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 5-5" />
      <path d="M12 2a5 5 0 0 1 5 5" strokeDasharray="2 2.5" />
      <path d="M3 11l9 11V11z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Grip on: a bolt runs from the moved wall into the wall it meets. */
export function GripOn({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <rect x="2" y="3" width="7" height="18" rx="1" />
      <rect x="12" y="9" width="10" height="6" rx="1" />
      <path d="M5.5 12H17" strokeWidth="2.6" />
      <circle cx="17" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** Grip off: the bolt is drawn back into the wall, the other wall is free. */
export function GripOff({ size = 16 }) {
  return (
    <svg {...base(size)}>
      <rect x="2" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="9" width="8" height="6" rx="1" strokeDasharray="2 2" />
      <path d="M4.5 12H8" strokeWidth="2.6" />
    </svg>
  );
}
