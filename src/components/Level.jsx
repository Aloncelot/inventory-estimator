// src/components/Level.jsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';
import LoosePanelMaterials from '@/components/LoosePanelMaterials';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

export default function Level({
  id,           // required: stable per-level id
  name,         // e.g. "Level 1"
  onRemove,     // optional: () => void
  onLooseTotal, // optional: ({ id, subtotal }) => void  (kept for external listeners)
  onLevelTotal,
}) {
  // UI (collapsed persisted per level)
  const [ui, setUi] = useLocalStorageJson(`inv:v1:level-ui:${id}`, { collapsed: false });
  const collapsed = !!ui.collapsed;
  const toggleCollapsed = () => setUi(prev => ({ ...prev, collapsed: !prev.collapsed }));

  // Live totals reported by wrappers
  const [extTotals, setExtTotals] = useState({
    extLengthSum: 0, extZipSheetsSum: 0, extPlatePieces: 0, extPTLFSum: 0,
    panelsSubtotal: 0, // NEW: sum of ExteriorWallGroup groupSubtotal for this level
  });
  const [intTotals, setIntTotals] = useState({
    int2x6LF: 0, int2x4LF: 0, intPlatePieces: 0, intPTLFSum: 0,
    panelsSubtotal: 0, // NEW: sum of InteriorWallGroup groupSubtotal for this level
  });
  const [looseSubtotal, setLooseSubtotal] = useState(0);

  // Stable handlers from child → level
  const handleExtTotals = useCallback((t) => setExtTotals(t || {}), []);
  const handleIntTotals = useCallback((t) => setIntTotals(t || {}), []);
  const handleLooseSubtotal = useCallback((payload) => {
    const sub = Number(payload?.subtotal) || 0;
    setLooseSubtotal(sub);
    onLooseTotal?.({ id, subtotal: sub });
  }, [id, onLooseTotal]);

  // Level total = exterior panels + interior panels + loose (for this level)
  const levelTotal = useMemo(() => {
    const ext = Number(extTotals?.panelsSubtotal) || 0;
    const intl = Number(intTotals?.panelsSubtotal) || 0;
    const loose = Number(looseSubtotal) || 0;
    return ext + intl + loose;
  }, [extTotals, intTotals, looseSubtotal]);

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    []
  );
  const fmt = (n) => moneyFmt.format(Number(n) || 0);
  useEffect(()=> {
    onLevelTotal?.({id, total: levelTotal});
  }, [id, levelTotal]);

  return (
    <section className="ew-stack">
      {/* Level header with collapser + total */}
      <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button
            type="button"
            className="ew-btn"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand level' : 'Collapse level'}
            title={collapsed ? 'Expand' : 'Collapse'}
            style={{ padding:'4px 8px', lineHeight:1 }}
          >
            {collapsed ? '▶' : '🔽'}
          </button>
          <h2 className="ew-h2" style={{ margin:0 }}>{name}</h2>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div
            className="ew-chip"
            style={{
              fontWeight: 800,
              fontSize: 16,
              color: 'var(--turq-300)',        // bright turquoise
              borderColor: 'rgba(47,183,173,.35)',
              background: 'rgba(47,183,173,.15)',
            }}
            title="Level total (Panels + Loose)"
          >
            Level total: {fmt(levelTotal)}
          </div>
          {onRemove && (
            <button className="ew-btn" onClick={onRemove}>Remove level</button>
          )}
        </div>
      </div>

      {/* Keep content mounted; just hide/show to preserve state instantly */}
      <div style={{ display: collapsed ? 'none' : 'block' }} aria-hidden={collapsed}>
        {/* pass levelId so each floor stores its own sections */}
        <ExteriorWalls
          levelId={id}
          onTotalsChange={handleExtTotals}
          title={`${name} — Exterior walls`}
        />

        <InteriorWalls
          levelId={id}
          onTotalsChange={handleIntTotals}
          title={`${name} — Interior walls`}
        />

        <LoosePanelMaterials
          title={`${name} — Loose materials (wall panels)`}
          persistKey={`loose:${id}`}
          // Inputs are computed inside LoosePanelMaterials from wrappers’ live totals via props on your current build.
          // If you feed explicit props, keep passing them here (left as-is if you're already doing it).
          onSubtotalChange={handleLooseSubtotal}
        />
      </div>
    </section>
  );
}
