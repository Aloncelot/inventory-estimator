// src/components/Summary.jsx
"use client";
import { useMemo, useState, useEffect, useCallback, useEffectEvent } from "react";
import { useProject } from "@/context/ProjectContext";

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


export default function Summary({ 
  wallPanelsTotal = 0, 
  trussTotal = 0,
}) {
  const { projectData, updateProject } = useProject();
  const onDataChange = useEffectEvent(updateProject);

  const [form, setForm] = useState({
    projectName: "",
    address: "",
    drawingsDate: "",
    estimateDate: "",
  });

  useEffect(() => {
    if (!form.estimateDate) {
      const today = new Date();
      const iso = new Date(Date.UTC(
        today.getFullYear(), today.getMonth(), today.getDate()
      )).toISOString().slice(0,10);
      setForm(f => ({ ...f, estimateDate: iso }));
    }
  }, [form.estimateDate]);

  const summaryInfo = useMemo(() => {
    const defaults = { 
      projectName: projectData?.name || "", 
      address: "", 
      drawingsDate: "", 
      estimateDate: "" 
    };
    return { ...defaults, ...(projectData?.estimateData?.summaryInfo || {}) };
  }, [projectData]);

  const [localShipping, setLocalShipping] = useState(String(summaryInfo.shipping || 0));

  useEffect(() => {
    setLocalShipping(String(summaryInfo.shipping || 0));
  }, [summaryInfo.shipping]);

  
  // Handlers para el input de Shipping
  const handleShippingChange = (e) => {
    const parsedValue = parseFormattedNumber(e.target.value);
    if (/^\d*\.?\d*$/.test(parsedValue)) {
      setLocalShipping(parsedValue);
    }
  };

  const commitShippingChange = (value) => {
    const numericValue = Number(value) || 0;
    // Guardar en el context
    handleTaxSettingChange('shipping', numericValue);
    // Reformatear el estado local
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
  
  // 1. Subtotal (antes de impuestos)
  const subtotal = useMemo(() => {
     return wallPanelsTotal + trussTotal;
  }, [wallPanelsTotal, trussTotal]);

  // 2. Estado
  const effectiveState = useMemo(() => {
    if (summaryInfo.taxState) {
      return summaryInfo.taxState;
    }
    const parsed = parseStateFromAddress(summaryInfo.address);
    return parsed || 'NO TAX';
  }, [summaryInfo.taxState, summaryInfo.address]);

  // 3. Tasa
  const taxRate = useMemo(() => {
    if (summaryInfo.isTaxExempt) {
      return 0;
    }
    return TAX_RATES[effectiveState] || 0;
  }, [summaryInfo.isTaxExempt, effectiveState]);
  
  // 4. Monto de Impuesto
  const taxAmount = useMemo(() => {
    // El impuesto se calcula sobre el subtotal (Panels + Trusses)
    return subtotal * (taxRate / 100);
  }, [subtotal, taxRate]);
  
  // 5. Monto de Envío
  const shippingAmount = useMemo(() => {
    return Number(summaryInfo.shipping) || 0;
  }, [summaryInfo.shipping]);
  
  // 6. Gran Total
  const grandTotal = useMemo(() => {
    return subtotal + taxAmount + shippingAmount;
  }, [subtotal, taxAmount, shippingAmount]);

  return (
    <div className="ew-card">
      <h2 className="text-section-title" style={{ marginBottom: '16px' }}>Summary</h2>
      <div className="controls2">
        <label>
          <span>Project name</span>
          <input className="ew-input " name="projectName" value={summaryInfo.projectName} onChange={onChange} />
        </label>
        <label>
          <span>Address</span>
          <input className="ew-input" name="address" value={summaryInfo.address} onChange={onChange} />
        </label>
        <label>
          <span>Drawings date</span>
          <input className="ew-input" type="date" name="drawingsDate" value={summaryInfo.drawingsDate} onChange={onChange} />
        </label>
        <label>
          <span>Estimate date</span>
          <input className="ew-input" type="date" name="estimateDate" value={summaryInfo.estimateDate} onChange={onChange} />
        </label>
      </div> 
      
      <div className="sum-row">
        <div className="sum-label">Wall panels total</div>
        <div className="text-summary-subcategory">
          {/* Usar el prop 'wallPanelsTotal' */}
          {moneyFmt.format(Number(wallPanelsTotal || 0))}
        </div>
      </div>
      
      <div className="sum-row">
        <div className="sum-label">Trusses total</div>
        <div className="text-summary-subcategory">
          {/* Usar el prop 'trussTotal' */}
          {moneyFmt.format(Number(trussTotal || 0))}
        </div>
      </div>

     <div className="sum-row" style={{borderTop: '1px solid var(--border)'}}>
        <div className="sum-label" style={{fontWeight: 700}}>Subtotal</div>
        <div className="text-summary-subcategory" style={{fontWeight: 700, fontSize: '1.1rem'}}>
          {moneyFmt.format(subtotal)}
        </div>
      </div>
      
      {/* Fila de Impuestos */}
      <div className="sum-row" style={{alignItems: 'center'}}>
        <div className="sum-label" style={{ display: 'flex', alignItems: 'center', gap: '50px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none', whiteSpace:'nowrap' }}>
            <input
              type="checkbox"
              style={{ width: '18px', height: '18px' }}
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
              style={{maxWidth: '120px', padding: '2.5px 8px'}}
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
        
        <div className="text-summary-subcategory" style={{ fontSize: '1.1rem'}}>
          {moneyFmt.format(taxAmount)}
        </div>
      </div>
      
      {/* Fila de Envío */}
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
            style={{ width: '150px', textAlign: 'right', fontSize: '1rem', paddingTop:'0', paddingBottom:'0',}}
           />
        </div>
      </div>

      <div className="sum-row" style={{marginTop: '20px', paddingTop: '20px', borderTop: '2px solid var(--border)'}}>
        <div className="sum-label text-level-total" style={{fontSize: '1.25rem'}}>Grand Total</div>
        <div className="text-level-total" style={{fontSize: '1.25rem'}}>
          {moneyFmt.format(grandTotal)}
        </div>
      </div>
      
    </div>
  );
}