// src/components/InteriorWalls.jsx
'use client';
import { useState } from 'react';
import InteriorWallGroup from './InteriorWallGroup';

export default function InteriorWalls() {
  const [groups, setGroups] = useState([{ id: 1 }]);
  const addGroup = () => setGroups(gs => [...gs, { id: (gs.at(-1)?.id ?? 0) + 1 }]);
  const removeGroup = (id) => setGroups(gs => gs.filter(g => g.id !== id));

  return (

    
    <div className="ew-stack">
      {groups.map((g, idx) => (
        <InteriorWallGroup
          key={g.id}
          persistKey={`interior-${g.id ?? idx}`}
          title={g.title}
          onRemove={() => removeGroup(g.id)}
        />
      ))}

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
        <button className="ew-btn" onClick={addGroup}>➕ Add wall section</button>
      </div>
    </div>
  );
}
