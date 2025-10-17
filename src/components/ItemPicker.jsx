// src/components/ItemPicker.jsx
'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { listVendors, listFamilies, listSizes } from '@/lib/catalog';
import SearchableSelect from '@/components/SearchableSelect';

// Normalize a string for case-insensitive, space-insensitive comparisons
const norm = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function ItemPicker({
  onSelect,
  compact = false,
  defaultVendor = 'Gillies & Prittie Warehouse',
  defaultFamilyLabel,     // e.g., "SPF#2"
  preferredSeries,        // e.g., "2x4", "2x6", "2x8", "2x10"
  defaultSizeLabel,       // e.g., 2x6"-12'
}) {
  // Data
  const [vendors, setVendors]       = useState([]);
  const [families, setFamilies]     = useState([]);
  const [sizes, setSizes]           = useState([]);

  // Selection
  const [vendorId, setVendorId]     = useState('');
  const [familySlug, setFamilySlug] = useState('');
  const [sizeId, setSizeId]         = useState('');

  // Guards for one-time/once-per-key auto picks
  const didAutoVendor          = useRef(false);
  const prevVendorRef          = useRef('');                             // last vendor we reacted to
  const prevFamilyKeyRef       = useRef('');                             // last (vendor|family|series) we reacted to
  const didAutoFamilyForVendor = useRef('');                             // vendor id we last auto-picked family for
  const didAutoSizeForKey      = useRef('');                             // key `${vendor}::${family}::${preferredSeries}`

  // User-clears should suppress auto-picks
  const userClearedVendor = useRef(false);
  const userClearedFamily = useRef(false);
  const userClearedSize   = useRef(false);

  // Idempotent setters (avoid re-setting same value)
  const setVendorIdIf = (val) => setVendorId(prev => (prev === toKey(val) ? prev : toKey(val)));
  const setFamilySlugIf = (val) => setFamilySlug(prev => (prev === toKey(val) ? prev : toKey(val)));
  const setSizeIdIf = (val) => setSizeId(prev => (prev === toKey(val) ? prev : toKey(val)));
  const toKey = (v) => (v === '' || v == null) ? '' : String(v);

  // Emit guard + stable onSelect ref
  const lastEmitRef = useRef(''); // `${vendorId}|${familySlug}|${sizeId}` or 'null'
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // -------- Load vendors once
  useEffect(() => {
    let alive = true;
    (async () => {
      const vs = await listVendors();
      if (!alive) return;
      setVendors(vs || []);
    })();
    return () => { alive = false; };
  }, []);

  // -------- Auto-pick default vendor once when vendors arrive
  useEffect(() => {
    if (didAutoVendor.current || userClearedVendor.current) return;
    if (!vendors.length || vendorId) return;

    const want = norm(defaultVendor);
    const byExact = vendors.find(v => norm(v.displayName || v.id) === want);
    const byIncl  = vendors.find(v => norm(v.displayName || '').includes(want));
    const gpBias  = vendors.find(v => {
      const n = norm(v.displayName || v.id);
      return n.includes('gillies') && n.includes('prittie');
    });
    const pick = byExact || byIncl || gpBias || vendors[0];

    didAutoVendor.current = true;
    if (pick?.id) setVendorIdIf(pick.id);
  }, [vendors, vendorId, defaultVendor, setVendorIdIf]);

  // ================================
  // VENDOR CHANGED → reset family/size, load families, maybe auto-pick a family
  // (depends ONLY on vendorId to avoid clearing family when family changes)
  // ================================
  useEffect(() => {
    const prevVendor = prevVendorRef.current;
    if (!vendorId || vendorId === prevVendor) {
      prevVendorRef.current = vendorId;
      return;
    }

    // Snapshot before we clear
    const hadSelection = !!(familySlug || sizeId);

    // Clear local state once for this vendor change
    if (familySlug) setFamilySlugIf('');
    if (sizeId) setSizeIdIf('');
    setFamilies(prev => (prev.length ? [] : prev));
    prevFamilyKeyRef.current = '';
    setSizes(prev => (prev.length ? [] : prev));
    didAutoSizeForKey.current = '';
    userClearedSize.current = false;

    // Tell parent selection is now null (once)
    if (hadSelection && onSelectRef.current && lastEmitRef.current !== 'null') {
      lastEmitRef.current = 'null';
      onSelectRef.current(null);
    }

    let alive = true;
    (async () => {
      const fs = await listFamilies(vendorId);
      if (!alive) return;
      setFamilies(fs || []);

      if (!userClearedFamily.current && didAutoFamilyForVendor.current !== vendorId && fs?.length) {
        let fam = null;
        if (defaultFamilyLabel) {
          const want = norm(defaultFamilyLabel);
          fam = fs.find(f => norm(f.label) === want) || fs.find(f => norm(f.label).includes(want));
        }
        if (!fam) {
          // prefer SPF #2 if present
          fam = fs.find(f => {
            const n = norm(f.label);
            return n.includes('spf') && (n.includes('#2') || n.includes(' 2'));
          }) || fs[0];
        }
        didAutoFamilyForVendor.current = vendorId;
        if (fam?.slug) setFamilySlugIf(fam.slug);
      }
    })();

    prevVendorRef.current = vendorId;
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]); // <-- ONLY vendorId

  // =========================================
  // FAMILY or PREFERRED SERIES CHANGED → reset size, load sizes, maybe auto-pick
  // (NO dependency on sizeId to avoid self-loop)
  // =========================================
  useEffect(() => {
    if (!vendorId || !familySlug) return;

    const key = `${vendorId}::${familySlug}::${preferredSeries || ''}`;
    if (prevFamilyKeyRef.current === key) return;

    const hadSize = !!sizeId;
    if (hadSize) setSizeIdIf('');
    setSizes(prev => (prev.length ? [] : prev));
    didAutoSizeForKey.current = '';
    userClearedSize.current = false;

    if (hadSize && onSelectRef.current && lastEmitRef.current !== 'null') {
      lastEmitRef.current = 'null';
      onSelectRef.current(null);
    }

    let alive = true;
    (async () => {
      const ss = await listSizes(vendorId, familySlug);
      if (!alive) return;
      setSizes(ss || []);

      if (!userClearedSize.current && didAutoSizeForKey.current !== key && ss?.length) {
        let size = null;

        if (defaultSizeLabel) {
          const want = norm(defaultSizeLabel);
          size =
            ss.find(s => norm(s.sizeLabel) === want) ||
            ss.find(s => norm(s.sizeLabel).includes(want));
        }

        if (!size && preferredSeries) {
          const wantSeries = norm(preferredSeries).replace(/[^0-9x]/g, '');
          const labelNorm = (s) => norm(String(s || '')).replace(/[^0-9x]/g, '');
          size =
            ss.find(s => labelNorm(s.sizeLabel).startsWith(wantSeries)) ||
            ss.find(s => labelNorm(s.sizeLabel).includes(wantSeries));
        }

        if (!size) size = ss[0];

        didAutoSizeForKey.current = key;
        if (size?.id) setSizeIdIf(size.id);
      }
    })();

    prevFamilyKeyRef.current = key;
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, familySlug, preferredSeries, defaultSizeLabel]); // <-- NO sizeId here

  // If user clears SIZE explicitly via "✖ Clear selection", notify parent once
  useEffect(() => {
    if (!sizeId) {
      if (lastEmitRef.current !== 'null') {
        lastEmitRef.current = 'null';
        onSelectRef.current?.(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeId]);

  // Build selected object for parent consumers
  const selected = useMemo(() => {
    if (!vendorId || !familySlug || !sizeId) return null;
    const fam = families.find(f => String(f.slug) === String(familySlug));
    const itm = sizes.find(s => String(s.id) === String(sizeId));
    if (!fam || !itm) return null;
    return {
      vendorId,
      vendorName: (vendors.find(v => v.id === vendorId)?.displayName) || vendorId,
      family: fam.slug,
      familyLabel: fam.label,
      item: itm,
    };
  }, [vendorId, familySlug, sizeId, vendors, families, sizes]);

  // Emit selection ONLY when it actually changes
  useEffect(() => {
    const sig = selected ? `${vendorId}|${familySlug}|${sizeId}` : 'null';
    if (sig !== lastEmitRef.current) {
      lastEmitRef.current = sig;
      onSelectRef.current?.(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ---- Change handlers (also set "user cleared" flags) ----------------
  const handleVendorChange = useCallback((val) => {
    if (val === '') userClearedVendor.current = true;
    setVendorIdIf(val);
  }, [setVendorIdIf]);

  const handleFamilyChange = useCallback((val) => {
    if (val === '') {
      userClearedFamily.current = true;
      if (sizeId) setSizeIdIf('');
      setSizes(prev => (prev.length ? [] : prev));
      if (lastEmitRef.current !== 'null') {
        lastEmitRef.current = 'null';
        onSelectRef.current?.(null);
      }
    }
    setFamilySlugIf(val);
  }, [sizeId, setSizeIdIf, setFamilySlugIf]);

  const handleSizeChange = useCallback((val) => {
    if (val === '') userClearedSize.current = true;
    setSizeIdIf(val);
  }, [setSizeIdIf]);

  // ---- UI pieces (searchable) ------------------------------------------
  const vendorOptions = useMemo(() => vendors.map(v => ({ value: String(v.id),  label: v.displayName })), [vendors]);
  const familyOptions = useMemo(() => families.map(f => ({ value: String(f.slug), label: f.label })), [families]);
  const sizeOptions   = useMemo(() => sizes.map(s => ({ value: String(s.id),   label: s.sizeLabel })), [sizes]);

  const VendorSelect = (
    <SearchableSelect
      ariaLabel="Vendor"
      value={vendorId}
      onChange={handleVendorChange}
      options={vendorOptions}
      placeholder="Select vendor…"
      disabled={!vendors.length}
    />
  );

  const FamilySelect = (
    <SearchableSelect
      ariaLabel="Family"
      value={familySlug}
      onChange={handleFamilyChange}
      options={familyOptions}
      placeholder="Family…"
      disabled={!families.length}
    />
  );

  // ⬇ IMPORTANT: show ALL sizes; do not filter by preferredSeries
  const SizeSelect = (
    <SearchableSelect
      ariaLabel="Size"
      value={sizeId}
      onChange={handleSizeChange}
      options={sizeOptions}
      placeholder="Size…"
      disabled={!sizes.length}
    />
  );

  // Layouts
  if (compact) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {VendorSelect}
        {FamilySelect}
        {SizeSelect}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {VendorSelect}
      {FamilySelect}
      {SizeSelect}
    </div>
  );
}
