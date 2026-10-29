// src/components/ui/EditableTitle.jsx
// Name that can be renamed: pencil button, double-click, or Enter/F2 when focused.
// `suggestions` shows a pick list (e.g. Basement, Level 2, Attic) while typing.
'use client';
import { useId, useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';

export default function EditableTitle({ value = '', onChange, textClass = '', suggestions, showEditButton = true, label = 'name' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [local, setLocal] = useState(value || '');
  const listId = useId();

  useEffect(() => { setLocal(value || ''); }, [value]);

  const commit = () => {
    setIsEditing(false);
    const next = String(local || '').trim();
    if (next && next !== value) onChange(next);
    else setLocal(value || '');
  };

  if (isEditing) {
    return (
      <>
        <input
          type="text"
          value={local}
          list={suggestions?.length ? listId : undefined}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setLocal(value || ''); setIsEditing(false); }
          }}
          className={`${textClass} ew-input`}
          style={{ width: Math.max(160, (local.length + 4) * 9), padding: '0 6px' }}
          autoFocus
          onFocus={(e) => e.target.select()}
          aria-label={`Rename ${label}`}
        />
        {suggestions?.length ? (
          <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        ) : null}
      </>
    );
  }

  return (
    <span className="edit-title">
      <span
        className={textClass}
        onDoubleClick={() => setIsEditing(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'F2') setIsEditing(true); }}
        tabIndex={0}
        role="button"
        title="Double-click to rename"
        style={{ cursor: 'text', whiteSpace: 'nowrap' }}
      >
        {value || 'Untitled'}
      </span>
      {showEditButton ? (
        <button type="button" className="row-action-btn edit-title__btn" onClick={() => setIsEditing(true)} title={`Rename ${label}`} aria-label={`Rename ${label}`}>
          <Pencil size={12} />
        </button>
      ) : null}
    </span>
  );
}
