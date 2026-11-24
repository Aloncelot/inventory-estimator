// src/components/NebulaMark.jsx
// The Nebula Estimator mark: a roof truss over a wall panel, against a
// nebula glow. The same drawing as the favicon (src/app/icon.svg); change
// both together. Size it with width/height or CSS.
import { useId } from 'react';

export default function NebulaMark({ className = '', size = 28 }) {
  const id = `neb${useId().replace(/:/g, '')}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id} cx="0.64" cy="0.3" r="0.62">
          <stop offset="0" stopColor="#8ea291" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#2f3d35" stopOpacity="0.45" />
          <stop offset="1" stopColor="#0c100e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0c100e" />
      <rect width="64" height="64" rx="14" fill={`url(#${id})`} />
      <circle cx="49" cy="13" r="1.7" fill="#dde7cb" />
      <circle cx="14" cy="17" r="1.1" fill="#dde7cb" opacity="0.75" />
      <circle cx="55" cy="29" r="0.9" fill="#dde7cb" opacity="0.6" />
      <path d="M32 13 9 40h46L32 13zM32 13v27M20.5 40 32 27.5 43.5 40" fill="none" stroke="#dde7cb" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M11 48h42M11 54h42M19 48v6M32 48v6M45 48v6" stroke="#8ea291" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
