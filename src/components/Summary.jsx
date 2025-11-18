// src/components/Summary.jsx
"use client";
import { useMemo, useState, useEffect, useCallback, useEffectEvent } from "react";
import { useProject } from "@/context/ProjectContext";

// --- (Helpers: TAX_RATES, parseStateFromAddress, format/parse number... no change) ---
const TAX_RATES = {
  'MA': 6.25,
  'RI': 7.0,
  'CT': 6.35,
  'ME': 5.5,
  'NH': 0.0,
  'NO TAX': 0.0,
};
const parseStateFromAddress = (address) => {
  if (!address) return null;
  const match = address.match(/\b([A-Z]{2})\b(?=.*$|\s+\d{5})?/g);
  if (!match) return null;
  const potentialState = match[match.length - 1];
  if (Object.keys(TAX_RATES).includes(potentialState)) {
    return potentialState;
  }
  return null;
};
const parseFormattedNumber = (value) => {
  return String(value).replace(/,/g, '');
};
const formatNumberString = (numStr) => {
  if (numStr === '' || numStr === '-') return '';
  if (numStr === '.') return '0.';
  const [integer, decimal] = String(numStr).split('.');
  const formattedInteger = new Intl.NumberFormat('en-US').format(
    Number(integer.replace(/[^0-9-]/g, '') || 0)
  );
  if (decimal !== undefined) {
    return `${formattedInteger}.${decimal}`;
  }
  if (String(numStr).endsWith('.')) {
    return `${formattedInteger}.`;
  }
  return formattedInteger;
};
// ---


export default function Summary({ 
  wallPanelsTotal = 0, 
  trussTotal = 0,
}) {
  const { projectData, updateProject, refreshProjectPrices, isSaving } = useProject();
  const onDataChange = useEffectEvent(updateProject);

  const summaryInfo = useMemo(() => {
    return projectData?.estimateData?.summaryInfo || {};
  }, [projectData]);
  
  const snapshotTotals = useMemo(() => {
    return projectData?.estimateData?.snapshotTotals || null;
  }, [projectData]);

  const [localShipping, setLocalShipping] = useState(String(summaryInfo.shipping || 0));
  useEffect(() => {
    // Ensure state updates if summaryInfo.shipping changes (e.g., on project load)
    setLocalShipping(String(summaryInfo.shipping || 0));
  }, [summaryInfo.shipping]);

  
  const handleShippingChange = (e) => {
    const parsedValue = parseFormattedNumber(e.target.value);
    if (/^\d*\.?\d*$/.test(parsedValue)) {
      setLocalShipping(parsedValue);
    }
  };
  const commitShippingChange = (value) => {
    const numericValue = Number(value) || 0;
    handleTaxSettingChange('shipping', numericValue);
    setLocalShipping(String(numericValue));
  };
  const handleShippingBlur = () => {
    commitShippingChange(localShipping);
  };
  const handleShippingKeyDown = (e) => {
    if (e.key === 'Enter') {
        commitShippingChange(localShipping);
        e.target.blur();
    }
    if (e.key === 'Escape') {
        setLocalShipping(String(summaryInfo.shipping || 0));
        e.target.blur();
    }
  };

  useEffect(() => {
    if (!projectData) return;
    const info = projectData.estimateData?.summaryInfo || {};
    const rootName = projectData.name || "";
    const today = new Date();
    const isoDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0,10);
    const needsDate = !info.estimateDate;
    const needsName = !info.projectName && rootName;

    if (needsDate || needsName) {
      onDataChange(prevEstimate => {
        const currentSummary = prevEstimate.summaryInfo || {};
        return {
          ...prevEstimate,
          summaryInfo: {
            ...currentSummary,
            estimateDate: needsDate ? isoDate : currentSummary.estimateDate,
            projectName: needsName ? rootName : currentSummary.projectName,
          }
        };
      });
    }
  }, [projectData, onDataChange]);

  const moneyFmt = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }),
    []
  );

  const onChange = useCallback((e) => {
    const { name, value } = e.target;
    updateProject(prevEstimate => ({
        ...prevEstimate,
        summaryInfo: {
            ...(prevEstimate.summaryInfo || {}),
            [name]: value,
        }
    }));
  }, [updateProject]);

  const handleTaxSettingChange = useCallback((key, value) => {
    updateProject(prevEstimate => ({
      ...prevEstimate,
      summaryInfo: {
        ...(prevEstimate.summaryInfo || {}),
        [key]: value
      }
    }));
  }, [updateProject]);
  
  const currentSubtotal = useMemo(() => {
     return wallPanelsTotal + trussTotal;
  }, [wallPanelsTotal, trussTotal]);

  const effectiveState = useMemo(() => {
    if (summaryInfo.taxState) {
      return summaryInfo.taxState;
    }
    const parsed = parseStateFromAddress(summaryInfo.address);
    return parsed || 'NO TAX';
  }, [summaryInfo.taxState, summaryInfo.address]);

  const taxRate = useMemo(() => {
    if (summaryInfo.isTaxExempt) {
      return 0;
    }
    return TAX_RATES[effectiveState] || 0;
  }, [summaryInfo.isTaxExempt, effectiveState]);
  
  const currentTaxAmount = useMemo(() => {
    return currentSubtotal * (taxRate / 100);
  }, [currentSubtotal, taxRate]);
  
  const currentShippingAmount = useMemo(() => {
    return Number(summaryInfo.shipping) || 0;
  }, [summaryInfo.shipping]);
  
  const currentGrandTotal = useMemo(() => {
    return currentSubtotal + currentTaxAmount + currentShippingAmount;
  }, [currentSubtotal, currentTaxAmount, currentShippingAmount]);

  const handleLockTotals = () => {
    if (window.confirm("Are you sure you want to lock these totals as the 'Original Quote'? This will be used for comparison.")) {
      const totalsToLock = {
        wallPanelsTotal: wallPanelsTotal,
        trussTotal: trussTotal,
        subtotal: currentSubtotal,
        taxAmount: currentTaxAmount,
        shippingAmount: currentShippingAmount,
        grandTotal: currentGrandTotal,
        lockedAt: new Date().toISOString()
      };
      updateProject(prev => ({
        ...prev,
        estimateData: {
          ...prev.estimateData,
          snapshotTotals: totalsToLock
        }
      }));
    }
  };

  const handleClearSnapshot = () => {
    if (window.confirm("Are you sure you want to clear the 'Original Quote' snapshot?")) {
      updateProject(prev => ({
        ...prev,
        estimateData: {
          ...prev.estimateData,
          snapshotTotals: null
        }
      }));
    }
  };

  const handleRefreshPrices = () => {
    if (window.confirm("This will fetch the latest prices for all items in this project from the database. Are you sure?")) {
      refreshProjectPrices();
    }
  };

  const renderComparisonRow = (label, originalValue, currentValue) => {
    const diff = currentValue - originalValue;
    let diffStyle = { color: 'var(--text-300)' };
    if (diff > 0) diffStyle = { color: '#f87171' }; // Red
    if (diff < 0) diffStyle = { color: '#4ade80' }; // Green
    
    return (
      <tr>
        <td>{label}</td>
        <td className="num">{moneyFmt.format(originalValue)}</td>
        <td className="num">{moneyFmt.format(currentValue)}</td>
        <td className="num" style={diffStyle}>
          {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${moneyFmt.format(diff)}`}
        </td>
      </tr>
    );
  };

  return (
    <div className="app-content">
      <h2 className="text-section-title" style={{ marginBottom: '16px' }}>Summary</h2>
      
      <div className="ew-card">
        <div className="controls2">
          <label>
            <span>Project name</span>
            {/* --- CORRECTION: Added || '' --- */}
            <input className="ew-input" name="projectName" value={summaryInfo.projectName || ''} onChange={onChange} />
          </label>
          <label>
            <span>Address</span>
            {/* --- CORRECTION: Added || '' --- */}
            <input className="ew-input" name="address" value={summaryInfo.address || ''} onChange={onChange} />
          </label>
          <label>
            <span>Drawings date</span>
            {/* --- CORRECCIÓN: Added || '' --- */}
            <input className="ew-input" type="date" name="drawingsDate" value={summaryInfo.drawingsDate || ''} onChange={onChange} />
          </label>
          <label>
            <span>Estimate date</span>
            {/* --- CORRECCIÓN: Added || '' --- */}
            <input className="ew-input" type="date" name="estimateDate" value={summaryInfo.estimateDate || ''} onChange={onChange} />
          </label>
        </div>
      </div> 

      <div className="ew-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <button 
            className="ew-btn" 
            onClick={handleRefreshPrices} 
            disabled={isSaving}
            title="Fetch latest prices from database for all items"
          >
            {isSaving ? 'Refreshing...' : 'Refresh Latest Prices'}
          </button>
        </div>
        <div>
          {snapshotTotals ? (
            <button 
              className="ew-btn"
              onClick={handleClearSnapshot}
              title="Clear the saved 'Original Quote' to set a new one"
            >
              Clear Original Quote
            </button>
          ) : (
            <button 
              className="ew-btn ew-btn--turq" 
              onClick={handleLockTotals}
              title="Save the current totals as the 'Original Quote' for comparison"
            >
              Lock Original Totals
            </button>
          )}
        </div>
      </div>
      
      <div className="ew-card">
        
        {!snapshotTotals && (
          <>
            <div className="sum-row">
              <div className="sum-label">Wall panels total</div>
              <div className="text-summary-subcategory">
                {moneyFmt.format(wallPanelsTotal)}
              </div>
            </div>
            
            <div className="sum-row">
              <div className="sum-label">Trusses total</div>
              <div className="text-summary-subcategory">
                {moneyFmt.format(trussTotal)}
              </div>
            </div>
            
            <div className="sum-row" style={{borderTop: '1px solid var(--border)'}}>
              <div className="sum-label" style={{fontWeight: 700}}>Subtotal</div>
              <div className="text-summary-subcategory" style={{fontWeight: 700, fontSize: '1.1rem'}}>
                {moneyFmt.format(currentSubtotal)}
              </div>
            </div>
            
            <div className="sum-row" style={{alignItems: 'center'}}>
              <div className="sum-label" style={{ display: 'flex', alignItems: 'center', gap: '50px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none', fontSize:'12px', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    style={{ width: '20px', height: '20px' }}
                    checked={summaryInfo.isTaxExempt || false}
                    onChange={(e) => handleTaxSettingChange('isTaxExempt', e.target.checked)}
                  />
                  <span>Tax Exempt</span>
                </label>
                
                {!summaryInfo.isTaxExempt && (
                  <select
                    className="ew-select focus-anim"
                    value={effectiveState}
                    onChange={(e) => handleTaxSettingChange('taxState', e.target.value)}
                    title="Select tax state (auto-detected from address)"
                    style={{maxWidth: '120px', padding: '4px 8px'}}
                  >
                    {Object.keys(TAX_RATES).map(stateAbbr => (
                      <option key={stateAbbr} value={stateAbbr}>
                        {stateAbbr}
                      </option>
                    ))}
                  </select>
                )}
                
                {!summaryInfo.isTaxExempt && (
                  <span className="text-summary-subcategory" style={{color: '#fc8600ff',}}><i>
                    ({taxRate.toFixed(2)}%)
                  </i>
                  </span>
                )}
              </div>
              <div className="text-summary-subcategory" style={{fontWeight: 700, fontSize: '1.1rem'}}>
                {moneyFmt.format(currentTaxAmount)}
              </div>
            </div>
            
            <div className="sum-row" style={{alignItems: 'flex-end'}}>
              <div className="sum-label">Shipping</div>
              <div className="ew-inline" style={{justifyContent: 'flex-end'}}>
                 <span className="ew-subtle" style={{fontSize: '1.1rem', color: 'var(--text-300)'}}>$</span>
                 <input
                  type="text"
                  inputMode="decimal"
                  className="ew-input focus-anim"
                  value={formatNumberString(localShipping)}
                  onChange={handleShippingChange}
                  onBlur={handleShippingBlur}
                  onKeyDown={handleShippingKeyDown}
                  placeholder="0.00"
                  style={{ width: '150px', textAlign: 'right', fontSize: '1rem', paddingTop: '2px', paddingBottom: '2px' }}
                 />
              </div>
            </div>

            <div className="sum-row" style={{marginTop: '20px', paddingTop: '20px', borderTop: '2px solid var(--border)'}}>
              <div className="sum-label text-level-total" style={{fontSize: '1.25rem'}}>Grand Total</div>
              <div className="text-level-total" style={{fontSize: '1.25rem'}}>
                {moneyFmt.format(currentGrandTotal)}
              </div>
            </div>
          </>
        )}
        
        {snapshotTotals && (
          <table className="tbl" style={{ width: '100%', marginTop: '12px' }}>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Original Quote ({new Date(snapshotTotals.lockedAt).toLocaleDateString()})</th>
                <th className="num">Current Quote</th>
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {renderComparisonRow('Wall Panels', snapshotTotals.wallPanelsTotal, wallPanelsTotal)}
              {renderComparisonRow('Trusses', snapshotTotals.trussTotal, trussTotal)}
            </tbody>
            <tfoot>
              {renderComparisonRow('Subtotal', snapshotTotals.subtotal, currentSubtotal)}
              {renderComparisonRow(`Tax (${taxRate.toFixed(2)}%)`, snapshotTotals.taxAmount, currentTaxAmount)}
              {renderComparisonRow('Shipping', snapshotTotals.shippingAmount, currentShippingAmount)}
              
              <tr style={{borderTop: '2px solid var(--border)'}}>
                <td style={{fontSize: '1.1rem'}}><b>Grand Total</b></td>
                <td className="num" style={{fontSize: '1.1rem'}}><b>{moneyFmt.format(snapshotTotals.grandTotal)}</b></td>
                <td className="num" style={{fontSize: '1.1rem'}}><b>{moneyFmt.format(currentGrandTotal)}</b></td>
                <td className="num" style={{fontSize: '1.1rem'}}>
                  <b>
                    {moneyFmt.format(currentGrandTotal - snapshotTotals.grandTotal)}
                  </b>
                </td>
              </tr>
            </tfoot>
          </table>
        )}

      </div>
    </div>
  );
}