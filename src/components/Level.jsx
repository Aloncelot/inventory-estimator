// src/components/Level.jsx
// A floor level: the only boxed container on the Wall Panels page.
// Level total = exterior + interior sections + panel nails + loose materials.
'use client';

import { useCallback, useMemo } from 'react';
import LoosePanelMaterials from '@/components/LoosePanelMaterials';
import ExteriorWalls from '@/components/ExteriorWalls';
import InteriorWalls from '@/components/InteriorWalls';
import PanelNails from '@/components/PanelNails';
import EditableTitle from './ui/EditableTitle';
import { GripVertical } from 'lucide-react';
import { Chevron, Collapse, RemoveIconButton, fmtMoney } from '@/components/ui/mat';
import { LEVEL_NAME_SUGGESTIONS } from '@/domain/lib/levelNames';
import { isGroundLevelName } from '@/domain/lib/defaults';
import { computeLevel } from '@/domain/estimate';

export default function Level({ levelData, calc: calcProp, isGround, onLevelChange, onRemove, dragHandleProps }) {
  const { id, name, collapsed = false } = levelData;

  const exteriorSections = useMemo(() => (levelData.exteriorSections || []).filter(Boolean), [levelData.exteriorSections]);
  const interiorSections = useMemo(() => (levelData.interiorSections || []).filter(Boolean), [levelData.interiorSections]);
  const looseMaterials = useMemo(() => levelData.looseMaterials || {}, [levelData.looseMaterials]);
  const panelNails = useMemo(() => levelData.panelNails || {}, [levelData.panelNails]);

  const patch = useCallback((key) => (updater) => {
    onLevelChange((prev) => ({
      ...prev,
      [key]: typeof updater === 'function' ? updater(prev[key] || (Array.isArray(prev[key]) ? [] : {})) : updater,
    }));
  }, [onLevelChange]);

  const handleExteriorChange = useCallback((fn) => onLevelChange((p) => ({ ...p, exteriorSections: fn(p.exteriorSections || []) })), [onLevelChange]);
  const handleInteriorChange = useCallback((fn) => onLevelChange((p) => ({ ...p, interiorSections: fn(p.interiorSections || []) })), [onLevelChange]);
  const handlePanelNailsChange = useMemo(() => patch('panelNails'), [patch]);
  const handleLooseChange = useMemo(() => patch('looseMaterials'), [patch]);

  // every number comes from computeLevel (src/domain/estimate)
  const calc = calcProp || computeLevel(levelData);
  const d = calc.derived;
  const levelTotal = calc.total;
  // the lowest level sits on the foundation: its bottom plates default to PT
  const groundLevel = isGround ?? isGroundLevelName(name);

  const open = !collapsed;
  const levelName = name || 'Level';

  return (
    <section className="lvl" aria-label={levelName}>
      <div className="lvl-head">
        {dragHandleProps ? <span className="drag-handle" title="Drag to reorder levels" {...dragHandleProps}><GripVertical size={16} /></span> : null}
        <Chevron open={open} onClick={() => onLevelChange((p) => ({ ...p, collapsed: open }))} label={levelName} />
        <EditableTitle value={levelName} onChange={(v) => onLevelChange((p) => ({ ...p, name: v }))} textClass="text-h1" suggestions={LEVEL_NAME_SUGGESTIONS} label="level" />
        <span className="ew-subtle">
          {(d.extLengthSum).toLocaleString('en-US')} LF ext · {(d.int2x6LF + d.int2x4LF).toLocaleString('en-US')} LF int · {d.panelSheetsAll} sheets
        </span>
        <div className="lvl-total">
          <span className="lbl">Level total</span>
          <span className="money-level">{fmtMoney(levelTotal)}</span>
        </div>
        {onRemove ? <RemoveIconButton onClick={onRemove} title="Remove level" /> : null}
      </div>

      <Collapse open={open}>
        <div className="lvl-body">
          <ExteriorWalls sectionsData={exteriorSections} calcs={calc.exterior} groundLevel={groundLevel} onSectionsChange={handleExteriorChange} title="Exterior walls" />
          <InteriorWalls sectionsData={interiorSections} calcs={calc.interior} groundLevel={groundLevel} onSectionsChange={handleInteriorChange} title="Interior walls" />

          <div className="cat">
            <div className="cat-head">
              <span className="cat-title">Level materials</span>
              <div className="cat-total">
                <span className="lbl">Nails + loose</span>
                <span className="money-section">{fmtMoney(calc.panelNails.total + calc.loose.subtotal)}</span>
              </div>
            </div>
            <PanelNails
              data={panelNails}
              calc={calc.panelNails}
              onChange={handlePanelNailsChange}
              title="Panel nails"
              ptPlatePiecesPanels={d.panelPtBoardsAll}
              totalPanelSheets={d.panelSheetsAll}
              totalBottomPlatePiecesPanel={d.totalBottomPlatePiecesPanelAll}
            />
            <LoosePanelMaterials
              data={looseMaterials}
              calc={calc.loose}
              onChange={handleLooseChange}
              title="Loose materials (wall panels)"
            />
          </div>
        </div>
      </Collapse>
    </section>
  );
}
