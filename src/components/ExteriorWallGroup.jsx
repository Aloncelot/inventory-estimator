// src/components/ExteriorWallGroup.jsx
"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ItemPicker from "@/components/ItemPicker";
import { useLocalStorageJson } from "@/hooks/useLocalStorageJson";
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
import AccordionSection from "@/components/ui/AccordionSection";
import RemoveButton from "@/components/ui/RemoveButton";

/* ──────────────────────────────────────────────────────────────────────────
   Helpers (kept in sync with Interior)
   ────────────────────────────────────────────────────────────────────────── */

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
// const getFamily = selLike => deref(selLike)?.raw?.familyDisplay || deref(selLike)?.familyDisplay || deref(selLike)?.raw?.family || selLike?.familyLabel || '';

/* ──────────────────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────────────────── */

export default function ExteriorWallGroup({
  onStatsChange,
  title = "Exterior walls",
  onRemove,
  persistKey = "exterior-0",
  bottomDefaultFamily = "SPF#2",
}) {
  /** Shared inputs */
  const lastSentSigRef = useRef("");

  const [lengthLF, setLengthLF] = useState(0);
  const [inputValueLF, setInputValueLF] = useState(String(lengthLF));
  const [heightFt, setHeightFt] = useState(12);
  const [studSpacingIn, setStudSpacingIn] = useState(16);
  const [studMultiplier, setStudMultiplier] = useState(1);

  /** Per-row waste (editable per row) */
  const [waste, setWaste] = useState({
    bottomPlate: 10,
    topPlate: 10,
    studs: 60,
    blocking: 10,
    sheathing: 20,
  });

  /** Selections */
  const [sel, setSel] = useState({
    bottomPlate: null,
    topPlate: null,
    studs: null,
    blocking: null,
    sheathing: null,
  });
  const setPick = (key) => (choice) =>
    setSel((prev) => ({ ...prev, [key]: choice }));

  /** Notes per row: { [rowKey]: { plan, comment, open } } */
  const [notes, setNotes] = useLocalStorageJson(
    `inv:v1:notes:${persistKey}`,
    {}
  );
  const getNote = (k) => notes[k] || { plan: "", comment: "", open: false };
  const setNote = (k, patch) =>
    setNotes((prev) => ({ ...prev, [k]: { ...getNote(k), ...patch } }));
  const toggleOpen = (k) => setNote(k, { open: !getNote(k).open });

  /* Board lengths */
  const _parsedBottom = parseBoardLengthFt(getSize(sel.bottomPlate));
  const bottomLen = _parsedBottom ?? 12;
  const bottomBoardLenFt = Number.isFinite(_parsedBottom) ? _parsedBottom : 0;

  useEffect(() => {
    setInputValueLF(String(lengthLF));
  }, [lengthLF]);

  // Function to commit the input value to the calculation state
  const commitLengthLF = () => {
    const newValue = Number(inputValueLF) || 0;
    setLengthLF(newValue);
  };

  // Handle Enter key press
  const handleKeyDownLF = (e) => {
    if (e.key === "Enter") {
      commitLengthLF();
      e.target.blur();
    }
  };

  const topLen = parseBoardLengthFt(getSize(sel.topPlate)) ?? 12;
  const blockLen = parseBoardLengthFt(getSize(sel.blocking)) ?? 12;

  const deref = (x) => (x && x.item ? deref(x.item) : x);
  const getFamily = (selLike) => {
    const it = deref(selLike);
    return String(
      it?.familyLabel ??
        it?.familyDisplay ??
        it?.raw?.familyDisplay ??
        it?.raw?.familyLabel ??
        it?.family ??
        ""
    ).toLowerCase();
  };

  /* Build base rows */
  const baseRows = useMemo(() => {
    const rows = [];

    // Bottom plate
    {
      const res = calcPlates({
        lengthLF,
        boardLenFt: bottomLen,
        wastePct: waste.bottomPlate ?? 0,
        item: getItem(sel.bottomPlate),
        unit: getUnit(sel.bottomPlate),
      });
      rows.push({
        key: "bottomPlate",
        label: "Bottom plate",
        item: getItem(sel.bottomPlate),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.bottomPlate ?? 0,
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
        label: "Top plate",
        item: getItem(sel.topPlate),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.topPlate ?? 0,
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
        label: "Studs",
        item: getItem(sel.studs),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.studs ?? 0,
      });
    }

    // Blocking (always on Exterior)
    {
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
        label: "Blocking",
        item: getItem(sel.blocking),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.blocking ?? 0,
      });
    }

    // Sheathing (always on Exterior)
    {
      const res = calcSheathing({
        lengthLF,
        heightFt,
        wastePct: waste.sheathing ?? 0,
        item: getItem(sel.sheathing),
        unit: getUnit(sel.sheathing) || "sheet",
      });
      rows.push({
        key: "sheathing",
        label: "Sheathing",
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
    lengthLF,
    heightFt,
    studSpacingIn,
    studMultiplier,
    bottomLen,
    topLen,
    blockLen,
  ]);

  const rowByKey = useMemo(
    () => Object.fromEntries(baseRows.map((r) => [r.key, r])),
    [baseRows]
  );

  // Calculate sheets used ON PANELS in this group
  const panelSheets = useMemo(() => {
    const sheathingRow = baseRows.find((r) => r.key === "sheathing");
    return Math.ceil(Number(sheathingRow?.qtyFinal || 0));
  }, [baseRows]);

  const bottomIsPT = /pt/i.test(getFamily(sel.bottomPlate));
  // How many PT boards are used on PANELS in this section?
  const panelPtBoards = bottomIsPT
    ? Math.ceil(Number(rowByKey?.bottomPlate?.qtyFinal || 0))
    : 0;

  // after you build `rows` (the same array you map in JSX):
  const sheathingRow = (baseRows ?? []).find(
    (r) => r.key === "sheathing" || /sheathing/i.test(r.label || "")
  );
  const isZip = /zip/.test(getFamily(sheathingRow?.item));
  const zipSheetsFinal = isZip
    ? Math.ceil(Number(sheathingRow?.qtyFinal || 0))
    : 0;

  const platePieces =
    (rowByKey?.bottomPlate?.qtyFinal ?? 0) +
    (rowByKey?.topPlate?.qtyFinal ?? 0);

  // PT LF in PANELS: interior PT bottom plates ≈ section length
  const ptLF = Number(lengthLF || 0);

  /* Extras (Header/Post + auto Headers infill) */
  const [extras, setExtras] = useState([]);
  const seq = useRef(1);
  const addExtra = (type) =>
    setExtras((prev) => [
      ...prev,
      { id: `x${seq.current++}`, type, item: null, wastePct: 5, inputs: {} },
    ]);
  const removeExtra = (id) =>
    setExtras((prev) => prev.filter((r) => r.id !== id));
  const updateExtra = (id, patch) =>
    setExtras((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );

  // Auto-add/remove "Headers infill" row based on Σ(Header LF) from SPF/PT/etc.
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

      // Unknown extra type — pass through
      return r;
    });
  }, [extras, heightFt]);

  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s, r) => s + (r.subtotal || 0), 0);
    const x = computedExtras.reduce((s, r) => s + (r.subtotal || 0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  // lengthLF contributes to either 2x6 LF or 2x4 LF
  useEffect(() => {
    const currentStats = {
      id: persistKey,
      kind: "exterior",
      lengthLF: Number(lengthLF || 0),
      zipSheetsFinal, // Report the calculated ZIP sheets
      panelSheets, // Sheets used on panels
      platePieces: Math.ceil(platePieces), // Report whole pieces
      bottomPlatePiecesPanel: Math.ceil(rowByKey.bottomPlate?.qtyFinal || 0), // <-- Add this
      ptLF: ptLF, // Report PT LF used in panels
      groupSubtotal,
      bottomBoardLenFt: bottomBoardLenFt, // Report actual parsed board length
      panelPtBoards, // Report PT boards used on panels
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
    lengthLF,
    zipSheetsFinal,
    panelSheets,
    platePieces,
    rowByKey.bottomPlate?.qtyFinal,
    ptLF,
    groupSubtotal,
    bottomBoardLenFt,
    panelPtBoards,
    onStatsChange,
  ]);

  /* ────────────────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────────────────── */

  // Columns (Notes after Subtotal; keep final blank col for controls)
  // Item | Selection | Qty | Waste % | Final | Unit | Unit price | Subtotal | Notes | (controls)
  const gridCols =
    "minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr";

  return (
    <div className="ew-card">
      <AccordionSection
        title={title}
        defaultOpen={true}
        summary={
          <div
            style={{
              textAlign: "right",
              fontWeight: 700,
              color: "#f18d5b",
            }}
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
        {/* Shared controls */}
        <div className="controls4" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Length (LF)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={inputValueLF} // Bind to local input state
              onChange={(e) => setInputValueLF(e.target.value)} // Update only local state on change
              onKeyDown={handleKeyDownLF} // Handle Enter key
              onBlur={commitLengthLF} // Commit value on blur (click away)
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
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              min={1}
              value={studMultiplier}
              onChange={(e) => setStudMultiplier(Number(e.target.value))}
            />
          </label>
        </div>

        {/* Header row */}
        <div className="ew-grid ew-head" style={{ "--cols": gridCols }}>
          <div>Item</div>
          <div>Family · Size · Vendor</div>
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
                  <ItemPicker
                    compact
                    onSelect={setPick(row.key)}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel={
                      row.key === "sheathing"
                        ? "Green Zip"
                        : row.key === "bottomPlate"
                        ? bottomDefaultFamily
                        : "SPF#2"
                    }
                    defaultSizeLabel={
                      row.key === "sheathing"
                        ? `4x8'-7/16"`
                        : row.key === "bottomPlate" ||
                          row.key === "topPlate" ||
                          row.key === "blocking"
                        ? `2x6"-8'`
                        : row.key === "stud"
                        ? `2x6"-10'`
                        : undefined
                    }
                    preferredSeries={
                      row.key === "sheathing" ? undefined : "2x6"
                    }
                  />

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

                {/* Drawer row (full width) */}
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

        {/* Extras rows (with Notes) */}
        <div className="ew-rows">
          {computedExtras.map((ex) => {
            const noteKey = `extra:${ex.id}`;
            const n = getNote(noteKey);

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
                          onClick={onRemove}
                          title="Remove section"
                          label="Remove section"
                        />
                      )}
                    </div>
                  </div>

                  {/* ItemPicker + type-specific inputs */}
                  <div>
                    <ItemPicker
                      compact
                      onSelect={(item) => updateExtra(ex.id, { item })}
                      defaultVendor="Gillies & Prittie Warehouse"
                      defaultFamilyLabel={
                        ex.type === "Headers infill" ||
                        ex.type === "Extra sheathing"
                          ? "CDX SE"
                          : "SPF#2"
                      }
                      defaultSizeLabel={
                        ex.type === "Headers infill" ||
                        ex.type === "Extra sheathing"
                          ? `4x8'-1/2"`
                          : ex.type === "Header" ||
                            ex.type === "Post" ||
                            ex.type === "Extra blocking"
                          ? `2x10"-10'`
                          : undefined
                      }
                    />

                    {/* Header params */}
                    {ex.type === "Header" &&
                      (isLVL(getFamily(ex)) ? (
                        <div className="ew-inline" style={{ marginTop: 6 }}>
                          <label>
                            Pieces
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
                          <label>
                            Length (lf)
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
                        <div className="ew-inline" style={{ marginTop: 6 }}>
                          <label>
                            Total header LF
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
                        </div>
                      ))}

                    {/* Post params */}
                    {ex.type === "Post" &&
                      (isLVL(getFamily(ex)) || isVersaColumn(getFamily(ex)) ? (
                        <div className="ew-inline" style={{ marginTop: 6 }}>
                          <label>
                            Pieces
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
                          <label>
                            Height (ft)
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
                        <div className="ew-inline" style={{ marginTop: 6 }}>
                          <label>
                            Pieces per post
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
                          <label>
                            Posts (#)
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

                    {ex.type === "Headers infill" && (
                      <div className="ew-hint" style={{ marginTop: 6 }}>
                        QTY = Σ Header LF ÷ 3 ÷ 32 × 2 (then waste)
                      </div>
                    )}
                  </div>

                  {/* Qty / waste / unit / price / subtotal */}
                  <div className="ew-right">{Math.ceil(ex.qtyRaw ?? 0)}</div>
                  <div className="ew-right">
                    <input
                      className="ew-input focus-anim"
                      type="number"
                      inputMode="decimal"
                      value={ex.wastePct ?? 0}
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
          <button className="ew-btn" onClick={() => addExtra("Header")}>
            <img
              src={"/icons/plus-sign.png"}
              width={12}
              height={12}
              className="acc__chev"
              style={{
                display: "inline-block",
                verticalAlign: "middle",
              }}
            />{" "}
            Header
          </button>
          <button className="ew-btn" onClick={() => addExtra("Post")}>
            <img
              src={"/icons/plus-sign.png"}
              width={12}
              height={12}
              className="acc__chev"
              style={{
                display: "inline-block",
                verticalAlign: "middle",
              }}
            />{" "}
            Post
          </button>
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
