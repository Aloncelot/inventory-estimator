// src/components/InteriorWalls.jsx
'use client';

import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import InteriorWallGroup from '@/components/InteriorWallGroup';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import AddButton from './ui/AddButton';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

const genId = () => 'int-' + Math.random().toString(36).slice(2, 9);

export default function InteriorWalls({
  title = 'Interior walls',
  levelId = 'default',               // <-- important for per-level storage
  onTotalsChange,                    // ({ int2x6LF, int2x4LF, intPlatePieces, intPTLFSum }) => void
  isLevelOne = false,
  onBearingLFChange,
  onPartitionLFChange,
  onKneeLFChange,
}) {

  const majority = (vals) => {
  const v = vals.filter(Boolean);
  if (!v.length) return 8;
  const counts = {};
  for (const n of v) counts[n] = (counts[n] || 0) + 1;
  return Number(Object.keys(counts).sort((a,b)=>counts[b]-counts[a] || b-a)[0]);
};

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

    //General sums  
    const intPlatePieces = arr.reduce((a, b) => a + (Number(b?.platePieces)   || 0), 0);
    const intBottomPlatePiecesPanel = arr.reduce((a, b) => a + (Number(b?.bottomPlatePiecesPanel) || 0), 0);
    const intPTLFSum     = arr.reduce((a, b) => a + (Number(b?.ptLF)          || 0), 0);
    const intPanelSheets = arr.reduce((a, b) => a + (Number(b?.panelSheets)   || 0), 0);
    const panelsSubtotal = arr.reduce((a, b) => a + (Number(b?.groupSubtotal) || 0), 0)

    // Shearing walls-only aggregates
    const shearArr = arr.filter(s => !!s?.isShear);
    const shearLengthSum = shearArr.reduce((sum, s) => sum + (Number(s?.lengthLF) || 0), 0);
    const intPanelPtBoards = arr.reduce(
      (a, b) => a + (Number(b?.panelPtBoards) || 0), 0
    );
    // majority-vote panel length from shear groups’ bottom plates
    let shearPanelLenFt = 8;
    {
      const vals = shearArr.map(s => Number(s?.bottomBoardLenFt) || 0).filter(Boolean);
      if (vals.length) {
        const counts = {};
        for (const v of vals) counts[v] = (counts[v] || 0) + 1;
        shearPanelLenFt = Number(Object.keys(counts).sort((a,b)=>counts[b]-counts[a] || b-a)[0]);
      }
    }

    // ── Partition (NON-load) ───────────────────────────────────────
    const partitionArr = arr.filter(s => !!s?.isPartition);
    const partitionLengthSum = partitionArr.reduce((sum, s) => sum + (Number(s.lengthLF) || 0), 0);
    // Optional panel length majority if you want it later:
    // const partitionPanelLenFt = majority(partitionArr.map(s => Number(s.bottomBoardLenFt) || 0));
    // ── Knee wall (from wallType === 'knee') ───────────────────────
    const kneeArr = arr.filter(s => !!s?.isKnee);
    const kneeLengthSum = kneeArr.reduce((sum, s) => sum + (Number(s.lengthLF) || 0), 0);
    // const kneePanelLenFt = majority(kneeArr.map(s => Number(s.bottomBoardLenFt) || 0));

    // Bearing (adds blocking)
    const bearingArr = arr.filter(s => !!s?.isBearing);
    const bearingLengthSum = bearingArr.reduce((sum, s) => sum + (Number(s.lengthLF) || 0), 0);
    const bearingPanelLenFt = majority(bearingArr.map(s => Number(s.bottomBoardLenFt) || 0));

    return { 
      int2x6LF, int2x4LF, intPlatePieces, intPTLFSum, panelsSubtotal, 
      intPanelSheets, shearLengthSum, shearPanelLenFt, 
      bearingLengthSum, bearingPanelLenFt, intBottomPlatePiecesPanel,
      partitionLengthSum, kneeLengthSum, intPanelPtBoards, intPanelSheets,
    };
  }, [stats]);

  // Emit to parent (Level.jsx)
  const lastSigRef = useRef('');
    useEffect(() => {
      const payload = {
          int2x6LF: totals.int2x6LF,
          int2x4LF: totals.int2x4LF,
          intPlatePieces: totals.intPlatePieces,
          intBottomPlatePiecesPanel: totals.intBottomPlatePiecesPanel,
          intPTLFSum: totals.intPTLFSum,
          intPanelSheets: totals.intPanelSheets,
          panelsSubtotal: totals.panelsSubtotal,
          shearLengthSum: totals.shearLengthSum,
          shearPanelLenFt: totals.shearPanelLenFt,
          bearingLengthSum: totals.bearingLengthSum,
          bearingPanelLenFt: totals.bearingPanelLenFt,
          partitionLengthSum: totals.partitionLengthSum,
          kneeLengthSum: totals.kneeLengthSum,
          intPanelPtBoards: totals.intPanelPtBoards,
        };
      const sig = JSON.stringify(payload);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        onTotalsChange?.(payload);
        onBearingLFChange?.(payload.bearingLengthSum);
        onPartitionLFChange?.(payload.partitionLengthSum);
        onKneeLFChange?.(payload.kneeLengthSum);
      }
    }, [totals, onTotalsChange, onBearingLFChange, onPartitionLFChange, onKneeLFChange]);

    const interiorTotalSubtotal = totals.panelsSubtotal;

  return (
        <section className="ew-stack">
            {/* Display Title at the top */}
            <div className="ew-card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <h2 className="ew-h2" style={{ margin:0 }}>{title}</h2>
              <div className="ew-right" title="Sum of all interior wall section subtotals for this level" style={{ fontWeight: 700 }}>
                Total: {fmt(interiorTotalSubtotal)}
              </div>
            </div>

            {/* Placeholder message if no sections exist */}
            {sections.length === 0 && (
                <div className="ew-card">
                    <div className="ew-subtle">No interior wall sections yet.</div>
                    <div style={{ marginTop: 8 }}>
                        {/* Button is now part of the moved card at the bottom */}
                        <button className="ew-btn ew-btn--turq" onClick={addSection}>+ Add interior wall section</button>
                    </div>
                </div>
            )}

            {/* Render each InteriorWallGroup section */}
            {sections.map((sec, i) => (
                <InteriorWallGroup
                    key={sec.id}
                    title={`${title} — Section ${i + 1}`}
                    persistKey={`int:${levelId}:${sec.id}`}        // keep notes/selections per-level & per-section
                    onRemove={() => removeSection(sec.id)}
                    onStatsChange={(s) => updateStats(sec.id, s)}   // section → wrapper
                    bottomDefaultFamily={isLevelOne ? 'PT' : 'SPF#2'} // Pass PT default based on level
                />
            ))}

            {/* Moved card containing Add button to the bottom */}
            <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop: '1rem' }}>
                <div className="ew-subtle">Add another interior wall section to this level.</div>
                <AddButton onClick={addSection} title="Add Section" label="Add Section" />
            </div>
        </section>
    );
}