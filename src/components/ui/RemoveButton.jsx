// src/components/ui/RemoveButton.jsx
'use client';
import { Trash2 } from 'lucide-react';

export default function RemoveButton({ onClick, size = 14, title = 'Remove', label = 'Remove', className = '', disabled = false }) {
  return (
    <button type="button" className={`row-action-btn delete ${className}`} onClick={onClick} aria-label={label || title} title={title} disabled={disabled}>
      <Trash2 size={size} aria-hidden="true" />
    </button>
  );
}
