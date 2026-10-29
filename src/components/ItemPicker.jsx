// src/components/ItemPicker.jsx
// Family → Size → Vendor picker. Three compact triggers on one line; the
// menus render in a portal with fixed positioning so they never get clipped
// by the scrolling content area.
'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem } from '@/lib/catalog';
import { slimItem } from '@/domain/lib/selection';
import { useProject } from '@/context/ProjectContext';
import { ChevronDown, Search, Check, LoaderCircle } from 'lucide-react';

/* Keyboard: ←/→ move between dropdowns, ↑/↓ move to the same dropdown in the
   row above/below, Enter or Space opens, type to filter, Enter picks. */
function focusTrigger(from, dir) {
  const all = Array.from(document.querySelectorAll('.pk-trigger')).filter((el) => el.offsetParent !== null);
  const i = all.indexOf(from);
  if (i < 0) return;
  if (dir === 'left' || dir === 'right') {
    const step = dir === 'right' ? 1 : -1;
    for (let j = i + step; j >= 0 && j < all.length; j += step) {
      if (!all[j].disabled) { all[j].focus(); return; }
    }
    return;
  }
  const group = from.closest('.pk');
  const col = Array.from(group.querySelectorAll('.pk-trigger')).indexOf(from);
  const groups = Array.from(document.querySelectorAll('.pk')).filter((g) => g.offsetParent !== null);
  const gi = groups.indexOf(group);
  const step = dir === 'down' ? 1 : -1;
  for (let k = gi + step; k >= 0 && k < groups.length; k += step) {
    const triggers = groups[k].querySelectorAll('.pk-trigger');
    const target = triggers[col] && !triggers[col].disabled ? triggers[col] : Array.from(triggers).find((t) => !t.disabled);
    if (target) { target.focus(); target.scrollIntoView({ block: 'nearest' }); return; }
  }
}

function PortalSelect({ value, options, onChange, disabled, loading, placeholder, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, up: false });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 280 && r.top > spaceBelow;
    setPos({ top: up ? r.top - 2 : r.bottom + 2, left: r.left, width: r.width, up });
  }, []);

  const open = () => {
    if (disabled || loading) return;
    place();
    setSearchTerm('');
    setActive(0);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setIsOpen(false);
    };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [isOpen, place]);

  const filtered = useMemo(
    () => (options || []).filter((o) => o.label.toLowerCase().includes(searchTerm.toLowerCase())),
    [options, searchTerm]
  );
  const selected = options?.find((o) => o.value === value);

  const choose = (opt) => {
    if (!opt) return;
    onChange(opt.value);
    setIsOpen(false);
    // move on to the next dropdown of the same picker (Family → Size → Vendor)
    const me = triggerRef.current;
    requestAnimationFrame(() => {
      const triggers = Array.from(me?.closest('.pk')?.querySelectorAll('.pk-trigger') || []);
      const next = triggers[triggers.indexOf(me) + 1];
      if (next && !next.disabled) next.focus(); else me?.focus();
    });
  };

  const onTriggerKeyDown = (e) => {
    if (isOpen) return;
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); open(); return; }
    if (map[e.key]) { e.preventDefault(); focusTrigger(e.currentTarget, map[e.key]); }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setIsOpen(false); triggerRef.current?.focus(); }
    else if (e.key === 'Tab') { setIsOpen(false); }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pk-trigger"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        title={selected?.label || placeholder}
      >
        <span className={`txt${selected ? '' : ' ph'}`}>{loading ? 'Loading…' : (selected?.label || placeholder)}</span>
        {loading ? <LoaderCircle size={12} className="animate-spin" /> : <ChevronDown size={12} />}
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="pk-menu"
          role="listbox"
          style={{
            left: pos.left,
            width: Math.max(pos.width, 220),
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
          }}
        >
          <div className="pk-search">
            <Search size={12} />
            <input
              autoFocus
              placeholder={`Search ${label?.toLowerCase() || ''}…`}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
            />
          </div>
          {filtered.length === 0 ? (
            <div className="pk-empty">No matches</div>
          ) : (
            filtered.map((opt, i) => (
              <div
                key={opt.value}
                role="option"
                aria-selected={value === opt.value}
                className={`pk-opt${i === active ? ' active' : ''}${value === opt.value ? ' is-selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
              >
                <span>{opt.label}</span>
                {value === opt.value ? <Check size={12} /> : null}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </>
  );
}

/* labels are typed by hand in defaults (2x6"-8', 4x8'-1/2"…); compare loosely */
const loose = (s = '') => String(s).toLowerCase().replace(/[\s"'″”“’‘`]/g, '').replace(/×/g, 'x');
const findByLabel = (list, label) => {
  const want = loose(label);
  if (!want) return null;
  return list.find((o) => loose(o.label) === want)
    || list.find((o) => loose(o.label).includes(want) || want.includes(loose(o.label)))
    || null;
};
const isEmptySel = (v) => !v || (!v.family && !v.vendorId && !v.item);

/**
 * Resolve a default { family, size, vendor } to a full selection, or null
 * when the material list doesn't have it.
 */
export async function resolveDefaultSelection(defaults) {
  if (!defaults?.family) return null;
  const fam = findByLabel(await getFamilies(), defaults.family);
  if (!fam) return null;
  const size = findByLabel(await getSizesForFamily(fam.value), defaults.size);
  if (!size) return null;
  const vendors = await getVendorsForIds(size.vendorIds);
  const vendor = findByLabel(vendors, defaults.vendor) || vendors[0];
  if (!vendor) return null;
  const item = await getFinalItem({ familyLabel: fam.label, sizeLabel: size.label, vendorId: vendor.value });
  if (!item) return null;
  return {
    vendorId: vendor.value, vendorName: vendor.label, family: fam.value, familyLabel: fam.label,
    sizeLookupId: size.value, sizeLabel: size.label, item: slimItem(item),
  };
}

/**
 * Family → Size → Vendor.
 * defaults: { family, size, vendor } preselected once while the row is empty.
 * Applying a default is not an undo step (it isn't something you did).
 */
export default function ItemPicker({ value, onSelect, defaults }) {
  const project = useProject();
  const runSilently = project?.runSilently;
  const [families, setFamilies] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [familySlug, setFamilySlug] = useState('');
  const [sizeLookupId, setSizeLookupId] = useState('');
  const [vendorId, setVendorId] = useState('');

  const [loadingF, setLoadingF] = useState(true);
  const [loadingS, setLoadingS] = useState(false);
  const [loadingV, setLoadingV] = useState(false);

  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const valueRef = useRef(value);
  valueRef.current = value;

  // preselect the row's default material once, only while nothing is chosen
  const defaultKey = defaults ? `${defaults.family}|${defaults.size}|${defaults.vendor}` : '';
  const triedRef = useRef('');
  useEffect(() => {
    if (!defaultKey || !isEmptySel(value) || triedRef.current === defaultKey) return undefined;
    triedRef.current = defaultKey;
    let alive = true;
    resolveDefaultSelection(defaults).then((sel) => {
      if (!alive || !sel || !isEmptySel(valueRef.current)) return;
      const apply = () => onSelectRef.current?.(sel);
      if (runSilently) runSilently(apply); else apply();
    });
    return () => { alive = false; triedRef.current = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultKey, isEmptySel(value), runSilently]);

  // keep internal state in sync with the saved selection
  useEffect(() => {
    setFamilySlug(value?.family || '');
    setSizeLookupId(value?.sizeLookupId || '');
    setVendorId(value?.vendorId || '');
  }, [value?.family, value?.sizeLookupId, value?.vendorId]);

  useEffect(() => {
    let alive = true;
    getFamilies().then((f) => { if (alive) { setFamilies(f); setLoadingF(false); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (familySlug) {
      setLoadingS(true);
      getSizesForFamily(familySlug).then((s) => { if (alive) { setSizes(s); setLoadingS(false); } });
    } else {
      setSizes([]);
    }
    return () => { alive = false; };
  }, [familySlug]);

  useEffect(() => {
    let alive = true;
    const selectedSize = sizes.find((s) => s.value === sizeLookupId);
    if (selectedSize?.vendorIds) {
      setLoadingV(true);
      getVendorsForIds(selectedSize.vendorIds).then((v) => { if (alive) { setVendors(v); setLoadingV(false); } });
    } else {
      setVendors([]);
    }
    return () => { alive = false; };
  }, [sizeLookupId, sizes]);

  // Family and size are reported right away (without price) so quantities that
  // depend on the piece length — e.g. plates LF ÷ 8' or 10' — update immediately.
  const handleFamilyChange = (slug) => {
    if (slug === familySlug) return;
    setFamilySlug(slug); setSizeLookupId(''); setVendorId('');
    const f = families.find((x) => x.value === slug);
    onSelect({ family: slug, familyLabel: f?.label || '', item: null });
  };

  const handleSizeChange = (sid) => {
    if (sid === sizeLookupId) return;
    setSizeLookupId(sid); setVendorId('');
    const f = families.find((x) => x.value === familySlug);
    const sz = sizes.find((x) => x.value === sid);
    onSelect({ family: familySlug, familyLabel: f?.label || '', sizeLookupId: sid, sizeLabel: sz?.label || '', item: null });
  };

  // notify the parent only when family, size and vendor are all chosen
  const handleVendorChange = async (vid) => {
    setVendorId(vid);
    const f = families.find((x) => x.value === familySlug);
    const s = sizes.find((x) => x.value === sizeLookupId);
    if (!f || !s) return;
    const list = vendors.length > 0 ? vendors : await getVendorsForIds(s.vendorIds);
    const v = list.find((x) => x.value === vid);
    if (!v) return;
    const item = slimItem(await getFinalItem({ familyLabel: f.label, sizeLabel: s.label, vendorId: v.value }));
    onSelect({
      vendorId: v.value,
      vendorName: v.label,
      family: familySlug,
      familyLabel: f.label,
      sizeLookupId,
      sizeLabel: s.label,
      item,
    });
  };

  return (
    <div className="pk">
      <PortalSelect label="Family" placeholder="Family" value={familySlug} options={families} onChange={handleFamilyChange} loading={loadingF} />
      <PortalSelect label="Size" placeholder="Size" value={sizeLookupId} options={sizes} onChange={handleSizeChange} disabled={!familySlug} loading={loadingS} />
      <PortalSelect label="Vendor" placeholder="Vendor" value={vendorId} options={vendors} onChange={handleVendorChange} disabled={!sizeLookupId} loading={loadingV} />
    </div>
  );
}
