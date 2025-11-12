// src/components/ItemPicker.jsx
'use client';

// 1. Importamos useEffectEvent
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffectEvent, // ¡Añadido!
} from 'react';
import {
  getFamilies,
  getSizesForFamily,
  getVendorsForIds,
  getFinalItem,
} from '@/lib/catalog';
import SearchableSelect from '@/components/SearchableSelect';

const norm = (s = '') =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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
  const [sizeLookupId, setSizeLookupId] = useState(
    () => value?.sizeLookupId || ''
  );
  const [vendorId, setVendorId] = useState(() => value?.vendorId || '');

  // Loading states
  const [loadingFamilies, setLoadingFamilies] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Refs
  const didAutoFamily = useRef(false);
  const didAutoSize = useRef(false);
  const didAutoVendor = useRef(false);

  // 2. Eliminamos el código anterior
  // const onSelectRef = useRef(onSelect);
  // useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // 3. Creamos la función de evento estable
  // Esta función siempre tendrá el 'onSelect' más reciente sin
  // necesidad de estar en un array de dependencias.
  const onSelectItem = useEffectEvent(onSelect);

  // **THIS IS THE FIX (PART 1)** (Lógica original, se mantiene)
  // Sincroniza el estado interno SOLO cuando el 'value' externo cambia.
  useEffect(() => {
    if (value && value.family) {
      // If the prop changes, force the state to match the prop
      if (familySlug !== value.family) setFamilySlug(value.family);
      if (sizeLookupId !== value.sizeLookupId)
        setSizeLookupId(value.sizeLookupId);
      if (vendorId !== value.vendorId) setVendorId(value.vendorId);
    }
    // Maneja el caso de limpiar el picker si el padre pasa null
    else if (!value) {
      setFamilySlug('');
      setSizeLookupId('');
      setVendorId('');
    }
  }, [value]); // <-- Correcto, solo depende del prop

  // **THIS IS THE FIX (PART 2)** (Lógica original, se mantiene)
  // Previene que la lógica de "autofill" se ejecute si
  // el componente ya se cargó con un valor guardado.
  useEffect(() => {
    if (value) {
      didAutoFamily.current = true;
      didAutoSize.current = true;
      didAutoVendor.current = true;
    }
  }, []); // <-- Correcto, se ejecuta solo una vez

  // Carga familias y aplica el valor por defecto
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingFamilies(true);
      const fams = await getFamilies();
      if (!alive) return;
      setFamilies(fams);
      setLoadingFamilies(false);

      if (
        !value &&
        !didAutoFamily.current &&
        fams.length > 0 &&
        defaultFamilyLabel
      ) {
        const want = norm(defaultFamilyLabel);
        const pick = fams.find((f) => norm(f.label) === want);
        if (pick) {
          didAutoFamily.current = true;
          setFamilySlug(pick.value); // <-- Aplica el default
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [value, defaultFamilyLabel]);

  // Handlers para actualizar el estado interno
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

  // Hook para cargar los tamaños (sin cambios)
  useEffect(() => {
    if (!familySlug) {
      setSizes([]);
      return;
    }

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
          pick = newSizes.find((s) => norm(s.label) === want);
        }
        if (!pick && preferredSeries) {
          const wantSeries = norm(preferredSeries).replace(/[^0-9x]/g, '');
          const labelNorm = (s) =>
            norm(String(s || '')).replace(/[^0-9x]/g, '');
          pick = newSizes.find((s) =>
            labelNorm(s.label).startsWith(wantSeries)
          );
        }
        if (pick) {
          didAutoSize.current = true;
          setSizeLookupId(pick.value);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [familySlug, value, defaultFamilyLabel, preferredSeries, sizes.length]);

  // Hook para cargar los vendedores (sin cambios)
  useEffect(() => {
    if (!sizeLookupId) {
      setVendors([]);
      return;
    }
    if (value && value.sizeLookupId === sizeLookupId && vendors.length > 0)
      return;

    const selectedSize = sizes.find((s) => s.value === sizeLookupId);
    if (!selectedSize?.vendorIds) return;

    let alive = true;
    (async () => {
      setLoadingVendors(true);
      const newVendors = await getVendorsForIds(selectedSize.vendorIds);
      if (!alive) return;
      setVendors(newVendors);
      setLoadingVendors(false);

      if (
        !value &&
        !didAutoVendor.current &&
        newVendors.length > 0 &&
        defaultVendor
      ) {
        const want = norm(defaultVendor);
        const pick = newVendors.find((v) => norm(v.label).includes(want));
        if (pick) {
          didAutoVendor.current = true;
          setVendorId(pick.value);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sizeLookupId, sizes, value, defaultVendor, vendors.length]);

  // **THIS IS THE FIX (PART 3)** (Lógica original, se mantiene)
  // Este hook envía la selección final al padre.
  useEffect(() => {
    // Si los 3 están presentes, tenemos una selección completa.
    if (vendorId && familySlug && sizeLookupId) {
      const family = families.find((f) => f.value === familySlug);
      const size = sizes.find((s) => s.value === sizeLookupId);
      const vendor = vendors.find((v) => v.value === vendorId);

      if (!family || !size || !vendor) {
        // Data no cargada aún, esperar.
        return;
      }

      // **LA GUARDIA**: Revisa si la selección interna ya
      // coincide con el prop 'value' externo.
      if (
        value &&
        value.family === familySlug &&
        value.sizeLookupId === sizeLookupId &&
        value.vendorId === vendorId
      ) {
        return; // La selección ya está sincronizada.
      }

      (async () => {
        const item = await getFinalItem({
          familyLabel: family.label,
          sizeLabel: size.label,
          vendorId: vendor.value,
        });

        // 4. Llamamos a la función de evento
        onSelectItem?.(
          item
            ? {
                vendorId: vendor.value,
                vendorName: vendor.label,
                family: family.value,
                familyLabel: family.label,
                sizeLookupId: size.value,
                item: item,
              }
            : null
        );
      })();
      return; // Listo
    }

    // Si los 3 están ausentes (ej. se limpió la familia)
    // La selección es 'null'.
    if (!vendorId && !familySlug && !sizeLookupId) {
      if (value !== null) { // Solo notificar si no éramos ya null
        // 4. Llamamos a la función de evento
        onSelectItem?.(null);
      }
      return;
    }

    // Si estamos en un estado intermedio (ej. familia seleccionada, pero no tamaño/vendedor),
    // estamos a mitad de una selección.
    // **NO ENVIAR NULL.** Simplemente esperar.
  }, [vendorId, familySlug, sizeLookupId, families, sizes, vendors, value]);

  // --- UI (Sin cambios) ---
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
          display: 'grid',
          gridTemplateColumns: '1.2fr 1.2fr 1fr',
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
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FamilySelect}
      {SizeSelect}
      {VendorSelect}
    </div>
  );
}