// src/components/InteriorWalls.jsx
'use client';

import { useMemo, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import InteriorWallGroup from '@/components/InteriorWallGroup';
import AddButton from './ui/AddButton';
import { Plus } from 'lucide-react';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '$0.00');

export default function InteriorWalls({
  sectionsData,
  onSectionsChange,
  title = 'Interior walls',
  isLevelOne = false,
}) {
  const { blankSection } = useProject();

  const addSection = useCallback(() => {
    onSectionsChange(prevSections => {
      const newSection = blankSection({
        kind: 'interior',
        name: `Section ${prevSections.length + 1}`
      });
      return [...(prevSections || []), newSection];
    });
  }, [onSectionsChange, blankSection]);

  const removeSection = useCallback((idToRemove) => {
    onSectionsChange(prevSections => (prevSections || []).filter(s => s.id !== idToRemove));
  }, [onSectionsChange]);

  const handleSectionChange = useCallback((sectionId, sectionUpdater) => {
    onSectionsChange(prevSections => (prevSections || []).map(s => s.id === sectionId ? sectionUpdater(s) : s));
  }, [onSectionsChange]);

  const totalSubtotal = useMemo(() => {
    const sections = Array.isArray(sectionsData) ? sectionsData : [];
    return sections.reduce((sum, s) => sum + (Number(s.groupSubtotal) || 0), 0);
  }, [sectionsData]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* HEADER DE CATEGORÍA UNIFORME */}
      <div className="ew-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'var(--bg-800)', borderLeft: '4px solid var(--turq-200)' }}>
        <h2 className="ew-h2" style={{ margin: 0, fontSize: '1.2rem' }}>{title}</h2>
        <div className="ew-right">
          <span className="ew-subtle" style={{ marginRight: '10px', verticalAlign: 'middle', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Category:</span>
          <span className="text-level-total" style={{ fontSize: '1.4rem', color: 'var(--turq-400)', fontWeight: 800 }}>{fmt(totalSubtotal)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {(!sectionsData || sectionsData.length === 0) ? (
          <div className="ew-card" style={{ textAlign: 'center', padding: '40px', borderStyle: 'dashed' }}>
            <div className="ew-subtle" style={{ marginBottom: '16px' }}>No interior wall sections yet.</div>
            <button className="ew-btn ew-btn--turq" onClick={addSection}><Plus size={16} style={{ marginRight: 8 }} />Add first section</button>
          </div>
        ) : (
          sectionsData.map((sec) => (
            <InteriorWallGroup
              key={sec.id}
              sectionData={sec}
              onUpdateSection={updaterFn => handleSectionChange(sec.id, updaterFn)}
              title={sec.name}
              onRemove={() => removeSection(sec.id)}
              bottomDefaultFamily={isLevelOne ? 'SPF#2' : 'SPF#2'}
            />
          ))
        )}
      </div>

      {sectionsData?.length > 0 && (
        <div className="ew-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderStyle: 'dashed' }}>
          <div className="ew-subtle">Click to add a new estimation group for {title}.</div>
          <AddButton onClick={addSection} title="Add Section" label="Add Section" />
        </div>
      )}
    </section>
  );
}