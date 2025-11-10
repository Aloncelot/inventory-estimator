// src/components/ExteriorWalls.jsx
'use client';

import { useMemo, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import ExteriorWallGroup from '@/components/ExteriorWallGroup';
import AddButton from './ui/AddButton';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

export default function ExteriorWalls({
  sectionsData,
  onSectionsChange, // This is a stable function: (updaterFn) => void
  title = 'Exterior walls',
  isLevelOne = false,
}) {
  const { blankSection } = useProject();

  // --- **THIS IS THE FIX (PART 1)** ---
  // These handlers now pass an *updater function* to the parent
   const addSection = useCallback(() => {
    const newSection = blankSection({ kind: 'exterior' }); 
    onSectionsChange(prevSections => [...(prevSections || []), newSection]);
  }, [onSectionsChange, blankSection]);

  const removeSection = useCallback((idToRemove) => {
    onSectionsChange(prevSections => (prevSections || []).filter(s => s.id !== idToRemove));
  }, [onSectionsChange]);

  // This function is now stable and passes the updater function up
  // to the correct section.
  const handleSectionChange = useCallback((sectionId, sectionUpdater) => {
    onSectionsChange(prevSections => // prevSections is the full array
      (prevSections || []).map(s => 
        s.id === sectionId ? sectionUpdater(s) : s // Apply updater to the correct section
      )
    );
  }, [onSectionsChange]); // Now stable

  // --- (Totals logic is unchanged) ---
  const totals = useMemo(() => {
    const sections = Array.isArray(sectionsData) ? sectionsData : [];
    const panelsSubtotal = sections.reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    // ... all other calcs are fine ...
    return { 
      panelsSubtotal,
      // ...
    };
  }, [sectionsData]);

   const exteriorTotalSubtotal = totals.panelsSubtotal;
   const novaMonoStyle = { fontFamily: "'Nova Mono', monospace" };

  return (
  <section className="ew-stack">
    <div className="ew-card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
      <h2 className="ew-h2" style={{ ...novaMonoStyle, margin:0, flexShrink: 0 }}>{title}</h2>
      <div className="ew-right" title="Sum of all exterior wall section subtotals for this level" style={{ ...novaMonoStyle, fontWeight: 700 }}>
        Total: {fmt(exteriorTotalSubtotal)}
      </div>
    </div>

      {(!sectionsData || sectionsData.length === 0) && (
        <div className="ew-card">
          <div className="ew-subtle">No exterior wall sections yet.</div>
          <div style={{ marginTop: 8 }}>
            <button className="ew-btn ew-btn--turq" onClick={addSection}>+ Add exterior wall section</button>
          </div>
        </div>
      )}

      {Array.isArray(sectionsData) && sectionsData.map((sec, idx) => (
        <ExteriorWallGroup
          key={sec.id}
          sectionData={sec} 
          // --- **THIS IS THE FIX (PART 2)** ---
          // We pass a new function that includes the section's ID
          onUpdateSection={updaterFn => handleSectionChange(sec.id, updaterFn)}
          title={`Exterior walls — section ${idx + 1}`}
          onRemove={() => removeSection(sec.id)}
          bottomDefaultFamily={isLevelOne ? 'PT' : 'SPF#2'}
        />
      ))}

      <div className="ew-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop: '1rem' }}>
        <div className="ew-subtle">Add another exterior wall section to this level.</div>
        <AddButton onClick={addSection} title="Add Section" label="Add Section" />
       </div>
    </section>
  );
}