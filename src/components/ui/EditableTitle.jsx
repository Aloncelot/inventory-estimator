// src/components/ui/EditableTitle.jsx

'use client';
import { useState, useEffect, useCallback } from 'react';

export default function EditableTitle({
  value,
  onChange,
  textClass = "", 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commitChange = useCallback(() => {
    setIsEditing(false);
 
    if (localValue.trim() && localValue !== value) {
      onChange(localValue.trim());
    } else {
      setLocalValue(value);
    }
  }, [localValue, value, onChange]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      commitChange();
      e.target.blur(); 
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setLocalValue(value); 
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commitChange}
        onKeyDown={handleKeyDown}
        className={`${textClass} ew-input`} 
        style={{ 
          margin: 0, 
          padding: '0 4px', 
          height: 'auto', 
          lineHeight: 'inherit' 
        }} 
        autoFocus
        onFocus={(e) => e.target.select()} 
      />
    );
  }

  return (
    <span
      className={textClass}
      onDoubleClick={() => setIsEditing(true)}
      title="Doble clic para editar"
      style={{ cursor: 'text' }}
    >
      {value}
    </span>
  );
}