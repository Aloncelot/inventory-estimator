// src/components/ExteriorWalls.jsx
'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import ExteriorWallGroup from '@/components/ExteriorWallGroup';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import AddButton from './ui/AddButton';

const sameTotals = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.extLengthSum        === b.extLengthSum &&
    a.extZipSheetsSum     === b.extZipSheetsSum &&
    a.extPlatePieces      === b.extPlatePieces &&
    a.extPTLFSum          === b.extPTLFSum &&
    a.extMoneySum         === b.extMoneySum &&
    a.panelsSubtotal      === b.panelsSubtotal &&
    a.panelLenFtExterior  === b.panelLenFtExterior
  );
};

function genId() {
  return 'ex-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
}

export default function ExteriorWalls({
  onTotalsChange,
  title = 'Exterior walls',
  levelId = 'default',
  onLengthLFChange,      
  onPanelLenFtChange,   
  isLevelOne = false,
}) {
  // Sections per level
  const [sections, setSections] = useLocalStorageJson(`inv:v1:ex:sections:${levelId}`, [
    { id: genId() },
  ]);

  // Stats each section
  const [statsById, setStatsById] = useState({}); 

  const addSection = () => setSections(prev => [...prev, { id: genId() }]);
  const removeSection = (id) => {
    setSections(prev => prev.filter(s => s.id !== id));
    setStatsById(prev => {
      const c = { ...prev };
      delete c[id];
      return c;
    });
  };

  // Get changes on each group
  const handleStatsChange = useCallback((s) => {
    if (!s || !s.id) return;
    setStatsById(prev => {
      const p = prev[s.id];
      if (
        p &&
        p.lengthLF        === s.lengthLF &&
        p.zipSheetsFinal  === s.zipSheetsFinal &&
        p.platePieces     === s.platePieces &&
        p.ptLF            === s.ptLF &&
        p.groupSubtotal   === s.groupSubtotal &&
        p.bottomBoardLenFt=== s.bottomBoardLenFt
      ) {
        return prev;
      }
      return { ...prev, [s.id]: s };
    });
  }, []);

  // Totals
  const totals = useMemo(() => {
    const arr = Object.values(statsById);
    const extLengthSum    = arr.reduce((sum, s) => sum + (Number(s.lengthLF)       || 0), 0);
    const extZipSheetsSum = arr.reduce((sum, s) => sum + (Number(s.zipSheetsFinal) || 0), 0);
    const extPlatePieces  = arr.reduce((sum, s) => sum + (Number(s.platePieces)    || 0), 0);
    const extPTLFSum      = arr.reduce((sum, s) => sum + (Number(s.ptLF)           || 0), 0);
    const extMoneySum     = arr.reduce((sum, s) => sum + (Number(s.groupSubtotal)  || 0), 0);
    const panelsSubtotal  = arr.reduce((sum, s) => sum + (Number(s.groupSubtotal)  || 0), 0);
    
    return { 
      extLengthSum, 
      extZipSheetsSum, 
      extZipSheetsFinal: extZipSheetsSum,
      extPlatePieces, 
      extPTLFSum, 
      extMoneySum, 
      panelsSubtotal, 
    };
  }, [statsById]);

  const panelLenFtExterior = useMemo(() => {
    const vals = Object.values(statsById)
      .map(s => Number(s.bottomBoardLenFt) || 0)
      .filter(Boolean);
    if (!vals.length) return 8;
    const counts = {};
    for (const v of vals) counts[v] = (counts[v] || 0) + 1;
    return Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a] || b - a)[0]);
  }, [statsById]);

  const lastSentRef = useRef(null);
  useEffect(() => {
    const payload = { ...totals, panelLenFtExterior };
    if (sameTotals(payload, lastSentRef.current)) return;
    lastSentRef.current = payload;

    onTotalsChange?.(payload);
    onLengthLFChange?.(totals.extLengthSum);
    onPanelLenFtChange?.(panelLenFtExterior);
  }, [totals, panelLenFtExterior, onTotalsChange, onLengthLFChange, onPanelLenFtChange]);

  return (
    <section className="ew-stack">
      <div className="ew-card" style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'space-between' }}>
        <h2 className="ew-h2" style={{ margin:0 }}>{title}</h2>        
        <AddButton onClick={addSection} title="Add wall" label="Add wall" />
      </div>

      {sections.length === 0 && (
        <div className="ew-card">
          <div className="ew-subtle">No exterior wall sections yet.</div>
          <div style={{ marginTop: 8 }}>
            <button className="ew-btn ew-btn--turq" onClick={addSection}>+ Add exterior wall section</button>
          </div>
        </div>
      )}

      {sections.map((sec, idx) => (
        <ExteriorWallGroup
          key={sec.id}
          persistKey={`exterior:${sec.id}`}
          title={`Exterior walls — section ${idx + 1}`}
          onRemove={() => removeSection(sec.id)}
          onStatsChange={handleStatsChange}
          bottomDefaultFamily={isLevelOne ? 'PT' : 'SPF#2'}
        />
      ))}
    </section>
  );
}
