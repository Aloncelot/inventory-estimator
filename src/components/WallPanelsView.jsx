// src/components/WallPanelsView.jsx
'use client';

import { 
  useCallback, 
  useMemo, 
  useState, 
  useEffect,
  useEffectEvent, 
  useRef,         
} from 'react';
import { useProject } from '@/context/ProjectContext';
import Level from '@/components/Level';
import PanelsManufactureEstimate from "@/components/PanelsManufactureEstimate";
import NailsAndBracing from '@/components/NailsAndBracing';
import AddButton from './ui/AddButton';

export default function WallPanelsView({ onGrandTotal }) {
  
  // Get ALL data and helpers from the context
  const { 
    projectData, 
    updateProject, // This is the stable function from context
    blankLevel,
    isLoaded 
  } = useProject();

  // Extract data from context
  const estimateData = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (estimateData.levels || []).filter(Boolean), [estimateData.levels]);
  const manufactureEstimate = useMemo(() => estimateData.manufactureEstimate || {}, [projectData]);
  const nailsAndBracing = useMemo(() => estimateData.nailsAndBracing || {}, [projectData]);
  
  // Stable handlers (this logic is correct)
  const handleLevelChangeById = useCallback((levelId, levelUpdaterFn) => {
    updateProject(prevEstimate => {
      const newLevels = (prevEstimate.levels || []).map(lvl => {
        if (lvl.id !== levelId) return lvl;
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

  // allLevelStats calculation
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

  // grandTotal calculation
  const grandTotal = useMemo(() => {
    const levelsTotal = levels.reduce((sum, lvl) => sum + (Number(lvl.total) || 0), 0);
    const manufactureTotal = Number(manufactureEstimate.total || 0);
    const nailsTotal = Number(nailsAndBracing.total || 0);
    return levelsTotal + manufactureTotal + nailsTotal;
  }, [levels, manufactureEstimate, nailsAndBracing]);
  
  // Create the stable event handler
  const onGrandTotalChange = useEffectEvent(onGrandTotal);
  
  // Create the ref to track the last sent value
  const lastSentGrandTotalRef = useRef(null);

  useEffect(() => {
    if (typeof onGrandTotalChange === 'function') {
      if (grandTotal !== lastSentGrandTotalRef.current) {
        onGrandTotalChange(grandTotal);
        lastSentGrandTotalRef.current = grandTotal;
      }
    }
  }, [grandTotal, onGrandTotalChange]); // Dependency is on the calculated value

  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), []);
  const fmt = (n) => moneyFmt.format(Number(n) || 0);

  if (!isLoaded || !projectData) {
    return (
       <div className="app-content">
          <div className="ew-card">
              <span className="text-h1">Wall Panels</span>
              <p className="ew-subtle" style={{ marginTop: '10px' }}>
                Please create or load a project from the "Project" section to begin.
              </p>
          </div>
       </div>
    );
  }

  return (
    <div className="app-content">
      <div className="sticky-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span className="text-section-title">
          {projectData?.name ? `${projectData.name} - ` : ''}Wall Panels
          </span>
        <div
          className="ew-right text-grand-total" 
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