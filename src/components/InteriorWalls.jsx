// src/components/InteriorWalls.jsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import InteriorWallGroup from './InteriorWallGroup';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

function genId() {
  return 'int-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
}

export default function InteriorWalls({
  onTotalsChange,
  title = 'Interior walls',
  storageKeyPrefix = 'inv:v1:int:sections',   // <— namespaced by level
}) {
  const [sections, setSections] = useLocalStorageJson(storageKeyPrefix, [
    { id: genId() },
  ]);

  const [statsById, setStatsById] = useState({}); // { [id]: { id, kind, lengthLF, platePieces, ptLF, groupSubtotal } }

  const addSection = () => setSections(prev => [...prev, { id: genId() }]);
  const removeSection = (id) => {
    setSections(prev => prev.filter(s => s.id !== id));
    setStatsById(prev => { const c = { ...prev }; delete c[id]; return c; });
  };

  const handleStatsChange = useCallback((s) => {
    if (!s || !s.id) return;
    setStatsById(prev => {
      const p = prev[s.id];
      if (p &&
          p.lengthLF === s.lengthLF &&
          p.platePieces === s.platePieces &&
          p.ptLF === s.ptLF &&
          p.kind === s.kind &&
          p.groupSubtotal === s.groupSubtotal) {
        return prev;
      }
      return { ...prev, [s.id]: s };
    });
  }, []);

  const totals = useMemo(() => {
    const arr = Object.values(statsById);
    const int2x6LF       = arr.filter(s => s?.kind === 'int-2x6').reduce((sum, s) => sum + (Number(s.lengthLF) || 0), 0);
    const int2x4LF       = arr.filter(s => s?.kind === 'int-2x4').reduce((sum, s) => sum + (Number(s.lengthLF) || 0), 0);
    const intPlatePieces = arr.reduce((sum, s) => sum + (Number(s.platePieces) || 0), 0);
    const intPTLFSum     = arr.reduce((sum, s) => sum + (Number(s.ptLF) || 0), 0);
    const intMoneySum    = arr.reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    return { int2x6LF, int2x4LF, intPlatePieces, intPTLFSum, intMoneySum };
  }, [statsById]);

  useEffect(() => { onTotalsChange?.(totals); }, [totals, onTotalsChange]);

  return (
    <section className="ew-stack">
      <div className="ew-card" style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'space-between' }}>
        <h2 className="ew-h2" style={{ margin: 0 }}>{title}</h2>
        <button className="ew-btn ew-btn--turq" onClick={addSection}>+ Add interior wall section</button>
      </div>

      {sections.length === 0 && (
        <div className="ew-card">
          <div className="ew-subtle">No interior wall sections yet.</div>
          <div style={{ marginTop: 8 }}>
            <button className="ew-btn ew-btn--turq" onClick={addSection}>+ Add interior wall section</button>
          </div>
        </div>
      )}

      {sections.map((sec, idx) => (
        <InteriorWallGroup
          key={sec.id}
          persistKey={`interior:${sec.id}`}
          title={`Interior walls — section ${idx + 1}`}
          onRemove={() => removeSection(sec.id)}
          onStatsChange={handleStatsChange}
        />
      ))}
    </section>
  );
}
