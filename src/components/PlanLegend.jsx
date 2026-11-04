// src/components/PlanLegend.jsx
// Legend of the plan drawings that is also their control: pick the colour of
// each wall type, windows and doors, and hide or show them (nothing is deleted).
'use client';

import { Eye, EyeOff } from 'lucide-react';
import { DISPLAY_ITEMS } from '@/domain/plans/display';

export default function PlanLegend({ display, onChange, className = '' }) {
  const set = (key, patch) => onChange({
    colors: { ...display.colors, ...(patch.color ? { [key]: patch.color } : {}) },
    hidden: { ...display.hidden, ...(patch.hidden !== undefined ? { [key]: patch.hidden } : {}) },
  });
  return (
    <div className={`pl-legend ${className}`}>
      {DISPLAY_ITEMS.map(({ key, label }) => {
        const hidden = Boolean(display.hidden[key]);
        return (
          <span key={key} className={`pl-item${hidden ? ' is-hidden' : ''}`}>
            <button type="button" className="ew-icon-btn" onClick={() => set(key, { hidden: !hidden })} title={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()} (they still count)`} aria-pressed={!hidden}>
              {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <label className="pl-swatch" title={`Colour of ${label.toLowerCase()}`}>
              <input type="color" value={display.colors[key]} onChange={(e) => set(key, { color: e.target.value })} />
              <i style={{ background: display.colors[key] }} />
            </label>
            {label}
          </span>
        );
      })}
    </div>
  );
}
