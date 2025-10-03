// src/components/ItemPicker.jsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [vendors, setVendors] = useState([]);
  const [families, setFamilies] = useState([]);
  const [sizes, setSizes] = useState([]);

  // Selection
  const [vendorId, setVendorId] = useState('');
  const [familySlug, setFamilySlug] = useState('');
  const [sizeId, setSizeId] = useState('');

  // Loading flags
  const [loadingFamilies, setLoadingFamilies] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);

  // One-time auto-select guards
  const didAutoVendor = useRef(false);
  const didAutoFamilyForVendor = useRef('');
  const didAutoSizeForKey = useRef(''); // guard key includes series so it can re-auto when series changes

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
      vendors.find(v => {
        const n = norm(v.displayName || v.id);
        return n.includes('gillies') && n.includes('prittie');
      })
      || vendors.find(v => norm(v.displayName || '').includes(want))
      || vendors.find(v => v.id === 'gillies_prittie_warehouse')
      || vendors[0];

    didAutoVendor.current = true;
    setVendorId(pick?.id || '');
  }, [vendors, vendorId, defaultVendor]);

  // 3) When vendor changes → reset family/size, load families, auto-pick one
  useEffect(() => {
    let alive = true;

    const hadSelection = !!(familySlug || sizeId);
    setFamilySlug(prev => (prev ? '' : prev));
    setSizeId(prev => (prev ? '' : prev));
    setFamilies([]);
    setSizes([]);
    if (hadSelection && onSelect) onSelect(null);

    if (!vendorId) return;

    (async () => {
      setLoadingFamilies(true);
      const fs = await listFamilies(vendorId);
      if (!alive) return;
      setFamilies(fs || []);
      setLoadingFamilies(false);

      if (didAutoFamilyForVendor.current !== vendorId && fs?.length) {
        let fam = null;

        if (defaultFamilyLabel) {
          const want = norm(defaultFamilyLabel);
          fam = fs.find(f => norm(f.label) === want) || fs.find(f => norm(f.label).includes(want));
        }
        if (!fam) {
          // Prefer SPF#2 if present
          fam = fs.find(f => {
            const n = norm(f.label);
            return n.includes('spf') && (n.includes('#2') || n.includes(' 2'));
          }) || fs[0];
        }

        didAutoFamilyForVendor.current = vendorId;
        setFamilySlug(fam.slug);
      }
    })();

    return () => { alive = false; };
  }, [vendorId]); // intentionally minimal

  // 4) When family or series changes → reset size, load sizes, auto-pick a default
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

      // Include series in the guard key so we re-auto-pick when series changes
      const famKey = `${vendorId}::${familySlug}::${preferredSeries || ''}`;
      if (didAutoSizeForKey.current !== famKey && ss?.length) {
        let size = null;

        // If a default size label is provided, try to honor it first
        if (defaultSizeLabel) {
          const want = norm(defaultSizeLabel);
          size =
            ss.find(s => norm(s.sizeLabel) === want) ||
            ss.find(s => norm(s.sizeLabel).includes(want));
        }

        // Then try to match the preferredSeries, but DO NOT FILTER options
        if (!size && preferredSeries) {
          const wantSeries = norm(preferredSeries).replace(/[^0-9x]/g, '');
          const labelNorm = (s) => norm(String(s || '')).replace(/[^0-9x]/g, '');
          size =
            ss.find(s => labelNorm(s.sizeLabel).startsWith(wantSeries)) ||
            ss.find(s => labelNorm(s.sizeLabel).includes(wantSeries));
        }

        // Fallback: first available size
        if (!size) size = ss[0];

        didAutoSizeForKey.current = famKey;
        setSizeId(size.id);
      }
    })();

    return () => { alive = false; };
  }, [vendorId, familySlug, preferredSeries, defaultSizeLabel]);

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
      item: itm,
    };
  }, [vendorId, familySlug, sizeId, vendors, families, sizes]);

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

  // ⬇ IMPORTANT: show ALL sizes; do not filter by preferredSeries
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
