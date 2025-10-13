// src/components/NailsAndBracing.jsx
'use client';

import React, {
  Fragment,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from 'react';
import ItemPicker from '@/components/ItemPicker';
import { unitPriceFrom } from '@/domain/lib/parsing';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const deref = (x) => (x && x.item ? deref(x.item) : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || 'box';

const GRID_COLS =
  'minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

const Row = memo(
  function Row({ label, picker, row, hint }) {
    return (
      <Fragment>
        <div className="ew-grid ew-row" style={{ '--cols': GRID_COLS }}>
          <div>{label}</div>
          <div>
            {picker}
            {hint ? <div className="ew-hint" style={{ marginTop: 6 }}>{hint}</div> : null}
          </div>
          <div className="ew-right">{Math.ceil(row.qtyRaw || 0)}</div>
          <div className="ew-right">{row.wastePct ?? 0}</div>
          <div className="ew-right">{row.qtyFinal ?? '—'}</div>
          <div className="ew-right">{row.unit || '—'}</div>
          <div className="ew-right ew-money">{row.unitPrice ? fmtMoney(row.unitPrice) : '—'}</div>
          <div className="ew-right ew-money">{row.subtotal ? fmtMoney(row.subtotal) : '—'}</div>
          <div></div>
          <div></div>
        </div>
      </Fragment>
    );
  },
  // re-render only if meaningful display data changed
  (prev, next) => {
    const a = prev.row || {};
    const b = next.row || {};
    return (
      prev.label === next.label &&
      prev.hint === next.hint &&
      prev.picker === next.picker &&
      a.qtyRaw === b.qtyRaw &&
      a.qtyFinal === b.qtyFinal &&
      a.unit === b.unit &&
      a.unitPrice === b.unitPrice &&
      a.subtotal === b.subtotal &&
      a.wastePct === b.wastePct
    );
  }
);

export default function NailsAndBracing({
  title = 'General — Nails & bracing (all levels)',
  totals = {},
  onTotalChange,
}) {
  const {
    panelsAll = 0,
    platePiecesAll = 0,
    sheetsExtAll = 0,
    sheetsBandAll = 0,
    sheetsExtraAll = 0,
  } = totals;

  // Item selections
  const [sel, setSel] = useState({
    nailsConcrete: null,
    nailsSheathing: null,
    nailsFraming: null,
    tempBracing: null,
  });

  const onConcreteSelect = useCallback(
    (val) => setSel((prev) => (prev.nailsConcrete === val ? prev : { ...prev, nailsConcrete: val })),
    []
  );
  const onSheathingSelect = useCallback(
    (val) =>
      setSel((prev) => (prev.nailsSheathing === val ? prev : { ...prev, nailsSheathing: val })),
    []
  );
  const onFramingSelect = useCallback(
    (val) => setSel((prev) => (prev.nailsFraming === val ? prev : { ...prev, nailsFraming: val })),
    []
  );
  const onBracingSelect = useCallback(
    (val) => setSel((prev) => (prev.tempBracing === val ? prev : { ...prev, tempBracing: val })),
    []
  );

  // Derived totals
  const allSheets = useMemo(
    () => Number(sheetsExtAll) + Number(sheetsBandAll) + Number(sheetsExtraAll),
    [sheetsExtAll, sheetsBandAll, sheetsExtraAll]
  );

  // Concrete nails: (PT pieces * 25 / 100) then +40% waste → ceil
  const concrete = useMemo(() => {
    const qtyRaw = (Number(platePiecesAll) || 0) * 25 / 100;
    const qtyFinal = Math.ceil(qtyRaw * 1.4);
    const unit = getUnit(sel.nailsConcrete) || 'box';
    const item = getItem(sel.nailsConcrete);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: 40 };
  }, [platePiecesAll, sel.nailsConcrete]);

  // Sheathing nails: (all ZIP sheets * 80 / 2700) then +40% waste → ceil
  const sheathing = useMemo(() => {
    const qtyRaw = (Number(allSheets) || 0) * 80 / 2700;
    const qtyFinal = Math.ceil(qtyRaw * 1.4);
    const unit = getUnit(sel.nailsSheathing) || 'box';
    const item = getItem(sel.nailsSheathing);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: 40 };
  }, [allSheets, sel.nailsSheathing]);

  // Framing nails: (platePiecesAll * 25 / 2500) then +40% waste → ceil
  const framing = useMemo(() => {
    const qtyRaw = (Number(platePiecesAll) || 0) * 25 / 2500;
    const qtyFinal = Math.ceil(qtyRaw * 1.4);
    const unit = getUnit(sel.nailsFraming) || 'box';
    const item = getItem(sel.nailsFraming);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: 40 };
  }, [platePiecesAll, sel.nailsFraming]);

  // Temporary bracing: panelsAll * 3 (no waste)
  const bracing = useMemo(() => {
    const qtyRaw = Math.max(0, Number(panelsAll) || 0) * 3;
    const qtyFinal = Math.ceil(qtyRaw);
    const unit = getUnit(sel.tempBracing) || 'pcs';
    const item = getItem(sel.tempBracing);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: 0 };
  }, [panelsAll, sel.tempBracing]);

  // Section total (memoized)
  const sectionTotal = useMemo(
    () =>
      (concrete.subtotal || 0) +
      (sheathing.subtotal || 0) +
      (framing.subtotal || 0) +
      (bracing.subtotal || 0),
    [concrete.subtotal, sheathing.subtotal, framing.subtotal, bracing.subtotal]
  );

  // Emit total only if it actually changed; keep onTotalChange in a ref
  const onTotalRef = useRef(onTotalChange);
  useEffect(() => {
    onTotalRef.current = onTotalChange;
  }, [onTotalChange]);

  const lastTotalRef = useRef(null);
  useEffect(() => {
    const t = Number(sectionTotal) || 0;
    if (t !== lastTotalRef.current) {
      lastTotalRef.current = t;
      onTotalRef.current?.({ total: t });
    }
  }, [sectionTotal]);

  // ---- Memoize pickers and hints so Row can truly memoize ----
  const concretePicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onConcreteSelect}
        defaultVendor="Home Depot"
        defaultFamilyLabel="Drive Pins with Washers (HD)"
        defaultSizeLabel={`3"-100s`}
      />
    ),
    [onConcreteSelect]
  );

  const sheathingPicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onSheathingSelect}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Ring Coil"
        defaultSizeLabel={`8D-2-3/8x.113-2.7M`}
      />
    ),
    [onSheathingSelect]
  );

  const framingPicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onFramingSelect}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Common Coil"
        defaultSizeLabel={`12D-3-1/4x.120-2.5M`}
      />
    ),
    [onFramingSelect]
  );

  const bracingPicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onBracingSelect}
        defaultVendor="Gillies & Prittie Warehouse"
        defaultFamilyLabel="SPF#2"
        defaultSizeLabel={`2x4"-16'`}
      />
    ),
    [onBracingSelect]
  );

  const concreteHint = useMemo(
    () => `PT boards: ${platePiecesAll} → boxes = ceil((boards × 25 / 100) × 1.4)`,
    [platePiecesAll]
  );
  const sheathingHint = useMemo(
    () =>
      `ZIP sheets = (ext: ${sheetsExtAll}) + (band: ${sheetsBandAll})` +
      (sheetsExtraAll ? ` + (extra: ${sheetsExtraAll})` : ''),
    [sheetsExtAll, sheetsBandAll, sheetsExtraAll]
  );
  const framingHint = useMemo(
    () => `Boards = ${platePiecesAll} → boxes = ceil((boards × 25 / 2500) × 1.4)`,
    [platePiecesAll]
  );
  const bracingHint = useMemo(
    () => `Bracing pieces = panels × 3 (panels: ${panelsAll})`,
    [panelsAll]
  );

  return (
    <div className="ew-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="ew-h2" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>

      <div className="ew-grid ew-head" style={{ '--cols': GRID_COLS }}>
        <div>Item</div>
        <div>Vendor · Family · Size</div>
        <div className="ew-right">Qty</div>
        <div className="ew-right">Waste %</div>
        <div className="ew-right">Final qty</div>
        <div className="ew-right">Unit</div>
        <div className="ew-right">Unit price</div>
        <div className="ew-right">Subtotal</div>
        <div></div>
        <div></div>
      </div>

      <div className="ew-rows">
        <Row label="Concrete nails" row={concrete} picker={concretePicker} hint={concreteHint} />
        <Row label="Sheathing nails" row={sheathing} picker={sheathingPicker} hint={sheathingHint} />
        <Row label="Framing nails" row={framing} picker={framingPicker} hint={framingHint} />
        <Row label="Temporary Bracing" row={bracing} picker={bracingPicker} hint={bracingHint} />
      </div>

      <div className="ew-footer">
        <div className="ew-total">Section subtotal: {fmtMoney(sectionTotal)}</div>
      </div>
    </div>
  );
}
