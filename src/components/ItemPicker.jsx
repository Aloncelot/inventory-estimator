// src/components/ItemPicker.jsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  getFamilies,
  getSizesForFamily,
  getVendorsForIds,
  getFinalItem,
} from "@/lib/catalog";
import SearchableSelect from "@/components/SearchableSelect";

// Helper function (copied from your import-prices.js)
function slug(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

const norm = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export default function ItemPicker({
  onSelect,
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
  const [familySlug, setFamilySlug] = useState("");
  const [sizeLookupId, setSizeLookupId] = useState("");
  const [vendorId, setVendorId] = useState("");

  // Loading states
  const [loadingFamilies, setLoadingFamilies] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Refs
  const didAutoFamily = useRef(false);
  const didAutoSize = useRef(false);
  const didAutoVendor = useRef(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // --- Step 1: Load all Families on mount ---
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingFamilies(true);
      const fams = await getFamilies();
      if (!alive) return;
      setFamilies(fams);
      setLoadingFamilies(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Auto-pick default family
  useEffect(() => {
    if (didAutoFamily.current || families.length === 0 || !defaultFamilyLabel)
      return;
    const want = norm(defaultFamilyLabel);
    const pick = families.find((f) => norm(f.label) === want);
    if (pick) {
      didAutoFamily.current = true;
      setFamilySlug(pick.value);
    }
  }, [families, defaultFamilyLabel]);

  // --- Step 2: On Family change, load Sizes ---
  const handleFamilyChange = useCallback(
    (slug) => {
      setFamilySlug(slug);
      setSizeLookupId("");
      setVendorId("");
      setSizes([]);
      setVendors([]);
      onSelectRef.current?.(null);
    },
    [onSelectRef]
  );

  useEffect(() => {
    if (!familySlug) {
      setSizes([]);
      return;
    }
    let alive = true;
    (async () => {
      setLoadingSizes(true);
      const newSizes = await getSizesForFamily(familySlug);
      if (!alive) return;
      setSizes(newSizes);
      setLoadingSizes(false);
    })();
    return () => {
      alive = false;
    };
  }, [familySlug]);

  // Auto-pick default size (NOW INCLUDES preferredSeries)
  useEffect(() => {
    if (didAutoSize.current || sizes.length === 0) return;
    if (!defaultSizeLabel && !preferredSeries) return;

    let pick = null;

    // Priority 1: Try to match defaultSizeLabel exactly (if provided)
    if (defaultSizeLabel) {
      const want = norm(defaultSizeLabel);
      pick = sizes.find((s) => norm(s.label) === want);
    }

    // Priority 2: If no match, try to match preferredSeries (e.g., "2x6")
    if (!pick && preferredSeries) {
      const wantSeries = norm(preferredSeries).replace(/[^0-9x]/g, ""); // "2x6"
      const labelNorm = (s) => norm(String(s || "")).replace(/[^0-9x]/g, "");
      pick = sizes.find((s) => labelNorm(s.label).startsWith(wantSeries));
    }

    if (pick) {
      didAutoSize.current = true;
      setSizeLookupId(pick.value); // This is the itemLookupId (e.g., 'spf-2_2x6-8')
    }
  }, [sizes, defaultSizeLabel, preferredSeries]);

  // --- Step 3: On Size change, load Vendors ---
  const handleSizeChange = useCallback(
    (lookupId) => {
      setSizeLookupId(lookupId);
      setVendorId("");
      setVendors([]);
      onSelectRef.current?.(null);
    },
    [onSelectRef]
  );

  useEffect(() => {
    if (!sizeLookupId) {
      setVendors([]);
      return;
    }
    const selectedSize = sizes.find((s) => s.value === sizeLookupId);
    if (!selectedSize?.vendorIds) return;

    let alive = true;
    (async () => {
      setLoadingVendors(true);
      const newVendors = await getVendorsForIds(selectedSize.vendorIds);
      if (!alive) return;
      setVendors(newVendors);
      setLoadingVendors(false);
    })();
    return () => {
      alive = false;
    };
  }, [sizeLookupId, sizes]);

  // --- Step 4: On Vendor change, get final item and emit ---
  const handleVendorChange = useCallback(
    (vId) => {
      setVendorId(vId);

      const family = families.find((f) => f.value === familySlug);
      const size = sizes.find((s) => s.value === sizeLookupId);

      if (!family || !size || !vId) {
        onSelectRef.current?.(null);
        return;
      }

      (async () => {
        const firestoreDoc = await getFinalItem({
          familyLabel: family.label,
          sizeLabel: size.label,
          vendorId: vId,
        });

        if (!firestoreDoc) {
          onSelectRef.current?.(null);
          return;
        }

        // 1. Re-create the `item` object (what the old `listSizes` did)
        const itemObject = {
          id: slug(`${family.label}|${size.label}`), // The doc ID
          sizeSlug: firestoreDoc.sizeSlug,
          sizeLabel: firestoreDoc.sizeDisplay, // <-- This is what getSize() needs
          unit: firestoreDoc.unit,
          priceWithMarkup: firestoreDoc.priceWithMarkup ?? null,
          raw: firestoreDoc, // Pass the full doc as `raw`
        };

        // 2. Build the final `onSelect` payload
        const selectionPayload = {
          vendorId: vId,
          vendorName: vendors.find((v) => v.value === vId)?.label || vId,
          family: family.value,
          familyLabel: family.label,
          item: itemObject, // <-- Pass the reconstructed `item` object
        };

        onSelectRef.current?.(selectionPayload);
      })();
    },
    [familySlug, sizeLookupId, families, sizes, vendors, onSelectRef]
  );

  // Auto-pick default vendor
  useEffect(() => {
    if (didAutoVendor.current || vendors.length === 0 || !defaultVendor) return;
    const want = norm(defaultVendor);
    const pick = vendors.find((v) => norm(v.label).includes(want));
    if (pick) {
      didAutoVendor.current = true;
      handleVendorChange(pick.value);
    }
  }, [vendors, defaultVendor, handleVendorChange]);

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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1.2fr 1fr",
          gap: 6,
        }}
      >
        {FamilySelect}
        {SizeSelect}
        {VendorSelect}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {FamilySelect}
      {SizeSelect}
      {VendorSelect}
    </div>
  );
}
