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
  // Initialize state from the 'value' prop ONCE
  const [familySlug, setFamilySlug] = useState(() => value?.family || '');
  const [sizeLookupId, setSizeLookupId] = useState(() => value?.sizeLookupId || ''); 
  const [vendorId, setVendorId] = useState(() => value?.vendorId || '');

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

  
  // **THIS IS THE FIX (PART 1)**
  // This hook's job is to sync the component's internal state
  // ONLY when the *external* 'value' prop changes.
  useEffect(() => {
    if (value && value.family) {
      // If the prop changes, force the state to match the prop
      if (familySlug !== value.family) setFamilySlug(value.family);
      if (sizeLookupId !== value.sizeLookupId) setSizeLookupId(value.sizeLookupId);
      if (vendorId !== value.vendorId) setVendorId(value.vendorId);
    } 
    // This handles clearing the picker if the parent sets value to null
    // (e.g., loading a new project)
    else if (!value) {
      setFamilySlug('');
      setSizeLookupId('');
      setVendorId('');
    }
  }, [value]); // <-- CORRECTED DEPENDENCY ARRAY (Only watches the prop)

  
  // **THIS IS THE FIX (PART 2)**
  // This hook prevents the "autofill" logic (below) from
  // running if the component was loaded with a saved value.
  useEffect(() => {
    // We use the initial 'value' prop to set the flags.
    if (value) {
      didAutoFamily.current = true;
      didAutoSize.current = true;
      didAutoVendor.current = true;
    }
  }, []); // <-- Empty array ensures this runs only once on mount.


  // This hook loads families and sets the DEFAULT value for NEW items
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingFamilies(true);
      const fams = await getFamilies();
      if (!alive) return;
      setFamilies(fams);
      setLoadingFamilies(false);

      // This logic will now run correctly for new items (!value)
      // and be blocked for existing items (didAutoFamily.current === true)
      if (!value && !didAutoFamily.current && fams.length > 0 && defaultFamilyLabel) {
        const want = norm(defaultFamilyLabel);
        const pick = fams.find(f => norm(f.label) === want);
        if (pick) {
          didAutoFamily.current = true;
          setFamilySlug(pick.value); // <-- This sets the default
        }
      }
    })();
    return () => { alive = false; };
  }, [value, defaultFamilyLabel]); // This hook is fine

  // These handlers just update internal state
  const handleFamilyChange = useCallback((slug) => {
    setFamilySlug(slug);
    setSizeLookupId('');
    setVendorId('');
    setSizes([]);
    setVendors([]);
  }, []);

  const handleSizeChange = useCallback((lookupId) => {
    setSizeLookupId(lookupId);
    setVendorId('');
    setVendors([]);
  }, []);

  const handleVendorChange = useCallback((vId) => {
    setVendorId(vId);
  }, []);

  // This hook (fetching sizes) is fine
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
  }, [familySlug, value, defaultFamilyLabel, preferredSeries, sizes.length]); 

  // This hook (fetching vendors) is fine
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


  // **THIS IS THE FIX (PART 3)**
  // This hook sends the final selection up to the parent.
  // It is modified to NOT send 'null' when a selection is in-progress
  // and to GUARD against re-sending the same value.
  useEffect(() => {
    // If all 3 are present, we have a full selection.
    if (vendorId && familySlug && sizeLookupId) {
      const family = families.find(f => f.value === familySlug);
      const size = sizes.find(s => s.value === sizeLookupId);
      const vendor = vendors.find(v => v.value === vendorId);

      if (!family || !size || !vendor) {
        // Data not loaded yet, wait.
        return;
      }
      
      // **THE GUARD**: Check if the current internal selection
      // already matches the external 'value' prop.
      // If it does, DO NOT call onSelect. This breaks the loop.
      if (
        value &&
        value.family === familySlug &&
        value.sizeLookupId === sizeLookupId &&
        value.vendorId === vendorId
      ) {
        return; // Selection is already in sync.
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
      return; // We're done
    }

    // If all 3 are *missing* (e.g., user cleared family)
    // Then the selection is truly 'null'.
    if (!vendorId && !familySlug && !sizeLookupId) {
      if (value !== null) { // Only notify parent if we aren't already null
          onSelectRef.current?.(null);
      }
      return;
    }
    
    // If we are in-between (e.g., family selected, but no size/vendor),
    // we are in the middle of a selection.
    // **DO NOT SEND NULL.** Just wait.
    
  }, [vendorId, familySlug, sizeLookupId, families, sizes, vendors, value]); // <-- 'value' is needed here


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