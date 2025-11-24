// src/components/PriceEditModal.jsx
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Helper component using global classes
function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <Label className="info-label">{label}</Label>
      <div className="info-value">{value}</div>
    </div>
  );
}

export default function PriceEditModal({ 
  isOpen, 
  onClose, 
  onSave, 
  item, 
  isCreating = false, 
  isCreatingItem = false, 
  vendorsList = [],
  familiesList = [] 
}) {
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  
  const [isNewVendorMode, setIsNewVendorMode] = useState(false);
  const [isNewFamilyMode, setIsNewFamilyMode] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setFormData({
        familyId: item.familyDisplay ? '' : (familiesList.length > 0 ? familiesList[0].value : ''),
        newFamilyName: '',
        sizeDisplay: item.sizeDisplay || '', 
        vendorId: item.vendorId || (vendorsList.length > 0 ? vendorsList[0].value : ''), 
        newVendorName: '',
        basePrice: item.basePrice || 0,
        markupPct: item.markupPct || 0,
        priceWithMarkup: item.priceWithMarkup || 0,
        unit: item.unit || 'pcs',
        materialType: item.materialType || 'Lumber',
        url: item.url || '',
      });
      setIsNewVendorMode(false);
      setIsNewFamilyMode(false);
    }
  }, [isOpen, item, vendorsList, familiesList]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    
    // Validation Logic
    if (isCreatingItem && !item.familyDisplay) {
        if (isNewFamilyMode) {
             if (!formData.newFamilyName.trim()) {
                alert("Please enter a Family Name.");
                setIsSaving(false); return;
             }
        }
    }
    if (isCreatingItem && !formData.sizeDisplay.trim()) {
        alert("Please enter a Size Name (e.g. 2x4-12')");
        setIsSaving(false); return;
    }

    let supplierName = item.supplierName;
    if (isCreating || isCreatingItem) {
      if (isNewVendorMode) {
        if (!formData.newVendorName.trim()) {
          alert("Please enter a vendor name.");
          setIsSaving(false); return;
        }
        supplierName = formData.newVendorName;
      } else {
        const selectedVendor = vendorsList.find(v => v.value === formData.vendorId);
        supplierName = selectedVendor ? selectedVendor.label : 'Unknown';
      }
    }

    // Prepare Data
    let familyDisplay = item.familyDisplay;
    if (isCreatingItem && !familyDisplay) {
         if (isNewFamilyMode) {
             familyDisplay = formData.newFamilyName;
         } else {
             const selectedFam = familiesList.find(f => f.value === formData.familyId);
             familyDisplay = selectedFam ? selectedFam.label : 'Unknown';
         }
    }

    const updatedItem = {
      ...item, 
      ...formData, 
      familyDisplay, 
      supplierName, 
      isNewVendor: isNewVendorMode,
      isNewFamily: isNewFamilyMode,
    };

    try {
      await onSave(updatedItem);
      onClose(); 
    } catch (error) {
      console.error("Failed to save price:", error);
      alert("Error saving: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open) => {
    if (!open) onClose();
  };

  let dialogTitle = "Edit Price Details";
  if (isCreating) dialogTitle = "Add New Price";
  if (isCreatingItem) dialogTitle = "Create New Material";

  const showFamilySelection = isCreatingItem && !item?.familyDisplay;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="ew-card" style={{ background: 'var(--bg-800)', borderColor: 'var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="text-h2">{dialogTitle}</DialogTitle>
          
          <DialogDescription asChild>
            <div style={{ paddingTop: '8px' }}>
              
              {/* 1. FAMILY */}
              {showFamilySelection ? (
                  <div style={{ marginBottom: '12px' }}>
                   <div className="flex-between-center">
                      <Label className="info-label">
                        {isNewFamilyMode ? "New Family Name" : "Select Family"}
                      </Label>
                      <button 
                        type="button"
                        onClick={() => setIsNewFamilyMode(!isNewFamilyMode)}
                        className="text-btn"
                      >
                        {isNewFamilyMode ? "Select Existing" : "+ New Family"}
                      </button>
                   </div>

                   {isNewFamilyMode ? (
                      <Input
                        type="text"
                        name="newFamilyName"
                        placeholder="e.g. Engineered Wood"
                        className="ew-input focus-anim"
                        value={formData.newFamilyName}
                        onChange={handleChange}
                        style={{ marginTop: '4px' }}
                      />
                   ) : (
                      <select
                        name="familyId"
                        className="ew-select focus-anim"
                        value={formData.familyId}
                        onChange={handleChange}
                        style={{ marginTop: '4px', width: '100%' }}
                      >
                        {familiesList.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                   )}
                 </div>
              ) : (
                  <InfoRow label="Family" value={item?.familyDisplay} />
              )}


              {/* 2. ITEM NAME / SIZE */}
              {isCreatingItem ? (
                 <div style={{ marginBottom: '12px' }}>
                   <Label className="info-label">New Item Size / Name</Label>
                   <Input
                      type="text"
                      name="sizeDisplay"
                      placeholder="e.g. 2x4-12' or 4x8-3/4"
                      className="ew-input focus-anim"
                      value={formData.sizeDisplay}
                      onChange={handleChange}
                      style={{ marginTop: '4px' }}
                   />
                 </div>
              ) : (
                 <InfoRow label="Size" value={item?.sizeDisplay} />
              )}
              
              {/* 3. VENDOR */}
              {(isCreating || isCreatingItem) ? (
                 <div style={{ marginBottom: '12px' }}>
                   <div className="flex-between-center">
                      <Label className="info-label">
                        {isNewVendorMode ? "New Vendor Name" : "Select Vendor"}
                      </Label>
                      <button 
                        type="button"
                        onClick={() => setIsNewVendorMode(!isNewVendorMode)}
                        className="text-btn"
                      >
                        {isNewVendorMode ? "Select Existing" : "+ New Vendor"}
                      </button>
                   </div>

                   {isNewVendorMode ? (
                      <Input
                        type="text"
                        name="newVendorName"
                        placeholder="e.g. Local Hardware Store"
                        className="ew-input focus-anim"
                        value={formData.newVendorName}
                        onChange={handleChange}
                        style={{ marginTop: '4px' }}
                      />
                   ) : (
                      <select
                        name="vendorId"
                        className="ew-select focus-anim"
                        value={formData.vendorId}
                        onChange={handleChange}
                        style={{ marginTop: '4px', width: '100%' }}
                      >
                        {vendorsList.map(v => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </select>
                   )}
                 </div>
              ) : (
                <InfoRow label="Vendor" value={item?.supplierName} />
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="controls2" style={{ alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Label><span>Base Price ($)</span>
              <Input type="number" name="basePrice" className="ew-input focus-anim" value={formData.basePrice || ''} onChange={handleChange} />
            </Label>
            <Label><span>Markup (%)</span>
              <Input type="number" name="markupPct" className="ew-input focus-anim" value={formData.markupPct || ''} onChange={handleChange} />
            </Label>
            <Label><span>Price w/ Markup ($)</span>
              <Input type="number" name="priceWithMarkup" className="ew-input focus-anim" value={formData.priceWithMarkup || ''} onChange={handleChange} />
            </Label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Label><span>Unit</span>
              <Input type="text" name="unit" className="ew-input focus-anim" value={formData.unit || ''} onChange={handleChange} />
            </Label>
            <Label><span>Material Type</span>
              <Input type="text" name="materialType" className="ew-input focus-anim" value={formData.materialType || ''} onChange={handleChange} />
            </Label>
            <Label><span>URL</span>
              <Input type="text" name="url" className="ew-input focus-anim" value={formData.url || ''} onChange={handleChange} />
            </Label>
          </div>
        </div>

        <DialogFooter style={{ marginTop: '16px' }}>
          <Button variant="outline" className="ew-btn" onClick={onClose}>Cancel</Button>
          <Button className="ew-btn ew-btn--turq" onClick={handleSaveClick} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}