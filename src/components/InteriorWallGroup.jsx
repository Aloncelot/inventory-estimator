// src/components/InteriorWallGroup.jsx
"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ItemPicker from "./ItemPicker"; // Corrected path
import { useLocalStorageJson } from "../hooks/useLocalStorageJson"; // Corrected path
import AccordionSection from "./ui/AccordionSection"; // Corrected path
import RemoveButton from "./ui/RemoveButton";

// Shared calculators & helpers
import {
  calcPlates,
  calcStuds,
  calcBlocking,
  calcSheathing,
  calcHeader,
  calcPost,
  calcHeadersInfill,
} from "@/domain/calculators";
import { parseBoardLengthFt } from "@/domain/lib/parsing";
import {
  isLVL,
  isVersaColumn,
  isLumberFamily,
  isInfillFamily,
} from "@/domain/lib/families";

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmt = (n) =>
  Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : "—";

/** Comment preview (first N words with ellipsis) */
const wordsPreview = (s = "", maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(" ");
  return parts.length > maxWords ? `${preview}…` : preview || "";
};

const deref = (x) => (x && x.item ? deref(x.item) : x);
const getItem = (selLike) => deref(selLike);
const getUnit = (selLike) =>
  deref(selLike)?.unit || deref(selLike)?.raw?.unit || "pcs";
const getSize = (selLike) =>
  deref(selLike)?.sizeDisplay ||
  deref(selLike)?.sizeLabel ||
  deref(selLike)?.raw?.sizeDisplay ||
  "";
const getFamily = (selLike) =>
  deref(selLike)?.raw?.familyDisplay ||
  deref(selLike)?.familyDisplay ||
  deref(selLike)?.raw?.family ||
  selLike?.familyLabel ||
  "";

/* ──────────────────────────────────────────────────────────────────────────
     Component
     ────────────────────────────────────────────────────────────────────────── */

export default function InteriorWallGroup({
  onStatsChange,
  title = "Interior walls",
  onRemove,
  persistKey = "interior-0",
  bottomDefaultFamily = "SPF#2",
}) {
  /* Interior toggles */
  const [kind, setKind] = useState("partition"); // partition | bearing | shear | knee

  /* Shared inputs */
  const [lengthLF, setLengthLF] = useState(0);
  const [inputValueLF, setInputValueLF] = useState(String(lengthLF));
  const [heightFt, setHeightFt] = useState(12);
  const [studSpacingIn, setStudSpacingIn] = useState(16);
  const [studMultiplier, setStudMultiplier] = useState(1);

  /* Per-row waste defaults (editable per row) */
  const [waste, setWaste] = useState({
    bottomPlate: 10,
    topPlate: 10,
    studs: 60,
    blocking: 10,
    sheathing: 20,
  });

  /* Selections */
  const [sel, setSel] = useState({
    bottomPlate: null,
    topPlate: null,
    studs: null,
    blocking: null,
    sheathing: null,
  });
  const setPick = (key) => (choice) =>
    setSel((prev) => ({ ...prev, [key]: choice }));

  /* Notes per row: { [rowKey]: { plan, comment, open } } */
  const [notes, setNotes] = useLocalStorageJson(
    `inv:v1:notes:${persistKey}`,
    {}
  );
  const getNote = (k) => notes[k] || { plan: "", comment: "", open: false };
  const setNote = (k, patch) =>
    setNotes((prev) => ({ ...prev, [k]: { ...getNote(k), ...patch } }));
  const toggleOpen = (k) => setNote(k, { open: !getNote(k).open });

  /* Board lengths */
  const bottomLenResult = parseBoardLengthFt(getSize(sel.bottomPlate)); // Get result which could be null
  const bottomLen = bottomLenResult ?? 12; // Use 12 if null
  const bottomBoardLenFt = Number.isFinite(bottomLenResult)
    ? bottomLenResult
    : 0; // Use 0 if null for reporting
  const topLen = parseBoardLengthFt(getSize(sel.topPlate)) ?? 12;
  const blockLen = parseBoardLengthFt(getSize(sel.blocking)) ?? 12;

  /* Visibility (interior-specific) */
  const showBlocking = kind === "bearing";
  const showSheathing = kind === "shear";

  useEffect(() => {
    setInputValueLF(String(lengthLF));
  }, [lengthLF]);

  // Function to commit the input value to the calculation state
  const commitLengthLF = () => {
    const newValue = Number(inputValueLF) || 0; // Parse and default to 0 if invalid
    setLengthLF(newValue);
  };

  // Handle Enter key press
  const handleKeyDownLF = (e) => {
    if (e.key === "Enter") {
      commitLengthLF();
      e.target.blur(); // Optional: remove focus after Enter
    }
  };

  /* Base rows */
  const baseRows = useMemo(() => {
    const rows = [];

    // Bottom plate
    {
      const res = calcPlates({
        lengthLF,
        boardLenFt: bottomLen, // Use calculated bottomLen
        wastePct: waste.bottomPlate ?? 0,
        item: getItem(sel.bottomPlate),
        unit: getUnit(sel.bottomPlate),
      });
      rows.push({
        key: "bottomPlate",
        label: `Bottom plate`,
        item: getItem(sel.bottomPlate),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.bottomPlate ?? 0,
        boardLenFt: res.boardLenFt,
      });
    }

    // Top plate
    {
      const res = calcPlates({
        lengthLF,
        boardLenFt: topLen,
        wastePct: waste.topPlate ?? 0,
        item: getItem(sel.topPlate),
        unit: getUnit(sel.topPlate),
      });
      rows.push({
        key: "topPlate",
        label: `Top plate`,
        item: getItem(sel.topPlate),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.topPlate ?? 0,
        boardLenFt: res.boardLenFt, // Added board length info
      });
    }

    // Studs
    {
      const res = calcStuds({
        lengthLF,
        spacingIn: studSpacingIn,
        multiplier: studMultiplier,
        wastePct: waste.studs ?? 0,
        item: getItem(sel.studs),
        unit: getUnit(sel.studs),
      });
      rows.push({
        key: "studs",
        label: `Studs`,
        item: getItem(sel.studs),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.studs ?? 0,
      });
    }

    // Blocking (bearing only)
    if (showBlocking) {
      const res = calcBlocking({
        lengthLF,
        heightFt,
        boardLenFt: blockLen,
        wastePct: waste.blocking ?? 0,
        item: getItem(sel.blocking),
        unit: getUnit(sel.blocking),
      });
      rows.push({
        key: "blocking",
        label: `Blocking`,
        item: getItem(sel.blocking),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.blocking ?? 0,
        boardLenFt: res.boardLenFt, // Added board length info
      });
    }

    // Sheathing (shear only)
    if (showSheathing) {
      const res = calcSheathing({
        lengthLF,
        heightFt,
        wastePct: waste.sheathing ?? 0,
        item: getItem(sel.sheathing),
        unit: getUnit(sel.sheathing) || "sheet",
      });
      rows.push({
        key: "sheathing",
        label: "Sheathing (4x8)",
        item: getItem(sel.sheathing),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.sheathing ?? 0,
      });
    }

    return rows;
  }, [
    sel,
    waste,
    showBlocking,
    showSheathing,
    lengthLF,
    heightFt,
    studSpacingIn,
    studMultiplier,
    bottomLen,
    topLen,
    blockLen,
  ]);

  /* ── Emit live stats for wrapper/page (for Loose materials auto-aggregation) ── */
  const rowByKey = useMemo(
    () => Object.fromEntries((baseRows || []).map((r) => [r.key, r])),
    [baseRows]
  );

  // Calculate sheets used ON PANELS (only if shear wall)
  const panelSheets = useMemo(() => {
    if (!showSheathing) return 0; // Only count if sheathing row exists
    const sheathingRow = baseRows.find((r) => r.key === "sheathing");
    return Math.ceil(Number(sheathingRow?.qtyFinal || 0));
  }, [baseRows, showSheathing]);

  // helper: detect PT family
  const isPTFamily = (fam) =>
    /(^|\b)pt(\b|$)|pressure/i.test(String(fam || ""));

  // PT boards used on PANELS (bottom plate only, when family is PT)
  const panelPtBoards = useMemo(() => {
    const fam = getFamily(sel.bottomPlate);
    const isPT = isPTFamily(fam);
    const qty = Math.ceil(Number(rowByKey.bottomPlate?.qtyFinal || 0));
    return isPT ? qty : 0;
  }, [sel.bottomPlate, rowByKey.bottomPlate?.qtyFinal]);

  const platePieces =
    (rowByKey.bottomPlate?.qtyFinal ?? 0) + (rowByKey.topPlate?.qtyFinal ?? 0);
  // PT LF in PANELS: only if bottom plate is PT
  const ptLF = isPTFamily(getFamily(sel.bottomPlate))
    ? Number(lengthLF || 0)
    : 0;
  // Infer interior series from the chosen sizes (studs preferred, else bottom plate)
  const sizeLabel = getSize(sel.studs) || getSize(sel.bottomPlate) || "";
  const is2x6 = /(^|\D)2\s*[x×]\s*6(\D|$)/i.test(sizeLabel);
  const wallKind = is2x6 ? "int-2x6" : "int-2x4";

  /* Extras (Header/Post + auto Headers infill) */
  const [extras, setExtras] = useState([]);
  const seq = useRef(1);
  // Update addExtra to handle 'Stud' type with defaults
  const addExtra = (type) =>
    setExtras((prev) => {
      const newId = `x${seq.current++}`;
      let defaultInputs = {};
      let defaultItem = null;
      let defaultWaste = 5; // Default waste for Header/Post/Blocking/Sheathing

      if (type === "Stud") {
        defaultInputs = {
          lengthLF: lengthLF, // Default to main wall length
          studSpacingIn: studSpacingIn, // Default to main wall spacing
          studMultiplier: studMultiplier, // Default to main wall multiplier
        };
        defaultItem = sel.studs; // Default to the item selected for main studs
        defaultWaste = 60; // Default waste for extra studs
      }

      return [
        ...prev,
        {
          id: newId,
          type,
          item: defaultItem,
          wastePct: defaultWaste,
          inputs: defaultInputs,
        },
      ];
    });
  const removeExtra = (id) =>
    setExtras((prev) => prev.filter((r) => r.id !== id));
  const updateExtra = (id, patch) =>
    setExtras((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );

  // Auto-add/remove "Headers infill" based on Σ(Header LF) from qualifying lumber families
  useEffect(() => {
    const headerLF = extras
      .filter((r) => r.type === "Header" && isInfillFamily(getFamily(r)))
      .reduce((s, r) => s + Number(r.inputs.headerLF || 0), 0);

    const hasInfill = extras.some((r) => r.type === "Headers infill");
    if (headerLF > 0 && !hasInfill) {
      setExtras((prev) => [
        ...prev,
        {
          id: "infill",
          type: "Headers infill",
          item: null,
          wastePct: 5,
          inputs: {},
        },
      ]);
    }
    if (headerLF === 0 && hasInfill) {
      setExtras((prev) => prev.filter((r) => r.type !== "Headers infill"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(
      extras.map((r) => ({
        t: r.type,
        f: getFamily(r),
        lf: r.inputs.headerLF || 0,
      }))
    ),
  ]);

  const computedExtras = useMemo(() => {
    // Pool for Headers infill (sum of qualifying lumber Header LF)
    const headerLFPool = extras
      .filter((r) => r.type === "Header" && isInfillFamily(getFamily(r)))
      .reduce((s, r) => s + Number(r?.inputs?.headerLF || 0), 0);

    return extras.map((r) => {
      const fam = getFamily(r);
      const boardLenFt = parseBoardLengthFt(getSize(r)) ?? 0;

      if (r.type === "Header") {
        const res = calcHeader({
          isLVL: isLVL(fam),
          headerLF: Number(r?.inputs?.headerLF || 0),
          lvlPieces: Number(r?.inputs?.lvlPieces || 0),
          lvlLength: Number(r?.inputs?.lvlLength || 0),
          boardLenFt,
          wastePct: r.wastePct ?? 5,
          item: getItem(r),
        });
        return {
          ...r,
          unit: res.unit,
          qtyRaw: res.qtyRaw,
          qtyFinal: res.qtyFinal,
          unitPrice: res.unitPrice,
          subtotal: res.subtotal,
          boardLenFt,
        };
      }

      if (r.type === "Extra blocking") {
        const rowsCnt = Math.max(1, Number(r?.inputs?.rows || 1));
        const res = calcPlates({
          lengthLF: Number(lengthLF || 0) * rowsCnt,
          boardLenFt,
          wastePct: r.wastePct ?? 10,
          item: getItem(r),
          unit: getUnit(r),
        });
        return {
          ...r,
          unit: res.unit,
          qtyRaw: res.qtyRaw,
          qtyFinal: res.qtyFinal,
          unitPrice: res.unitPrice,
          subtotal: res.subtotal,
          boardLenFt,
        };
      }

      if (r.type === "Extra sheathing") {
        const res = calcSheathing({
          lengthLF,
          heightFt,
          wastePct: r.wastePct ?? 5,
          item: getItem(r),
          unit: getUnit(r) || "sheet",
        });
        return {
          ...r,
          unit: res.unit,
          qtyRaw: res.qtyRaw,
          qtyFinal: res.qtyFinal,
          unitPrice: res.unitPrice,
          subtotal: res.subtotal,
          boardLenFt: null,
        };
      }

      if (r.type === "Post") {
        const res = calcPost({
          isLinearLF: isLVL(fam) || isVersaColumn(fam),
          pieces: Number(r?.inputs?.pieces || 0),
          heightFt: Number(r?.inputs?.heightFt ?? heightFt),
          piecesPerPost: Number(r?.inputs?.piecesPerPost || 0),
          numPosts: Number(r?.inputs?.numPosts || 0),
          wastePct: r.wastePct ?? 5,
          item: getItem(r),
        });
        return {
          ...r,
          unit: res.unit,
          qtyRaw: res.qtyRaw,
          qtyFinal: res.qtyFinal,
          unitPrice: res.unitPrice,
          subtotal: res.subtotal,
          boardLenFt,
        };
      }

      if (r.type === "Headers infill") {
        const res = calcHeadersInfill({
          headerLFPool,
          wastePct: r.wastePct ?? 5,
          item: getItem(r),
        });
        return {
          ...r,
          unit: res.unit,
          qtyRaw: res.qtyRaw,
          qtyFinal: res.qtyFinal,
          unitPrice: res.unitPrice,
          subtotal: res.subtotal,
          boardLenFt: null,
        };
      }

      // ---> Add calculation logic for 'Stud' type <---
      else if (r.type === "Stud") {
        // Use row-specific inputs, falling back to main wall values
        const rowLengthLF = Number(r?.inputs?.lengthLF ?? lengthLF);
        const rowSpacingIn = Number(r?.inputs?.studSpacingIn ?? studSpacingIn);
        const rowMultiplier = Number(
          r?.inputs?.studMultiplier ?? studMultiplier
        );
        const rowWastePct = r.wastePct ?? 60; // Use row's waste or default to 60

        // Calculate using calcStuds with row-specific values
        const res = calcStuds({
          lengthLF: rowLengthLF,
          spacingIn: rowSpacingIn,
          multiplier: rowMultiplier,
          wastePct: rowWastePct,
          item: getItem(r), // Use the item selected for this row
          unit: getUnit(r),
        });
        return {
          ...r, // Keep original extra data (id, type, item, inputs, wastePct)
          unit: res.unit,
          qtyRaw: res.qtyRaw,
          qtyFinal: res.qtyFinal,
          unitPrice: res.unitPrice,
          subtotal: res.subtotal,
          wastePct: rowWastePct, // Ensure wastePct is explicitly returned
          // boardLenFt is not relevant for stud count calculation itself
        };
      }

      // Unknown extra type — pass through
      return r;
    });
  }, [extras, heightFt, lengthLF, studSpacingIn, studMultiplier]);

  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s, r) => s + (r.subtotal || 0), 0);
    const x = computedExtras.reduce((s, r) => s + (r.subtotal || 0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  // Ref to store the last sent signature
  const lastSentSigRef = useRef("");

  // Emit stats up
  useEffect(() => {
    // Create the stats object to be sent
    const currentStats = {
      id: persistKey,
      kind: wallKind,
      lengthLF: Number(lengthLF || 0),
      platePieces: Math.ceil(platePieces),
      bottomPlatePiecesPanel: Math.ceil(rowByKey.bottomPlate?.qtyFinal || 0),
      ptLF: ptLF,
      groupSubtotal,
      isShear: kind === "shear",
      isBearing: kind === "bearing",
      isPartition: kind === "partition",
      isKnee: kind === "knee",
      bottomBoardLenFt: bottomBoardLenFt,
      panelPtBoards,
      panelSheets,
    };

    // Create a signature (stringified version)
    const currentSig = JSON.stringify(currentStats);

    // Only call onStatsChange if the signature has changed
    if (currentSig !== lastSentSigRef.current) {
      lastSentSigRef.current = currentSig; // Update the ref with the new signature
      onStatsChange?.(currentStats);
    }
  }, [
    persistKey,
    kind,
    wallKind,
    panelPtBoards,
    panelSheets,
    lengthLF,
    platePieces,
    rowByKey.bottomPlate?.qtyFinal,
    ptLF,
    groupSubtotal,
    bottomBoardLenFt,
    onStatsChange,
  ]);

  /* ────────────────────────────────────────────────────────────────────────
         Render
         ──────────────────────────────────────────────────────────────────────── */

  // Columns (Item | Selection | Qty | Waste % | Final | Unit | Unit price | Subtotal | Notes | (controls))
  const gridCols =
    "minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr";

  return (
    <div className="ew-card">
      <AccordionSection
        title={title}
        defaultOpen={true}
        summary={
          <div
            style={{ textAlign: "right", fontWeight: 700, color: "#f18d5b" }}
          >
            Subtotal: {fmt(groupSubtotal)}
          </div>
        }
        actions={
          onRemove ? (
            <RemoveButton
              onClick={onRemove}
              title="Remove section"
              label="Remove section"
            />
          ) : null
        }
      >
        {/* Controls row 1 */}
        <div className="controls4" style={{ marginBottom: 8 }}>
          <label>
            <span className="ew-subtle">Length (LF)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={inputValueLF} // Bind to local input state
              onChange={(e) => setInputValueLF(e.target.value)} // Update only local state on change
              onKeyDown={handleKeyDownLF} // Handle Enter key
              onBlur={commitLengthLF} // Commit value on blur
            />
          </label>
          <label>
            <span className="ew-subtle">Height (ft)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={heightFt}
              onChange={(e) => setHeightFt(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="ew-subtle">Stud spacing (in)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={studSpacingIn}
              onChange={(e) => setStudSpacingIn(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="ew-subtle">Studs per location</span>
            <select
              className="ew-select focus-anim"
              value={studMultiplier}
              onChange={(e) => setStudMultiplier(Number(e.target.value))}
            >
              <option value={1}>Single</option>
              <option value={2}>Double</option>
              <option value={3}>Triple</option>
              <option value={4}>Quad</option>
            </select>
          </label>
        </div>
        <div className="controls2" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Wall kind</span>
            <select
              className="ew-select focus-anim"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="partition">Partition</option>
              <option value="bearing">Bearing (adds blocking)</option>
              <option value="shear">Shear (adds sheathing)</option>
              <option value="knee">Knee</option>
            </select>
          </label>
        </div>

        {/* Header row */}
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

        {/* Base rows with Notes + drawer */}
        <div className="ew-rows">
          {baseRows.map((row) => {
            const noteKey = `base:${row.key}`;
            const n = getNote(noteKey);

            return (
              <Fragment key={row.key}>
                <div className="ew-grid ew-row" style={{ "--cols": gridCols }}>
                  {/* Item label */}
                  <div>{row.label}</div>

                  {/* ItemPicker */}
                  <div>
                    <ItemPicker
                      compact
                      initialSelection={sel[row.key]} // Pass initial selection if available
                      onSelect={setPick(row.key)}
                      defaultVendor="Gillies & Prittie Warehouse"
                      defaultFamilyLabel={
                        row.key === "sheathing"
                          ? "CDX SE"
                          : row.key === "bottomPlate"
                          ? bottomDefaultFamily
                          : "SPF#2"
                      }
                      defaultSizeLabel={
                        row.key === "sheathing" ? `4x8'-1/2"` : undefined
                      }
                      preferredSeries={
                        row.key === "sheathing" ? undefined : "2x6"
                      }
                    />
                  </div>

                  {/* Qty raw (rounded up visually) */}
                  <div className="ew-right">{Math.ceil(row.qtyRaw)}</div>

                  {/* Waste % */}
                  <div className="ew-right">
                    <input
                      className="ew-input focus-anim"
                      type="number"
                      inputMode="decimal"
                      value={row.wastePct}
                      onChange={(e) =>
                        setWaste((w) => ({
                          ...w,
                          [row.key]: Number(e.target.value),
                        }))
                      }
                      style={{ width: 80, padding: 6, textAlign: "right" }}
                    />
                  </div>

                  {/* Final qty */}
                  <div className="ew-right">{row.qtyFinal}</div>

                  {/* Unit */}
                  <div className="ew-right">{row.unit}</div>

                  {/* Unit price */}
                  <div className="ew-right ew-money">
                    {row.unitPrice ? fmt(row.unitPrice) : "—"}
                  </div>

                  {/* Subtotal */}
                  <div className="ew-right ew-money">
                    {row.subtotal ? fmt(row.subtotal) : "—"}
                  </div>

                  {/* Notes (chip + toggle + preview) */}
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

                  {/* controls col (blank) */}
                  <div></div>
                </div>

                {/* Drawer row */}
                {n.open && (
                  <div className="ew-row" style={{ padding: 12 }}>
                    <div className="controls2" style={{ width: "100%" }}>
                      <label>
                        <span className="ew-subtle">Plan label</span>
                        <input
                          className="ew-input focus-anim"
                          type="text"
                          placeholder="e.g., A2.4 / S5 – Detail 03"
                          value={getNote(noteKey).plan}
                          onChange={(e) =>
                            setNote(noteKey, { plan: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span className="ew-subtle">Comment</span>
                        <textarea
                          className="ew-input focus-anim"
                          rows={3}
                          placeholder="Add any notes for this item…"
                          value={getNote(noteKey).comment}
                          onChange={(e) =>
                            setNote(noteKey, { comment: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {/* Extras header */}
        <h3 className="ew-h3" style={{ marginTop: 12, marginBottom: 6 }}>
          Extras
        </h3>

        {/* Extras rows */}
        <div className="ew-rows">
          {computedExtras.map((ex) => {
            const noteKey = `extra:${ex.id}`;

            return (
              <Fragment key={ex.id}>
                <div className="ew-grid ew-row" style={{ "--cols": gridCols }}>
                  {/* Type + remove */}
                  <div>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <span style={{ fontWeight: 600 }}>{ex.type}</span>
                      {ex.type !== "Headers infill" && (
                        <RemoveButton
                          onClick={() => removeExtra(ex.id)}
                          title={`Remove ${ex.type}`}
                          label={`Remove ${ex.type}`}
                        />
                      )}
                    </div>
                  </div>

                  {/* ItemPicker + type-specific inputs */}
                  <div>
                    <ItemPicker
                      compact
                      initialSelection={ex.item} // Pass initial selection
                      onSelect={(item) => updateExtra(ex.id, { item })}
                      defaultVendor="Gillies & Prittie Warehouse"
                      defaultFamilyLabel={
                        ex.type === "Headers infill" ||
                        ex.type === "Extra sheathing"
                          ? "CDX SE"
                          : ex.type === "Stud"
                          ? getFamily(sel.studs) || "SPF#2" // Default family from main studs
                          : "SPF#2"
                      }
                      // defaultSizeLabel={ex.type === 'Extra sheathing' ? `4x8'-1/2"` : undefined}
                      // preferredSeries={ex.type === 'Extra sheathing' ? undefined : '2x6'} // Adjust if needed
                    />

                    {/* Header params */}
                    {ex.type === "Header" &&
                      (isLVL(getFamily(ex)) ? (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: "end" }}
                        >
                          <label style={{ minWidth: 120 }}>
                            <span className="ew-subtle">Pieces</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.lvlPieces || ""}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    lvlPieces: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <label style={{ minWidth: 140 }}>
                            <span className="ew-subtle">Length (lf)</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.lvlLength || ""}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    lvlLength: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: "end" }}
                        >
                          <label style={{ minWidth: 160 }}>
                            <span className="ew-subtle">Total header LF</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.headerLF || ""}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    headerLF: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <div className="ew-hint">
                            Board length from size:{" "}
                            {ex.boardLenFt ||
                              parseBoardLengthFt(getSize(ex)) ||
                              "—"}{" "}
                            ft
                          </div>
                        </div>
                      ))}

                    {/* Post params */}
                    {ex.type === "Post" &&
                      (isLVL(getFamily(ex)) || isVersaColumn(getFamily(ex)) ? (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: "end" }}
                        >
                          <label style={{ minWidth: 120 }}>
                            <span className="ew-subtle">Pieces</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.pieces || ""}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    pieces: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <label style={{ minWidth: 140 }}>
                            <span className="ew-subtle">Height (ft)</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.heightFt ?? heightFt}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    heightFt: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : isLumberFamily(getFamily(ex)) ? (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: "end" }}
                        >
                          <label style={{ minWidth: 160 }}>
                            <span className="ew-subtle">Pieces per post</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.piecesPerPost || ""}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    piecesPerPost: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <label style={{ minWidth: 140 }}>
                            <span className="ew-subtle">Posts (#)</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.numPosts || ""}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    numPosts: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : null)}

                    {/* ---> Add Inputs for 'Stud' type <--- */}
                    {ex.type === "Stud" && (
                      <div
                        className="controls4"
                        style={{
                          marginTop: 6,
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 6,
                        }}
                      >
                        {" "}
                        {/* Adjust grid for 3 inputs */}
                        <label>
                          <span className="ew-subtle">Length (LF)</span>
                          <input
                            className="ew-input focus-anim"
                            type="number"
                            inputMode="decimal"
                            value={ex.inputs?.lengthLF ?? ""}
                            onChange={(e) =>
                              updateExtra(ex.id, {
                                inputs: {
                                  ...ex.inputs,
                                  lengthLF: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          <span className="ew-subtle">Spacing (in)</span>
                          <input
                            className="ew-input focus-anim"
                            type="number"
                            inputMode="decimal"
                            value={ex.inputs?.studSpacingIn ?? ""}
                            onChange={(e) =>
                              updateExtra(ex.id, {
                                inputs: {
                                  ...ex.inputs,
                                  studSpacingIn: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          <span className="ew-subtle">Per Location</span>
                          <select
                            className="ew-select focus-anim"
                            value={ex.inputs?.studMultiplier ?? 1}
                            onChange={(e) =>
                              updateExtra(ex.id, {
                                inputs: {
                                  ...ex.inputs,
                                  studMultiplier: Number(e.target.value),
                                },
                              })
                            }
                          >
                            <option value={1}>Single</option>
                            <option value={2}>Double</option>
                            <option value={3}>Triple</option>
                            <option value={4}>Quad</option>
                          </select>
                        </label>
                      </div>
                    )}

                    {ex.type === "Headers infill" && (
                      <div className="ew-hint" style={{ marginTop: 6 }}>
                        QTY = Σ Header LF ÷ 3 ÷ 32 × 2 (then waste)
                      </div>
                    )}
                    {ex.type === "Extra sheathing" && (
                      <div className="ew-hint" style={{ marginTop: 6 }}>
                        Same math as regular sheathing (length × height ÷ 32),
                        then waste.
                      </div>
                    )}
                    {ex.type === "Extra blocking" && (
                      <div
                        className="ew-inline"
                        style={{ marginTop: 6, alignItems: "end", gap: 12 }}
                      >
                        <label style={{ minWidth: 140 }}>
                          <span className="ew-subtle">Rows (#)</span>
                          <input
                            className="ew-input focus-anim"
                            type="number"
                            min={1}
                            step={1}
                            value={ex.inputs?.rows || 1}
                            onChange={(e) =>
                              updateExtra(ex.id, {
                                inputs: {
                                  ...(ex.inputs || {}),
                                  rows: Math.max(
                                    1,
                                    Number(e.target.value || 1)
                                  ),
                                },
                              })
                            }
                          />
                        </label>
                        <div className="ew-hint">
                          Same math as plates × rows (then waste). Board length
                          from size:{" "}
                          {ex.boardLenFt ||
                            parseBoardLengthFt(getSize(ex)) ||
                            "—"}{" "}
                          ft
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Qty / waste / unit / price / subtotal */}
                  <div className="ew-right">{Math.ceil(ex.qtyRaw ?? 0)}</div>
                  <div className="ew-right">
                    {" "}
                    {/* Waste Pct Input */}
                    <input
                      className="ew-input focus-anim"
                      type="number"
                      inputMode="decimal"
                      value={ex.wastePct ?? (ex.type === "Stud" ? 60 : 5)} // Use correct default based on type
                      onChange={(e) =>
                        updateExtra(ex.id, { wastePct: Number(e.target.value) })
                      }
                      style={{ width: 80, textAlign: "right" }}
                    />
                  </div>
                  <div className="ew-right">{ex.qtyFinal ?? "—"}</div>
                  <div className="ew-right">{ex.unit}</div>
                  <div className="ew-right ew-money">
                    {ex.unitPrice ? fmt(ex.unitPrice) : "—"}
                  </div>
                  <div className="ew-right ew-money">
                    {ex.subtotal ? fmt(ex.subtotal) : "—"}
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
                      <span
                        className="ew-chip"
                        title={getNote(noteKey).plan || ""}
                      >
                        {getNote(noteKey).plan || "—"}
                      </span>
                      <button
                        className="ew-btn"
                        style={{ padding: "4px 8px" }}
                        onClick={() => toggleOpen(noteKey)}
                      >
                        {getNote(noteKey).open ? "Hide" : "Notes"}
                      </button>
                    </div>
                    {getNote(noteKey).comment && (
                      <div
                        className="ew-subtle"
                        title={getNote(noteKey).comment}
                      >
                        {wordsPreview(getNote(noteKey).comment)}
                      </div>
                    )}
                  </div>

                  {/* controls col (blank) */}
                  <div></div>
                </div>

                {/* Drawer */}
                {getNote(noteKey).open && (
                  <div className="ew-row" style={{ padding: 12 }}>
                    <div className="controls2" style={{ width: "100%" }}>
                      <label>
                        <span className="ew-subtle">Plan label</span>
                        <input
                          className="ew-input focus-anim"
                          type="text"
                          value={getNote(noteKey).plan}
                          onChange={(e) =>
                            setNote(noteKey, { plan: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span className="ew-subtle">Comment</span>
                        <textarea
                          className="ew-input focus-anim"
                          rows={3}
                          value={getNote(noteKey).comment}
                          onChange={(e) =>
                            setNote(noteKey, { comment: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {/* Footer / actions */}
        <div className="ew-footer">
          <button
            className="ew-btn"
            onClick={() => addExtra("Header")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <img src="/icons/plus-sign.png" alt="Add" width={14} height={14} />{" "}
            Header
          </button>
          <button
            className="ew-btn"
            onClick={() => addExtra("Post")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <img src="/icons/plus-sign.png" alt="Add" width={14} height={14} />{" "}
            Post
          </button>
          <button
            className="ew-btn"
            onClick={() => addExtra("Extra blocking")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <img src="/icons/plus-sign.png" alt="Add" width={14} height={14} />{" "}
            Blocking
          </button>
          <button
            className="ew-btn"
            onClick={() => addExtra("Stud")}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <img src="/icons/plus-sign.png" alt="Add" width={14} height={14} />{" "}
            Stud
          </button>
          {showSheathing && (
            <button
              className="ew-btn"
              onClick={() => addExtra("Extra sheathing")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <img
                src="/icons/plus-sign.png"
                alt="Add"
                width={14}
                height={14}
              />{" "}
              Sheathing
            </button>
          )}
          <div
            className="ew-right"
            style={{ marginLeft: "auto", color: "#f18d5b" }}
          >
            Group subtotal: {fmt(groupSubtotal)}
          </div>
        </div>
      </AccordionSection>
    </div>
  );
}
