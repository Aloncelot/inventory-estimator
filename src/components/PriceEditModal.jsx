// src/components/PriceEditModal.jsx
'use client';

import { useState, useEffect, useCallback } from 'react';
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

// Helper component for read-only fields
function InfoRow({ label, value }) {
  return (
    // This div is fine, the problem is its parent
    <div style={{ marginBottom: '8px' }}>
      <Label style={{ fontSize: '0.75rem', color: 'var(--text-300)' }}>{label}</Label>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-100)', fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

export default function PriceEditModal({ isOpen, onClose, onSave, item }) {
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setFormData({
        basePrice: item.basePrice || 0,
        markupPct: item.markupPct || 0,
        priceWithMarkup: item.priceWithMarkup || 0,
        unit: item.unit || '',
        materialType: item.materialType || '',
        url: item.url || '',
      });
    }
  }, [isOpen, item]); 

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    
    const updatedItem = {
      ...item, 
      ...formData,
    };

    try {
      await onSave(updatedItem);
      onClose(); 
    } catch (error) {
      console.error("Failed to save price:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="ew-card" style={{ background: 'var(--bg-800)', borderColor: 'var(--border)' }}>
        <DialogHeader>
          <DialogTitle className="text-h2">Edit Price Details</DialogTitle>
          
          {/* --- THIS IS THE FIX --- */}
          {/* We use 'asChild' to tell DialogDescription to pass its props
              to our own <div>, instead of rendering its own <p> tag. */}
          <DialogDescription asChild>
            <div style={{ color: 'var(--text-300)', paddingTop: '8px' }}>
              <InfoRow label="Vendor" value={item?.supplierName} />
              <InfoRow label="Item" value={`${item?.familyDisplay} - ${item?.sizeDisplay}`} />
            </div>
          </DialogDescription>
          {/* --- END OF FIX --- */}

        </DialogHeader>

        {/* Form Body */}
        <div className="controls2" style={{ alignItems: 'flex-start', gap: '16px' }}>
          {/* Prices */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Label>
              <span>Base Price ($)</span>
              <Input
                type="number"
                name="basePrice"
                className="ew-input focus-anim"
                value={formData.basePrice || ''}
                onChange={handleChange}
              />
            </Label>
            <Label>
              <span>Markup (%)</span>
              <Input
                type="number"
                name="markupPct"
                className="ew-input focus-anim"
                value={formData.markupPct || ''}
                onChange={handleChange}
              />
            </Label>
            <Label>
              <span>Price w/ Markup ($)</span>
              <Input
                type="number"
                name="priceWithMarkup"
                className="ew-input focus-anim"
                value={formData.priceWithMarkup || ''}
                onChange={handleChange}
              />
            </Label>
          </div>
          
          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Label>
              <span>Unit (e.g., pcs, lf, sheet)</span>
              <Input
                type="text"
                name="unit"
                className="ew-input focus-anim"
                value={formData.unit || ''}
                onChange={handleChange}
              />
            </Label>
            <Label>
              <span>Material Type</span>
              <Input
                type="text"
                name="materialType"
                className="ew-input focus-anim"
                value={formData.materialType || ''}
                onChange={handleChange}
              />
            </Label>
            <Label>
              <span>URL</span>
              <Input
                type="text"
                name="url"
                className="ew-input focus-anim"
                value={formData.url || ''}
                onChange={handleChange}
              />
            </Label>
          </div>
        </div>

        <DialogFooter style={{ marginTop: '16px' }}>
          <Button 
            variant="outline" 
            className="ew-btn"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            className="ew-btn ew-btn--turq"
            onClick={handleSaveClick}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}