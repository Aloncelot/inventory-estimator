// src/components/InteriorWalls.jsx
'use client';

import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import InteriorWallGroup from '@/components/InteriorWallGroup';
import AddButton from './ui/AddButton';
import { useProject } from '@/context/ProjectContext';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

export default function InteriorWalls({
  sectionsData,
  onSectionsChange, // This is a stable function: (updaterFn) => void
  title = 'Interior walls',
  isLevelOne = false,
}) {

  const { blankSection } = useProject();
  
  // --- **THIS IS THE FIX (PART 1)** ---
  // These handlers now pass an *updater function* to the parent
  const addSection = useCallback(() => {
    const newSection = blankSection({ kind: 'partition' });
    onSectionsChange(prevSections => [...(prevSections || []), newSection]);
  }, [onSectionsChange, blankSection]);

  const removeSection = useCallback((idToRemove) => {
    onSectionsChange(prevSections => (prevSections || []).filter(s => s.id !== idToRemove));
  }, [onSectionsChange]);

  const handleSectionChange = useCallback((sectionId, sectionUpdater) => {
    onSectionsChange(prevSections => 
      (prevSections || []).map(s => 
        s.id === sectionId ? sectionUpdater(s) : s 
      )
    );
  }, [onSectionsChange]); // Now stable

  // --- (Totals logic is unchanged) ---
  const totals = useMemo(() => {
    const sections = Array.isArray(sectionsData) ? sectionsData : [];
    const panelsSubtotal = sections.reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    return { 
      panelsSubtotal,
    };
  }, [sectionsData]);

  const interiorTotalSubtotal = totals.panelsSubtotal;

  return (
        <section className="ew-stack">
            <div className="ew-card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <h2 className="text-h2">{title}</h2>
              <div className="ew-right text-level-total" title="Sum of all interior wall section subtotals for this level">
                Total: {fmt(interiorTotalSubtotal)}
              </div>
            </div>

            {(!sectionsData || sectionsData.length === 0) && (
                <div className="ew-card">
                    <div className="ew-subtle">No interior wall sections yet.</div>
                    <div style={{ marginTop: 8 }}>
                        <button className="ew-btn ew-btn--turq" onClick={addSection}>+ Add interior wall section</button>
                    </div>
                </div>
            )}

            {Array.isArray(sectionsData) && sectionsData.map((sec, i) => (
                <InteriorWallGroup
                    key={sec.id}
                    sectionData={sec}
                    // --- **THIS IS THE FIX (PART 2)** ---
                    onUpdateSection={updaterFn => handleSectionChange(sec.id, updaterFn)}
                    title={`${title} — Section ${i + 1}`}
                    onRemove={() => removeSection(sec.id)}
                    bottomDefaultFamily={isLevelOne ? 'PT' : 'SPF#2'}
                />
            ))}

            <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop: '1rem' }}>
                <div className="ew-subtle">Add another interior wall section to this level.</div>
                <AddButton onClick={addSection} title="Add Section" label="Add Section" />
            </div>
        </section>
    );
}