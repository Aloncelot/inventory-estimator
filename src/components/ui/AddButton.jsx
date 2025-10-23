// src/components/ui/AddBotton.jsx
'use client';

export default function AddButton({
  onClick,
  size = 20,
  title = 'Add',
  label = 'Add',
  src = '/icons/plus.png',
  className = '',
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`ew-btn ew-icon-btn ${className}`}
      onClick={onClick}
      aria-label={label}
      title={title}
      disabled={disabled}
    >
      <img src={src} width={size} height={size} alt="" />
    </button>
  );
}
