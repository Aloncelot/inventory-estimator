// src/components/WallCategory.jsx
// "Exterior walls" / "Interior walls" block inside a level: a heading with the
// category total, its wall sections, and an add button. No card of its own.
'use client';

import { useCallback, useMemo } from 'react';
import { useProject } from '@/context/ProjectContext';
import WallGroup from '@/components/WallGroup';
import { useConfirm } from '@/components/ui/confirm';
import { AddRowButton, fmtMoney, SortableList, SortableBlock, reorderById } from '@/components/ui/mat';

export default function WallCategory({ variant = 'exterior', sectionsData, calcs = [], groundLevel = false, onSectionsChange, title }) {
  const { blankSection } = useProject();
  const sections = useMemo(() => (Array.isArray(sectionsData) ? sectionsData : []), [sectionsData]);

  const addSection = useCallback(() => {
    onSectionsChange((prev) => [
      ...(prev || []),
      blankSection({ kind: variant === 'exterior' ? 'exterior' : 'partition', name: `Section ${(prev || []).length + 1}` }),
    ]);
  }, [onSectionsChange, blankSection, variant]);

  const confirm = useConfirm();
  const removeSection = useCallback(async (id) => {
    const sec = sections.find((s) => s.id === id);
    const ok = await confirm({
      title: `Delete ${sec?.name || 'this section'}?`,
      message: `All of its rows and extras are removed from ${title.toLowerCase()}.`,
      confirmLabel: 'Delete section',
      tone: 'danger',
    });
    if (ok) onSectionsChange((prev) => (prev || []).filter((s) => s.id !== id));
  }, [onSectionsChange, confirm, sections, title]);

  const changeSection = useCallback((id, updater) => {
    onSectionsChange((prev) => (prev || []).map((s) => (s.id === id ? updater(s) : s)));
  }, [onSectionsChange]);

  const calcById = useMemo(() => Object.fromEntries((calcs || []).map((c) => [c.id, c])), [calcs]);
  const total = useMemo(() => (calcs || []).reduce((s, c) => s + (Number(c.subtotal) || 0), 0), [calcs]);
  const lf = useMemo(() => sections.reduce((s, x) => s + (Number(x.lengthLF) || 0), 0), [sections]);

  return (
    <div className="cat">
      <div className="cat-head">
        <span className="cat-title">{title}</span>
        <span className="ew-subtle">{sections.length} section{sections.length === 1 ? '' : 's'} · {lf.toLocaleString('en-US')} LF</span>
        <div className="cat-total"><span className="lbl">Category total</span><span className="money-section">{fmtMoney(total)}</span></div>
      </div>

      {sections.length === 0 ? (
        <div className="empty-state">
          <span>No {variant} wall sections yet.</span>
          <AddRowButton onClick={addSection}>Add section</AddRowButton>
        </div>
      ) : (
        <>
          <SortableList ids={sections.map((s) => s.id)} onMove={(a, o) => onSectionsChange((prev) => reorderById(prev || [], a, o))}>
            {sections.map((sec) => (
              <SortableBlock key={sec.id} id={sec.id}>
                {(handle) => (
                  <WallGroup
                    variant={variant}
                    sectionData={sec}
                    calc={calcById[sec.id]}
                    groundLevel={groundLevel}
                    title={sec.name}
                    dragHandleProps={sections.length > 1 ? handle : undefined}
                    onUpdateSection={(fn) => changeSection(sec.id, fn)}
                    onRemove={() => removeSection(sec.id)}
                  />
                )}
              </SortableBlock>
            ))}
          </SortableList>
          <div className="cat-foot">
            <AddRowButton onClick={addSection} title={`Add a ${variant} wall section`}>Add {variant} section</AddRowButton>
          </div>
        </>
      )}
    </div>
  );
}
