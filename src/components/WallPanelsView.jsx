// src/components/WallPanelsView.jsx
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
import Level from '@/components/Level';
import PanelsManufactureEstimate from "@/components/PanelsManufactureEstimate";
import NailsAndBracing from '@/components/NailsAndBracing';
import AddButton from './ui/AddButton';

export default function WallPanelsView({ onGrandTotal }) {
  
  // 1. Get ALL data and helpers from the context
  const { 
    projectData, 
    updateProject, // This is the stable function from context
    blankLevel,
    isLoaded 
  } = useProject();

  // 2. Extract data from context
  const estimateData = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (estimateData.levels || []).filter(Boolean), [estimateData.levels]);
  const manufactureEstimate = useMemo(() => estimateData.manufactureEstimate || {}, [estimateData.manufactureEstimate]);
  const nailsAndBracing = useMemo(() => estimateData.nailsAndBracing || {}, [estimateData.nailsAndBracing]);
  
  // --- **THIS IS THE FIX (PART 1)** ---
  // All handlers are now stable `useCallback` hooks that
  // pass a functional update to the main `updateProject` setter.
  
  const handleLevelChangeById = useCallback((levelId, levelUpdaterFn) => {
    updateProject(prevEstimate => {
      const newLevels = (prevEstimate.levels || []).map(lvl => {
        if (lvl.id !== levelId) return lvl;
        // Apply the functional update to the specific level
        return levelUpdaterFn(lvl); 
      });
      return { ...prevEstimate, levels: newLevels };
    });
  }, [updateProject]);

  const addLevel = useCallback(() => {
    const newLevel = blankLevel({ index: levels.length });
    updateProject(prevEstimate => ({
      ...prevEstimate,
      levels: [...(prevEstimate.levels || []), newLevel]
    }));
  }, [updateProject, blankLevel, levels.length]);

  const removeLevel = useCallback((idToRemove) => {
    updateProject(prevEstimate => ({
      ...prevEstimate,
      levels: (prevEstimate.levels || []).filter(l => l.id !== idToRemove)
    }));
  }, [updateProject]);

  const handleManufactureChange = useCallback((manufactureUpdater) => {
    updateProject(prevEstimate => ({
      ...prevEstimate,
      manufactureEstimate: typeof manufactureUpdater === 'function' 
        ? manufactureUpdater(prevEstimate.manufactureEstimate || {}) 
        : manufactureUpdater
    }));
  }, [updateProject]);

  const handleNailsBracingChange = useCallback((nailsUpdater) => {
    updateProject(prevEstimate => ({
      ...prevEstimate,
      nailsAndBracing: typeof nailsUpdater === 'function'
        ? nailsUpdater(prevEstimate.nailsAndBracing || {})
        : nailsUpdater
    }));
  }, [updateProject]);

  // --- **THIS IS THE FIX (PART 2)** ---
  // This calculation now correctly sums all stats from all sections
  const allLevelStats = useMemo(() => {
    let totalExteriorLF = 0, totalInteriorShearLF = 0, totalInteriorBlockingLF = 0;
    let totalInteriorNonLoadLF = 0, totalKneeWallLF = 0, panelsAll = 0;
    let platePiecesAll = 0, ptPiecesAll = 0, sheetsExtAll = 0;
    let sheetsBandAll = 0, sheetsExtraAll = 0;

    for (const level of levels) {
      // Aggregate exterior stats
      for (const s of (level.exteriorSections || [])) {
        totalExteriorLF += Number(s.lengthLF || 0);
        panelsAll += Number(s.panelSheets || 0); 
        platePiecesAll += Number(s.platePieces || 0);
        ptPiecesAll += Number(s.panelPtBoards || 0);
        sheetsExtAll += Number(s.zipSheetsFinal || 0);
      }
      // Aggregate interior stats
      for (const s of (level.interiorSections || [])) {
        if (s.isShear) totalInteriorShearLF += Number(s.lengthLF || 0);
        if (s.isBearing) totalInteriorBlockingLF += Number(s.lengthLF || 0);
        if (s.isPartition) totalInteriorNonLoadLF += Number(s.lengthLF || 0);
        if (s.isKnee) totalKneeWallLF += Number(s.lengthLF || 0);
        panelsAll += Number(s.panelSheets || 0);
        platePiecesAll += Number(s.platePieces || 0);
        ptPiecesAll += Number(s.panelPtBoards || 0);
      }
      // Aggregate loose stats
      const looseStats = level.looseMaterials?.generalStats || {};
      platePiecesAll += Number(looseStats.platePiecesTotal || 0); // Add loose plates
      ptPiecesAll += Number(looseStats.ptPieces || 0); // Add loose PT
      sheetsBandAll += Number(looseStats.sheetsBand || 0);
      sheetsExtraAll += Number(looseStats.sheetsExtra || 0);
    }

    return {
      totalExteriorLF, totalInteriorShearLF, totalInteriorBlockingLF,
      totalInteriorNonLoadLF, totalKneeWallLF, panelsAll, platePiecesAll,
      ptPiecesAll, sheetsExtAll, sheetsBandAll, sheetsExtraAll,
      levelsCount: levels.length 
    };
  }, [levels]);

  // --- (Grand total logic is unchanged) ---
  const grandTotal = useMemo(() => {
    const levelsTotal = levels.reduce((sum, lvl) => sum + (Number(lvl.total) || 0), 0);
    const manufactureTotal = Number(manufactureEstimate.total || 0);
    const nailsTotal = Number(nailsAndBracing.total || 0);
    return levelsTotal + manufactureTotal + nailsTotal;
  }, [levels, manufactureEstimate, nailsAndBracing]);

  useEffect(() => {
    if (typeof onGrandTotal === 'function') onGrandTotal(grandTotal);
  }, [grandTotal, onGrandTotal]);

  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), []);
  const fmt = (n) => moneyFmt.format(Number(n) || 0);

  if (!isLoaded || !projectData) {
    return (
       <div className="app-content">
          <div className="ew-card">
              <h2 className="ew-h2 nova-flat-turquoise" style={{ margin: 0 }}>Wall Panels</h2>
              <p className="ew-subtle" style={{ marginTop: '10px' }}>
                Please create or load a project from the "Project" section to begin.
              </p>
          </div>
       </div>
    );
  }

  // --- (Render is unchanged, but props are now stable) ---
  return (
    <div className="app-content">
      <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h1 className="ew-h2 nova-flat-turquoise" style={{ margin: 0, flexShrink: 0 }}>Wall Panels</h1>
        <div
          className="ew-right nova-flat-turquoise" 
          style={{ fontSize: '1.25rem' }}
          title="Sum of all levels (panels + loose)"
        >
          Grand total: {fmt(grandTotal)}
        </div>
      </div>

      {levels.map((lvl, i) => (
        <Level
          key={lvl.id}
          levelData={lvl} 
          onLevelChange={updaterFn => handleLevelChangeById(lvl.id, updaterFn)} 
          onRemove={levels.length > 1 ? () => removeLevel(lvl.id) : undefined}
          levelStats={allLevelStats} 
        />
      ))}

      <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div className="ew-subtle">Add another floor (mirrors functionality; you can input different quantities)</div>
        <AddButton onClick={addLevel} title="Add wall" label="Add wall" />
      </div>
    
      <div>
        <NailsAndBracing 
          title="General — Nails & Bracing (all levels)" 
          data={nailsAndBracing}
          onChange={handleNailsBracingChange}
          totals={allLevelStats} 
        />
      </div>

      <PanelsManufactureEstimate
        data={manufactureEstimate}
        onChange={handleManufactureChange}
        exteriorLF={allLevelStats.totalExteriorLF}
        interiorShearLF={allLevelStats.totalInteriorShearLF}
        interiorBlockingLF={allLevelStats.totalInteriorBlockingLF}
        interiorNonLoadLF={allLevelStats.totalInteriorNonLoadLF}
        kneeWallLF={allLevelStats.totalKneeWallLF}
      />
  </div>
  );
}