// src/components/ExteriorWalls.jsx
'use client';
import { useState } from 'react';
import ExteriorWallGroup from '@/components/ExteriorWallGroup';

export default function ExteriorWalls() {
  const [groups, setGroups] = useState([{ id: 1 }]);

  const addGroup = () =>
    setGroups(gs => [...gs, { id: (gs.at(-1)?.id ?? 0) + 1 }]);

  const removeGroup = (id) =>
    setGroups(gs => gs.filter(g => g.id !== id));

  return (
    <div className="ew-stack">
      {groups.map((g, idx) => (
        <ExteriorWallGroup
          key={g.id}
          persistKey={`exterior-${g.id ?? idx}`}
          title={g.title}
          onRemove={() => removeGroup(g.id)}
        />
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="ew-btn" onClick={addGroup}>➕ Add exterior wall</button>
      </div>
    </div>
  );
}
