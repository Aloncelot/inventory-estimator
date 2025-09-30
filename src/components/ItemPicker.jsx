// src/components/ItemPicker.jsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { listVendors, listFamilies, listSizes } from '@/lib/catalog';
import SearchableSelect from '@/components/SearchableSelect';

// Normalize a string for case-insensitive, space-insensitive comparisons
const norm = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Normalize a size token for series matching: keep digits and "x", remove quotes/symbols/spaces
// e.g. `2×6"-8'` -> `2x6-8` (we only care that it starts with `2x6`)
const cleanSizeToken = (s = '') =>
  String(s)
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9x]+/g, ''); // strip quotes, spaces, punctuation

export default function ItemPicker({
  onSelect,
  compact = false,
  // Preferred default vendor label; you can add a defaultVendorId prop later if needed
  defaultVendor = 'Gillies & Prittie Warehouse',
  defaultFamilyLabel,   // e.g., "SPF#2" (optional)
  preferredSeries,      // e.g., "2x6" | "2x4" (optional)
  defaultSizeLabel,     // e.g., 2x6"-12' (optional)
}) {
  // Data
  const [vendors, setVendors] = useState([]);
  const [families, setFamilies] = useState([]); // [{ slug, label }]
  const [sizes, setSizes]       = useState([]); // [{ id, sizeSlug, sizeLabel, unit, ... }]

  // Selection
  const [vendorId, setVendorId]     = useState('');
  const [familySlug, setFamilySlug] = useState('');
  const [sizeId, setSizeId]         = useState('');

  // Loading flags
  const [loadingFamilies, setLoadingFamilies] = useState(false);
  const [loadingSizes, setLoadingSizes]       = useState(false);

  // One-time auto-select guards
  const didAutoVendor = useRef(false);
  const didAutoFamilyForVendor = useRef(''); // remembers vendorId we auto-picked a family for
  const didAutoSizeForFamily   = useRef(''); // remembers vendorId::familySlug we auto-picked a size for

  // Helper: try to find first size that matches the preferred series
  const findSeriesMatch = (list) => {
    if (!preferredSeries) return null;
    const want = cleanSizeToken(preferredSeries);  // "2x6"
    return (list || []).find(s => cleanSizeToken(s.sizeLabel).startsWith(want)) || null;
  };

  // 1) Load vendors once (on mount)
  useEffect(() => {
    let alive = true;
    (async () => {
      const vs = await listVendors();
      if (!alive) return;
      setVendors(vs || []);
    })();
    return () => { alive = false; };
  }, []);

  // 2) Auto-pick default vendor once when vendors arrive
  useEffect(() => {
    if (didAutoVendor.current) return;
    if (!vendors.length || vendorId) return;

    const want = norm(defaultVendor);
    const pick =
      // token match for "Gillies & Prittie"
      vendors.find(v => {
        const n = norm(v.displayName || v.id);
        return n.includes('gillies') && n.includes('prittie');
      })
      // contains normalized defaultVendor label
      || vendors.find(v => norm(v.displayName || '').includes(want))
      // known slug fallback
      || vendors.find(v => v.id === 'gillies_prittie_warehouse')
      // fallback: first vendor
      || vendors[0];

    didAutoVendor.current = true;
    setVendorId(pick?.id || '');
  }, [vendors, vendorId, defaultVendor]);

  // 3) When vendor changes → reset family/size, load families, auto-pick one
  useEffect(() => {
    let alive = true;

    // Reset dependent selections and data
    const hadSelection = !!(familySlug || sizeId);
    setFamilySlug(prev => (prev ? '' : prev));
    setSizeId(prev => (prev ? '' : prev));
    setFamilies([]);
    setSizes([]);
    if (hadSelection && onSelect) onSelect(null); // notify parent that selection is cleared

    if (!vendorId) return;

    (async () => {
      setLoadingFamilies(true);
      const fs = await listFamilies(vendorId);
      if (!alive) return;
      setFamilies(fs || []);
      setLoadingFamilies(false);

      // Auto-pick a family once per vendor
      if (didAutoFamilyForVendor.current !== vendorId && fs?.length) {
        let fam = null;

        if (defaultFamilyLabel) {
          const want = norm(defaultFamilyLabel);
          fam = fs.find(f => norm(f.label) === want) || fs.find(f => norm(f.label).includes(want));
        }
        // Prefer SPF#2 if present
        if (!fam) {
          fam = fs.find(f => {
            const n = norm(f.label);
            return n.includes('spf') && (n.includes('#2') || n.includes(' 2'));
          });
        }
        // Fallback: first family
        if (!fam) fam = fs[0];

        didAutoFamilyForVendor.current = vendorId;
        setFamilySlug(fam.slug);
      }
    })();

    return () => { alive = false; };
  }, [vendorId]); // keep deps minimal by design

  // 4) When family changes → reset size, load sizes, auto-pick one (prefer series)
  useEffect(() => {
    let alive = true;

    const hadSize = !!sizeId;
    setSizeId(prev => (prev ? '' : prev));
    setSizes([]);
    if (hadSize && onSelect) onSelect(null);

    if (!vendorId || !familySlug) return;

    (async () => {
      setLoadingSizes(true);
      const ss = await listSizes(vendorId, familySlug);
      if (!alive) return;
      setSizes(ss || []);
      setLoadingSizes(false);

      // Auto-pick a size once per vendor+family
      const famKey = `${vendorId}::${familySlug}`;
      if (didAutoSizeForFamily.current !== famKey && ss?.length) {
        let size = null;

        // 1) Try to match by preferred series (e.g., "2x6" → '2x6"-8\'')
        size = findSeriesMatch(ss);

        // 2) Then try defaultSizeLabel (your original behavior)
        if (!size && defaultSizeLabel) {
          const want = norm(defaultSizeLabel);
          size =
            ss.find(s => norm(s.sizeLabel) === want) ||
            ss.find(s => norm(s.sizeLabel).includes(want)) ||
            null;
        }

        // 3) Fallback: first size
        if (!size) size = ss[0];

        didAutoSizeForFamily.current = famKey;
        setSizeId(size.id);
      }
    })();

    return () => { alive = false; };
  }, [vendorId, familySlug, preferredSeries, defaultSizeLabel]); // include series so first auto-pick prefers it

  // 5) If the user changes the Series later (without changing vendor/family),
  // re-align the size to the new series if current size doesn't match.
  useEffect(() => {
    if (!preferredSeries || !sizes?.length) return;
    const current = sizes.find(s => s.id === sizeId);
    const wantMatch = findSeriesMatch(sizes);
    const currentMatches =
      current && wantMatch && cleanSizeToken(current.sizeLabel).startsWith(cleanSizeToken(preferredSeries));
    if (!currentMatches && wantMatch) {
      setSizeId(wantMatch.id);
    }
  }, [preferredSeries, sizes, sizeId]); // safe: setting sizeId won't change these deps in a loop

  // Build selected object for parent consumers
  const selected = useMemo(() => {
    if (!vendorId || !familySlug || !sizeId) return null;
    const fam = families.find(f => f.slug === familySlug);
    const itm = sizes.find(s => s.id === sizeId);
    if (!fam || !itm) return null;
    return {
      vendorId,
      vendorName: (vendors.find(v => v.id === vendorId)?.displayName) || vendorId,
      family: fam.slug,
      familyLabel: fam.label,
      item: itm, // includes unit, supplierPrice, markupPct, priceWithMarkup, raw, etc.
    };
  }, [vendorId, familySlug, sizeId, vendors, families, sizes]);

  // Notify parent only when a complete selection exists
  useEffect(() => {
    if (onSelect && selected) onSelect(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ---- UI pieces (searchable) ------------------------------------------
  const VendorSelect = (
    <SearchableSelect
      ariaLabel="Vendor"
      value={vendorId}
      onChange={setVendorId}
      options={vendors.map(v => ({ value: v.id, label: v.displayName }))}
      placeholder="Select vendor…"
      disabled={!vendors.length}
    />
  );

  const FamilySelect = (
    <SearchableSelect
      ariaLabel="Family"
      value={familySlug}
      onChange={setFamilySlug}
      options={families.map(f => ({ value: f.slug, label: f.label }))}
      placeholder={loadingFamilies ? 'Loading families…' : 'Family…'}
      disabled={!families.length || loadingFamilies}
      loading={loadingFamilies}
    />
  );

  const SizeSelect = (
    <SearchableSelect
      ariaLabel="Size"
      value={sizeId}
      onChange={setSizeId}
      options={sizes.map(s => ({ value: s.id, label: s.sizeLabel }))}
      placeholder={loadingSizes ? 'Loading sizes…' : 'Size…'}
      disabled={!sizes.length || loadingSizes}
      loading={loadingSizes}
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
