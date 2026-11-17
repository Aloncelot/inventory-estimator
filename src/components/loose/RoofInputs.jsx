// src/components/loose/RoofInputs.jsx
// The measurements typed for a roof section (roof area and the lengths of
// rafters, ridge, eaves, rakes, gables and trim) its rows are calculated from.
'use client';

import { useState, useEffect } from 'react';

// keeps typing local and reports the value when the field is left (not on every key)
function DebouncedInput({ value: propValue, onChange, className, ...props }) {
  const [localValue, setLocalValue] = useState(propValue ?? '');
  useEffect(() => { setLocalValue(propValue ?? ''); }, [propValue]);

  const commit = () => {
    if (localValue !== propValue) onChange(localValue);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { commit(); e.target.blur(); }
    else if (e.key === 'Escape') { setLocalValue(propValue ?? ''); e.target.blur(); }
  };

  return (
    <input
      {...props}
      className={`ew-input focus-anim ${className || ''}`}
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}

export default function RoofInputs({ inputs, onUpdate }) {
  const update = (key, val) => onUpdate(key, Number(val));

  return (
    <div className="controls4" style={{ marginBottom: 12 }}>
      <label>
        <span className="ew-subtle">Rafter Total LF</span>
        <DebouncedInput 
            type="number" 
            value={inputs.rafterLF} 
            onChange={v => update('rafterLF', v)} 
        />
      </label>
      <label>
        <span className="ew-subtle">Ridge LF</span>
        <DebouncedInput 
            type="number" 
            value={inputs.ridgeLF} 
            onChange={v => update('ridgeLF', v)} 
        />
      </label>
      <label>
        <span className="ew-subtle">Gable LF</span>
        <DebouncedInput 
            type="number" 
            value={inputs.gableLF} 
            onChange={v => update('gableLF', v)} 
        />
      </label>
      <label>
        <span className="ew-subtle">Eave LF</span>
        <DebouncedInput 
            type="number" 
            value={inputs.eaveLF} 
            onChange={v => update('eaveLF', v)} 
        />
      </label>
      <label>
        <span className="ew-subtle">Rake LF</span>
        <DebouncedInput 
            type="number" 
            value={inputs.rakeLF} 
            onChange={v => update('rakeLF', v)} 
        />
      </label>
      <label>
        <span className="ew-subtle">Roof Area (SqFt)</span>
        <DebouncedInput 
            type="number" 
            value={inputs.roofArea} 
            onChange={v => update('roofArea', v)} 
        />
      </label>
      <label>
        <span className="ew-subtle">Trim LF</span>
        <DebouncedInput 
            type="number" 
            value={inputs.trimLF} 
            onChange={v => update('trimLF', v)} 
        />
      </label>
      {/* hurricane ties and clips need no input: they are counted from the rafters and the sheathing */}
    </div>
  );
}