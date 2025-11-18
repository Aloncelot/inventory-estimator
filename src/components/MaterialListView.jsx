// src/components/MaterialListView.jsx
'use client';

import { useState, useEffect, useMemo } from "react";
// Import all necessary functions from catalog
import { getFamilies, getSizesForFamily, getPricesForItem, updateItemPrice } from "@/lib/catalog"; 
import PriceEditModal from "./PriceEditModal"; // <-- NEW: Import the modal

// Helper for formatting money
const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : "—");

// ListColumn component (no changes)
function ListColumn({ title, items, selectedValue, onSelect, loading, scrollable = false }) {
  return (
    <div 
      className="material-col" 
      style={{ 
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, 
      }}
    >
      <h3 
        className="ew-h3" 
        style={{ 
          padding: '8px 12px', 
          background: 'var(--bg-750)', 
          margin: 0,
          position: 'sticky',
          top: 0,
          zIndex: 1,
          flexShrink: 0, 
        }}
      >
        {title}
      </h3>
      
      <div className="col-scroll-area">
        {loading && <div style={{padding: 12}}>Loading...</div>}
        {!loading && items.length === 0 && <div style={{padding: 12, color: 'var(--text-300)', fontSize: '0.8rem'}}>No items.</div>}
        <ul>
          {items.map(item => (
            <li key={item.value}>
              <button
                className={item.value === selectedValue ? 'active' : ''}
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
  // Column Data
  const [families, setFamilies] = useState([]);
  const [items, setItems] = useState([]);
  const [prices, setPrices] = useState([]);

  // Loading States
  const [loadingFamilies, setLoadingFamilies] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  
  // Selection States
  const [selectedFamily, setSelectedFamily] = useState(null);
  // MODIFIED: Store the full item object, not just the ID
  const [selectedItem, setSelectedItem] = useState(null); 

  // --- NEW: Modal State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  // ---

  // Search States
  const [familySearch, setFamilySearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  // Load families on mount
  useEffect(() => {
    (async () => {
      setLoadingFamilies(true);
      const fams = await getFamilies();
      setFamilies(fams);
      setLoadingFamilies(false);
    })();
  }, []);

  // Filtered Lists
  const filteredFamilies = useMemo(() => {
    const query = familySearch.toLowerCase();
    if (!query) return families;
    return families.filter(f => 
      f.label.toLowerCase().includes(query)
    );
  }, [families, familySearch]);

  const filteredItems = useMemo(() => {
    const query = itemSearch.toLowerCase();
    if (!query) return items;
    return items.filter(i => 
      i.label.toLowerCase().includes(query)
    );
  }, [items, itemSearch]);

  // Handler for family selection (Loads items)
  const handleFamilySelect = async (family) => {
    if (selectedFamily === family.value) return; 

    setSelectedFamily(family.value);
    setSelectedItem(null); 
    setPrices([]); 
    setLoadingItems(true); 
    setItems([]); 

    const familyItems = await getSizesForFamily(family.value);
    setItems(familyItems);
    setLoadingItems(false);
  };

  // Handler for item selection (Loads prices)
  const handleItemSelect = async (item) => {
    if (selectedItem?.value === item.value) return; 

    setSelectedItem(item); // Store the full item object
    setLoadingPrices(true);
    setPrices([]); 

    const itemPrices = await getPricesForItem(item.fullItemData); 
    setPrices(itemPrices);
    setLoadingPrices(false);
  };

  // --- NEW: Modal Handlers ---
  const handleEditClick = (priceItem) => {
    setEditingItem(priceItem);
    setIsModalOpen(true);
  };

  const handleSavePrice = async (updatedItem) => {
    // onSave prop from the modal calls this function
    await updateItemPrice(updatedItem);
    
    // Refresh the prices list to show the new data
    setLoadingPrices(true);
    // 'selectedItem' is the full item object, so fullItemData is available
    const newPrices = await getPricesForItem(selectedItem.fullItemData);
    setPrices(newPrices);
    setLoadingPrices(false);
  };
  // ---

  return (
    <div className="app-content">
      <style jsx>{`
        .material-view {
          display: grid;
          grid-template-columns: 250px 250px 1fr; 
          height: calc(100dvh - 240px);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }

        .material-col {
          display: flex;
          flex-direction: column;
          min-height: 0; 
          border-right: 1px solid var(--border);
        }
        
        .material-col:last-child {
          border-right: none;
        }

        .col-header {
          padding: 8px 12px; 
          background: var(--bg-750); 
          margin: 0;
          position: sticky;
          top: 0;
          z-index: 1;
          flex-shrink: 0;
          border-bottom: 1px solid var(--border);
        }

        .col-scroll-area {
          flex: 1;
          overflow-y: auto;
        }
        
        ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        li button {
          display: block;
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border);
          color: var(--text-300);
          cursor: pointer;
          
          padding: 8px 12px;
          font-size: 0.8rem;
        }
        li button:hover {
          background: var(--bg-700);
        }
        li button.active {
          background: var(--turq-500);
          color: white;
          font-weight: 700;
        }

        .ew-link {
          color: var(--turq-200);
          text-decoration: underline;
        }
        .ew-link:hover {
          color: var(--turq-300);
        }

        .search-wrapper {
          display: grid;
          grid-template-columns: 250px 250px 1fr;
          border: 1px solid var(--border);
          border-bottom: none; 
          border-top-left-radius: 12px;
          border-top-right-radius: 12px;
          background: var(--bg-800);
        }
        .search-bar {
          padding: 10px;
          border-right: 1px solid var(--border);
        }
        .search-input {
          width: 100%;
          padding: 8px 10px;
          background: var(--input-bg);
          color: var(--text-100);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.9rem;
          outline: none;
        }
        .search-input:focus {
          border-color: var(--turq-400);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-color) 25%, transparent);
        }
      `}</style>
      
      <div 
        className="ew-card" 
        style={{ 
          padding: 0, 
          overflow: 'hidden',
        }}
      >
        <div className="search-wrapper">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search Families..."
              className="search-input"
              value={familySearch}
              onChange={(e) => setFamilySearch(e.target.value)}
            />
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search Items..."
              className="search-input"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
          </div>
          <div className="search-bar" style={{borderRight: 'none'}}>
          </div>
        </div>


        <div className="material-view">
          
          <div className="material-col">
            <h3 className="ew-h3 col-header">
              Families
            </h3>
            <div className="col-scroll-area">
              {loadingFamilies && <div style={{padding: 12}}>Loading...</div>}
              <ul>
                {filteredFamilies.map(item => (
                  <li key={item.value}>
                    <button
                      className={item.value === selectedFamily ? 'active' : ''}
                      onClick={() => handleFamilySelect(item)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="material-col">
            <h3 className="ew-h3 col-header">
              Items & Sizes
            </h3>
            <div className="col-scroll-area">
              {loadingItems && <div style={{padding: 12}}>Loading...</div>}
              {!loadingItems && filteredItems.length === 0 && (
                <div style={{padding: 12, color: 'var(--text-300)', fontSize: '0.8rem'}}>
                  {selectedFamily ? 'No items found.' : 'Select a family to see items.'}
                </div>
              )}
              <ul>
                {filteredItems.map(item => (
                  <li key={item.value}>
                    <button
                      // MODIFIED: Use selectedItem.value
                      className={item.value === selectedItem?.value ? 'active' : ''}
                      onClick={() => handleItemSelect(item)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="material-col">
            <h3 className="ew-h3 col-header">
              Prices
            </h3>
            <div className="col-scroll-area">
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
                            <a 
                              href={p.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="ew-link"
                              title={p.url}
                            >
                              View
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        {/* --- NEW: Edit Button Cell --- */}
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
                        {/* --- End Edit Button Cell --- */}
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
                  No prices found for this item.
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
      
      {/* --- NEW: Render the Modal --- */}
      {isModalOpen && (
        <PriceEditModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSavePrice}
          item={editingItem}
        />
      )}
      {/* --- End Modal --- */}

    </div>
  );
}