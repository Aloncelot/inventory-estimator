// src/components/ui/AddBotton.jsx
'use client';
import { Cross } from 'lucide-react';

export default function AddButton({
  onClick,
  size = 16,
  title = 'Add',
  label = 'Add',
  className = '',
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`ew-btn ${className}`}
      onClick={onClick}
      aria-label={label || title}
      title={title}
      disabled={disabled}
      style={{ gap: '8px' }}
    >
      <Cross size={size} className="gradient-icon" />
      {label && <span>{label}</span>}
    </button>
  );
}


