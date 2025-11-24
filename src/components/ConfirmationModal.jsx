// src/components/ConfirmationModal.jsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirm Action", 
  description = "Are you sure you want to proceed? This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel"
}) {
  const handleOpenChange = (open) => {
    if (!open) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="ew-card" 
        style={{ 
          background: 'var(--bg-800)', 
          borderColor: 'var(--border)', 
          maxWidth: '400px',
          padding: '20px' 
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-h2" style={{ fontSize: '1.2rem', color: 'var(--text-100)' }}>
            {title}
          </DialogTitle>
          <DialogDescription asChild>
             <div style={{ color: 'var(--text-300)', marginTop: '8px', fontSize: '0.9rem' }}>
                {description}
             </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter style={{ marginTop: '24px', gap: '8px' }}>
          <button 
            className="ew-btn" 
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button 
            className="ew-btn ew-btn--danger" 
            onClick={onConfirm}
            autoFocus // Focus on delete for quick action, or remove for safety
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}