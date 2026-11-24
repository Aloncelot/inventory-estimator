// src/components/WallPanelsView.jsx
// The Wall panels page: each level's exterior and interior wall sections,
// panel nails, temporary bracing and panel manufacture.
'use client';

import BufferBar from '@/components/BufferBar';
import { bufferPctOf } from '@/domain/markup';
import { useCallback, useMemo } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import Level from '@/components/Level';
import PanelsManufactureEstimate from '@/components/PanelsManufactureEstimate';
import Bracing from '@/components/Bracing';
import PanelTrucking from '@/components/PanelTrucking';
import { useConfirm } from '@/components/ui/confirm';
import { PageHeader, AddRowButton, SortableList, SortableBlock, reorderById } from '@/components/ui/mat';
import { wallPanelsOf } from '@/domain/estimate';
import { buildMethodOf, BUILD_GROUPS } from '@/domain/scope';
import { goTo } from '@/lib/nav';
import { useEstimateAssistant } from '@/components/assistant/useEstimateAssistant';

// active: this is the page on screen (the view stays mounted while hidden)
export default function WallPanelsView({ active = true }) {
  const { projectData, updateProject, blankLevel, isLoaded, readOnly } = useProject();

  useEstimateAssistant({
    page: 'Wall panels',
    active,
    examples: [
      'Add an exterior section on Level 1: Green ZIP R6, single studs @16", 150 LF, "Poolhouse"',
      'A 50 × 120 rectangle, 12\' high, on Level 1',
      'Make the Level 2 partitions 9\' high',
    ],
  });

  const estimateData = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (estimateData.levels || []).filter(Boolean), [estimateData.levels]);
  const manufactureEstimate = useMemo(() => estimateData.manufactureEstimate || {}, [estimateData.manufactureEstimate]);
  const bracing = useMemo(() => estimateData.bracing || {}, [estimateData.bracing]);

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
  const handleBracingChange = useMemo(() => patchKey('bracing'), [patchKey]);
  const handleTruckingChange = useMemo(() => patchKey('trucking'), [patchKey]);

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

  const bm = buildMethodOf(estimateData);
  const stickGroups = BUILD_GROUPS.filter((g) => bm[g.key] === 'stick').map((g) => g.label);
  const allStick = stickGroups.length === BUILD_GROUPS.length;

  return (
    <div className="app-content">
      <PageHeader
        icon={PanelsTopLeft}
        title="Wall panels"
        meta={`${projectData.name || 'Untitled'} · ${levels.length} level${levels.length === 1 ? '' : 's'}`}
        totalLabel="Wall panels total (with buffer)"
        total={grandTotal + Math.round((calc.total - calc.manufacture.total - calc.trucking.total) * bufferPctOf(estimateData, 'wallPanels')) / 100}
        actions={(
          <>
            <AddRowButton onClick={() => addLevel('top')} title="Add a floor above the last level">Add level</AddRowButton>
            <AddRowButton onClick={() => addLevel('below')} title="Add a basement below the first level">Add basement</AddRowButton>
          </>
        )}
      />

      <BufferBar est={estimateData} part="wallPanels" base={calc.total - calc.manufacture.total - calc.trucking.total} updateProject={updateProject} readOnly={readOnly} note="(not on manufacture or trucking)" />

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

      <Bracing data={bracing} calc={calc.bracing} onChange={handleBracingChange} />

      {stickGroups.length ? (
        <div className="ew-card wp-stick">
          {allStick
            ? 'Every wall is stick framed on site: no panel manufacture and no panel delivery.'
            : `${stickGroups.join(' and ')} are stick framed on site: left out of manufacture and delivery below.`}
          {' '}<button type="button" className="ew-link" onClick={() => goTo('summary')}>Change it in Summary</button>
        </div>
      ) : null}

      {!allStick ? <PanelsManufactureEstimate data={manufactureEstimate} calc={calc.manufacture} onChange={handleManufactureChange} /> : null}

      {!allStick ? <PanelTrucking data={estimateData.trucking} calc={calc.trucking} onChange={handleTruckingChange} /> : null}
    </div>
  );
}
