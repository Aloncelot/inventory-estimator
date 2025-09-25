// src/components/InteriorWalls.jsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import InteriorWallGroup from '@/components/InteriorWallGroup';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

const genId = () => 'int-' + Math.random().toString(36).slice(2, 9);

export default function InteriorWalls({
  title = 'Interior walls',
  levelId = 'default',               // <-- important for per-level storage
  onTotalsChange,                    // ({ int2x6LF, int2x4LF, intPlatePieces, intPTLFSum }) => void
}) {
  // One persisted list of sections per level
  const [sections, setSections] = useLocalStorageJson(
    `inv:v1:int:sections:${levelId}`,
    [{ id: genId() }]
  );

  // Stats reported by each section
  const [stats, setStats] = useState({}); // { [id]: { kind, lengthLF, platePieces, ptLF } }

  const updateStats = useCallback((id, s) => {
    setStats(prev => ({ ...prev, [id]: s }));
  }, []);

  const addSection = useCallback(() => {
    setSections(prev => [...prev, { id: genId() }]);
  }, [setSections]);

  const removeSection = useCallback((id) => {
    setSections(prev => prev.filter(s => s.id !== id));
    setStats(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }, [setSections]);

  // Roll-up totals across all interior sections for this level
  const totals = useMemo(() => {
    const arr = Object.values(stats);
    const int2x6LF = arr
      .filter(s => s?.kind === 'int-2x6')
      .reduce((a, b) => a + (Number(b?.lengthLF) || 0), 0);
    const int2x4LF = arr
      .filter(s => s?.kind === 'int-2x4')
      .reduce((a, b) => a + (Number(b?.lengthLF) || 0), 0);
    const intPlatePieces = arr.reduce((a, b) => a + (Number(b?.platePieces)   || 0), 0);
    const intPTLFSum     = arr.reduce((a, b) => a + (Number(b?.ptLF)          || 0), 0);
    const panelsSubtotal = arr.reduce((a, b) => a + (Number(b?.groupSubtotal) || 0), 0)
    return { int2x6LF, int2x4LF, intPlatePieces, intPTLFSum, panelsSubtotal };
  }, [stats]);

  // Emit to parent (Level.jsx)
  useEffect(() => {
    onTotalsChange?.(totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals]);

  return (
    <div className="ew-stack">
      <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2 className="ew-h2" style={{ margin:0 }}>{title}</h2>
        <button className="ew-btn ew-btn--turq" onClick={addSection}>+ Add interior wall section</button>
      </div>

      {sections.map((sec, i) => (
        <InteriorWallGroup
          key={sec.id}
          title={`${title} — Section ${i + 1}`}
          persistKey={`int:${levelId}:${sec.id}`}             // keep notes/selections per-level & per-section
          onRemove={() => removeSection(sec.id)}
          onStatsChange={(s) => updateStats(sec.id, s)}       // section → wrapper
        />
      ))}
    </div>
  );
}
