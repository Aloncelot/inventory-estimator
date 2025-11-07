// src/components/Level.jsx
'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';
import LoosePanelMaterials from '@/components/LoosePanelMaterials';
import AccordionSection from '@/components/ui/AccordionSection';
import RemoveButton from './ui/RemoveButton';
import PanelNails from '@/components/PanelNails';
// Removed: useLocalStorageJson
// Removed: all the individual on... props like onLooseTotal, onLevelTotal, etc.

export default function Level({
  levelData,     // <-- 1. Receive the full level data object
  onLevelChange, // <-- 2. Receive the update function
  onRemove,      // optional: () => void
  // 3. We add levelStats (from WallPanelsView)
  levelStats = {}, 
}) {  
  // 4. Extract all data from the prop
  const {
    id,
    name,
    collapsed = false, // Default to not collapsed
    exteriorSections = [],
    interiorSections = [],
    looseMaterials = {},
    panelNails = {},
  } = levelData;

  // 5. Handlers to update the levelData object
  const handleNameChange = (newName) => {
    onLevelChange({ ...levelData, name: newName });
  };
  const setCollapsed = (isCollapsed) => {
    onLevelChange({ ...levelData, collapsed: isCollapsed });
  };
  const handleExteriorChange = (newExteriorSections) => {
    onLevelChange({ ...levelData, exteriorSections: newExteriorSections });
  };
  const handleInteriorChange = (newInteriorSections) => {
    onLevelChange({ ...levelData, interiorSections: newInteriorSections });
  };
  const handlePanelNailsChange = (newPanelNailsData) => {
    onLevelChange({ ...levelData, panelNails: newPanelNailsData });
  };
  const handleLooseMaterialsChange = (newLooseData) => {
    onLevelChange({ ...levelData, looseMaterials: newLooseData });
  };
  
  // 6. **THIS IS THE FIX**: Calculate all derived totals for child components
  const derivedTotals = useMemo(() => {
    let extLengthSum = 0;
    let extZipSheetsFinal = 0;
    let extPanelSheets = 0;
    let extPlatePieces = 0;
    let extBottomPlatePiecesPanel = 0;
    let extPTLFSum = 0;
    let extPanelPtBoards = 0;

    for (const s of exteriorSections) {
      extLengthSum += Number(s.lengthLF || 0);
      extZipSheetsFinal += Number(s.zipSheetsFinal || 0);
      extPanelSheets += Number(s.panelSheets || 0);
      extPlatePieces += Number(s.platePieces || 0);
      extBottomPlatePiecesPanel += Number(s.bottomPlatePiecesPanel || 0);
      extPTLFSum += Number(s.ptLF || 0);
      extPanelPtBoards += Number(s.panelPtBoards || 0);
    }

    let int2x6LF = 0;
    let int2x4LF = 0;
    let intPlatePieces = 0;
    let intBottomPlatePiecesPanel = 0;
    let intPTLFSum = 0;
    let intPanelSheets = 0;
    let intPanelPtBoards = 0;

    for (const s of interiorSections) {
      if (s.wallKind === 'int-2x6') int2x6LF += Number(s.lengthLF || 0);
      if (s.wallKind === 'int-2x4') int2x4LF += Number(s.lengthLF || 0);
      intPlatePieces += Number(s.platePieces || 0);
      intBottomPlatePiecesPanel += Number(s.bottomPlatePiecesPanel || 0);
      intPTLFSum += Number(s.ptLF || 0);
      intPanelSheets += Number(s.panelSheets || 0);
      intPanelPtBoards += Number(s.panelPtBoards || 0);
    }

    // Combine totals needed by children
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
  
  // 7. Level total calculation (reads from the data object)
  const levelTotal = useMemo(() => {
    const extTotal = (levelData.exteriorSections || []).reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const intTotal = (levelData.interiorSections || []).reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const looseTotal = Number(levelData.looseMaterials?.subtotal) || 0;
    const nailsTotal = Number(levelData.panelNails?.total) || 0; 
    const newTotal = extTotal + intTotal + looseTotal + nailsTotal;
    
    // Save this new total back into the object for the parent (WallPanelsView)
    if (onLevelChange && levelData.total !== newTotal) {
      // Use a microtask to avoid updating state during render
      Promise.resolve().then(() => {
        onLevelChange({ ...levelData, total: newTotal });
      });
    }

    return newTotal;
  }, [levelData, onLevelChange]); // Recalculates whenever levelData changes

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    []
  );
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
        onSectionsChange={handleExteriorChange}
        title={`${name} — Exterior walls`}
        isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ''))}
      />

      <InteriorWalls
        sectionsData={interiorSections}
        onSectionsChange={handleInteriorChange}
        title={`${name} — Interior walls`}
        isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ''))}
      />

      {/* 8. **THE FIX**: Pass the new `derivedTotals` to the children */}
      <PanelNails
        data={panelNails}
        onChange={handlePanelNailsChange}
        title={`${name} — Panel nails`}
        // Pass the calculated totals
        ptPlatePiecesPanels={derivedTotals.panelPtBoardsAll}
        totalPanelSheets={derivedTotals.panelSheetsAll}
        totalBottomPlatePiecesPanel={derivedTotals.totalBottomPlatePiecesPanelAll}
      />

      <LoosePanelMaterials
        data={looseMaterials}
        onChange={handleLooseMaterialsChange}
        title={`${name} — Loose materials (wall panels)`}
        // Pass the calculated totals
        extLengthLF={derivedTotals.extLengthSum}
        extZipSheetsFinal={derivedTotals.extZipSheetsFinal}
        int2x6LF={derivedTotals.int2x6LF}
        int2x4LF={derivedTotals.int2x4LF}
        ptLFTotal={derivedTotals.ptLFTotalAll}
        platePiecesTotal={derivedTotals.platePiecesTotalAll}
        levelId={id}
        // These props are from WallPanelsView (passed through)
        levelsCount={levelStats.levelsCount}
        panelsTotalAllSections={levelStats.panelsAll} 
      />
    </AccordionSection>
  </section>
)};