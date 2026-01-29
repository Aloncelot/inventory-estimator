// src/components/ItemPicker.jsx
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem } from '@/lib/catalog';
import { ChevronDown, Search, Check, Loader2 } from 'lucide-react';

const menuVariants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.15, ease: "easeIn" } }
};

function PortalSelect({ value, options, onChange, disabled, loading, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const handleOpen = () => {
    if (disabled || loading) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width });
    }
    setIsOpen(!isOpen);
    setSearchTerm('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !triggerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isOpen]);

  const filteredOptions = useMemo(() => (options || []).filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]);
  const selectedOption = options?.find(o => o.value === value);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button ref={triggerRef} type="button" onClick={handleOpen} disabled={disabled}
        className={`ew-input flex items-center justify-between w-full gap-2 transition-all ${isOpen ? 'ring-2 ring-turq-400' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ height: '32px', textAlign: 'left', fontSize: '0.8rem' }}>
        <span className="truncate">{loading ? 'Loading...' : (selectedOption?.label || placeholder)}</span>
        {loading ? <Loader2 size={12} className="animate-spin opacity-50" /> : <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'absolute', top: coords.top + 4, left: coords.left, width: Math.max(coords.width, 220), zIndex: 9999 }}>
          <motion.div ref={menuRef} variants={menuVariants} initial="hidden" animate="visible" exit="exit" className="ew-card shadow-2xl border border-white/10 overflow-hidden" style={{ background: 'var(--bg-800)', backdropFilter: 'blur(10px)' }}>
            <div className="p-2 border-b border-white/5 bg-white/5 flex items-center gap-2">
              <Search size={14} className="text-turq-400 opacity-70" />
              <input autoFocus className="bg-transparent border-none outline-none text-sm w-full" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
              {filteredOptions.length === 0 ? <div className="p-3 text-center text-xs opacity-50">No results</div> :
                filteredOptions.map(opt => (
                  <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); }}
                    className={`flex items-center justify-between p-2 text-xs rounded cursor-pointer hover:bg-white/5 ${value === opt.value ? 'text-turq-400 bg-turq-500/10' : ''}`}>
                    <span>{opt.label}</span>
                    {value === opt.value && <Check size={12} />}
                  </div>
                ))
              }
            </div>
          </motion.div>
        </div>, document.body
      )}
    </div>
  );
}

export default function ItemPicker({ value, onSelect, compact = false }) {
  const [families, setFamilies] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [familySlug, setFamilySlug] = useState('');
  const [sizeLookupId, setSizeLookupId] = useState('');
  const [vendorId, setVendorId] = useState('');

  const [loadingF, setLoadingF] = useState(true);
  const [loadingS, setLoadingS] = useState(false);
  const [loadingV, setLoadingV] = useState(false);

  // Sincronizar estados internos con el valor guardado
  useEffect(() => {
    if (value) {
      setFamilySlug(value.family || '');
      setSizeLookupId(value.sizeLookupId || '');
      setVendorId(value.vendorId || '');
    }
  }, [value]);

  // Carga inicial de familias
  useEffect(() => {
    getFamilies().then(f => { setFamilies(f); setLoadingF(false); });
  }, []);

  // Carga de tamaños cuando cambia la familia
  useEffect(() => {
    if (familySlug) {
      setLoadingS(true);
      getSizesForFamily(familySlug).then(s => { setSizes(s); setLoadingS(false); });
    } else { setSizes([]); }
  }, [familySlug]);

  // Carga de vendedores cuando cambia el tamaño
  useEffect(() => {
    const selectedSize = sizes.find(s => s.value === sizeLookupId);
    if (selectedSize?.vendorIds) {
      setLoadingV(true);
      getVendorsForIds(selectedSize.vendorIds).then(v => { setVendors(v); setLoadingV(false); });
    } else { setVendors([]); }
  }, [sizeLookupId, sizes]);

  const handleFamilyChange = (slug) => {
    if (slug === familySlug) return;
    setFamilySlug(slug); setSizeLookupId(''); setVendorId('');
  };

  const handleSizeChange = (sid) => {
    if (sid === sizeLookupId) return;
    setSizeLookupId(sid); setVendorId('');
  };

  // Notificar al padre solo cuando los 3 estén seleccionados
  const handleVendorChange = async (vid) => {
    setVendorId(vid);
    const f = families.find(f => f.value === familySlug);
    const s = sizes.find(s => s.value === sizeLookupId);
    const v = (vendors.length > 0 ? vendors : await getVendorsForIds(s.vendorIds)).find(v => v.value === vid);

    if (f && s && v) {
      const item = await getFinalItem({ familyLabel: f.label, sizeLabel: s.label, vendorId: v.value });
      onSelect({
        vendorId: v.value,
        vendorName: v.label,
        family: familySlug,
        familyLabel: f.label,
        sizeLookupId: sizeLookupId,
        item
      });
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? '1.2fr 1.2fr 1fr' : 'repeat(3, 1fr)', gap: 6, width: '100%' }}>
      <PortalSelect placeholder="Family..." value={familySlug} options={families} onChange={handleFamilyChange} loading={loadingF} />
      <PortalSelect placeholder="Size..." value={sizeLookupId} options={sizes} onChange={handleSizeChange} disabled={!familySlug} loading={loadingS} />
      <PortalSelect placeholder="Vendor..." value={vendorId} options={vendors} onChange={handleVendorChange} disabled={!sizeLookupId} loading={loadingV} />
    </div>
  );
}