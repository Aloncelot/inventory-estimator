// src/components/LooseMaterialView.jsx
'use client';

import { useMemo } from 'react';
import { Layers, Eye } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import LooseMaterialSection, { sectionKind } from './LooseMaterialSection';
import { useConfirm } from '@/components/ui/confirm';
import { PageHeader, AddRowButton, fmtMoney } from '@/components/ui/mat';
import { looseOf } from '@/domain/estimate';
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

function SortableSection({ section, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, position: 'relative', zIndex: isDragging ? 20 : 'auto' }}
    >
      <LooseMaterialSection section={section} dragHandleProps={{ ...attributes, ...listeners }} {...props} />
    </div>
  );
}

export default function LooseMaterialView() {
  const { projectData, updateProject, blankLooseSection, blankLevelLooseSection, isLoaded } = useProject();
  const confirm = useConfirm();

  const estimateData = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const looseList = useMemo(() => estimateData.looseList || [], [estimateData.looseList]);
  const foundationSection = useMemo(() => looseList.find((s) => sectionKind(s) === 'foundation'), [looseList]);
  const calc = useMemo(() => looseOf(estimateData), [estimateData]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateList = (fn) => updateProject((prev) => ({ ...prev, looseList: fn(prev.looseList || []) }));
  const changeSection = (id, fn) => updateList((list) => list.map((s) => (s.id === id ? (typeof fn === 'function' ? fn(s) : fn) : s)));
  const toggleHidden = (id) => updateList((list) => list.map((s) => (s.id === id ? { ...s, isHidden: !s.isHidden } : s)));

  const addSection = () => updateList((list) => [...list, { ...blankLooseSection('New section'), kind: 'custom' }]);
  const addLevelSection = () => updateList((list) => {
    const levelCount = list.filter((s) => sectionKind(s) === 'level').length;
    const sec = { ...blankLevelLooseSection(levelCount), kind: 'level' };
    // keep levels before the roof
    const roofIdx = list.findIndex((s) => sectionKind(s) === 'roof');
    return roofIdx === -1 ? [...list, sec] : [...list.slice(0, roofIdx), sec, ...list.slice(roofIdx)];
  });

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    updateList((list) => {
      const from = list.findIndex((s) => s.id === active.id);
      const to = list.findIndex((s) => s.id === over.id);
      return from < 0 || to < 0 ? list : arrayMove(list, from, to);
    });
  };

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={Layers} title="Loose material" />
        <div className="empty-state">Open or create a project in Projects to start estimating loose material.</div>
      </div>
    );
  }

  const visible = looseList.filter((s) => !s.isHidden);
  const hidden = looseList.filter((s) => s.isHidden);

  return (
    <div className="app-content">
      <PageHeader
        icon={Layers}
        title="Loose material"
        meta={`${projectData.name || 'Untitled'} · ${visible.length} section${visible.length === 1 ? '' : 's'}`}
        totalLabel="Loose material total"
        total={calc.total}
        actions={(
          <>
            <AddRowButton onClick={addLevelSection} title="Add a floor level (joists, subfloor…)">Add level</AddRowButton>
            <AddRowButton onClick={addSection} title="Add an empty section">Add section</AddRowButton>
          </>
        )}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {visible.map((section) => (
            <SortableSection
              key={section.id}
              section={section}
              calc={calc.byId[section.id]}
              onUpdate={(fn) => changeSection(section.id, fn)}
              onRemove={async () => {
                const ok = await confirm({ title: `Delete ${section.name || 'this section'}?`, message: 'The section and all of its items are removed.', confirmLabel: 'Delete section', tone: 'danger' });
                if (ok) updateList((list) => list.filter((s) => s.id !== section.id));
              }}
              onToggleHidden={() => toggleHidden(section.id)}
              foundationData={foundationSection}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="empty-state" style={{ paddingTop: 0 }}>
        <span>Levels hold joists, beams, subfloor and strapping for each floor.</span>
        <div className="ew-inline">
          <AddRowButton onClick={addLevelSection}>Add level</AddRowButton>
          <AddRowButton onClick={addSection}>Add section</AddRowButton>
        </div>
      </div>

      {hidden.length > 0 ? (
        <div className="empty-state" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <span>Hidden (not in totals):</span>
          {hidden.map((s) => (
            <button key={s.id} type="button" className="ew-btn ew-btn--ghost" onClick={() => toggleHidden(s.id)} title="Show section again">
              <Eye size={12} /> {s.name} · {fmtMoney(calc.byId[s.id]?.subtotal)}
            </button>
          ))}
        </div>
      ) : null}

    </div>
  );
}
