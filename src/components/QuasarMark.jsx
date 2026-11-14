// src/components/QuasarMark.jsx
// The QuasarDevs logo with its accretion disk spinning (CSS only, .qspin in
// globals.css). Layers: full disk, jet and core, front half of the disk on top.
// Set the size with the height, e.g. style={{ height: 56 }}.
/* eslint-disable @next/next/no-img-element */
export default function QuasarMark({ className = '', style }) {
  const disk = (
    <span className="qspin__squash">
      <img src="/quasar-devs/disk.webp" alt="" width={434} height={437} className="qspin__spin" />
    </span>
  );
  return (
    <span className={`qspin ${className}`.trim()} style={style} aria-hidden="true">
      <span className="qspin__disk">{disk}</span>
      <img src="/quasar-devs/core.png" alt="" width={502} height={452} className="qspin__core" />
      <span className="qspin__disk qspin__disk--front">{disk}</span>
    </span>
  );
}

export const QUASAR_URL = 'https://quasardevs.com';
