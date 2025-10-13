// src/components/Level.jsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';
import LoosePanelMaterials from '@/components/LoosePanelMaterials';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

// Compare only the fields that matter to avoid loops
const sameExtTotals = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = [
    'extLengthSum',
    'extZipSheetsSum',
    'extPlatePieces',
    'extPTLFSum',
    'extMoneySum',
    'panelsSubtotal',
    'panelLenFtExterior',
  ];
  return keys.every(k => a[k] === b[k]);
};

export default function Level({
  id,           // required: stable per-level id
  name,         // e.g. "Level 1"
  onRemove,     // optional: () => void
  onLooseTotal = () => {},
  onLevelTotal = () => {},
  onExteriorPanelLenChange,
  onExteriorLF,
  onInteriorShearLF,
  onInteriorShearPanelLenChange,
  onInteriorBearingLF,
  onInteriorNonLoadLF,
  onKneeWallLF,
  levelsCount,
  panelsTotalAllSections,
  onLooseGeneralChange,
}) {
  const handlePanelLenFromExterior = useCallback((len) => {
    onExteriorPanelLenChange?.({ id, len: Number(len) || 0 });
  }, [onExteriorPanelLenChange, id]);

  // UI (collapsed persisted per level)
  const [ui, setUi] = useLocalStorageJson(`inv:v1:level-ui:${id}`, { collapsed: false });
  const collapsed = !!ui.collapsed;
  const toggleCollapsed = () => setUi(prev => ({ ...prev, collapsed: !prev.collapsed }));

  // Live totals reported by wrappers
  const [extTotals, setExtTotals] = useState(null);
  const [intTotals, setIntTotals] = useState({
    int2x6LF: 0, int2x4LF: 0, intPlatePieces: 0, intPTLFSum: 0,
    panelsSubtotal: 0, // sum of InteriorWallGroup groupSubtotal for this level
    // (InteriorWalls should also provide shearLengthSum, shearPanelLenFt, bearingLengthSum)
  });
  const [looseSubtotal, setLooseSubtotal] = useState(0);

  // Stable handlers from child → level
  const handleExtTotals = useCallback((t) => {
    setExtTotals(prev => sameExtTotals(prev, t) ? prev : t);
  }, []);

  const handleIntTotals = useCallback((t) => {
    setIntTotals(t || {});
    if (!t) return;

    // forward interior shear LF
    if (typeof onInteriorShearLF === 'function') {
      onInteriorShearLF({ id, lf: Number(t.shearLengthSum) || 0 });
    }
    // forward interior shear panel length (derived from bottom plate in shear groups)
    if (typeof onInteriorShearPanelLenChange === 'function') {
      onInteriorShearPanelLenChange({ id, len: Number(t.shearPanelLenFt) || 8 });
    }
    // forward interior bearing LF (a.k.a. “blocking only / bearing walls”)
    if (typeof onInteriorBearingLF === 'function') {
      onInteriorBearingLF({ id, lf: Number(t.bearingLengthSum) || 0 });
    }
  }, [id, onInteriorShearLF, onInteriorShearPanelLenChange, onInteriorBearingLF]);

  const handleLooseSubtotal = useCallback((payload) => {
    const sub = Number(payload?.subtotal) || 0;
    setLooseSubtotal(sub);
    onLooseTotal?.({ id, subtotal: sub });
  }, [id, onLooseTotal]);

  // Level total = exterior panels + interior panels + loose (for this level)
  const levelTotal = useMemo(() => {
    const ext   = Number(extTotals?.panelsSubtotal) || 0;
    const intl  = Number(intTotals?.panelsSubtotal) || 0;
    const loose = Number(looseSubtotal)             || 0;
    // console.log('extTotals', extTotals);
    return ext + intl + loose;
  }, [extTotals, intTotals, looseSubtotal]);

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    []
  );
  const fmt = (n) => moneyFmt.format(Number(n) || 0);

  useEffect(() => {
    onLevelTotal?.({ id, total: levelTotal });
  }, [id, levelTotal, onLevelTotal]);

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
          <h2 className="ew-h2 ew-level-title" style={{ margin:0 }}>{name}</h2>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div
            className="ew-chip"
            style={{
              fontWeight: 800,
              fontSize: 16,
              color: 'var(--turq-300)',
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
        <ExteriorWalls
          levelId={id}
          onTotalsChange={(t) => setExtTotals(t)}
          title={`${name} — Exterior walls`}
          onLengthLFChange={(lf) => onExteriorLF?.({ id, lf })}
          onPanelLenFtChange={handlePanelLenFromExterior}
          isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ''))}
        />

        <InteriorWalls
          levelId={id}
          onTotalsChange={handleIntTotals}
          title={`${name} — Interior walls`}
          isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ''))}
          onInteriorBearingLF={onInteriorBearingLF}
          onBearingLFChange={(lfVal) => 
            onInteriorBearingLF?.({ id, lf: Number(lfVal) || 0 })
          }
          onPartitionLFChange={(lfVal) =>
            onInteriorNonLoadLF?.({id, lf: Number(lfVal) || 0})
          }
          onKneeLFChange={(lfVal) => 
            onKneeWallLF?.({ id, lf: Number(lfVal) || 0 })
          }
        />

        <LoosePanelMaterials
          title={`${name} — Loose materials (wall panels)`}
          persistKey={`loose:${id}`}
          onSubtotalChange={handleLooseSubtotal}
          extLengthLF={Number(extTotals?.extLengthSum || 0)}
          extZipSheetsFinal={Number(
            extTotals?.extZipSheetsFinal ??
            extTotals?.extZipSheetsSum ??
            0
          )}
          extZipSheetsSum={extTotals?.extZipSheetsSum}
          int2x6LF={Number(intTotals?.int2x6LF || 0)}
          int2x4LF={Number(intTotals?.int2x4LF || 0)}
          // for nails/bracing math (lets Loose use the real combined totals)
          ptLFTotal={
            Number(extTotals?.extPTLFSum || 0) +
            Number(intTotals?.intPTLFSum || 0)
          }
          platePiecesTotal={
            Number(extTotals?.extPlatePieces || 0) +
            Number(intTotals?.intPlatePieces || 0)
          }
          totalPanelsAllLevels={Number(panelsTotalAllSections || 0)}
          levelsCount={Number(levelsCount || 1)}
          levelId={id}
          onGeneralChange={onLooseGeneralChange}
        />
      </div>
    </section>
  );
}
