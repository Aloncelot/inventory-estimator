// src/components/LoosePanelMaterials.jsx
"use client";

import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { parseBoardLengthFt, unitPriceFrom } from "@/domain/lib/parsing";
import ItemPicker from "@/components/ItemPicker";
import { useLocalStorageJson } from "@/hooks/useLocalStorageJson";
import AccordionSection from "@/components/ui/AccordionSection";

import {
  // exterior
  looseExtBottomPlates,
  looseExtTopPlates,
  loosePanelBandSheathing,
  looseExtraSheathing,
  looseOpeningsBlocking,
  looseSecondBottomPlate,
  // interior
  looseInt2x6PTPlates,
  looseInt2x6Plates,
  looseInt2x4PTPlates,
  looseInt2x4Plates,
  looseCabinetBlocking,
  // general
  looseConcreteNails,
  looseSheathingNails,
  looseFramingNails,
  looseTempBracing,
} from "@/domain/calculators";

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmt = (n) =>
  Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : "—";

const deref = (x) => (x && x.item ? deref(x.item) : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || "pcs";
const getSize = (s) =>
  deref(s)?.sizeDisplay ||
  deref(s)?.sizeLabel ||
  deref(s)?.raw?.sizeDisplay ||
  "";
const wordsPreview = (s = "", maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(" ");
  return parts.length > maxWords ? `${preview}…` : preview || "";
};

export default function LoosePanelMaterials({
  title = "Loose materials — Wall Panels",
  persistKey = "loose-panels-0",
  onRemove,
  extLengthLF,
  extZipSheetsFinal,
  extZipSheetsSum,
  int2x6LF,
  int2x4LF,
  ptLFTotal,
  onTotalChange,
  onSubtotalChange,
  levelId,
  platePiecesTotal,
  onGeneralChange,
}) {
  const extSheets = useMemo(
    () => Number(extZipSheetsFinal ?? extZipSheetsSum ?? 0),
    [extZipSheetsFinal, extZipSheetsSum]
  );

  const showZipTape = extSheets > 0;

  // Notes per row
  const [notes, setNotes] = useLocalStorageJson(
    `inv:v1:notes:${persistKey}`,
    {}
  );
  const getNote = (k) => notes[k] || { plan: "", comment: "", open: false };
  const setNote = (k, patch) =>
    setNotes((prev) => ({ ...prev, [k]: { ...getNote(k), ...patch } }));
  const toggleOpen = (k) => setNote(k, { open: !getNote(k).open });

  // ── Exterior context (manual if props not provided) ─────────────
  const [extInputs, setExtInputs] = useState({
    lengthLF: Number(extLengthLF ?? 0),
    panelBandLF: Number(extLengthLF ?? 0),
    panelBandHeightFt: 4,
    lfPerZipSheet: 12,
    tapeRollLenFt: 75,
    openingsBlockingLF: 0,
  });

  const [panelBandEdited, setPanelBandEdited] = useState(false);

  // ── Interior context (manual if props not provided) ─────────────
  const [intInputs, setIntInputs] = useState({
    int2x6LF: int2x6LF ?? 0,
    int2x4LF: int2x4LF ?? 0,
    blockingLF: 0, // bathroom/kitchen blocking LF (always included)
  });

  // Include toggles (ONLY for these two)
  const [include, setInclude] = useState({
    secondBottom: false,
    extraSheathing: false,
  });

  // Selections
  const [sel, setSel] = useState({
    // Exterior
    extBottomPT: null,
    extTopPlate: null,
    panelBandSheathing: null,
    zipTape: null,
    openingsBlocking: null,
    secondBottom: null,
    extraSheathing: null,

    // Interior
    int2x6PT: null,
    int2x6Plate: null,
    int2x4PT: null,
    int2x4Plate: null,
    intCabinetBlocking: null,
  });
  const setPick = (key) => (item) =>
    setSel((prev) => ({ ...prev, [key]: item }));

  // Derived effective LFs
  const effectiveExtLF = Number(extLengthLF ?? extInputs.lengthLF ?? 0);
  const effectiveInt2x6LF = Number(int2x6LF ?? intInputs.int2x6LF ?? 0);
  const effectiveInt2x4LF = Number(int2x4LF ?? intInputs.int2x4LF ?? 0);

  useEffect(() => {
    if (!panelBandEdited) {
      const ext = Number(extLengthLF ?? extInputs.lengthLF ?? 0);
      setExtInputs((v) => ({ ...v, panelBandLF: ext }));
    }
  }, [extLengthLF, panelBandEdited]); // extInputs.lengthLF if you allow editing that too

  // Board lengths from sizes
  const lenBottomPT = parseBoardLengthFt(getSize(sel.extBottomPT)) || 16;
  const lenTopPlate = parseBoardLengthFt(getSize(sel.extTopPlate)) || 16;
  const lenOpeningBlk = parseBoardLengthFt(getSize(sel.openingsBlocking)) || 10;
  const lenSecondBottom = parseBoardLengthFt(getSize(sel.secondBottom)) || 16;

  const lenInt2x6PT = parseBoardLengthFt(getSize(sel.int2x6PT)) || 16;
  const lenInt2x6Pl = parseBoardLengthFt(getSize(sel.int2x6Plate)) || 16;
  const lenInt2x4PT = parseBoardLengthFt(getSize(sel.int2x4PT)) || 16;
  const lenInt2x4Pl = parseBoardLengthFt(getSize(sel.int2x4Plate)) || 16;

  // ── Build EXTERIOR rows ────────────────────────────────────────
  const exteriorRows = useMemo(() => {
    const out = [];

    // PT Bottom Plates – Loose
    {
      const res = looseExtBottomPlates({
        lengthLF: Number(effectiveExtLF) || 0,
        boardLenFt: Math.max(Number(lenBottomPT) || 0, 1),
        item: getItem(sel.extBottomPT),
        unit: getUnit(sel.extBottomPT),
      });
      out.push({
        key: "extBottomPT",
        label: "PT Bottom Plates – Loose",
        ...res,
        item: getItem(sel.extBottomPT),
        wastePct: 5,
      });
    }

    // Top Plates – Loose
    {
      const res = looseExtTopPlates({
        lengthLF: Number(effectiveExtLF) || 0,
        boardLenFt: Math.max(Number(lenTopPlate) || 0, 1),
        item: getItem(sel.extTopPlate),
        unit: getUnit(sel.extTopPlate),
      });
      out.push({
        key: "extTopPlate",
        label: "Top Plates – Loose",
        ...res,
        item: getItem(sel.extTopPlate),
        wastePct: 5,
      });
    }

    // Panel band sheathing (ZIP family by default)
    {
      const res = loosePanelBandSheathing({
        panelBandLF: Number(extInputs.panelBandLF || 0),
        bandHeightFt: 4, // 4' band ⇒ sheets ≈ LF / 8 (waste applied inside)
        item: getItem(sel.panelBandSheathing),
        unit: getUnit(sel.panelBandSheathing) || "sheet",
        wastePct: 20,
      });

      out.push({
        key: "panelBandSheathing",
        label: "Panel band sheathing",
        ...res,
        item: getItem(sel.panelBandSheathing),
        wastePct: 20,
      });
    }

    // Extra sheathing (optional)
    if (include.extraSheathing) {
      const res = looseExtraSheathing({
        extLengthLF: Number(effectiveExtLF) || 0,
        bandHeightFt: Number(extInputs.panelBandHeightFt || 4),
        item: getItem(sel.extraSheathing),
        unit: getUnit(sel.extraSheathing) || "sheet",
      });
      out.push({
        key: "extraSheathing",
        label: "Extra sheathing (optional)",
        ...res,
        item: getItem(sel.extraSheathing),
        wastePct: 10,
      });
    }

    // Tape – ZIP system  (Rolls = total ZIP sheets ÷ 6; per-level)
    if (showZipTape) {
      const panelBandSheetsLocal = Number(
        out.find((r) => r.key === "panelBandSheathing")?.qtyFinal || 0
      );
      const extraSheetsLocal = include.extraSheathing
        ? Number(out.find((r) => r.key === "extraSheathing")?.qtyFinal || 0)
        : 0;

      // extSheets must come from props/parent (e.g., extZipSheetsFinal),
      // not computed from `out`, to avoid loops:
      const totalSheets =
        Number(extSheets) + panelBandSheetsLocal + extraSheetsLocal;

      const qtyRaw = totalSheets / 6;
      const qtyFinal = Math.ceil(qtyRaw); // whole rolls only
      const unit = getUnit(sel.zipTape) || "roll";
      const item = getItem(sel.zipTape);
      const unitPrice = unitPriceFrom(item);
      const subtotal = qtyFinal * (Number(unitPrice) || 0);

      out.push({
        key: "zipTape",
        label: "Tape – ZIP system",
        unit,
        qtyRaw,
        qtyFinal,
        unitPrice,
        subtotal,
        item,
        wastePct: 0, // set to 0 if tape calc already fixes rolls; or keep 15, but update the comment
      });
    }

    // Blocking at openings (LF ÷ board length)
    {
      const res = looseOpeningsBlocking({
        openingsLF: Number(extInputs.openingsBlockingLF || 0),
        boardLenFt: Math.max(Number(lenOpeningBlk) || 0, 1),
        item: getItem(sel.openingsBlocking),
        unit: getUnit(sel.openingsBlocking),
      });
      out.push({
        key: "openingsBlocking",
        label: "Blocking at openings",
        ...res,
        item: getItem(sel.openingsBlocking),
        wastePct: 10,
      });
    }

    // Second bottom plate (optional)
    if (include.secondBottom) {
      const res = looseSecondBottomPlate({
        lengthLF: Number(effectiveExtLF) || 0,
        boardLenFt: Math.max(Number(lenSecondBottom) || 0, 1),
        item: getItem(sel.secondBottom),
        unit: getUnit(sel.secondBottom),
      });
      out.push({
        key: "secondBottom",
        label: "Second bottom plate (optional)",
        ...res,
        item: getItem(sel.secondBottom),
        wastePct: 5,
      });
    }

    return out;
  }, [
    sel,
    include,
    effectiveExtLF,
    extSheets,
    extInputs.panelBandLF,
    extInputs.panelBandHeightFt,
    extInputs.lfPerZipSheet,
    extInputs.tapeRollLenFt,
    extInputs.openingsBlockingLF,
    lenBottomPT,
    lenTopPlate,
    lenOpeningBlk,
    lenSecondBottom,
    showZipTape,
  ]);

  const rowsByKey = useMemo(
    () => Object.fromEntries(exteriorRows.map((r) => [r.key, r])),
    [exteriorRows]
  );

  const bandSheets = Math.ceil(rowsByKey.panelBandSheathing?.qtyFinal || 0);
  const extraSheets = include.extraSheathing
    ? Math.ceil(rowsByKey.extraSheathing?.qtyFinal || 0)
    : 0;

  const sheetsBand = useMemo(
    () =>
      Number(
        exteriorRows.find((r) => r.key === "panelBandSheathing")?.qtyFinal || 0
      ),
    [exteriorRows]
  );

  const sheetsExtra = useMemo(
    () =>
      Number(
        exteriorRows.find((r) => r.key === "extraSheathing")?.qtyFinal || 0
      ),
    [exteriorRows]
  );

  const sheetsExt = useMemo(
    () => Number(extZipSheetsFinal || extZipSheetsSum || 0),
    [extZipSheetsFinal, extZipSheetsSum]
  );

  // ── Build INTERIOR rows ────────────────────────────────────────
  const interiorRows = useMemo(() => {
    const out = [];

    // Interior 2×6 — PT Plates – Loose
    {
      const res = looseInt2x6PTPlates({
        lengthLF: Number(effectiveInt2x6LF) || 0,
        boardLenFt: Math.max(Number(lenInt2x6PT) || 0, 1),
        item: getItem(sel.int2x6PT),
        unit: getUnit(sel.int2x6PT),
        wastePct: 5,
      });
      out.push({
        key: "int2x6PT",
        label: "Interior 2×6 — PT Plates – Loose",
        ...res,
        item: getItem(sel.int2x6PT),
        wastePct: 5,
      });
    }

    // Interior 2×6 — Plates – Loose (non-PT)
    {
      const res = looseInt2x6Plates({
        lengthLF: Number(effectiveInt2x6LF) || 0,
        boardLenFt: Math.max(Number(lenInt2x6Pl) || 0, 1),
        item: getItem(sel.int2x6Plate),
        unit: getUnit(sel.int2x6Plate),
        wastePct: 5,
      });
      out.push({
        key: "int2x6Plate",
        label: "Interior 2×6 — Plates – Loose",
        ...res,
        item: getItem(sel.int2x6Plate),
        wastePct: 5,
      });
    }

    // Interior 2×4 — PT Plates – Loose
    {
      const res = looseInt2x4PTPlates({
        lengthLF: Number(effectiveInt2x4LF) || 0,
        boardLenFt: Math.max(Number(lenInt2x4PT) || 0, 1),
        item: getItem(sel.int2x4PT),
        unit: getUnit(sel.int2x4PT),
        wastePct: 5,
      });
      out.push({
        key: "int2x4PT",
        label: "Interior 2×4 — PT Plates – Loose",
        ...res,
        item: getItem(sel.int2x4PT),
        wastePct: 5,
      });
    }

    // Interior 2×4 — Plates – Loose (non-PT)
    {
      const res = looseInt2x4Plates({
        lengthLF: Number(effectiveInt2x4LF) || 0,
        boardLenFt: Math.max(Number(lenInt2x4Pl) || 0, 1),
        item: getItem(sel.int2x4Plate),
        unit: getUnit(sel.int2x4Plate),
        wastePct: 5,
      });
      out.push({
        key: "int2x4Plate",
        label: "Interior 2×4 — Plates – Loose",
        ...res,
        item: getItem(sel.int2x4Plate),
        wastePct: 5,
      });
    }

    // Walls (general) — Blocking for Bathroom & Kitchen
    {
      const blkLen = parseBoardLengthFt(getSize(sel.intCabinetBlocking)) || 8;
      const res = looseCabinetBlocking({
        blockingLF: Number(intInputs.blockingLF || 0),
        boardLenFt: Math.max(blkLen, 1),
        item: getItem(sel.intCabinetBlocking),
        unit: getUnit(sel.intCabinetBlocking),
      });
      out.push({
        key: "intCabinetBlocking",
        label: "Walls (general) — Blocking for Bathroom & Kitchen",
        ...res,
        item: getItem(sel.intCabinetBlocking),
        wastePct: 10,
      });
    }

    return out;
  }, [
    sel,
    effectiveInt2x6LF,
    effectiveInt2x4LF,
    lenInt2x6PT,
    lenInt2x6Pl,
    lenInt2x4PT,
    lenInt2x4Pl,
    intInputs.blockingLF,
  ]);

  // 2) Aggregates (computed AFTER exteriorRows + interiorRows exist)
  const nonPTPiecesLevel = useMemo(() => {
    const extTop = Math.ceil(
      exteriorRows.find((r) => r.key === "extTopPlate")?.qtyFinal || 0
    );
    const second = Math.ceil(
      exteriorRows.find((r) => r.key === "secondBottom")?.qtyFinal || 0
    );
    const int6Pl = Math.ceil(
      interiorRows.find((r) => r.key === "int2x6Plate")?.qtyFinal || 0
    );
    const int4Pl = Math.ceil(
      interiorRows.find((r) => r.key === "int2x4Plate")?.qtyFinal || 0
    );
    return extTop + second + int6Pl + int4Pl;
  }, [exteriorRows, interiorRows]);

  // If you use per-group LF with 5% waste for PT pieces (recommended):
  const ptPiecesLevel = useMemo(() => {
    const parts = [
      {
        lf: Number(effectiveExtLF) || 0,
        len: Math.max(Number(lenBottomPT) || 0, 1),
      },
      {
        lf: Number(effectiveInt2x6LF) || 0,
        len: Math.max(Number(lenInt2x6PT) || 0, 1),
      },
      {
        lf: Number(effectiveInt2x4LF) || 0,
        len: Math.max(Number(lenInt2x4PT) || 0, 1),
      },
    ];
    return parts.reduce(
      (sum, { lf, len }) => sum + Math.ceil((lf * 1.05) / len),
      0
    );
  }, [
    effectiveExtLF,
    effectiveInt2x6LF,
    effectiveInt2x4LF,
    lenBottomPT,
    lenInt2x6PT,
    lenInt2x4PT,
  ]);

  // 3) Emit up (top-level hooks; do NOT place them inside a useMemo)
  const lastGenSigRef = useRef("");
  const onGenRef = useRef(onGeneralChange);
  useEffect(() => {
    onGenRef.current = onGeneralChange;
  }, [onGeneralChange]);

  useEffect(() => {
    const sig = [
      Number(sheetsExt) || 0,
      Number(sheetsBand) || 0,
      Number(sheetsExtra) || 0,
      Number(nonPTPiecesLevel) || 0,
      String(levelId || ""),
      Number(ptPiecesLevel) || 0,
    ].join("|");

    if (sig !== lastGenSigRef.current) {
      lastGenSigRef.current = sig;
      onGenRef.current?.({
        id: levelId,
        sheetsExt: Number(sheetsExt) || 0,
        sheetsBand: Number(sheetsBand) || 0,
        sheetsExtra: Number(sheetsExtra) || 0,
        platePiecesTotal: Number(nonPTPiecesLevel) || 0, // Loose-only non-PT
        ptPieces: Number(ptPiecesLevel) || 0, // PT pieces (per-group 5% waste)
      });
    }
  }, [
    sheetsExt,
    sheetsBand,
    sheetsExtra,
    nonPTPiecesLevel,
    ptPiecesLevel,
    levelId,
  ]);

  // Totals for nails math

  const ptLFAll = Number(
    ptLFTotal ?? effectiveExtLF + effectiveInt2x6LF + effectiveInt2x4LF
  );
  const wallsLFTotal = effectiveExtLF + effectiveInt2x6LF + effectiveInt2x4LF;

  // ── Build GENERAL (nails & bracing) rows ───────────────────────

  const sectionSubtotal = useMemo(() => {
    const a = exteriorRows.reduce((s, r) => s + (r.subtotal || 0), 0);
    const b = interiorRows.reduce((s, r) => s + (r.subtotal || 0), 0);
    return a + b;
  }, [exteriorRows, interiorRows]);

  const gridCols =
    "minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr";

  const subtotalStyle = {
    fontFamily: "'Nova Flat', cursive",
    color: "#f18d5b", // Orange color used elsewhere
    fontWeight: 700,
    marginLeft: "auto", // Align to the right
  };

  // Notify parent (Level) with Loose-materials subtotal
  useEffect(() => {
    if (typeof onSubtotalChange === "function") {
      onSubtotalChange({ subtotal: Number(sectionSubtotal) || 0 });
    }
    if (typeof onTotalChange === "function") {
      onTotalChange(Number(sectionSubtotal) || 0);
    }
  }, [sectionSubtotal, onSubtotalChange, onTotalChange]);

  return (
    <div className="ew-card">
      <AccordionSection
        title={title}
        defaultOpen={true}
        // summary={<div style={{ textAlign: 'right', fontWeight: 700, color: '#f18d5b' }}>Subtotal: {fmt(sectionSubtotal)}</div>}
        actions={
          onRemove ? (
            <button className="ew-btn" onClick={onRemove}>
              Remove section
            </button>
          ) : null
        }
        bar={({ open, toggle }) => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
            }}
          >
            <button
              type="button"
              className="acc__button"
              onClick={toggle}
              aria-expanded={open}
              title={open ? "Collapse" : "Expand"}
            >
              <img
                src={open ? "/icons/minimize.png" : "/icons/down.png"}
                alt={open ? "Collapse section" : "Expand section"}
                width={16}
                height={16}
                className="acc__chev"
                style={{ display: "inline-block", verticalAlign: "middle" }}
              />
            </button>
            <span className="ew-head">{title}</span>
            <div style={subtotalStyle}>Subtotal: {fmt(sectionSubtotal)}</div>
            {onRemove && (
              <div style={{ marginLeft: "8px" }}>
                <button className="ew-btn" onClick={onRemove}>
                  Remove section
                </button>
              </div>
            )}
          </div>
        )}
      >
        {/* ───────────── Exterior walls ───────────── */}
        <h3 className="ew-h3" style={{ marginTop: 0, marginBottom: 6 }}>
          Exterior walls
        </h3>

        {/* Exterior context */}
        <div className="controls4" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Exterior wall length (LF)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={extLengthLF ?? extInputs.lengthLF}
              onChange={(e) =>
                setExtInputs((v) => ({
                  ...v,
                  lengthLF: Number(e.target.value),
                }))
              }
              disabled={typeof extLengthLF === "number"}
              title={
                typeof extLengthLF === "number"
                  ? "Provided by context"
                  : "Manual"
              }
            />
          </label>
          <label>
            <span className="ew-subtle">Panel band LF</span>
            <div className="flex items-center gap-2">
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={extInputs.panelBandLF}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPanelBandEdited(true);
                  setExtInputs((prev) => ({
                    ...prev,
                    panelBandLF: Number.isFinite(v) ? v : 0,
                  }));
                }}
                style={{ width: 140, textAlign: "right" }}
              />
              {/* optional reset to re-link it to exterior LF */}
              <button
                type="button"
                className="ew-btn-secondary"
                onClick={() => {
                  setPanelBandEdited(false);
                  setExtInputs((prev) => ({
                    ...prev,
                    panelBandLF: Number(extLengthLF ?? prev.lengthLF ?? 0),
                  }));
                }}
                title="Use Exterior LF"
              >
                ↺ use exterior LF
              </button>
            </div>
          </label>
          <label>
            <span className="ew-subtle">Band height (ft)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={extInputs.panelBandHeightFt}
              onChange={(e) =>
                setExtInputs((v) => ({
                  ...v,
                  panelBandHeightFt: Number(e.target.value),
                }))
              }
            />
          </label>
        </div>

        {/* Exterior header */}
        <div className="ew-grid ew-head" style={{ "--cols": gridCols }}>
          <div>Item</div>
          <div>Vendor · Family · Size</div>
          <div className="ew-right">Qty</div>
          <div className="ew-right">Waste %</div>
          <div className="ew-right">Final qty</div>
          <div className="ew-right">Unit</div>
          <div className="ew-right">Unit price</div>
          <div className="ew-right">Subtotal</div>
          <div>Notes</div>
          <div></div>
        </div>

        <div className="ew-rows">
          {/* PT Bottom Plates – Loose */}
          <Row
            gridCols={gridCols}
            label="PT Bottom Plates – Loose"
            noteKey="loose:extBottomPT"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <ItemPicker
                compact
                onSelect={setPick("extBottomPT")}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
                defaultSizeLabel={`2x6"-16'`}
              />
            }
            row={exteriorRows.find((r) => r.key === "extBottomPT")}
          />

          {/* Top Plates – Loose */}
          <Row
            gridCols={gridCols}
            label="Top Plates – Loose"
            noteKey="loose:extTopPlate"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <ItemPicker
                compact
                onSelect={setPick("extTopPlate")}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x6"-16'`}
              />
            }
            row={exteriorRows.find((r) => r.key === "extTopPlate")}
          />

          {/* Panel band sheathing */}
          <Row
            gridCols={gridCols}
            label="Panel band sheathing"
            noteKey="loose:panelBandSheathing"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <div className="ew-inline" style={{ alignItems: "end" }}>
                <ItemPicker
                  compact
                  onSelect={setPick("panelBandSheathing")}
                  defaultVendor="Gillies & Prittie Warehouse"
                  defaultFamilyLabel="Green Zip"
                />
                <div className="ew-hint">
                  Here: 4′ band ⇒ sheets ≈ (Exterior LF ÷ 8) + waste
                </div>
              </div>
            }
            row={exteriorRows.find((r) => r.key === "panelBandSheathing")}
          />

          {/* Tape – ZIP system */}
          {showZipTape && (
            <Row
              gridCols={gridCols}
              label="Tape – ZIP system"
              noteKey="loose:zipTape"
              noteApi={{ getNote, toggleOpen, setNote }}
              picker={
                <div className="ew-inline" style={{ alignItems: "end" }}>
                  <ItemPicker
                    compact
                    onSelect={setPick("zipTape")}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel="ZIP Flashing Tape"
                  />
                  <div className="ew-hint">
                    ZIP sheets = (ext: {extSheets}) + (band: {bandSheets})
                    {include.extraSheathing ? ` + (extra: ${extraSheets})` : ""}
                  </div>
                </div>
              }
              row={exteriorRows.find((r) => r.key === "zipTape")}
            />
          )}

          {/* Blocking at openings */}
          <Row
            gridCols={gridCols}
            label="Blocking at openings"
            noteKey="loose:openingsBlocking"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <div className="ew-inline" style={{ alignItems: "end" }}>
                <ItemPicker
                  compact
                  onSelect={setPick("openingsBlocking")}
                  defaultVendor="Gillies & Prittie Warehouse"
                  defaultFamilyLabel="SPF#2"
                />
                <label style={{ minWidth: 170 }}>
                  <span className="ew-subtle">Openings blocking (LF)</span>
                  <input
                    className="ew-input focus-anim"
                    type="number"
                    value={extInputs.openingsBlockingLF}
                    onChange={(e) =>
                      setExtInputs((v) => ({
                        ...v,
                        openingsBlockingLF: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>
            }
            row={exteriorRows.find((r) => r.key === "openingsBlocking")}
          />

          {include.extraSheathing && (
            <Row
              gridCols={gridCols}
              label="Extra sheathing (optional)"
              noteKey="loose:extraSheathing"
              noteApi={{ getNote, toggleOpen, setNote }}
              picker={
                <div
                  className="ew-inline"
                  style={{ alignItems: "end", gap: 8 }}
                >
                  <ItemPicker
                    compact
                    onSelect={setPick("extraSheathing")}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel="CDX SE"
                  />
                  <button
                    type="button"
                    className="ew-btn"
                    onClick={() =>
                      setInclude((p) => ({ ...p, extraSheathing: false }))
                    }
                    title="Remove this row"
                  >
                    Remove
                  </button>
                </div>
              }
              row={exteriorRows.find((r) => r.key === "extraSheathing")}
            />
          )}

          {/* Second bottom plate (optional include) */}
          {include.secondBottom && (
            <Row
              gridCols={gridCols}
              label="Second bottom plate (optional)"
              noteKey="loose:secondBottom"
              noteApi={{ getNote, toggleOpen, setNote }}
              picker={
                <div
                  className="ew-inline"
                  style={{ alignItems: "end", gap: 8 }}
                >
                  <ItemPicker
                    compact
                    onSelect={setPick("secondBottom")}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel="SPF#2"
                  />
                  <button
                    type="button"
                    className="ew-btn"
                    onClick={() =>
                      setInclude((p) => ({ ...p, secondBottom: false }))
                    }
                    title="Remove this row"
                  >
                    Remove
                  </button>
                </div>
              }
              row={exteriorRows.find((r) => r.key === "secondBottom")}
            />
          )}
        </div>
        {/* Exterior “add optional rows” footer, like wall panels */}
        <div
          className="ew-footer"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          <button
            className="ew-btn"
            onClick={() => setInclude((p) => ({ ...p, extraSheathing: true }))}
            disabled={include.extraSheathing}
            title={
              include.extraSheathing
                ? "Already added"
                : "Add extra sheathing row"
            }
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <img src="/icons/plus-sign.png" alt="Add" width={14} height={14} />{" "}
            Extra sheathing
          </button>

          <button
            className="ew-btn"
            onClick={() => setInclude((p) => ({ ...p, secondBottom: true }))}
            disabled={include.secondBottom}
            title={
              include.secondBottom
                ? "Already added"
                : "Add second bottom plate row"
            }
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <img src="/icons/plus-sign.png" alt="Add" width={14} height={14} />{" "}
            Extra bottom plate
          </button>

          {/* Spacer grows; keep it like the panels footer layout */}
          <div style={{ flex: 1 }} />

          {/* You can optionally echo a small subtotal for exterior-only if you want */}
          {/* <div className="ew-subtle">Exterior subtotal: {fmt(exteriorRows.reduce((s,r)=>s+(r.subtotal||0),0))}</div> */}
        </div>

        {/* ───────────── Interior walls ───────────── */}
        <h3 className="ew-h3" style={{ marginTop: 16, marginBottom: 6 }}>
          Interior walls
        </h3>

        {/* Interior context */}
        <div className="controls4" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Interior 2×6 LF</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={int2x6LF ?? intInputs.int2x6LF}
              onChange={(e) =>
                setIntInputs((v) => ({
                  ...v,
                  int2x6LF: Number(e.target.value),
                }))
              }
              disabled={typeof int2x6LF === "number"}
              title={
                typeof int2x6LF === "number" ? "Provided by context" : "Manual"
              }
            />
          </label>
          <label>
            <span className="ew-subtle">Interior 2×4 LF</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={int2x4LF ?? intInputs.int2x4LF}
              onChange={(e) =>
                setIntInputs((v) => ({
                  ...v,
                  int2x4LF: Number(e.target.value),
                }))
              }
              disabled={typeof int2x4LF === "number"}
              title={
                typeof int2x4LF === "number" ? "Provided by context" : "Manual"
              }
            />
          </label>
          <label>
            <span className="ew-subtle">Blocking LF (bath/kitchen)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={intInputs.blockingLF || 0}
              onChange={(e) =>
                setIntInputs((v) => ({
                  ...v,
                  blockingLF: Number(e.target.value),
                }))
              }
            />
          </label>
          <div></div>
        </div>

        {/* Interior header */}
        <div className="ew-grid ew-head" style={{ "--cols": gridCols }}>
          <div>Item</div>
          <div>Vendor · Family · Size</div>
          <div className="ew-right">Qty</div>
          <div className="ew-right">Waste %</div>
          <div className="ew-right">Final qty</div>
          <div className="ew-right">Unit</div>
          <div className="ew-right">Unit price</div>
          <div className="ew-right">Subtotal</div>
          <div>Notes</div>
          <div></div>
        </div>

        <div className="ew-rows">
          {/* Interior rows */}
          <Row
            gridCols={gridCols}
            label="Interior 2×6 — PT Plates – Loose"
            noteKey="loose:int2x6PT"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <ItemPicker
                compact
                onSelect={setPick("int2x6PT")}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
                defaultSizeLabel={`2x6"-16'`}
              />
            }
            row={interiorRows.find((r) => r.key === "int2x6PT")}
          />
          <Row
            gridCols={gridCols}
            label="Interior 2×6 — Plates – Loose"
            noteKey="loose:int2x6Plate"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <ItemPicker
                compact
                onSelect={setPick("int2x6Plate")}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x6"-16'`}
              />
            }
            row={interiorRows.find((r) => r.key === "int2x6Plate")}
          />
          <Row
            gridCols={gridCols}
            label="Interior 2×4 — PT Plates – Loose"
            noteKey="loose:int2x4PT"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <ItemPicker
                compact
                onSelect={setPick("int2x4PT")}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
                defaultSizeLabel={`2x4"-16'`}
              />
            }
            row={interiorRows.find((r) => r.key === "int2x4PT")}
          />
          <Row
            gridCols={gridCols}
            label="Interior 2×4 — Plates – Loose"
            noteKey="loose:int2x4Plate"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <ItemPicker
                compact
                onSelect={setPick("int2x4Plate")}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x4"-16'`}
              />
            }
            row={interiorRows.find((r) => r.key === "int2x4Plate")}
          />
          <Row
            gridCols={gridCols}
            label="Walls (general) — Blocking for Bathroom & Kitchen"
            noteKey="loose:intCabinetBlocking"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={
              <ItemPicker
                compact
                onSelect={setPick("intCabinetBlocking")}
                defaultVendor="Fairway Lumber"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x10"-16'`}
              />
            }
            row={interiorRows.find((r) => r.key === "intCabinetBlocking")}
          />
        </div>
      </AccordionSection>
    </div>
  );
}

/** Shared row renderer (supports optional include checkbox under the picker) */
function Row({
  gridCols,
  label,
  picker,
  row,
  noteKey,
  noteApi,
  includeControl,
}) {
  const { getNote, toggleOpen, setNote } = noteApi;
  const n = getNote(noteKey);

  return (
    <Fragment>
      <div className="ew-grid ew-row" style={{ "--cols": gridCols }}>
        <div>{label}</div>

        {/* Picker (+ optional include checkbox row) */}
        <div>
          {picker}
          {includeControl && (
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={includeControl.checked}
                  onChange={(e) => includeControl.onChange(e.target.checked)}
                />
                {includeControl.label}
              </label>
            </div>
          )}
        </div>

        {/* Qty raw */}
        <div className="ew-right">{row ? Math.ceil(row.qtyRaw || 0) : "—"}</div>

        {/* Waste % */}
        <div className="ew-right">{row ? row.wastePct ?? 0 : "—"}</div>

        {/* Final qty */}
        <div className="ew-right">{row?.qtyFinal ?? "—"}</div>

        {/* Unit */}
        <div className="ew-right">{row?.unit ?? "—"}</div>

        {/* Unit price */}
        <div className="ew-right ew-money">
          {row?.unitPrice ? fmt(row.unitPrice) : "—"}
        </div>

        {/* Subtotal */}
        <div className="ew-right ew-money">
          {row?.subtotal ? fmt(row.subtotal) : "—"}
        </div>

        {/* Notes */}
        <div>
          <div
            className="ew-subtle"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span className="ew-chip" title={n.plan || ""}>
              {n.plan || "—"}
            </span>
            <button
              className="ew-btn"
              style={{ padding: "4px 8px" }}
              onClick={() => toggleOpen(noteKey)}
            >
              {n.open ? "Hide" : "Notes"}
            </button>
          </div>
          {n.comment && (
            <div className="ew-subtle" title={n.comment}>
              {wordsPreview(n.comment)}
            </div>
          )}
        </div>

        {/* spacer */}
        <div></div>
      </div>

      {/* Drawer */}
      {n.open && (
        <div className="ew-row" style={{ padding: 12 }}>
          <div className="controls2" style={{ width: "100%" }}>
            <label>
              <span className="ew-subtle">Plan label</span>
              <input
                className="ew-input focus-anim"
                type="text"
                value={getNote(noteKey).plan}
                onChange={(e) => setNote(noteKey, { plan: e.target.value })}
              />
            </label>
            <label>
              <span className="ew-subtle">Comment</span>
              <textarea
                className="ew-input focus-anim"
                rows={3}
                value={getNote(noteKey).comment}
                onChange={(e) => setNote(noteKey, { comment: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}
    </Fragment>
  );
}
