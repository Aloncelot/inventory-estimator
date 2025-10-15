'use client';

export default function RemoveButton({
  onClick,
  size = 20,
  title = 'Remove',
  label = 'Remove',      
  src = '/icons/trash.png',
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
