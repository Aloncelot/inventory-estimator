// Connects the assistant panel to the estimate pages (Wall panels, Loose material):
// the same estimate tools work on both, on the open project's estimate.
import { useProject } from '@/context/ProjectContext';
import { useAssistantPage } from '@/context/AssistantContext';
import { ESTIMATE_TOOLS, ESTIMATE_INSTRUCTIONS, runEstimateTool, describeWallSection, estimateContext, estimateChanges } from '@/domain/assistant/estimateTools';
import { resolveDefaultSelection } from '@/components/ItemPicker';
import { wallRowDefaults } from '@/domain/lib/defaults';
import { getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem } from '@/lib/catalog';

const catalog = { getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem };

const WALL_KEYS = ['bottomPlate', 'topPlate', 'studs', 'blocking', 'sheathing'];
const isEmptySel = (v) => !v || (!v.family && !v.vendorId && !v.item);

// Fill a section's empty material keys with the page defaults, as the page's
// pickers do when it shows the section, so the draft's total matches what the
// page will show. A default the price list lacks stays empty.
async function withPageDefaults(est, sectionId) {
  const levels = est.levels || [];
  for (let li = 0; li < levels.length; li++) {
    for (const variant of ['exterior', 'interior']) {
      const key = `${variant}Sections`;
      const idx = (levels[li][key] || []).findIndex((s) => s.id === sectionId);
      if (idx < 0) continue;
      const sec = levels[li][key][idx];
      // same input as the page (WallPanelsView passes isGround={i === 0}): only the lowest level is on the foundation
      const groundLevel = li === 0;
      const sel = { ...(sec.sel || {}) };
      let changed = false;
      for (const k of WALL_KEYS) {
        if (k === 'sheathing' && variant === 'interior' && sec.kind !== 'shear') continue;
        if (!isEmptySel(sel[k])) continue;
        try {
          const d = await resolveDefaultSelection(wallRowDefaults(variant, k, { groundLevel, studSize: sec.planSize }));
          if (d) { sel[k] = d; changed = true; }
        } catch { /* leave it empty */ }
      }
      if (!changed) return est;
      const nextSec = { ...sec, sel };
      return { ...est, levels: levels.map((l, i) => (i === li ? { ...l, [key]: l[key].map((x, j) => (j === idx ? nextSec : x)) } : l)) };
    }
  }
  return est;
}

// the wall section a tool call added or replaced (sections are copied on change)
function changedSectionId(before, after) {
  const old = new Map();
  for (const l of before.levels || []) for (const k of ['exteriorSections', 'interiorSections']) for (const x of l[k] || []) old.set(x.id, x);
  for (const l of after.levels || []) for (const k of ['exteriorSections', 'interiorSections']) for (const x of l[k] || []) if (old.get(x.id) !== x) return x.id;
  return null;
}

/** Call before any early return in the view. Not registered when the project is read-only. */
export function useEstimateAssistant({ page, examples, active = true }) {
  const { projectData, updateProject, readOnly } = useProject();
  const est = projectData?.estimateData || {};

  useAssistantPage({
    key: active && projectData && !readOnly ? 'estimate' : undefined,
    title: page,
    subtitle: projectData?.name || '',
    examples,
    system: ESTIMATE_INSTRUCTIONS,
    tools: ESTIMATE_TOOLS,
    context: (s) => estimateContext(s),
    getState: () => est,
    // find_material reads the price list through the per-request session
    run: (s, name, args, session) => {
      session.catalog = catalog;
      const finish = async ({ est: next, result }) => {
        if (result?.ok && (name === 'add_wall_section' || name === 'update_wall_section')) {
          const id = changedSectionId(s, next);
          if (id) {
            const filled = await withPageDefaults(next, id);
            if (filled !== next) { next = filled; result = { ...result, ...describeWallSection(next, id) }; }
          }
        }
        return { state: next, result };
      };
      return Promise.resolve(runEstimateTool(s, name, args, session)).then(finish);
    },
    changes: (before, after) => estimateChanges(before, after),
    apply: (next) => updateProject(() => next),
  });
}
