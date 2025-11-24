// src/components/LooseMaterialView.jsx
'use client';

import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import LooseMaterialSection from './LooseMaterialSection';
import AddButton from '@/components/ui/AddButton';
import ConfirmationModal from '@/components/ConfirmationModal';
import { unitPriceFrom } from '@/domain/lib/parsing';

// --- DnD Kit Imports ---
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = (n) => moneyFmt.format(Number(n) || 0);

const calcSectionTotal = (rows = []) => {
    return rows.reduce((sum, row) => {
        const qtyRaw = Number(row.qty) || 0;
        const waste = Number(row.wastePct) || 0;
        const qtyFinal = Math.ceil(qtyRaw * (1 + waste / 100));
        const itemObj = row.item?.item || row.item;
        const unitPrice = unitPriceFrom(itemObj);
        return sum + (qtyFinal * unitPrice);
    }, 0);
};

// --- Sortable Wrapper Component ---
function SortableSection({ section, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1, 
    marginBottom: '16px', 
    position: 'relative',
    zIndex: isDragging ? 999 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <LooseMaterialSection
        section={section}
        dragHandleProps={{ ...attributes, ...listeners }} 
        {...props}
      />
    </div>
  );
}

export default function LooseMaterialView({ onTotalChange }) {
    const { projectData, updateProject, blankLooseSection, isLoaded } = useProject();
    const [sectionToDelete, setSectionToDelete] = useState(null);
    const [activeId, setActiveId] = useState(null); 

    const looseList = useMemo(() => {
        return projectData?.estimateData?.looseList || [];
    }, [projectData]);

    // --- FIX: Find Foundation by NAME, not ID ---
    const foundationSection = useMemo(() => {
        return looseList.find(s => s.name === 'Foundation');
    }, [looseList]);
    // --------------------------------------------

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), 
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const updateLooseList = (listUpdater) => {
        updateProject(prevEstimate => {
            const currentList = prevEstimate.looseList || [];
            const newList = typeof listUpdater === 'function' 
                ? listUpdater(currentList) 
                : listUpdater;
            return { ...prevEstimate, looseList: newList };
        });
    };

    const handleSectionChange = (sectionId, sectionUpdater) => {
        updateLooseList(prevList => 
            prevList.map(s => 
                s.id === sectionId 
                ? (typeof sectionUpdater === 'function' ? sectionUpdater(s) : sectionUpdater) 
                : s
            )
        );
    };

    const addSection = () => {
        const newSection = blankLooseSection("New Section");
        updateLooseList(prevList => [...prevList, newSection]);
    };

    const requestDeleteSection = (id) => { setSectionToDelete(id); };
    
    const confirmDeleteSection = () => {
        if (sectionToDelete) {
            updateLooseList(prevList => prevList.filter(s => s.id !== sectionToDelete));
            setSectionToDelete(null);
        }
    };

    const toggleSectionVisibility = (id) => {
        updateLooseList(prevList => prevList.map(s => {
            if (s.id === id) {
                return { ...s, isHidden: !s.isHidden };
            }
            return s;
        }));
    };

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (active.id !== over?.id) {
            updateLooseList((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const viewTotal = useMemo(() => {
        return looseList
            .filter(s => !s.isHidden)
            .reduce((sum, section) => sum + calcSectionTotal(section.rows), 0);
    }, [looseList]);

    const lastSentTotalRef = useRef(null);
    useEffect(() => {
        if (typeof onTotalChange === 'function') {
             if (viewTotal !== lastSentTotalRef.current) {
                 onTotalChange(viewTotal);
                 lastSentTotalRef.current = viewTotal;
             }
        }
    }, [viewTotal, onTotalChange]);


    if (!isLoaded || !projectData) {
        return <div className="app-content"><div className="ew-card">Loading...</div></div>;
    }

    const defaultSections = ['Foundation', 'Basement', '1st Level', 'Roof'];
    
    const visibleSections = looseList.filter(s => !s.isHidden);
    const hiddenSections = looseList.filter(s => s.isHidden);
    const activeSectionData = looseList.find(s => s.id === activeId);

    return (
        <div className="app-content">
            <div className="sticky-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-section-title">
                    {projectData?.name ? `${projectData.name} - ` : ''}Loose Material
                </span>
                <div className="ew-right text-grand-total" title="Sum of visible sections">
                    Total: {fmt(viewTotal)}
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext 
                    items={visibleSections.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="ew-stack">
                        {visibleSections.map(section => (
                            <SortableSection
                                key={section.id}
                                section={section}
                                onUpdate={updater => handleSectionChange(section.id, updater)}
                                onRemove={defaultSections.includes(section.name) ? undefined : () => requestDeleteSection(section.id)}
                                onToggleHidden={() => toggleSectionVisibility(section.id)}
                                // Pass foundation data correctly now!
                                foundationData={foundationSection} 
                                isHidden={false}
                            />
                        ))}
                    </div>
                </SortableContext>

                <DragOverlay>
                    {activeSectionData ? (
                         <LooseMaterialSection
                            section={activeSectionData}
                            onUpdate={() => {}}
                            dragHandleProps={{}}
                            foundationData={foundationSection}
                            isHidden={false}
                         />
                    ) : null}
                </DragOverlay>
            </DndContext>


            <div className="ew-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                <div className="ew-subtle">Add another custom section (e.g. Stairs, Deck, Porch)</div>
                <AddButton onClick={addSection} title="Add Section" label="Add Section" />
            </div>

            {hiddenSections.length > 0 && (
                <div className="ew-card" style={{ marginTop: '20px', border: '1px dashed var(--border)', background: 'transparent' }}>
                    <h3 className="ew-h3" style={{ color: 'var(--text-300)', fontSize: '0.9rem', margin: '0 0 10px 0' }}>
                        Hidden Sections ({hiddenSections.length})
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {hiddenSections.map(section => (
                            <div 
                                key={section.id} 
                                className="ew-chip" 
                                style={{ 
                                    padding: '6px 12px', 
                                    fontSize: '0.9rem', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    background: 'var(--bg-800)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-300)'
                                }}
                            >
                                <span>{section.name}</span>
                                <button 
                                    className="ew-btn ew-icon-btn"
                                    onClick={() => toggleSectionVisibility(section.id)}
                                    title="Restore / Show Section"
                                    style={{ padding: 2, height: 'auto' }}
                                >
                                    <img src="/icons/eye.png" width={16} height={16} alt="Show" style={{opacity: 0.6}} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={!!sectionToDelete}
                onClose={() => setSectionToDelete(null)}
                onConfirm={confirmDeleteSection}
                title="Delete Section"
                description="Are you sure you want to delete this section and all its items? This action cannot be undone."
                confirmLabel="Delete"
            />
        </div>
    );
}