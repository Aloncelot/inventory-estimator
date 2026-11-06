// src/components/MaterialListView.jsx
'use client';

import { Plus, Pencil, Package, Copy, Warehouse, Check, X } from 'lucide-react';
import { getStockItem, listPriceReviews, resolvePriceReview } from '@/lib/inventory';
import { useAuth } from '@/AuthContext';
import { buyUnitLabel, ageDays, STALE_PRICE_DAYS } from '@/domain/purchase';
import { goTo, takeFocus } from '@/lib/nav';
import { onHand } from '@/domain/inventory';
import { useCompany } from '@/context/CompanyContext';
import { PageHeader } from '@/components/ui/mat';
import { useState, useEffect, useMemo } from "react";
import { 
  getFamilies, 
  getSizesForFamily, 
  getPricesForItem, 
  updateItemPrice, 
  createItemPrice, 
  createNewMaterial, 
  getAllVendors,
  copyStarterCatalog
} from "@/lib/catalog"; 
import PriceEditModal from "./PriceEditModal";
import { formatMoney } from "@/domain/lib/currency";

const fmt = (n) => (Number.isFinite(Number(n)) ? formatMoney(Number(n)) : "—");
const pctFmt = (v) => `${v > 0 ? '+' : ''}${v}%`;
const fmtDay = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** How the supplier sells it, for the prices table. */
function soldBy(p) {
  if (p.buyUnit === 'bundle') return `Bundle of ${p.pcsPerBundle || '?'}${p.buyPrice ? ` · ${fmt(p.buyPrice)}` : ''}`;
  if (p.buyUnit === 'mbf') return `MBF${p.buyPrice ? ` · ${fmt(p.buyPrice)}` : ''}`;
  return buyUnitLabel('each');
}

/**
 * Receipts where Warehouse paid a different price than the list: the
 * estimator takes the price paid as the supplier's new price, or ignores it.
 */
function PriceReviews({ reviews, onResolve, busy }) {
  if (!reviews?.length) return null;
  return (
    <div className="ew-card pl-review">
      <h3>{reviews.length} price change{reviews.length === 1 ? '' : 's'} to review</h3>
      <p className="ew-subtle">Warehouse paid a different price than the list on these receipts. Use the price paid as the supplier&apos;s new price, or ignore it if it was a one-off.</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Material</th><th>Supplier</th><th>Invoice</th>
            <th className="num">List</th><th className="num">Paid</th><th className="num">Change</th>
            <th>Received</th><th />
          </tr>
        </thead>
        <tbody>
          {reviews.map((m) => {
            const p = m.purchase || {};
            return (
              <tr key={m.id}>
                <td>{m.family} · {m.size}</td>
                <td>{p.vendorName || '—'}</td>
                <td className="ew-subtle">{p.buyQty} {p.buyUnit === 'bundle' ? `bundle${p.buyQty === 1 ? '' : 's'}` : p.buyUnit === 'mbf' ? 'MBF' : m.unit} · {fmt(p.totalPaid)}{m.ref ? ` · ${m.ref}` : ''}</td>
                <td className="num">{fmt(p.listPrice)}</td>
                <td className="num"><strong>{fmt(m.unitCost)}</strong></td>
                <td className={`num ${p.variancePct > 0 ? 'pl-up' : 'pl-down'}`}>{pctFmt(p.variancePct)}</td>
                <td className="ew-subtle">{fmtDay(m.at)} · {m.by?.name || m.by?.email || ''}</td>
                <td className="pl-review__acts">
                  <button type="button" className="ew-btn ew-btn--primary" disabled={busy} onClick={() => onResolve(m, true)} title="Use the price paid as the new list price"><Check size={12} /> Update price</button>
                  <button type="button" className="ew-btn ew-btn--ghost" disabled={busy} onClick={() => onResolve(m, false)} title="Keep the list price"><X size={12} /> Ignore</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ListColumn component using global classes
function ListColumn({ title, items, selectedValue, onSelect, loading, headerAction }) {
  return (
    <div className="material-col">
      <div className="ew-h3 material-header">
        <span>{title}</span>
        {headerAction}
      </div>
      
      <div className="material-scroll">
        {loading && <div style={{padding: 12}}>Loading...</div>}
        {!loading && items.length === 0 && <div style={{padding: 12, color: 'var(--text-300)', fontSize: '0.8rem'}}>No items.</div>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map(item => (
            <li key={item.value}>
              <button
                className={`material-list-btn ${item.value === selectedValue ? 'active' : ''}`}
                onClick={() => onSelect(item)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function MaterialListView() {
  const { company, companyId, perms } = useCompany();
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [stock, setStock] = useState(null);   // the selected material in the inventory
  // the company's own price list: Estimators and Admins change it, everyone sees it
  const canEdit = Boolean(perms?.canEditEstimate || perms?.isAdmin);
  const [copying, setCopying] = useState('');
  const [reload, setReload] = useState(0);
  const [families, setFamilies] = useState([]);
  const [items, setItems] = useState([]);
  const [prices, setPrices] = useState([]);
  const [allVendors, setAllVendors] = useState([]); 

  const [loadingFamilies, setLoadingFamilies] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isCreatingPrice, setIsCreatingPrice] = useState(false); 
  const [isCreatingItem, setIsCreatingItem] = useState(false); 

  const [familySearch, setFamilySearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingFamilies(true);
      const [fams, vendors] = await Promise.all([
        getFamilies(),
        getAllVendors() 
      ]);
      setFamilies(fams);
      setAllVendors(vendors);
      setLoadingFamilies(false);
      // opened from the inventory: show that material
      const f = takeFocus('items');
      if (f) {
        const fam = fams.find((x) => x.label === f.family);
        if (fam) {
          const its = await selectFamily(fam);
          const it = its.find((x) => x.value === f.itemKey);
          if (it) handleItemSelect(it);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // how much of the selected material the company has (when it keeps inventory)
  useEffect(() => {
    setStock(null);
    if (!selectedItem || !companyId || !company?.inventoryEnabled) return;
    let alive = true;
    getStockItem(companyId, selectedItem.value).then((s) => { if (alive) setStock(s || { qty: {} }); }).catch(() => {});
    return () => { alive = false; };
  }, [selectedItem, companyId, company?.inventoryEnabled]);

  // price changes seen on receipts (only where the company keeps inventory)
  useEffect(() => {
    if (!canEdit || !companyId || !company?.inventoryEnabled) { setReviews([]); return; }
    listPriceReviews(companyId).then(setReviews).catch((e) => console.warn('Price reviews not read:', e));
  }, [canEdit, companyId, company?.inventoryEnabled, reload]);

  const resolveReview = async (m, accept) => {
    setReviewBusy(true);
    try {
      await resolvePriceReview(companyId, m, accept, user);
      setReviews((list) => list.filter((x) => x.id !== m.id));
      setCopying(accept ? `${m.purchase?.vendorName}: ${m.family} ${m.size} is now ${fmt(m.unitCost)}.` : 'Ignored; the list price stays.');
      if (accept && selectedItem?.value === m.itemKey) {
        setPrices(await getPricesForItem(selectedItem.fullItemData));
      }
    } catch (e) { setCopying(`Could not save: ${e?.message || e}`); } finally { setReviewBusy(false); }
  };

  const copyStarter = async () => {
    setCopying('Copying the starter price list…');
    try {
      const c = await copyStarterCatalog({ onProgress: (x) => setCopying(`Copying the starter price list… ${x.prices} prices`) });
      setCopying(`Copied ${c.families} families, ${c.items} sizes, ${c.suppliers} suppliers and ${c.prices} prices.`);
      setReload((r) => r + 1);
    } catch (e) { setCopying(`Could not copy: ${e?.message || e}`); }
  };

  const filteredFamilies = useMemo(() => {
    const query = familySearch.toLowerCase();
    if (!query) return families;
    return families.filter(f => f.label.toLowerCase().includes(query));
  }, [families, familySearch]);

  const filteredItems = useMemo(() => {
    const query = itemSearch.toLowerCase();
    if (!query) return items;
    return items.filter(i => i.label.toLowerCase().includes(query));
  }, [items, itemSearch]);

  const selectFamily = async (family) => {
    setSelectedFamily(family.value);
    setSelectedItem(null); 
    setPrices([]); 
    setLoadingItems(true); 
    setItems([]); 
    const familyItems = await getSizesForFamily(family.value);
    setItems(familyItems);
    setLoadingItems(false);
    return familyItems;
  };
  const handleFamilySelect = (family) => { selectFamily(family); };

  const handleItemSelect = async (item) => {
    setSelectedItem(item); 
    setLoadingPrices(true);
    setPrices([]); 
    const itemPrices = await getPricesForItem(item.fullItemData); 
    setPrices(itemPrices);
    setLoadingPrices(false);
  };

  const handleEditClick = (priceItem) => {
    setEditingItem(priceItem);
    setIsCreatingPrice(false);
    setIsCreatingItem(false);
    setIsModalOpen(true);
  };

  const handleAddPriceClick = () => {
    if (!selectedItem) return;
    const skeletonItem = {
      familyDisplay: selectedItem.fullItemData.familyDisplay,
      sizeDisplay: selectedItem.fullItemData.sizeDisplay,
    };
    setEditingItem(skeletonItem);
    setIsCreatingPrice(true);
    setIsCreatingItem(false);
    setIsModalOpen(true);
  };

  const handleAddItemClick = () => {
    if (!selectedFamily) return;
    const familyObj = families.find(f => f.value === selectedFamily);
    const skeletonItem = {
      familyDisplay: familyObj ? familyObj.label : 'Unknown Family',
      sizeDisplay: '', 
    };
    setEditingItem(skeletonItem);
    setIsCreatingPrice(false); 
    setIsCreatingItem(true);  
    setIsModalOpen(true);
  };

  const handleAddGlobalClick = () => {
    const skeletonItem = {
      familyDisplay: '', 
      sizeDisplay: '',
    };
    setEditingItem(skeletonItem);
    setIsCreatingPrice(false); 
    setIsCreatingItem(true);
    setIsModalOpen(true);
  }

  const handleSavePrice = async (updatedItem) => {
    if (isCreatingItem) {
      await createNewMaterial(updatedItem);
      if (updatedItem.isNewFamily) {
          const newFams = await getFamilies();
          setFamilies(newFams);
      }
      if (updatedItem.isNewVendor) {
         const vendors = await getAllVendors();
         setAllVendors(vendors);
      }
      const famSlug = updatedItem.familySlug || families.find(f => f.label === updatedItem.familyDisplay)?.value;
      if (selectedFamily === famSlug || updatedItem.isNewFamily) {
         if (selectedFamily === famSlug) {
             setLoadingItems(true);
             const familyItems = await getSizesForFamily(selectedFamily);
             setItems(familyItems);
             setLoadingItems(false);
         }
      }
    } else if (isCreatingPrice) {
      await createItemPrice(updatedItem);
      if (updatedItem.isNewVendor) {
         const vendors = await getAllVendors();
         setAllVendors(vendors);
      }
      setLoadingPrices(true);
      const newPrices = await getPricesForItem(selectedItem.fullItemData);
      setPrices(newPrices);
      setLoadingPrices(false);
    } else {
      await updateItemPrice(updatedItem);
      setLoadingPrices(true);
      const newPrices = await getPricesForItem(selectedItem.fullItemData);
      setPrices(newPrices);
      setLoadingPrices(false);
    }
  };

  return (
    <div className={`app-content${canEdit ? '' : ' is-readonly'}`}>
      <PageHeader icon={Package} title="Price list" meta={`${company?.name ? `${company.name}: ` : ''}families, sizes and supplier prices`} />
      {!canEdit ? <p className="ew-subtle">View only: the price list is changed by Estimators and Admins.</p> : null}
      {!loadingFamilies && families.length === 0 ? (
        <div className="ew-card inv-empty">
          <p>Your company&apos;s price list is empty. Each company keeps its own materials, suppliers and prices.{canEdit ? ' Start from a copy of the starter list and edit it, or add materials one by one.' : ''}</p>
          {canEdit ? <button type="button" className="ew-btn" onClick={copyStarter} disabled={copying.startsWith('Copying')}><Copy size={13} /> Copy the starter price list</button> : null}
        </div>
      ) : null}
      {copying ? <p className="team-msg">{copying}</p> : null}
      <PriceReviews reviews={reviews} onResolve={resolveReview} busy={reviewBusy} />
      <div className="ew-card full-height-card">
        
        <div className="search-wrapper">
          <div className="search-cell">
            <input 
              type="text" 
              placeholder="Search families" 
              className="ew-input ro-ok" 
              value={familySearch} 
              onChange={(e) => setFamilySearch(e.target.value)} 
            />
          </div>
          <div className="search-cell">
            <input 
              type="text" 
              placeholder="Search items" 
              className="ew-input ro-ok" 
              value={itemSearch} 
              onChange={(e) => setItemSearch(e.target.value)} 
            />
          </div>
          <div className="search-cell" style={{borderRight: 'none'}}></div>
        </div>

        <div className="material-view">
          
          {/* Column 1: Families */}
          <ListColumn
            title="Families"
            items={filteredFamilies}
            selectedValue={selectedFamily}
            onSelect={handleFamilySelect}
            loading={loadingFamilies}
            headerAction={
                <button 
                  className="ew-icon-btn ro-hide"
                  onClick={handleAddGlobalClick}
                  title="Create New Family and Item"
                >
                   <Plus size={12} aria-hidden="true" />
                </button>
            }
          />

          {/* Column 2: Items & Sizes */}
          <ListColumn
            title="Items & Sizes"
            items={filteredItems}
            selectedValue={selectedItem?.value} 
            onSelect={handleItemSelect}
            loading={loadingItems}
            headerAction={
              selectedFamily && (
                <button 
                  className="ew-icon-btn ro-hide"
                  onClick={handleAddItemClick}
                  title="Create a new item in this family"
                >
                   <Plus size={12} aria-hidden="true" />
                </button>
              )
            }
          />
          
          {/* Column 3: Prices */}
          <div className="material-col">
            <div className="ew-h3 material-header">
              <span>Prices</span>
              {selectedItem && (
                <button 
                  className="ew-btn ro-hide"
                  onClick={handleAddPriceClick}
                >
                  <Plus size={12} aria-hidden="true" /> Add price
                </button>
              )}
            </div>

            {selectedItem && company?.inventoryEnabled ? (
              <div className="pl-stock">
                <Warehouse size={13} aria-hidden="true" />
                {stock === null ? <span className="ew-subtle">Checking the inventory…</span> : (
                  <span>
                    <strong>{onHand(stock).toLocaleString('en-US')}</strong> {stock.unit || selectedItem.fullItemData?.unit || ''} in stock
                    {(company.warehouses || []).length > 1 && onHand(stock) > 0 ? (
                      <span className="ew-subtle"> · {(company.warehouses || []).filter((w) => onHand(stock, w.id) > 0).map((w) => `${w.name} ${onHand(stock, w.id)}`).join(' · ')}</span>
                    ) : null}
                    {stock.avgCost ? <span className="ew-subtle"> · avg cost {fmt(stock.avgCost)}</span> : null}
                  </span>
                )}
                <button type="button" className="ew-link pl-stock__go" onClick={() => goTo('inventory', { itemKey: selectedItem.value })}>Open in Inventory</button>
              </div>
            ) : null}

            <div className="material-scroll">
              {loadingPrices && <div style={{padding: 12}}>Loading...</div>}
              
              {!loadingPrices && prices.length > 0 && (
                <table className="tbl" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th className="num">Price</th>
                      <th>Unit</th>
                      <th>Sold by</th>
                      <th title={`Prices older than ${STALE_PRICE_DAYS} days show as old`}>Updated</th>
                      <th>Link</th>
                      <th></th> 
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map(p => (
                      <tr key={p.vendorName}>
                        <td>{p.vendorName}</td>
                        <td className="num">{fmt(p.basePrice)}</td>
                        <td>{p.unit}</td>
                        <td className="ew-subtle">{soldBy(p)}</td>
                        <td>
                          {(() => {
                            const d = ageDays(p.updatedAt);
                            if (d == null) return '—';
                            const old = d > STALE_PRICE_DAYS;
                            return <span className={old ? 'pl-old' : 'ew-subtle'} title={fmtDay(p.updatedAt)}>{d === 0 ? 'today' : `${d}d ago`}{old ? ' · old' : ''}</span>;
                          })()}
                        </td>
                        <td>
                          {p.url ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="ew-link" title={p.url}>View</a>
                          ) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="ew-btn ew-icon-btn ro-hide"
                            title="Edit Price"
                            onClick={() => handleEditClick(p)}
                          >
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              
              {!loadingPrices && !selectedItem && (
                <div style={{ padding: 12, color: 'var(--text-300)', fontSize: '0.8rem' }}>
                  Select an item to see prices.
                </div>
              )}
              
              {!loadingPrices && selectedItem && prices.length === 0 && (
                <div style={{ padding: 12, color: 'var(--text-300)', fontSize: '0.8rem' }}>
                  No prices found for this item. <br/> Click "+ Add Price" to create one.
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
      
      {isModalOpen && (
        <PriceEditModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSavePrice}
          item={editingItem}
          isCreating={isCreatingPrice} 
          isCreatingItem={isCreatingItem} 
          vendorsList={allVendors}     
          familiesList={families} 
        />
      )}

    </div>
  );
}