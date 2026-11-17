# Estimate Assistant (Wall panels + Loose material) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the assistant panel change the estimate from plain words on the Wall panels and Loose material pages: "create an exterior wall section on Level 1, Green ZIP R6 sheathing, single studs @16", 150 LF, for the poolhouse", "a 50 × 120 rectangle, 12' high", "add 20 joist hangers to the roof".

**Architecture:** Same pattern as the Schedule assistant (`src/domain/assistant/scheduleTools.js`): plain tool specs + a pure `runEstimateTool(est, name, args, session)` that returns a new estimate and a result for the model; the panel shows the changes and the change in the estimate total; Apply = one undo step. Materials are never invented: `find_material` searches the company's price list (async, Firestore) and returns candidates with ids; tools that set a material take one of those ids.

**Tech Stack:** Next.js 16 / React 19, plain JS (ES modules), Firebase (Firestore price list), Gemini via Firebase AI Logic (`src/lib/ai.js`), node:test (`node --import ./scripts/test-loader.mjs --test <file>`).

**Spec:** this document (the conversation's request): wall sections and loose rows from a prompt, for jobs without plans or small additions; rectangle perimeters computed in code, not by the model; propose → Apply/Discard like Schedule.

## Global Constraints

- All UI text and code comments in English; comments say what and why, no changelog notes.
- No new dependencies. Plain JavaScript, same style as `src/domain/assistant/scheduleTools.js`.
- Domain modules (`src/domain/**`) stay pure: no React, no Firebase imports. Firestore access is injected.
- The model never sets a price or invents a material: a material is set only from an id returned by `find_material` in the same request.
- Wall section kinds: exterior sections live in `level.exteriorSections` with `kind: 'exterior'`; interior sections in `level.interiorSections` with `kind` one of `partition | bearing | shear | knee`.
- Wall section fields the tools may set: `name, lengthLF, heightFt, studSpacingIn, studMultiplier, kind, sel.{bottomPlate,topPlate,studs,blocking,sheathing}`. Defaults for a new section are those of `blankSection` in `src/context/ProjectContext.jsx` (height 12, spacing 16, multiplier 1, waste {bottomPlate:10, topPlate:10, studs:60, blocking:10, sheathing:20}).
- A material selection has the shape `{ family, familyLabel, sizeLookupId, sizeLabel, vendorId, vendorName, item }` with `item` from `slimItem` (`src/domain/lib/selection.js`). Rows left without a selection get the page's defaults when the page renders (ItemPicker), so tools leave `sel` keys null unless the user names a material.
- Loose row types are the labels of `LOOSE_ITEMS` in `src/components/LooseMaterialSection.jsx`; quantities follow `rowCalcType` in `src/domain/estimate/index.js` (`lengthLF` for joist/beam/plates/studs/strapping/sheathing/tape, `area` for subfloor, `qty` for manual, `formula` for Extra).
- Existing tests must keep passing: `npm test` → 0 failures.

## Review Focus

1. A level or section name the user types loosely ("level one", "1st floor", "poolhouse wall") must resolve to the right one, or the tool fails with the candidates — never a silent wrong pick. Tested in Task 2.
2. `find_material` with no match returns `ok:false` and a message saying it is not in the price list; the model must not set a material then. Tested in Task 1.
3. A rectangle request ("50 × 120") gives 340 LF; L-shapes or lists of sides add up; nonsense (negative, zero) fails. Tested in Task 2.
4. The changes list and total delta must ignore unchanged sections and show removed ones. Tested in Task 2.
5. A draft based on an old estimate is not applied (same stale check as Schedule) — already in `AssistantContext.apply`; Task 3 keeps it working with async tools. Tested in Task 3.

---

### Task 1: Shared blank builders and material search

**Files:**
- Create: `src/domain/estimate/blank.js`
- Modify: `src/context/ProjectContext.jsx` (import the builders instead of defining them)
- Create: `src/domain/assistant/materialSearch.js`
- Test: `src/domain/assistant/materialSearch.test.mjs`

**Interfaces:**
- Produces: `blank.js` exports `generateId(prefix)`, `blankSection(props)`, `blankLevel(props)`, `blankTrussRow(label, amount)`, `blankLooseRow(type, vendor, family, size)`, `blankLooseSection(name)`, `blankLevelLooseSection(index)`, `blankEstimateData()` — moved verbatim from ProjectContext (behavior unchanged).
- Produces: `searchMaterials(query, catalog, { limit = 6 } = {}) → Promise<Array<{ id, family, size, vendor, unit, price, selection }>>` where `catalog = { getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem }` (same signatures as `src/lib/catalog.js`), `id` is `m1, m2…` in result order, `price` the item's `priceWithMarkup ?? basePrice`, `selection` the full selection shape (see Global Constraints) built with `slimItem`.

- [ ] **Step 1:** Move the blank builders to `blank.js`; ProjectContext imports them and still exposes `blankLevel, blankSection, blankLooseRow, blankLooseSection, blankLevelLooseSection` in its context value. Run `npm test` → PASS.
- [ ] **Step 2: Write the failing tests** in `materialSearch.test.mjs` with a fake catalog (families `Green Zip`, `CDX SE`, `SPF#2`; sizes `4x8'-7/16"`, `4x8'-7/16" R6`, `2x6"-10'`; two vendors):
  - `searchMaterials('green zip R6', fake)` → first result family `Green Zip`, size contains `R6`.
  - `searchMaterials('2x6 10 studs', fake)` → first result `SPF#2` `2x6"-10'`.
  - `searchMaterials('titanium beam', fake)` → `[]`.
  - each result has `id`, `price`, and `selection.item.priceDate`.
- [ ] **Step 3:** Run `node --import ./scripts/test-loader.mjs --test src/domain/assistant/materialSearch.test.mjs` → FAIL.
- [ ] **Step 4: Implement `searchMaterials`.** Score = words of the query found in `family + ' ' + size` (case-insensitive, `x`, `"`, `'`, `-` treated as separators, numbers matched as tokens); keep families with any hit, then their sizes; rank by score, ties by shorter label; fetch vendor + price only for the top `limit`; first vendor of each size (one result per size).
- [ ] **Step 5:** Tests PASS; `npm test` PASS. Commit.

### Task 2: Estimate tools (pure)

**Files:**
- Create: `src/domain/assistant/estimateTools.js`
- Test: `src/domain/assistant/estimateTools.test.mjs`

**Interfaces:**
- Consumes: `blank.js` builders; `computeWallPanels`, `computeLoose`, `sectionKind`, `rowCalcType` from `src/domain/estimate`; `tryEvaluate` from `src/domain/lib/calc`.
- Produces:
  - `ESTIMATE_TOOLS` (spec objects like `SCHEDULE_TOOLS`): `find_material {query}`, `perimeter {width, length} | {sides:[number]}`, `add_level {where:'top'|'below'}`, `add_wall_section {level, side:'exterior'|'interior', kind?, name, length_lf?, rectangle?:{width,length}, height_ft?, stud_spacing_in?, studs?:'single'|'double'|'triple', sheathing?:material_id, studs_material?, plates_material?}`, `update_wall_section {section, …same optional fields}`, `remove_wall_section {section}`, `add_loose_section {name}`, `add_loose_row {section, type, quantity?, length_lf?, area_sqft?, formula?, material?:material_id, waste_pct?, note?}`, `remove_loose_row {section, row}`.
  - `runEstimateTool(est, name, args, session) → { est, result }` — sync except `find_material`, which returns a Promise (`session.catalog` is injected; found candidates are stored in `session.materials: Map<id, selection>`; material ids from earlier calls in the same session resolve through it).
  - `findLevel(est, ref)`, `findWallSection(est, ref, level?)`, `findLooseSection(est, ref)` → `{ value } | { error }` (row number, exact name, then loose: "level one" = "Level 1", "1st level", "first floor").
  - `estimateContext(est) → string` — levels with their sections (name, side/kind, LF, height, spacing, studs ×N, sheathing label), loose sections with rows (type, qty/LF, material), and the totals `Wall panels $X · Loose $Y`.
  - `estimateChanges(before, after) → { items:[{kind:'add'|'change'|'remove', text}], totals:{ from, to } | null }` with totals = `computeWallPanels(est).total + computeLoose(est).total`.
  - `ESTIMATE_INSTRUCTIONS` (system prompt, same tone as `SCHEDULE_INSTRUCTIONS`): use tools for every change; call `find_material` before naming any material and ask when several fit; rectangles go through `rectangle` or `perimeter`, never mental math; one-to-three-sentence answers in the user's language.

- [ ] **Step 1: Write the failing tests**:
  - add_wall_section on "level 1", exterior, `rectangle {width:50,length:120}`, height 12, studs single, spacing 16 → section `lengthLF 340, heightFt 12, studMultiplier 1, studSpacingIn 16, kind 'exterior'` in `levels[0].exteriorSections`.
  - with `sheathing: 'm1'` after a session where `session.materials` has `m1` → `sel.sheathing` equals that selection; with an unknown id → `ok:false`.
  - interior `kind:'shear'` lands in `interiorSections`; `kind:'banana'` fails.
  - `perimeter {sides:[20,10,20,10]}` → 60; `{width:0,length:5}` fails.
  - update_wall_section changes only the given fields; remove_wall_section removes it.
  - findLevel resolves "level one", "Level 1", "1"; ambiguous section names return the candidates.
  - add_loose_row type `Hangers - Joist` quantity 20 → manual row qty 20; type `Joist` length_lf 120 → `inputs.lengthLF 120`; unknown type fails listing close types.
  - estimateChanges reports one 'add' item for a new section and a totals delta when prices exist.
- [ ] **Step 2:** Run the test file → FAIL.
- [ ] **Step 3:** Implement `estimateTools.js`.
- [ ] **Step 4:** Tests PASS; `npm test` PASS. Commit.

### Task 3: Async tools in the assistant context

**Files:**
- Modify: `src/context/AssistantContext.jsx`
- Modify: `src/domain/assistant/history.test.mjs` only if needed (no behavior change there)

**Interfaces:**
- Consumes: page spec `run(state, name, args, session)` which may return a Promise.
- Produces: in `send`, one `session = {}` object per request passed to every `spec.run` call; `execute` awaits `spec.run`. The schedule page keeps working unchanged (its `run` ignores `session`).

- [ ] **Step 1:** Make `execute` async and pass the session; keep the stale-draft check in `apply`.
- [ ] **Step 2:** `npm test` PASS; check the Schedule harness flow still proposes and applies (see the harness notes in the ledger). Commit.

### Task 4: Wire the pages

**Files:**
- Create: `src/components/assistant/useEstimateAssistant.js`
- Modify: `src/components/WallPanelsView.jsx`, `src/components/LooseMaterialView.jsx`
- Modify: `src/components/help/content.js` (an "Assistant" section in the Wall panels and Loose material topics)

**Interfaces:**
- Consumes: `useAssistantPage` (AssistantContext), `ESTIMATE_TOOLS`, `runEstimateTool`, `estimateContext`, `estimateChanges`, `ESTIMATE_INSTRUCTIONS`, and the catalog functions from `src/lib/catalog.js`.
- Produces: `useEstimateAssistant({ page: 'Wall panels' | 'Loose material', examples })` registering key `estimate`, title = page, subtitle = project name, state = `projectData.estimateData`, `apply: (next) => updateProject(() => next)`, `run` injecting `session.catalog` = `{ getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem }`. Not registered when read-only.
- Examples — Wall panels: `Add an exterior section on Level 1: Green ZIP R6, single studs @16", 150 LF, "Poolhouse"`, `A 50 × 120 rectangle, 12' high, on Level 1`, `Make the Level 2 partitions 9' high`. Loose material: `Add 20 joist hangers to the Roof`, `Add a "Poolhouse" section with 120 LF of 2x10 joists`.

- [ ] **Step 1:** Implement the hook and call it from both views (before any early return).
- [ ] **Step 2:** Help: one section per topic explaining what to ask and that materials come from the price list.
- [ ] **Step 3:** `npm test` PASS; syntax-check the changed JSX with esbuild. Commit.
