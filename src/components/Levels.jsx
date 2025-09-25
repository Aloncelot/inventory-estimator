// src/components/Levels.jsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';
import LoosePanelMaterials from '@/components/LoosePanelMaterials';
export { default } from './Level';


function genLevelId() {
  return 'lvl-' + Math.random().toString(36).slice(2, 8);
}

export default function Levels() {
  // Persist levels (name/collapsed) + stable ids
  const [levels, setLevels] = useLocalStorageJson('inv:v1:levels', [
    { id: genLevelId(), name: 'Level 1', collapsed: false },
  ]);

  // Per-level running totals collected from children
  // shape:
  // {
  //   [levelId]: {
  //     exterior: { extLengthSum, extZipSheetsSum, extPlatePieces, extPTLFSum, extMoneySum },
  //     interior: { int2x6LF, int2x4LF, intPlatePieces, intPTLFSum, intMoneySum },
  //     loose:    { looseSubtotal }
  //   }
  // }
  const [byLevel, setByLevel] = useState({});

  const upsert = useCallback((levelId, part, data) => {
    if (!levelId || !part || !data) return;
    setByLevel(prev => {
      const prevLevel = prev[levelId] || {};
      const nextLevel = { ...prevLevel, [part]: { ...(prevLevel[part]||{}), ...data } };
      // shallow equality guard to avoid thrashing renders
      const same =
        JSON.stringify(prevLevel[part] || {}) === JSON.stringify(nextLevel[part] || {});
      if (same) return prev;
      return { ...prev, [levelId]: nextLevel };
    });
  }, []);

  const addLevel = () => {
    setLevels(prev => [
      ...prev,
      { id: genLevelId(), name: `Level ${prev.length + 1}`, collapsed: false },
    ]);
  };

  const removeLevel = (id) => {
    setLevels(prev => prev.filter(l => l.id !== id));
    setByLevel(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const setCollapsed = (id, collapsed) => {
    setLevels(prev => prev.map(l => (l.id === id ? { ...l, collapsed } : l)));
  };

  const renameLevel = (id, name) => {
    setLevels(prev => prev.map(l => (l.id === id ? { ...l, name } : l)));
  };

  // Compute per-level subtotal and grand total
  const computed = useMemo(() => {
    const out = {};
    let grandTotal = 0;

    for (const lv of levels) {
      const rec = byLevel[lv.id] || {};
      const ex  = rec.exterior || {};
      const inn = rec.interior || {};
      const loose = rec.loose || {};

      const levelSubtotal =
        Number(ex.extMoneySum || 0) +
        Number(inn.intMoneySum || 0) +
        Number(loose.looseSubtotal || 0);

      out[lv.id] = { levelSubtotal };
      grandTotal += levelSubtotal;
    }

    return { perLevel: out, grandTotal };
  }, [levels, byLevel]);

  return (
    <main style={{ padding: 24 }}>
      {levels.map((lv, idx) => {
        // wire up props for LoosePanelMaterials from ex+int stats
        const stats = byLevel[lv.id] || {};
        const ex = stats.exterior || {};
        const inn = stats.interior || {};

        const looseInputs = {
          extLengthLF:       ex.extLengthSum || 0,
          extZipSheetsFinal: ex.extZipSheetsSum || 0,
          int2x6LF:          inn.int2x6LF || 0,
          int2x4LF:          inn.int2x4LF || 0,
          platePiecesTotal:  (ex.extPlatePieces || 0) + (inn.intPlatePieces || 0),
          ptLFTotal:         (ex.extPTLFSum || 0) + (inn.intPTLFSum || 0),
        };

        return (
          <section key={lv.id} className="ew-stack">
            {/* Level header */}
            <div className="ew-card" style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button
                className="ew-btn"
                onClick={() => setCollapsed(lv.id, !lv.collapsed)}
                aria-label={lv.collapsed ? 'Expand level' : 'Collapse level'}
                title={lv.collapsed ? 'Expand' : 'Collapse'}
                style={{ padding:'4px 8px', lineHeight:1 }}
              >
                {lv.collapsed ? '▶' : '🔽'}
              </button>

              <input
                className="ew-input focus-anim"
                value={lv.name}
                onChange={e => renameLevel(lv.id, e.target.value)}
                style={{ maxWidth: 240 }}
              />

              <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
                <div className="ew-chip" title="Level subtotal">
                  {Number.isFinite(computed.perLevel[lv.id]?.levelSubtotal)
                    ? new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' })
                        .format(computed.perLevel[lv.id].levelSubtotal)
                    : '—'}
                </div>
                <button className="ew-btn" onClick={() => removeLevel(lv.id)}>Remove level</button>
              </div>
            </div>

            {/* Level body (stays mounted) */}
            <div style={{ display: lv.collapsed ? 'none' : 'block' }}>
              <ExteriorWalls levelId={id} onTotalsChange={handleExtTotals} title={`${name} — Exterior walls`} />
              <InteriorWalls levelId={id} onTotalsChange={handleIntTotals} title={`${name} — Interior walls`} />
              <LoosePanelMaterials
                title={`${lv.name} — Loose materials — Wall Panels`}
                persistKey={`loose:${lv.id}`}
                {...looseInputs}
                onTotalChange={(payload) => {
                  // payload: { id, looseSubtotal }
                  upsert(lv.id, 'loose', { looseSubtotal: Number(payload?.looseSubtotal || 0) });
                }}
              />
            </div>
          </section>
        );
      })}

      {/* Add level + grand total */}
      <div className="ew-card" style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'space-between' }}>
        <button className="ew-btn ew-btn--turq" onClick={addLevel}>+ Add level</button>
        <div style={{ fontWeight:700 }}>
          Grand total:{' '}
          {new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' })
            .format(computed.grandTotal)}
        </div>
      </div>
    </main>
  );
}
