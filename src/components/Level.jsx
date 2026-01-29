// src/components/Level.jsx
'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import LoosePanelMaterials from '@/components/LoosePanelMaterials';
import AccordionSection from '@/components/ui/AccordionSection';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';
import EditableTitle from './ui/EditableTitle';
import RemoveButton from './ui/RemoveButton';
import PanelNails from '@/components/PanelNails';

// Iconos Lucide para consistencia total
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function Level({
  levelData,
  onLevelChange,
  onRemove,
  levelStats = {},
}) {
  const { id, name, collapsed = false } = levelData;

  // Filtrado de seguridad para evitar errores de renderizado
  const exteriorSections = useMemo(() => (levelData.exteriorSections || []).filter(Boolean), [levelData.exteriorSections]);
  const interiorSections = useMemo(() => (levelData.interiorSections || []).filter(Boolean), [levelData.interiorSections]);
  const looseMaterials = useMemo(() => levelData.looseMaterials || {}, [levelData.looseMaterials]);
  const panelNails = useMemo(() => levelData.panelNails || {}, [levelData.panelNails]);

  // Handlers estables para actualizar el estado del proyecto
  const handleNameChange = useCallback((newName) => {
    onLevelChange(prevLevel => ({ ...prevLevel, name: newName }));
  }, [onLevelChange]);

  const setCollapsed = useCallback((isCollapsed) => {
    onLevelChange(prevLevel => ({ ...prevLevel, collapsed: isCollapsed }));
  }, [onLevelChange]);

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

  // Cálculo del total del nivel (Panels + Loose + Nails)
  const levelTotal = useMemo(() => {
    const extTotal = exteriorSections.reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const intTotal = interiorSections.reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const looseTotal = Number(looseMaterials?.subtotal) || 0;
    const nailsTotal = Number(panelNails?.total) || 0;
    const newTotal = Number((extTotal + intTotal + looseTotal + nailsTotal).toFixed(2));

    if (onLevelChange && levelData.total !== newTotal) {
      Promise.resolve().then(() => {
        onLevelChange(prev => ({ ...prev, total: newTotal }));
      });
    }
    return newTotal;
  }, [levelData.total, exteriorSections, interiorSections, looseMaterials, panelNails, onLevelChange]);

  // Totales derivados para los componentes hijos
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

    return {
      extLengthSum, extZipSheetsFinal, int2x6LF, int2x4LF,
      ptLFTotalAll: extPTLFSum + intPTLFSum,
      platePiecesTotalAll: extPlatePieces + intPlatePieces,
      panelPtBoardsAll: extPanelPtBoards + intPanelPtBoards,
      totalBottomPlatePiecesPanelAll: extBottomPlatePiecesPanel + intBottomPlatePiecesPanel,
      panelSheetsAll: extPanelSheets + intPanelSheets,
    };
  }, [exteriorSections, interiorSections]);

  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2
  }), []);
  const fmt = (n) => moneyFmt.format(Number(n) || 0);

  return (
    <section className="ew-stack">
      <AccordionSection
        open={!collapsed}
        onOpenChange={(o) => setCollapsed(!o)}
        bar={({ open, toggle }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <button
              type="button"
              className="acc__button"
              onClick={toggle}
              title={open ? 'Collapse' : 'Expand'}
              style={{ border: 'none', background: 'transparent', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              {/* SUSTITUCIÓN: Chevrons de Lucide */}
              {open ? <ChevronDown className="gradient-icon" size={20} /> : <ChevronRight className="gradient-icon" size={20} />}
            </button>
            <EditableTitle
              value={name}
              onChange={handleNameChange}
              textClass='text-h1'
            />
            <div
              className="text-subtotal-orange"
              style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 18, fontFamily: 'var(--font-money)' }}
              title="Level total (Panels + Loose)"
            >
              Level total: {fmt(levelTotal)}
            </div>
            {onRemove ? (
              <div style={{ marginLeft: 12 }}>
                <RemoveButton onClick={onRemove} title="Remove level" label="Remove" />
              </div>
            ) : null}
          </div>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '16px' }}>
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
        </div>
      </AccordionSection>
    </section>
  )
};