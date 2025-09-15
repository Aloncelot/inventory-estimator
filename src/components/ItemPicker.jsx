// src/components/ItemPicker.jsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { listVendors, listFamilies, listSizes } from '@/lib/catalog';

export default function ItemPicker({
  onSelect,
  compact = false,
  defaultVendor = '', // e.g. "Gillies & Prittie"
}) {
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');

  const [families, setFamilies] = useState([]);        // [{slug,label}]
  const [familySlug, setFamilySlug] = useState('');

  const [sizes, setSizes] = useState([]);              // [{id,sizeSlug,sizeLabel,unit,...}]
  const [sizeId, setSizeId] = useState('');

  // ---- one-time auto-select guards -------------------------------------
  const didAutoVendor = useRef(false);
  const didAutoFamilyForVendor = useRef(''); // remember vendor we auto-picked family for
  const didAutoSizeForFamily = useRef('');   // remember family we auto-picked size for

  // Load vendors once
  useEffect(() => {
    let alive = true;
    (async () => {
      const vs = await listVendors();
      if (!alive) return;
      setVendors(vs || []);
    })();
    return () => { alive = false; };
  }, []);

  // Auto-pick default vendor ONCE when vendors arrive
  useEffect(() => {
    if (didAutoVendor.current) return;
    if (!vendors.length || vendorId) return;

    if (defaultVendor) {
      const needle = defaultVendor.toLowerCase();
      const match = vendors.find(v =>
        v.displayName?.toLowerCase().includes(needle)
      );
      if (match) {
        didAutoVendor.current = true;
        setVendorId(match.id);
        return;
      }
    }

    // fallback to first vendor once
    didAutoVendor.current = true;
    setVendorId(vendors[0]?.id || '');
  }, [vendors, vendorId, defaultVendor]);

  // When vendor changes → reset family/size, load families
  useEffect(() => {
    let alive = true;
    // reset family/size (but avoid useless sets)
    setFamilySlug(prev => (prev ? '' : prev));
    setSizeId(prev => (prev ? '' : prev));
    setFamilies([]);
    setSizes([]);

    if (!vendorId) return;

    (async () => {
      const fs = await listFamilies(vendorId);
      if (!alive) return;
      setFamilies(fs || []);

      // Auto-pick first family only once per vendor
      if (didAutoFamilyForVendor.current !== vendorId && fs?.length) {
        didAutoFamilyForVendor.current = vendorId;
        setFamilySlug(fs[0].slug);
      }
    })();

    return () => { alive = false; };
  }, [vendorId]);

  // When family changes → reset size, load sizes
  useEffect(() => {
    let alive = true;
    setSizeId(prev => (prev ? '' : prev));
    setSizes([]);

    if (!vendorId || !familySlug) return;

    (async () => {
      const ss = await listSizes(vendorId, familySlug);
      if (!alive) return;
      setSizes(ss || []);

      // Auto-pick first size only once per family (per current vendor)
      const famKey = `${vendorId}::${familySlug}`;
      if (didAutoSizeForFamily.current !== famKey && ss?.length) {
        didAutoSizeForFamily.current = famKey;
        setSizeId(ss[0].id);
      }
    })();

    return () => { alive = false; };
  }, [vendorId, familySlug]);

  // Build the selected object
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
      item: itm, // contains unit, supplierPrice, markupPct, priceWithMarkup, raw, etc.
    };
  }, [vendorId, familySlug, sizeId, vendors, families, sizes]);

  // Notify parent ONLY when a *complete* selection exists
  useEffect(() => {
    if (onSelect && selected) onSelect(selected);
    // do NOT include onSelect in deps to avoid identity changes causing re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ----- UI --------------------------------------------------------------
  if (compact) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <select className='ew-select focus-anim'
          value={vendorId}
          onChange={e => setVendorId(e.target.value)}
          style={{ padding: 6 }}
        >
          {!vendorId && <option value="">Select vendor…</option>}
          {vendors.map(v => (
            <option key={v.id} value={v.id}>{v.displayName}</option>
          ))}
        </select>

        <select className='ew-select focus-anim'
          value={familySlug}
          onChange={e => setFamilySlug(e.target.value)}
          disabled={!families.length}
          style={{ padding: 6 }}
        >
          {!familySlug && <option value="">Family…</option>}
          {families.map(f => (
            <option key={f.slug} value={f.slug}>{f.label}</option>
          ))}
        </select>

        <select className='ew-select focus-anim'
          value={sizeId}
          onChange={e => setSizeId(e.target.value)}
          disabled={!sizes.length}
          style={{ padding: 6 }}
        >
          {!sizeId && <option value="">Size…</option>}
          {sizes.map(s => (
            <option key={s.id} value={s.id}>
              {s.sizeLabel}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // non-compact layout (if you ever need it)
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ padding: 6 }}>
        {!vendorId && <option value="">Select vendor…</option>}
        {vendors.map(v => (
          <option key={v.id} value={v.id}>{v.displayName}</option>
        ))}
      </select>
      <select value={familySlug} onChange={e => setFamilySlug(e.target.value)} disabled={!families.length} style={{ padding: 6 }}>
        {!familySlug && <option value="">Family…</option>}
        {families.map(f => (
          <option key={f.slug} value={f.slug}>{f.label}</option>
        ))}
      </select>
      <select value={sizeId} onChange={e => setSizeId(e.target.value)} disabled={!sizes.length} style={{ padding: 6 }}>
        {!sizeId && <option value="">Size…</option>}
        {sizes.map(s => (
          <option key={s.id} value={s.id}>{s.sizeLabel}</option>
        ))}
      </select>
    </div>
  );
}
