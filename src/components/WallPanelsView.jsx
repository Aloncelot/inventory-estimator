// src/components/WallPanelsView.jsx
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import Level from '@/components/Level';
import PanelsManufactureEstimate from "@/components/PanelsManufactureEstimate";


function genLevel() {
  return { id: crypto?.randomUUID?.() || ('lvl-' + Math.random().toString(36).slice(2,8)), name: '' };
}

export default function WallPanelsView({ onGrandTotal}) {
  // Persist levels
  const [manufactureTotal, setManufactureTotal] = useState(0);
  const [extLfByLevel, setExtLfByLevel] = useState({}); // { levelId: lf }
  const handleExteriorLF = useCallback(({ id, lf }) => {
    setExtLfByLevel(prev => (prev[id] === lf ? prev : { ...prev, [id]: Number(lf) || 0 }));
  }, []);
  const totalExteriorLF = useMemo(
    () => Object.values(extLfByLevel).reduce((s, n) => s + (Number(n) || 0), 0),
    [extLfByLevel]
  );

  // panel length (ft) per level (from bottom plate size)
const [extPanelLenByLevel, setExtPanelLenByLevel] = useState({});
const handleExteriorPanelLen = useCallback(({ id, len }) => {
  setExtPanelLenByLevel(prev => (prev[id] === len ? prev : { ...prev, [id]: Number(len) || 0 }));
}, []);
const panelLenFtExterior = useMemo(() => {
  const vals = Object.values(extPanelLenByLevel).filter(Boolean);
  if (!vals.length) return 8;
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  return Number(Object.keys(counts).sort((a,b) => counts[b]-counts[a] || b-a)[0]);
}, [extPanelLenByLevel]);

  const [levels, setLevels] = useLocalStorageJson('inv:v1:levels', [
    { id: 'level-1', name: 'Level 1' },
  ]);

// One-time sanitize: ensure unique IDs, ensure names
  useEffect(() => {
    if (!Array.isArray(levels) || levels.length === 0) {
      setLevels([{ id: genLevel().id, name: 'Level 1' }]);
      return;
    }
    const seen = new Set();
    const clean = levels
      .map(l => ({ id: l?.id || genLevel().id, name: l?.name || '' }))
      .filter(l => (seen.has(l.id) ? false : (seen.add(l.id), true)))
      .map((l, i) => ({ ...l, name: l.name || `Level ${i + 1}` }));
    const same =
      clean.length === levels.length &&
      clean.every((l, i) => l.id === levels[i].id && l.name === levels[i].name);
    if (!same) setLevels(clean);
  }, []);

  // Per-level loose-materials subtotal (we can extend later to panel subtotals)
  const [totalsByLevel, setTotalsByLevel] = useState({});
  const [looseByLevel, setLooseByLevel] = useState({}); 

  const addLevel = useCallback(() => {
    const idx = levels.length + 1;
    const lvl = genLevel();
    lvl.name = `Level ${idx}`;
    setLevels(prev => [...prev, lvl]);
  }, [levels, setLevels]);

  const removeLevel = useCallback((id) => {
    setLevels(prev => prev.filter(l => l.id !== id));
    setLooseByLevel(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }, [setLevels]);

  const handleLooseTotal = useCallback(({ id, subtotal }) => {
    setLooseByLevel(prev => {
      if (prev[id] === subtotal) return prev;
      return { ...prev, [id]: subtotal };
    });
  }, []);

  const handleLevelTotal = useCallback(({id, total}) => {
    setTotalsByLevel(prev => (prev[id] === total ? prev : {...prev, [id]: total}));
  }, []);

const grandLooseTotal = useMemo(
  () => Object.values(looseByLevel).reduce((s, n) => s + (Number(n) || 0), 0),
  [looseByLevel]
);


const grandTotal = useMemo(
  () =>
   Object.values(totalsByLevel).reduce((s,n) => s + (Number(n) || 0), 0)
    + grandLooseTotal
    + Number(manufactureTotal || 0),
  [totalsByLevel, grandLooseTotal, manufactureTotal]
);

useEffect(()=> {
  if (typeof onGrandTotal === 'function') onGrandTotal(grandTotal);
}, [grandTotal, onGrandTotal]);

  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), []);
  const fmt = (n) => moneyFmt.format(Number(n) || 0);

const [manufactureRows, setManufactureRows] = useState({
  exteriorWalls: { lf: 0, panels: 0 },
  interiorShear: { lf: 0, panels: 0 },
  interiorBlockingOnly: { lf: 0, panels: 0 },
  interiorNonLoad: { lf: 0, panels: 0 },
  kneeWall: { lf: 0, panels: 0 },
  windows: { qty: 0 },
  exteriorDoors: { qty: 0 },
  blocking2x10: { rows: 0 },
});


  return (
    <div className="app-content">
      <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h1 className="ew-h2" style={{ margin:0 }}>Wall Panels</h1>
        <div className="ew-chip" title= "Sum of all levels (panels + loose)"> 
          Grand total: {fmt(grandTotal)}
          </div>
      </div>
      {levels.map((lvl, i) => (
        <Level
          key={lvl.id}
          id={lvl.id}
          name={lvl.name || `Level ${i + 1}`}
          onRemove={levels.length > 1 ? () => removeLevel(lvl.id) : undefined}
          onLooseTotal={handleLooseTotal}
          onLevelTotal={handleLevelTotal}
          onExteriorLF={handleExteriorLF}
          onExteriorPanelLen={handleExteriorPanelLen}
        />    
      ))}
        {/* Panels Manufacture Estimate */}
        <PanelsManufactureEstimate
          rows={manufactureRows}
          panelLenFt={8} 
          panelLenFtExterior={panelLenFtExterior}
          exteriorLF={totalExteriorLF}
          onTotalChange={({ total}) => setManufactureTotal(Number(total) || 0)}
        />
      <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div className="ew-subtle">Add another floor (mirrors functionality; you can input different quantities)</div>
        <button className="ew-btn ew-btn--turq" onClick={addLevel}>+ Add level</button>
      </div>
    </div>
  );
}
