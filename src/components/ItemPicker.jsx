// src/components/ItemPicker.jsx
'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem } from '@/lib/catalog';
import SearchableSelect from '@/components/SearchableSelect';

const norm = (s = '') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function ItemPicker({
  onSelect,
  value, // This prop holds the currently selected item object
  compact = false,
  defaultVendor,
  defaultFamilyLabel,
  defaultSizeLabel,
  preferredSeries,
}) {
  // Data
  const [families, setFamilies] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [vendors, setVendors] = useState([]);

  // Selection
  const [familySlug, setFamilySlug] = useState('');
  const [sizeLookupId, setSizeLookupId] = useState(''); 
  const [vendorId, setVendorId] = useState('');

  // Loading states
  const [loadingFamilies, setLoadingFamilies] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Refs
  const didAutoFamily = useRef(false);
  const didAutoSize = useRef(false);
  const didAutoVendor = useRef(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (value && value.family) {
      if (familySlug !== value.family) setFamilySlug(value.family);
      if (sizeLookupId !== value.sizeLookupId) setSizeLookupId(value.sizeLookupId);
      if (vendorId !== value.vendorId) setVendorId(value.vendorId);
    }
  }, [value, familySlug, sizeLookupId, vendorId]); 


  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingFamilies(true);
      const fams = await getFamilies();
      if (!alive) return;
      setFamilies(fams);
      setLoadingFamilies(false);

      if (!value && !didAutoFamily.current && fams.length > 0 && defaultFamilyLabel) {
        const want = norm(defaultFamilyLabel);
        const pick = fams.find(f => norm(f.label) === want);
        if (pick) {
          didAutoFamily.current = true;
          setFamilySlug(pick.value);
        }
      }
    })();
    return () => { alive = false; };
  }, [value, defaultFamilyLabel]);

  const handleFamilyChange = useCallback((slug) => {
    setFamilySlug(slug);
    setSizeLookupId('');
    setVendorId('');
    setSizes([]);
    setVendors([]);
  }, []);

  useEffect(() => {
    if (!familySlug) {
      setSizes([]); 
      return;
    };

    if (value && value.family === familySlug && sizes.length > 0) return;

    let alive = true;
    (async () => {
      setLoadingSizes(true);
      const newSizes = await getSizesForFamily(familySlug);
      if (!alive) return;
      setSizes(newSizes);
      setLoadingSizes(false);

      if (!value && !didAutoSize.current && newSizes.length > 0) {
        let pick = null;
        if (defaultSizeLabel) {
          const want = norm(defaultSizeLabel);
          pick = newSizes.find(s => norm(s.label) === want);
        }
        if (!pick && preferredSeries) {
          const wantSeries = norm(preferredSeries).replace(/[^0-9x]/g, '');
          const labelNorm = (s) => norm(String(s || '')).replace(/[^0-9x]/g, '');
          pick = newSizes.find(s => labelNorm(s.label).startsWith(wantSeries));
        }
        if (pick) {
          didAutoSize.current = true;
          setSizeLookupId(pick.value);
        }
      }
    })();
    return () => { alive = false; };
  }, [familySlug, value, defaultSizeLabel, preferredSeries, sizes.length]); 

  const handleSizeChange = useCallback((lookupId) => {
    setSizeLookupId(lookupId);
    setVendorId('');
    setVendors([]);
  }, []);

  useEffect(() => {
    if (!sizeLookupId) {
      setVendors([]); 
      return;
    }
    if (value && value.sizeLookupId === sizeLookupId && vendors.length > 0) return;
    
    const selectedSize = sizes.find(s => s.value === sizeLookupId);
    if (!selectedSize?.vendorIds) return;

    let alive = true;
    (async () => {
      setLoadingVendors(true);
      const newVendors = await getVendorsForIds(selectedSize.vendorIds);
      if (!alive) return;
      setVendors(newVendors);
      setLoadingVendors(false);

      if (!value && !didAutoVendor.current && newVendors.length > 0 && defaultVendor) {
        const want = norm(defaultVendor);
        const pick = newVendors.find(v => norm(v.label).includes(want)); 
        if (pick) {
          didAutoVendor.current = true;
          setVendorId(pick.value); 
        }
      }
    })();
    return () => { alive = false; };
  }, [sizeLookupId, sizes, value, defaultVendor, vendors.length]); 

  const handleVendorChange = useCallback((vId) => {
    setVendorId(vId);
  }, []);

  useEffect(() => {
    if (!vendorId || !familySlug || !sizeLookupId) {
      onSelectRef.current?.(null);
      return;
    }
    
    const family = families.find(f => f.value === familySlug);
    const size = sizes.find(s => s.value === sizeLookupId);
    const vendor = vendors.find(v => v.value === vendorId);

    if (!family || !size || !vendor) {
      onSelectRef.current?.(null);
      return;
    }

    (async () => {
      const item = await getFinalItem({
        familyLabel: family.label,
        sizeLabel: size.label,
        vendorId: vendor.value,
      });
      
      onSelectRef.current?.(item ? {
        vendorId: vendor.value,
        vendorName: vendor.label,
        family: family.value,
        familyLabel: family.label,
        sizeLookupId: size.value, 
        item: item, 
      } : null);
    })();
    
  }, [vendorId, familySlug, sizeLookupId, families, sizes, vendors]); 

  // --- UI ---
  const FamilySelect = (
    <SearchableSelect
      ariaLabel="Family"
      value={familySlug} 
      onChange={handleFamilyChange}
      options={families}
      placeholder="Select Family…"
      disabled={loadingFamilies}
      loading={loadingFamilies}
    />
  );

  const SizeSelect = (
    <SearchableSelect
      ariaLabel="Size"
      value={sizeLookupId} 
      onChange={handleSizeChange}
      options={sizes}
      placeholder="Select Size…"
      disabled={!familySlug || loadingSizes}
      loading={loadingSizes}
    />
  );

  const VendorSelect = (
    <SearchableSelect
      ariaLabel="Vendor"
      value={vendorId} 
      onChange={handleVendorChange}
      options={vendors}
      placeholder="Select Vendor…"
      disabled={!sizeLookupId || loadingVendors}
      loading={loadingVendors}
    />
  );

  if (compact) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: 6 }}>
        {FamilySelect}
        {SizeSelect}
        {VendorSelect}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FamilySelect}
      {SizeSelect}
      {VendorSelect}
    </div>
  );
}