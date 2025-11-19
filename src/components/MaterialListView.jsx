// src/components/MaterialListView.jsx
'use client';

import { useState, useEffect, useMemo } from "react";
import { 
  getFamilies, 
  getSizesForFamily, 
  getPricesForItem, 
  updateItemPrice, 
  createItemPrice, 
  createNewMaterial, 
  getAllVendors    
} from "@/lib/catalog"; 
import PriceEditModal from "./PriceEditModal";

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : "—");

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
    })();
  }, []);

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

  const handleFamilySelect = async (family) => {
    setSelectedFamily(family.value);
    setSelectedItem(null); 
    setPrices([]); 
    setLoadingItems(true); 
    setItems([]); 
    const familyItems = await getSizesForFamily(family.value);
    setItems(familyItems);
    setLoadingItems(false);
  };

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
    <div className="app-content">
      {/* Usamos la clase global para altura completa y alineación */}
      <div className="ew-card full-height-card">
        
        <div className="search-wrapper">
          <div className="search-cell">
            <input 
              type="text" 
              placeholder="Search Families..." 
              className="ew-input" 
              value={familySearch} 
              onChange={(e) => setFamilySearch(e.target.value)} 
            />
          </div>
          <div className="search-cell">
            <input 
              type="text" 
              placeholder="Search Items..." 
              className="ew-input" 
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
                  className="ew-btn ew-btn--turq ew-icon-btn" 
                  style={{ padding: '2px 2px', fontSize: '0.7rem' }}
                  onClick={handleAddGlobalClick}
                  title="Create New Family and Item"
                >
                   <img src="/icons/plus-sign.png" width={12} height={12} alt="Add Item" />
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
                  className="ew-btn ew-btn--turq ew-icon-btn" 
                  style={{ padding: '2px 2px', fontSize: '0.7rem' }}
                  onClick={handleAddItemClick}
                  title="Create a new item in this family"
                >
                   <img src="/icons/plus-sign.png" width={12} height={12} alt="Add Item" />
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
                  className="ew-btn ew-btn--turq" 
                  style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                  onClick={handleAddPriceClick}
                >
                  + Add Price
                </button>
              )}
            </div>

            <div className="material-scroll">
              {loadingPrices && <div style={{padding: 12}}>Loading...</div>}
              
              {!loadingPrices && prices.length > 0 && (
                <table className="tbl" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th className="num">Price</th>
                      <th>Unit</th>
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
                        <td>
                          {p.url ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="ew-link" title={p.url}>View</a>
                          ) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="ew-btn ew-icon-btn"
                            title="Edit Price"
                            onClick={() => handleEditClick(p)}
                          >
                            <img src="/icons/edit.png" width={16} height={16} alt="Edit" />
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