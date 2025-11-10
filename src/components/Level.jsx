// src/components/Level.jsx
'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';
import LoosePanelMaterials from '@/components/LoosePanelMaterials';
import AccordionSection from '@/components/ui/AccordionSection';
import RemoveButton from './ui/RemoveButton';
import PanelNails from '@/components/PanelNails';

export default function Level({
  levelData,
  onLevelChange, // This is a stable function: (updaterFn) => void
  onRemove,
  levelStats = {}, 
}) {  
  // 1. Destructure all data from the prop
  const {
    id,
    name,
    collapsed = false,
  } = levelData;

  // 2. Filter arrays from props to prevent crashes
  const exteriorSections = useMemo(() => (levelData.exteriorSections || []).filter(Boolean), [levelData.exteriorSections]);
  const interiorSections = useMemo(() => (levelData.interiorSections || []).filter(Boolean), [levelData.interiorSections]);
  const looseMaterials = useMemo(() => levelData.looseMaterials || {}, [levelData.looseMaterials]);
  const panelNails = useMemo(() => levelData.panelNails || {}, [levelData.panelNails]);

  // --- **THIS IS THE FIX** ---
  // All handlers must now be stable `useCallback` hooks
  
  const handleNameChange = useCallback((newName) => {
    onLevelChange(prevLevel => ({ ...prevLevel, name: newName }));
  }, [onLevelChange]);
  
  const setCollapsed = useCallback((isCollapsed) => {
    onLevelChange(prevLevel => ({ ...prevLevel, collapsed: isCollapsed }));
  }, [onLevelChange]);
  
  // `sectionsUpdater` is the function from ExteriorWalls: (prevSections) => newSections
  const handleExteriorChange = useCallback((sectionsUpdater) => {
    onLevelChange(prevLevel => ({ 
      ...prevLevel, 
      exteriorSections: sectionsUpdater(prevLevel.exteriorSections || []) 
    }));
  }, [onLevelChange]);
  
  const handleInteriorChange = useCallback((sectionsUpdater) => {
    onLevelChange(prevLevel => ({ 
      ...prevLevel, 
      interiorSections: sectionsUpdater(prevLevel.interiorSections || [])
    }));
  }, [onLevelChange]);
  
  const handlePanelNailsChange = useCallback((panelNailsUpdater) => {
    onLevelChange(prevLevel => ({ 
      ...prevLevel, 
      panelNails: typeof panelNailsUpdater === 'function' 
        ? panelNailsUpdater(prevLevel.panelNails || {}) 
        : panelNailsUpdater
    }));
  }, [onLevelChange]);
  
  const handleLooseMaterialsChange = useCallback((looseUpdater) => {
    onLevelChange(prevLevel => ({ 
      ...prevLevel, 
      looseMaterials: typeof looseUpdater === 'function'
        ? looseUpdater(prevLevel.looseMaterials || {})
        : looseUpdater
    }));
  }, [onLevelChange]);
  
  // -------------------------
  
  // 4. Level total calculation (reads from the data object)
  const levelTotal = useMemo(() => {
    const extTotal = (exteriorSections || []).reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const intTotal = (interiorSections || []).reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const looseTotal = Number(looseMaterials?.subtotal) || 0;
    const nailsTotal = Number(panelNails?.total) || 0; 
    const newTotal = extTotal + intTotal + looseTotal + nailsTotal;
    
    // Save this new total back into the object for the parent (WallPanelsView)
    if (onLevelChange && levelData.total !== newTotal) {
      Promise.resolve().then(() => {
        onLevelChange(prev => ({ ...prev, total: newTotal }));
      });
    }

    return newTotal;
  }, [levelData, exteriorSections, interiorSections, looseMaterials, panelNails, onLevelChange]);

  // 5. Calculate all derived totals for child components
  const derivedTotals = useMemo(() => {
    let extLengthSum = 0, extZipSheetsFinal = 0, extPanelSheets = 0;
    let extPlatePieces = 0, extBottomPlatePiecesPanel = 0, extPTLFSum = 0, extPanelPtBoards = 0;

    for (const s of exteriorSections) {
      extLengthSum += Number(s.lengthLF || 0);
      extZipSheetsFinal += Number(s.zipSheetsFinal || 0);
      extPanelSheets += Number(s.panelSheets || 0);
      extPlatePieces += Number(s.platePieces || 0);
      extBottomPlatePiecesPanel += Number(s.bottomPlatePiecesPanel || 0);
      extPTLFSum += Number(s.ptLF || 0);
      extPanelPtBoards += Number(s.panelPtBoards || 0);
    }

    let int2x6LF = 0, int2x4LF = 0, intPlatePieces = 0;
    let intBottomPlatePiecesPanel = 0, intPTLFSum = 0, intPanelSheets = 0, intPanelPtBoards = 0;

    for (const s of interiorSections) {
      if (s.wallKind === 'int-2x6') int2x6LF += Number(s.lengthLF || 0);
      if (s.wallKind === 'int-2x4') int2x4LF += Number(s.lengthLF || 0);
      intPlatePieces += Number(s.platePieces || 0);
      intBottomPlatePiecesPanel += Number(s.bottomPlatePiecesPanel || 0);
      intPTLFSum += Number(s.ptLF || 0);
      intPanelSheets += Number(s.panelSheets || 0);
      intPanelPtBoards += Number(s.panelPtBoards || 0);
    }

    const panelPtBoardsAll = extPanelPtBoards + intPanelPtBoards;
    const totalBottomPlatePiecesPanelAll = extBottomPlatePiecesPanel + intBottomPlatePiecesPanel;
    const panelSheetsAll = extPanelSheets + intPanelSheets;
    const ptLFTotalAll = extPTLFSum + intPTLFSum;
    const platePiecesTotalAll = extPlatePieces + intPlatePieces;

    return {
      extLengthSum, extZipSheetsFinal, int2x6LF, int2x4LF,
      ptLFTotalAll, platePiecesTotalAll, panelPtBoardsAll,
      totalBottomPlatePiecesPanelAll, panelSheetsAll,
    };
  }, [exteriorSections, interiorSections]);
  
  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), []);
  const fmt = (n) => moneyFmt.format(Number(n) || 0);
  const novaMonoStyle = { fontFamily: "'Nova Mono', monospace" };

  return (
  <section className="ew-stack">
    <AccordionSection
      open={!collapsed}
      onOpenChange={(o) => setCollapsed(!o)}
      bar={({ open, toggle }) => (
        <div style={{ ...novaMonoStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="acc__button"
            onClick={toggle}
            title={open ? 'Collapse' : 'Expand'}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
          >
            <img
              src={open ? '/icons/down.png' : '/icons/minimize.png'}
              alt={open ? 'Collapse section' : 'Expand section'}
              width={16}
              height={16}
              className="acc__chev"
              style={{ display: 'inline-block', verticalAlign: 'middle' }}
            />
            <span className="ew-head">{name}</span>
          </button>
          <div
            className="ew-right"
            style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 16, color: '#f18d5b' }}
            title="Level total (Panels + Loose)"
          >
            Level total: {fmt(levelTotal)}
          </div>
          {onRemove ? <RemoveButton onClick={onRemove} title="Remove level" label="Remove level" /> : null}
        </div>
      )}
    >
      <ExteriorWalls
        sectionsData={exteriorSections}    
        onSectionsChange={handleExteriorChange} // Pass the stable handler
        title={`${name} — Exterior walls`}
        isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ''))}
      />

      <InteriorWalls
        sectionsData={interiorSections}    
        onSectionsChange={handleInteriorChange} // Pass the stable handler
        title={`${name} — Interior walls`}
        isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ''))}
      />

      <PanelNails
        data={panelNails}
        onChange={handlePanelNailsChange}
        title={`${name} — Panel nails`}
        ptPlatePiecesPanels={derivedTotals.panelPtBoardsAll}
        totalPanelSheets={derivedTotals.panelSheetsAll}
        totalBottomPlatePiecesPanel={derivedTotals.totalBottomPlatePiecesPanelAll}
      />

      <LoosePanelMaterials
        data={looseMaterials}
        onChange={handleLooseMaterialsChange}
        title={`${name} — Loose materials (wall panels)`}
        extLengthLF={derivedTotals.extLengthSum}
        extZipSheetsFinal={derivedTotals.extZipSheetsFinal}
        int2x6LF={derivedTotals.int2x6LF}
        int2x4LF={derivedTotals.int2x4LF}
        ptLFTotal={derivedTotals.ptLFTotalAll}
        platePiecesTotal={derivedTotals.platePiecesTotalAll}
        levelId={id}
        levelsCount={levelStats.levelsCount}
        panelsTotalAllSections={levelStats.panelsAll} 
      />
    </AccordionSection>
  </section>
)};