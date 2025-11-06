// src/components/Level.jsx
"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
// import { useLocalStorageJson } from "@/hooks/useLocalStorageJson";
import ExteriorWalls from "@/components/ExteriorWalls";
import InteriorWalls from "@/components/InteriorWalls";
import LoosePanelMaterials from "@/components/LoosePanelMaterials";
import AccordionSection from "@/components/ui/AccordionSection";
import RemoveButton from "./ui/RemoveButton";
import PanelNails from "@/components/PanelNails";

export default function Level({
  // id, 
  // name, 
  // onLooseTotal = () => {},
  // onLevelTotal = () => {},
  // onExteriorPanelLenChange,
  // onExteriorLF,
  // onInteriorShearLF,
  // onInteriorShearPanelLenChange,
  // onInteriorBearingLF,
  // onInteriorNonLoadLF,
  // onKneeWallLF,
  // levelsCount,
  // panelsTotalAllSections,
  // onLooseGeneralChange,
  onRemove, // optional: () => void
  levelData,
  onLevelChange,
}) {

  const {
    id,
    name,
    collapsed = false, // Default to not collapsed
    exteriorSections = [],
    interiorSections = [],
    looseMaterials = {},
    panelNails = {},
  } = levelData;

  const handleNameChange = (newName) => {
    onLevelChange({ ...levelData, name: newName });
  };
  
  const setCollapsed = (isCollapsed) => {
    onLevelChange({ ...levelData, collapsed: isCollapsed });
  };
  
  // This function will be passed to ExteriorWalls
  const handleExteriorChange = (newExteriorSections) => {
    onLevelChange({ ...levelData, exteriorSections: newExteriorSections });
  };
  
  // This function will be passed to InteriorWalls
  const handleInteriorChange = (newInteriorSections) => {
    onLevelChange({ ...levelData, interiorSections: newInteriorSections });
  };
  
  const handlePanelNailsChange = (newPanelNailsData) => {
    onLevelChange({ ...levelData, panelNails: newPanelNailsData });
  };
  
  const handleLooseMaterialsChange = (newLooseData) => {
    onLevelChange({ ...levelData, looseMaterials: newLooseData });
  };

  const levelTotal = useMemo(() => {
    const extTotal = (levelData.exteriorSections || []).reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const intTotal = (levelData.interiorSections || []).reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const looseTotal = Number(levelData.looseMaterials?.subtotal) || 0;
    const nailsTotal = Number(levelData.panelNails?.total) || 0; 
    
    const newTotal = extTotal + intTotal + looseTotal + nailsTotal;
    
    // Also, save this new total back into the object for the parent (WallPanelsView)
    if (onLevelChange && levelData.total !== newTotal) {
      // Use a microtask to avoid updating state during render
      Promise.resolve().then(() => {
        onLevelChange({ ...levelData, total: newTotal });
      });
    }
    return newTotal;
  }, [levelData, onLevelChange]);

    const moneyFmt = useMemo(
    () =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
    []
  );
  const fmt = (n) => moneyFmt.format(Number(n) || 0);
  const novaMonoStyle = { fontFamily: "'Nova Mono', monospace" };



  // UI (collapsed persisted per level)
  // const [ui, setUi] = useLocalStorageJson(`inv:v1:level-ui:${id}`, {
  //   collapsed: false,
  // });
  // const collapsed = !!ui.collapsed;
  // const setCollapsed = (c) => setUi((prev) => ({ ...prev, collapsed: !!c }));

  // Live totals reported by wrappers
  // const [extTotals, setExtTotals] = useState(null);
  // const [intTotals, setIntTotals] = useState({
  //   int2x6LF: 0,
  //   int2x4LF: 0,
  //   intPlatePieces: 0,
  //   intPTLFSum: 0,
  //   panelsSubtotal: 0, // sum of InteriorWallGroup groupSubtotal for this level
  // });
  // const [panelNailsSubtotal, setPanelNailsSubtotal] = useState(0);

  // derive once per level
  // const panelPtBoards = useMemo(
  //   () =>
  //     Math.ceil(Number(extTotals?.extPanelPtBoards || 0)) +
  //     Math.ceil(Number(intTotals?.intPanelPtBoards || 0)),
  //   [extTotals?.extPanelPtBoards, intTotals?.intPanelPtBoards]
  // );

  // Sum of ALL bottom plate pieces used ON PANELS for this level
  // const totalBottomPlatePiecesPanel = useMemo(
  //   () =>
  //     Math.ceil(Number(extTotals?.extBottomPlatePiecesPanel || 0)) +
  //     Math.ceil(Number(intTotals?.intBottomPlatePiecesPanel || 0)),
  //   [extTotals?.extBottomPlatePiecesPanel, intTotals?.intBottomPlatePiecesPanel]
  // );

  // const [looseSubtotal, setLooseSubtotal] = useState(0);
  // const [extPanelLenFt, setExtPanelLenFt] = useState(0);

  // const handlePanelLenFromExterior = useCallback(
  //   (len) => {
  //     const val = Number(len) || 16;
  //     setExtPanelLenFt(val);
  //     onExteriorPanelLenChange?.({ id, len: val }); // still inform parent if desired
  //   },
  //   [id, onExteriorPanelLenChange]
  // );

  // const handleIntTotals = useCallback(
  //   (t) => {
  //     setIntTotals(t || null); // Store the whole object (or null)
  //     if (!t) return;

  //     // Forward specific LF values if needed by parent (WallPanelsView)
  //     onInteriorShearLF?.({ id, lf: Number(t.shearLengthSum) || 0 });
  //     onInteriorShearPanelLenChange?.({
  //       id,
  //       len: Number(t.shearPanelLenFt) || 8,
  //     });
  //     onInteriorBearingLF?.({ id, lf: Number(t.bearingLengthSum) || 0 });
  //     onInteriorNonLoadLF?.({ id, lf: Number(t.partitionLengthSum) || 0 }); // Assuming partition = non-load
  //     onKneeWallLF?.({ id, lf: Number(t.kneeLengthSum) || 0 });
  //   },
  //   [
  //     id,
  //     onInteriorShearLF,
  //     onInteriorShearPanelLenChange,
  //     onInteriorBearingLF,
  //     onInteriorNonLoadLF,
  //     onKneeWallLF,
  //   ]
  // );

  // const handleLooseSubtotal = useCallback(
  //   (payload) => {
  //     const sub = Number(payload?.subtotal) || 0;
  //     setLooseSubtotal(sub);
  //     onLooseTotal?.({ id, subtotal: sub });
  //   },
  //   [id, onLooseTotal]
  // );

  // Callback for PanelNails subtotal
  // const handlePanelNailsSubtotal = useCallback((payload) => {
  //   const sub = Number(payload?.total) || 0; // PanelNails sends { total: ... }
  //   setPanelNailsSubtotal(sub);
  // }, []);

  
  // const levelTotal = useMemo(() => {
  //   const ext = Number(extTotals?.panelsSubtotal) || 0;
  //   const intl = Number(intTotals?.panelsSubtotal) || 0; 
  //   const loose = Number(looseSubtotal) || 0; 
  //   const nails = Number(panelNailsSubtotal) || 0; 
  //   return ext + intl + loose + nails;
  // }, [
  //   extTotals?.panelsSubtotal,
  //   intTotals?.panelsSubtotal,
  //   looseSubtotal,
  //   panelNailsSubtotal,
  // ]);



  // useEffect(() => {
  //   onLevelTotal?.({ id, total: levelTotal });
  // }, [id, levelTotal, onLevelTotal]);

  // const panelPlatePieces =
  //   Number(extTotals?.extPlatePieces || 0) +
  //   Number(intTotals?.intPlatePieces || 0);

  // // Calculate total sheets used ON PANELS for this level
  // const panelSheetsAll = useMemo(() => {
  //   const ext = Number(extTotals?.extPanelSheets || 0); // Use the corrected prop name
  //   const ints = Number(intTotals?.intPanelSheets || 0); // Use the corrected prop name
  //   return ext + ints;
  // }, [extTotals?.extPanelSheets, intTotals?.intPanelSheets]); // Update dependencies


  return (
    <section className="ew-stack">
      <AccordionSection
        open={!collapsed}
        onOpenChange={(o) => setCollapsed(!o)}
        bar={({ open, toggle }) => (
          <div
            style={{
              ...novaMonoStyle,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <button
              type="button"
              className="acc__button"
              onClick={toggle}
              title={open ? "Collapse" : "Expand"}
              aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
              style={{ fontSize: "18px", fontWeight: "700", color: "#59d2c8" }}
            >
              <img
                src={open ? "/icons/down.png" : "/icons/minimize.png"}
                alt={open ? "Collapse section" : "Expand section"}
                className="acc__chev"
                style={{
                  display: "inline-block",
                  verticalAlign: "middle",
                }}
              />
              {name}
            </button>

            <div
              className="ew-right"
              style={{
                marginLeft: "auto",
                fontWeight: 800,
                fontSize: 16,
                color: "#f18d5b",
              }}
              title="Level total (Panels + Loose)"
            >
              Level total: {fmt(levelTotal)}
            </div>

            {onRemove ? (
              <RemoveButton
                onClick={onRemove}
                title="Remove level"
                label="Remove level"
              />
            ) : null}
          </div>
        )}
      >
        <ExteriorWalls
          sectionsData={exteriorSections}
          onSectionsChange={handleExteriorChange}
          title={`${name} — Exterior walls`}
          isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ""))}
          // levelId={id}
          // onTotalsChange={(t) => setExtTotals(t)}
          // onLengthLFChange={(lf) => onExteriorLF?.({ id, lf })}
          // onPanelLenFtChange={handlePanelLenFromExterior}
        />

        <InteriorWalls
          sectionsData={interiorSections}
          onSectionsChange={handleInteriorChange}
          title={`${name} — Interior walls`}
          isLevelOne={/(\b|^)level\s*1(\b|$)/i.test(String(name || ""))}
          // levelId={id}
          // onTotalsChange={handleIntTotals}
          // onInteriorBearingLF={onInteriorBearingLF}
          // onBearingLFChange={(lfVal) =>
          // onInteriorBearingLF?.({ id, lf: Number(lfVal) || 0 })
          // }
          // onPartitionLFChange={(lfVal) =>
          //   onInteriorNonLoadLF?.({ id, lf: Number(lfVal) || 0 })
          // }
          // onKneeLFChange={(lfVal) =>
          //   onKneeWallLF?.({ id, lf: Number(lfVal) || 0 })
          // }
        />

        <PanelNails
          data={panelNails}
          onChange={handlePanelNailsChange}
          title={`${name} — Panel nails`}
          persistKey={`panel-nails:${id}`}
          platePiecesPanels={
            Number(
              // This is NON-PT plates only, keep for 8D nails
              (extTotals?.extPlatePieces || 0) +
                (intTotals?.intPlatePieces || 0)
            ) - totalBottomPlatePiecesPanel
          }
          ptPlatePiecesPanels={panelPtBoards}
          totalPanelSheets={panelSheetsAll}
          totalBottomPlatePiecesPanel={totalBottomPlatePiecesPanel}
          onTotalChange={handlePanelNailsSubtotal}
        />

        <LoosePanelMaterials
        data={looseMaterials}
        onChange={handleLooseMaterialsChange}
          title={`${name} — Loose materials (wall panels)`}
          persistKey={`loose:${id}`}
          onSubtotalChange={handleLooseSubtotal}
          extLengthLF={Number(extTotals?.extLengthSum || 0)}
          extZipSheetsFinal={Number(
            extTotals?.extZipSheetsFinal ?? extTotals?.extZipSheetsSum ?? 0
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
      </AccordionSection>
    </section>
  );
}
