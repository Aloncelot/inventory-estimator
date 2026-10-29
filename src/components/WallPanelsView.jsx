// src/components/WallPanelsView.jsx
'use client';

import { useCallback, useMemo } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import Level from '@/components/Level';
import PanelsManufactureEstimate from '@/components/PanelsManufactureEstimate';
import NailsAndBracing from '@/components/NailsAndBracing';
import { useConfirm } from '@/components/ui/confirm';
import { PageHeader, AddRowButton, SortableList, SortableBlock, reorderById } from '@/components/ui/mat';
import { wallPanelsOf } from '@/domain/estimate';

export default function WallPanelsView() {
  const { projectData, updateProject, blankLevel, isLoaded } = useProject();

  const estimateData = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (estimateData.levels || []).filter(Boolean), [estimateData.levels]);
  const manufactureEstimate = useMemo(() => estimateData.manufactureEstimate || {}, [estimateData.manufactureEstimate]);
  const nailsAndBracing = useMemo(() => estimateData.nailsAndBracing || {}, [estimateData.nailsAndBracing]);

  const handleLevelChangeById = useCallback((levelId, fn) => {
    updateProject((prev) => ({
      ...prev,
      levels: (prev.levels || []).map((lvl) => (lvl.id === levelId ? fn(lvl) : lvl)),
    }));
  }, [updateProject]);

  // "Add level" stacks a floor on top; "Add basement" puts one below the first level
  const addLevel = useCallback((where = 'top') => {
    updateProject((prev) => {
      const list = prev.levels || [];
      if (where === 'below') {
        const n = list.filter((l) => /basement|cellar/i.test(l.name || '')).length;
        return { ...prev, levels: [blankLevel({ index: 0, name: n ? `Basement ${n + 1}` : 'Basement' }), ...list] };
      }
      const floors = list.filter((l) => !/basement|cellar/i.test(l.name || '')).length;
      return { ...prev, levels: [...list, blankLevel({ index: floors, name: `Level ${floors + 1}` })] };
    });
  }, [updateProject, blankLevel]);

  const moveLevel = useCallback((activeId, overId) => {
    updateProject((prev) => ({ ...prev, levels: reorderById(prev.levels || [], activeId, overId) }));
  }, [updateProject]);

  const confirm = useConfirm();
  const removeLevel = useCallback(async (id) => {
    const lvl = (projectData?.estimateData?.levels || []).find((l) => l.id === id);
    const ok = await confirm({
      title: `Delete ${lvl?.name || 'this level'}?`,
      message: 'Its wall sections, panel nails and loose materials are removed too. Undo with Ctrl+Z.',
      confirmLabel: 'Delete level',
      tone: 'danger',
    });
    if (!ok) return;
    updateProject((prev) => ({ ...prev, levels: (prev.levels || []).filter((l) => l.id !== id) }));
  }, [updateProject, confirm, projectData]);

  const patchKey = useCallback((key) => (fn) => updateProject((prev) => ({
    ...prev,
    [key]: typeof fn === 'function' ? fn(prev[key] || {}) : fn,
  })), [updateProject]);
  const handleManufactureChange = useMemo(() => patchKey('manufactureEstimate'), [patchKey]);
  const handleNailsBracingChange = useMemo(() => patchKey('nailsAndBracing'), [patchKey]);

  // one pure calculation for the whole page (levels, nails & bracing, manufacture)
  const calc = useMemo(() => wallPanelsOf(estimateData), [estimateData]);
  const grandTotal = calc.total;
  const levelCalcById = useMemo(() => Object.fromEntries(calc.levels.map((l) => [l.id, l])), [calc]);

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={PanelsTopLeft} title="Wall panels" />
        <div className="empty-state">Open or create a project in Projects to start estimating wall panels.</div>
      </div>
    );
  }

  return (
    <div className="app-content">
      <PageHeader
        icon={PanelsTopLeft}
        title="Wall panels"
        meta={`${projectData.name || 'Untitled'} · ${levels.length} level${levels.length === 1 ? '' : 's'}`}
        totalLabel="Wall panels total"
        total={grandTotal}
        actions={(
          <>
            <AddRowButton onClick={() => addLevel('top')} title="Add a floor above the last level">Add level</AddRowButton>
            <AddRowButton onClick={() => addLevel('below')} title="Add a basement below the first level">Add basement</AddRowButton>
          </>
        )}
      />

      <SortableList ids={levels.map((l) => l.id)} onMove={moveLevel}>
        {levels.map((lvl, i) => (
          <SortableBlock key={lvl.id} id={lvl.id}>
            {(handle) => (
              <Level
                levelData={lvl}
                calc={levelCalcById[lvl.id]}
                isGround={i === 0}
                dragHandleProps={levels.length > 1 ? handle : undefined}
                onLevelChange={(fn) => handleLevelChangeById(lvl.id, fn)}
                onRemove={levels.length > 1 ? () => removeLevel(lvl.id) : undefined}
              />
            )}
          </SortableBlock>
        ))}
      </SortableList>

      <div className="empty-state" style={{ paddingTop: 0 }}>
        <span>Each level has its own walls, panel nails and loose materials. Drag the grip to reorder levels; use the pencil to rename one.</span>
        <div className="ew-inline">
          <AddRowButton onClick={() => addLevel('top')}>Add level</AddRowButton>
          <AddRowButton onClick={() => addLevel('below')}>Add basement</AddRowButton>
        </div>
      </div>

      <NailsAndBracing data={nailsAndBracing} calc={calc.nails} onChange={handleNailsBracingChange} totals={calc.totals} />

      <PanelsManufactureEstimate data={manufactureEstimate} calc={calc.manufacture} onChange={handleManufactureChange} />
    </div>
  );
}
