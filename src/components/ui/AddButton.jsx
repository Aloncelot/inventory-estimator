// src/components/ui/AddButton.jsx
'use client';
import { Plus } from 'lucide-react';

export default function AddButton({ onClick, size = 13, title = 'Add', label = 'Add', className = '', disabled = false }) {
  return (
    <button type="button" className={`ew-btn ${className}`} onClick={onClick} aria-label={label || title} title={title} disabled={disabled}>
      <Plus size={size} aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
