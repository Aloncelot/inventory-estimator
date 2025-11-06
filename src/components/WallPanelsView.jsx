// src/components/WallPanelsView.jsx
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext'; // <-- Import the project context
import Level from '@/components/Level';
import PanelsManufactureEstimate from "@/components/PanelsManufactureEstimate";
import NailsAndBracing from '@/components/NailsAndBracing';
import AddButton from './ui/AddButton';

export default function WallPanelsView({ onGrandTotal }) {
  
  // 1. Get ALL data and helpers from the context
  const { 
    projectData, 
    updateProject, 
    blankLevel,
    isLoaded 
  } = useProject();

  // Extract the specific data this component needs from projectData
  const estimateData = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (estimateData.levels || []).filter(Boolean), [estimateData.levels]); // Filter out bad data
  const manufactureEstimate = useMemo(() => estimateData.manufactureEstimate || {}, [estimateData.manufactureEstimate]);
  const nailsAndBracing = useMemo(() => estimateData.nailsAndBracing || {}, [estimateData.nailsAndBracing]);
  
  // --- Handlers to update data IN THE CONTEXT ---

  // This function receives the *entire new level object* from the Level component
  const handleLevelChange = useCallback((updatedLevel) => {
    const newLevels = levels.map(lvl => 
      lvl.id === updatedLevel.id ? updatedLevel : lvl
    );
    // Call updateProject with the *entire* estimateData object
    updateProject({ ...estimateData, levels: newLevels });
  }, [levels, estimateData, updateProject]);

  const addLevel = useCallback(() => {
    const newLevel = blankLevel({ index: levels.length });
    const newLevels = [...levels, newLevel];
    updateProject({ ...estimateData, levels: newLevels });
  }, [levels, estimateData, updateProject, blankLevel]);

  const removeLevel = useCallback((idToRemove) => {
    const newLevels = levels.filter(l => l.id !== idToRemove);
    updateProject({ ...estimateData, levels: newLevels });
  }, [levels, estimateData, updateProject]);

  // Handle updates from PanelsManufactureEstimate
  const handleManufactureChange = useCallback((newManufactureData) => {
    updateProject({ ...estimateData, manufactureEstimate: newManufactureData });
  }, [estimateData, updateProject]);

  // Handle updates from NailsAndBracing
  const handleNailsBracingChange = useCallback((newNailsData) => {
    updateProject({ ...estimateData, nailsAndBracing: newNailsData });
  }, [estimateData, updateProject]);

  // --- Calculations (derived from context data) ---
  
  // Calculate all the totals needed by child components
  const allLevelStats = useMemo(() => {
    let totalExteriorLF = 0;
    let totalInteriorShearLF = 0;
    let totalInteriorBlockingLF = 0;
    let totalInteriorNonLoadLF = 0;
    let totalKneeWallLF = 0;
    let panelsAll = 0;
    let platePiecesAll = 0;
    let ptPiecesAll = 0;
    let sheetsExtAll = 0;
    let sheetsBandAll = 0;
    let sheetsExtraAll = 0;

    for (const level of levels) {
      for (const s of (level.exteriorSections || [])) {
        totalExteriorLF += Number(s.lengthLF || 0);
        panelsAll += Number(s.panels || 0); // Need to add panels calc to group
        // ... (add other exterior rollups)
      }
      for (const s of (level.interiorSections || [])) {
        if (s.isShear) totalInteriorShearLF += Number(s.lengthLF || 0);
        if (s.isBearing) totalInteriorBlockingLF += Number(s.lengthLF || 0);
        if (s.isPartition) totalInteriorNonLoadLF += Number(s.lengthLF || 0);
        if (s.isKnee) totalKneeWallLF += Number(s.lengthLF || 0);
        panelsAll += Number(s.panels || 0); // Need to add panels calc to group
        // ... (add other interior rollups)
      }
      const looseStats = level.looseMaterials?.generalStats || {};
      platePiecesAll += Number(looseStats.platePiecesTotal || 0);
      ptPiecesAll += Number(looseStats.ptPieces || 0);
      sheetsExtAll += Number(looseStats.sheetsExt || 0);
      sheetsBandAll += Number(looseStats.sheetsBand || 0);
      sheetsExtraAll += Number(looseStats.sheetsExtra || 0);
    }

    return {
      totalExteriorLF, totalInteriorShearLF, totalInteriorBlockingLF,
      totalInteriorNonLoadLF, totalKneeWallLF, panelsAll, platePiecesAll,
      ptPiecesAll, sheetsExtAll, sheetsBandAll, sheetsExtraAll
    };
  }, [levels]);


  const grandTotal = useMemo(() => {
    const levelsTotal = levels.reduce((sum, lvl) => sum + (Number(lvl.total) || 0), 0);
    const manufactureTotal = Number(manufactureEstimate.total || 0);
    const nailsTotal = Number(nailsAndBracing.total || 0);
    return levelsTotal + manufactureTotal + nailsTotal;
  }, [levels, manufactureEstimate, nailsAndBracing]);

  // Notify the parent (page.jsx) of the grand total
  useEffect(() => {
    if (typeof onGrandTotal === 'function') onGrandTotal(grandTotal);
  }, [grandTotal, onGrandTotal]);

  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), []);
  const fmt = (n) => moneyFmt.format(Number(n) || 0);

  // Show a loading/placeholder if the project isn't loaded
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
          levelData={lvl} // <-- Pass the full level object
          onLevelChange={handleLevelChange} // <-- Pass the update function
          onRemove={levels.length > 1 ? () => removeLevel(lvl.id) : undefined}
          // Pass the calculated totals for this level's children
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
          totals={allLevelStats} // Pass the rolled-up totals
        />
      </div>

      <PanelsManufactureEstimate
        data={manufactureEstimate}
        onChange={handleManufactureChange}
        // Pass the rolled-up LF totals
        exteriorLF={allLevelStats.totalExteriorLF}
        interiorShearLF={allLevelStats.totalInteriorShearLF}
        interiorBlockingLF={allLevelStats.totalInteriorBlockingLF}
        interiorNonLoadLF={allLevelStats.totalInteriorNonLoadLF}
        kneeWallLF={allLevelStats.totalKneeWallLF}
        // ... (other props like panelLenFtExterior can be added here if needed)
      />
  </div>
  );
}