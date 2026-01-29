// src/components/WallPanelsView.jsx
'use client';

import {
  useCallback,
  useMemo,
  useEffect,
  useState,
  useRef,
} from 'react';
import { useProject } from '@/context/ProjectContext';
import Level from '@/components/Level';
import PanelsManufactureEstimate from "@/components/PanelsManufactureEstimate";
import NailsAndBracing from '@/components/NailsAndBracing';
import AddButton from './ui/AddButton';
import { motion } from "framer-motion";

const WallIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M7 21V7" />
    <path d="M12 21V7" />
    <path d="M17 21V7" />
    <path d="M2 12h20" />
  </svg>
);

export default function WallPanelsView({ onGrandTotal }) {
  const { projectData, updateProject, blankLevel, isLoaded } = useProject();

  const estimateData = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (estimateData.levels || []).filter(Boolean), [estimateData.levels]);
  const manufactureEstimate = useMemo(() => estimateData.manufactureEstimate || {}, [projectData]);
  const nailsAndBracing = useMemo(() => estimateData.nailsAndBracing || {}, [projectData]);

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

  // Lógica de Agregación Corregida
  const allLevelStats = useMemo(() => {
    let totalExteriorLF = 0, totalInteriorShearLF = 0, totalInteriorBlockingLF = 0;
    let totalInteriorNonLoadLF = 0, totalKneeWallLF = 0, panelsAll = 0;
    let platePiecesAll = 0, ptPiecesAll = 0, sheetsExtAll = 0;
    let sheetsBandAll = 0, sheetsExtraAll = 0;
    let totalLooseBlockingLF = 0; // Para la última fila de manufactura

    for (const level of levels) {
      // Exterior
      for (const s of (level.exteriorSections || [])) {
        totalExteriorLF += Number(s.lengthLF || 0);
        panelsAll += Number(s.panelSheets || 0);
        platePiecesAll += Number(s.platePieces || 0);
        ptPiecesAll += Number(s.panelPtBoards || 0);
        sheetsExtAll += Number(s.zipSheetsFinal || 0);
      }
      // Interior - Mapeo por 'kind'
      for (const s of (level.interiorSections || [])) {
        const k = String(s.kind || '').toLowerCase();
        if (k === 'shear') totalInteriorShearLF += Number(s.lengthLF || 0);
        if (k === 'bearing') totalInteriorBlockingLF += Number(s.lengthLF || 0); // Bearing a row 3
        if (k === 'partition') totalInteriorNonLoadLF += Number(s.lengthLF || 0);
        if (k === 'knee') totalKneeWallLF += Number(s.lengthLF || 0);

        panelsAll += Number(s.panelSheets || 0);
        platePiecesAll += Number(s.platePieces || 0);
        ptPiecesAll += Number(s.panelPtBoards || 0);
      }
      // Loose Materials - Mapeo de Int Blocking
      const looseData = level.looseMaterials || {};
      const looseInputs = looseData.intInputs || {};
      totalLooseBlockingLF += Number(looseInputs.blockingLF || 0); // Int Blocking a row 8

      const looseStats = looseData.generalStats || {};
      platePiecesAll += Number(looseStats.platePiecesTotal || 0);
      ptPiecesAll += Number(looseStats.ptPieces || 0);
      sheetsBandAll += Number(looseStats.sheetsBand || 0);
      sheetsExtraAll += Number(looseStats.sheetsExtra || 0);
    }

    return {
      totalExteriorLF, totalInteriorShearLF, totalInteriorBlockingLF,
      totalInteriorNonLoadLF, totalKneeWallLF, totalLooseBlockingLF,
      panelsAll, platePiecesAll, ptPiecesAll, sheetsExtAll, sheetsBandAll, sheetsExtraAll,
      levelsCount: levels.length
    };
  }, [levels]);

  const grandTotal = useMemo(() => {
    const levelsTotal = levels.reduce((sum, lvl) => sum + (Number(lvl.total) || 0), 0);
    const manufactureTotal = Number(manufactureEstimate.total || 0);
    const nailsTotal = Number(nailsAndBracing.total || 0);
    return Number((levelsTotal + manufactureTotal + nailsTotal).toFixed(2));
  }, [levels, manufactureEstimate, nailsAndBracing]);

  const onGrandTotalRef = useRef(onGrandTotal);
  useEffect(() => { onGrandTotalRef.current = onGrandTotal; }, [onGrandTotal]);

  const lastSentGrandTotalRef = useRef(null);
  useEffect(() => {
    if (grandTotal !== lastSentGrandTotalRef.current) {
      if (typeof onGrandTotalRef.current === 'function') onGrandTotalRef.current(grandTotal);
      lastSentGrandTotalRef.current = grandTotal;
    }
  }, [grandTotal]);

  const moneyFmt = useMemo(() => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2
  }), []);
  const fmt = (n) => moneyFmt.format(Number(n) || 0);

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <div className="ew-card"><span className="text-h1">Wall Panels</span><p className="ew-subtle" style={{ marginTop: '10px' }}>Please create or load a project.</p></div>
      </div>
    );
  }

  return (
    <div className="app-content">
      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
        style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: '16px', color: 'var(--turq-200)' }}>
            <WallIcon width={32} height={32} />
          </div>
          <div>
            <h1 className="ew-h2" style={{ fontSize: '2.5rem', margin: 0, lineHeight: 1.1 }}>{projectData?.name ? `${projectData.name} — ` : ''}Wall Panels</h1>
            <div className="ew-subtle" style={{ fontSize: '1rem', marginTop: '4px' }}>Estimate floor levels, manufacture costs & hardware</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ew-subtle" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Project Total</div>
          <div style={{ fontSize: '2.2rem', color: 'var(--turq-400)', fontWeight: '800', fontFamily: 'var(--font-money)' }}>{fmt(grandTotal)}</div>
        </div>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {levels.map((lvl) => (
          <Level
            key={lvl.id}
            levelData={lvl}
            onLevelChange={updaterFn => handleLevelChangeById(lvl.id, updaterFn)}
            onRemove={levels.length > 1 ? () => removeLevel(lvl.id) : undefined}
            levelStats={allLevelStats}
          />
        ))}
      </div>

      <div className="ew-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
        <div className="ew-subtle">Add another floor level to the estimate</div>
        <AddButton onClick={addLevel} title="Add Level" label="Add Floor Level" />
      </div>

      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <NailsAndBracing title="General — Nails & Bracing (all levels)" data={nailsAndBracing} onChange={handleNailsBracingChange} totals={allLevelStats} />

        <PanelsManufactureEstimate
          data={manufactureEstimate}
          onChange={handleManufactureChange}
          exteriorLF={allLevelStats.totalExteriorLF}
          interiorShearLF={allLevelStats.totalInteriorShearLF}
          interiorBlockingLF={allLevelStats.totalInteriorBlockingLF} // Mapeo de Bearing Walls
          interiorNonLoadLF={allLevelStats.totalInteriorNonLoadLF}
          kneeWallLF={allLevelStats.totalKneeWallLF}
          blocking2x10LF={allLevelStats.totalLooseBlockingLF} // Mapeo de Int Blocking
        />
      </div>
    </div>
  );
}