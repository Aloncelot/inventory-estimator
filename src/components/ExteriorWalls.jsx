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
  onSectionsChange,
  title = 'Exterior walls',
  isLevelOne = false,
}) {
  const { blankSection } = useProject();
   const addSection = () => {
    const newSection = blankSection({ kind: 'exterior' }); 
    onSectionsChange([...(sectionsData || []), newSection]); // Add guard for undefined sectionsData
  };

  const removeSection = (idToRemove) => {
    const newSections = sectionsData.filter(s => s.id !== idToRemove);
    onSectionsChange(newSections);
  };

  const handleSectionChange = useCallback((updatedSection) => {
    const newSections = sectionsData.map(s => 
      s.id === updatedSection.id ? updatedSection : s
    );
    onSectionsChange(newSections);
  }, [sectionsData, onSectionsChange]);

  // Totals
  const totals = useMemo(() => {
    const sections = Array.isArray(sectionsData) ? sectionsData : [];
    const panelsSubtotal = sections.reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
    const extLengthSum    = sections.reduce((sum, s) => sum + (Number(s.lengthLF)       || 0), 0);
    const extZipSheetsSum = sections.reduce((sum, s) => sum + (Number(s.zipSheetsFinal) || 0), 0);
    const extPanelSheets  = sections.reduce((sum, s) => sum + (Number(s.panelSheets)    || 0), 0);
    const extPlatePieces  = sections.reduce((sum, s) => sum + (Number(s.platePieces)    || 0), 0);
    const extBottomPlatePiecesPanel = sections.reduce((sum, s) => sum + (Number(s.bottomPlatePiecesPanel) || 0), 0);
    const extPTLFSum      = sections.reduce((sum, s) => sum + (Number(s.ptLF)           || 0), 0);
    const extMoneySum     = sections.reduce((sum, s) => sum + (Number(s.groupSubtotal)  || 0), 0);
    const extPanelPtBoards= sections.reduce((sum, s) => sum + (Number(s.panelPtBoards)  || 0), 0);
    
    return { 
      extLengthSum, 
      extZipSheetsSum, 
      extPanelSheets,
      extZipSheetsFinal: extZipSheetsSum,
      extPlatePieces,
      extBottomPlatePiecesPanel, 
      extPTLFSum, 
      extMoneySum, 
      panelsSubtotal,
      extPanelPtBoards,
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
          onUpdateSection={handleSectionChange}
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
