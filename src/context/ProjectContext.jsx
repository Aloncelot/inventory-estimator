// src/context/ProjectContext.jsx
// The open project: loading it, editing it (with undo/redo), saving it
// (autosave, conflict check, history entries) and who else has it open.
// Every page reads projectData and changes it through updateProject.
'use client';
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection, query, where, getDocs, Timestamp, orderBy, onSnapshot, runTransaction } from 'firebase/firestore';
import { activeOf, holderOf, isConflict, HEARTBEAT_MS } from '@/domain/presence';
import { db, auth } from '@/lib/firebase'; 
import { useAuth } from '@/AuthContext'; 
import { useCompany } from '@/context/CompanyContext';
import { addHistory, updateHistory } from '@/lib/company';
import { actorOf, changeSummary, mergeSummary, continuesEntry, approxDocBytes, DOC_LIMIT_BYTES, fmtKB } from '@/domain/team';
import { getFinalItem } from '@/lib/catalog';
import { migrateEstimate } from '@/domain/estimate/migrate';
import { withPlanLoose } from '@/domain/plans/loose';
import { slimEstimate, slimSelection } from '@/domain/lib/selection';
import { setCurrency, currencyOf } from '@/domain/lib/currency';

import {
  blankSection, blankLevel, blankTrussRow, blankLooseRow, blankLooseSection,
  blankLevelLooseSection, blankEstimateData,
} from '@/domain/estimate/blank';

const ProjectContext = createContext();

const HISTORY_LIMIT = 100;
const COALESCE_MS = 500;      // typing bursts become one undo step
const AUTOSAVE_MS = 2500;     // save this long after the last change

export function ProjectProvider({ children, initialProjectId = null }) {
    const { user } = useAuth();
    const { base, perms } = useCompany();
    // without the Estimator role the project can be seen, not changed
    const canEditRole = Boolean(perms?.canEditEstimate);
    const [projectId, setProjectId] = useState(initialProjectId);
    const [projectData, setProjectData] = useState(null);
    const [projectsList, setProjectsList] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isListLoading, setIsListLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [lastSavedAt, setLastSavedAt] = useState(null);
    // the estimate object that matches Firestore; anything else is unsaved
    const [savedEstimate, setSavedEstimate] = useState(null);
    const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
    const [appId, setAppId] = useState(null);
    // size of the project document as last saved (Firestore allows 1 MB)
    const [projectBytes, setProjectBytes] = useState(0);

    /* ── who has the project open; one person edits at a time ───────────
       Each open project keeps a presence document per person
       ({appId}/projects/{id}/presence/{uid}), refreshed every HEARTBEAT_MS.
       Opening a project nobody is editing takes it; anyone with the
       Estimator role can take over. Without presence (rules not deployed,
       offline) everybody can edit and the save check below still stops one
       save from silently overwriting another. */
    const [presence, setPresence] = useState([]);
    const [nowTick, setNowTick] = useState(() => Date.now());
    const meRef = useRef({ editing: false, editSince: null, ready: false });
    const writeMeRef = useRef(() => {});
    const uid = user?.uid;
    const presencePath = appId && projectId && uid ? `${appId}/projects/${projectId}/presence` : null;
    useEffect(() => {
        if (!presencePath || !user) { setPresence([]); return undefined; }
        const meDoc = doc(db, `${presencePath}/${user.uid}`);
        const actor = actorOf(user);
        let alive = true;
        meRef.current = { editing: false, editSince: null, ready: false };
        const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const write = () => setDoc(meDoc, {
            uid: user.uid, name: actor.name || actor.email, email: actor.email || '',
            editing: meRef.current.editing, editSince: meRef.current.editSince, at: Timestamp.now(),
            away: hidden(),
        }).catch(() => {});
        writeMeRef.current = write;
        (async () => {
            let others = [];
            try {
                const snap = await getDocs(collection(db, presencePath));
                others = activeOf(snap.docs.map((d) => d.data()).filter((p) => p.uid !== user.uid));
            } catch { /* presence unavailable: edit freely */ }
            if (!alive) return;
            meRef.current = canEditRole && !holderOf(others)
                ? { editing: true, editSince: Timestamp.now(), ready: true }
                : { editing: false, editSince: null, ready: true };
            write();
        })();
        const off = onSnapshot(collection(db, presencePath), (snap) => { setPresence(snap.docs.map((d) => d.data())); setNowTick(Date.now()); }, () => {});
        // only a visible tab keeps writing; hidden, it leaves one "away" mark and goes quiet
        const beat = setInterval(() => { if (!hidden()) write(); setNowTick(Date.now()); }, HEARTBEAT_MS);
        const onVisibility = () => { write(); setNowTick(Date.now()); };
        document.addEventListener('visibilitychange', onVisibility);
        const leave = () => { deleteDoc(meDoc).catch(() => {}); };
        window.addEventListener('pagehide', leave);
        return () => {
            alive = false; off(); clearInterval(beat);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', leave);
            leave(); setPresence([]); writeMeRef.current = () => {};
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presencePath, uid, canEditRole]);

    const active = useMemo(() => activeOf(presence, nowTick), [presence, nowTick]);
    const holder = holderOf(active);
    const lockedBy = holder && holder.uid !== uid ? holder : null;
    // someone else holds it, or the role does not allow editing
    const readOnly = !canEditRole || Boolean(lockedBy);
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;

    // lost the project to someone who took over: stop claiming it.
    // Nobody holds it any more (they closed it): take it.
    useEffect(() => {
        if (!meRef.current.ready || !presencePath) return;
        if (meRef.current.editing && lockedBy) {
            meRef.current = { ...meRef.current, editing: false, editSince: null };
            writeMeRef.current();
            // whatever was not saved yet goes in before they reload
            if (dataRef.current?.estimateData && dataRef.current.estimateData !== savedEstimateRef.current) saveRef.current?.({ lastChance: true });
        } else if (!meRef.current.editing && canEditRole && !holder && active.some((p) => p.uid === uid)) {
            meRef.current = { ...meRef.current, editing: true, editSince: Timestamp.now() };
            writeMeRef.current();
        }
    }, [lockedBy, holder, canEditRole, presencePath, active, uid]);

    // a save from someone else since this screen loaded the project
    const [conflict, setConflict] = useState(null);   // { by, at } or null
    const baseAtRef = useRef(null);
    const forceSaveRef = useRef(false);

    const dataRef = useRef(projectData);
    dataRef.current = projectData;
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;

    /* ── undo / redo history (estimateData snapshots) ───────────────── */
    const pastRef = useRef([]);
    const futureRef = useRef([]);
    const lastPushRef = useRef(0);
    const silentRef = useRef(false);
    const syncHistorySize = useCallback(() => {
        setHistorySize({ past: pastRef.current.length, future: futureRef.current.length });
    }, []);
    const resetHistory = useCallback(() => {
        pastRef.current = [];
        futureRef.current = [];
        lastPushRef.current = 0;
        syncHistorySize();
    }, [syncHistorySize]);

    // appId is the company's base path (companies/{cid}); templates and note
    // images live under it too
    useEffect(() => {
        setAppId(user && base ? base : null);
    }, [user, base]);

    const getProjectsCollectionPath = useCallback(() => (appId ? `${appId}/projects` : null), [appId]);
    const getProjectPath = useCallback((pId) => (appId && pId ? `${appId}/projects/${pId}` : null), [appId]);

    const fetchProjectsList = useCallback(async (basePath) => {
        const collectionPath = basePath ? `${basePath}/projects` : null;
        if (!collectionPath) return;
        setIsListLoading(true);
        try {
            const q = query(collection(db, collectionPath), orderBy('updatedAt', 'desc'));
            const querySnapshot = await getDocs(q);
            setProjectsList(querySnapshot.docs.map((d) => ({
                id: d.id,
                name: d.data().name || 'Untitled',
                updatedAt: d.data().updatedAt?.toDate(),
                updatedBy: d.data().updatedBy || null,
                sizeBytes: d.data().sizeBytes || 0,
                meta: d.data().meta || {},
            })));
        } catch (error) {
            console.error('Error fetching projects list:', error);
            setProjectsList([]);
        } finally {
            setIsListLoading(false);
        }
    }, []);

    const createNewProject = useCallback(async (name) => {
        const collectionPath = getProjectsCollectionPath();
        if (!user || !collectionPath || readOnlyRef.current) return null;
        setIsSaving(true);
        try {
            const actor = actorOf(user);
            const docRef = await addDoc(collection(db, collectionPath), {
                name: name || 'Untitled Project',
                ownerId: user.uid,
                createdBy: actor,
                updatedBy: actor,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                estimateData: blankEstimateData(),
            });
            fetchProjectsList(appId);
            return docRef.id;
        } catch (error) {
            console.error('Error creating new project:', error);
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [user, getProjectsCollectionPath, fetchProjectsList, appId]);

    const loadingRef = useRef(false);
    const saveRef = useRef(null);
    const dirtyRef = useRef(false);
    const loadProject = useCallback(async (pId, { discard = false } = {}) => {
        if (!pId || loadingRef.current) return;
        const path = getProjectPath(pId);
        if (!path) return;
        // never drop unsaved work when switching projects (unless asked to: a save conflict)
        if (!discard && dirtyRef.current && saveRef.current) await saveRef.current();
        setConflict(null);
        forceSaveRef.current = false;

        loadingRef.current = true;
        setIsLoading(true);
        setIsLoaded(false);
        setProjectData(null);
        setSavedEstimate(null);
        setSaveError(null);
        resetHistory();
        histEntryRef.current = null;
        setProjectId(pId);

        try {
            const docSnap = await getDoc(doc(db, path));
            if (docSnap.exists()) {
                const data = docSnap.data();
                // fill in what older projects lack, so every page can rely on these fields
                if (!data.estimateData) data.estimateData = blankEstimateData();
                const est = data.estimateData;
                if (!est.levels || est.levels.length === 0) est.levels = [blankLevel({ index: 0 })];
                if (!est.trusses) {
                    est.trusses = [blankTrussRow('Roof Trusses & Hangers'), blankTrussRow('1st Floor Trusses & Hangers')];
                } else if (est.trusses.length > 0 && est.trusses[0].base) {
                    // old format: one group with base and extra rows; now a flat list
                    const oldGroup = est.trusses[0];
                    est.trusses = [...(oldGroup.base || []), ...(oldGroup.extras || [])];
                }
                if (!est.summaryInfo) est.summaryInfo = blankEstimateData().summaryInfo;
                else {
                    if (est.summaryInfo.isTaxExempt === undefined) est.summaryInfo.isTaxExempt = false;
                    if (est.summaryInfo.taxState === undefined) est.summaryInfo.taxState = null;
                    if (est.summaryInfo.shipping === undefined) est.summaryInfo.shipping = 0;
                }
                if (est.snapshotTotals === undefined) est.snapshotTotals = null;

                if (!est.looseList) {
                    est.looseList = [
                        blankLooseSection('Foundation'),
                        blankLooseSection('Basement'),
                        blankLevelLooseSection(0),
                        blankLooseSection('Roof'),
                    ];
                } else {
                    const level1 = est.looseList.find((s) => s.name === '1st Level');
                    if (level1 && (!level1.rows || level1.rows.length === 0)) level1.rows = blankLevelLooseSection(0).rows;
                }

                // drop stored totals and slim prices; the saved copy is then
                // "dirty" only if migration changed something worth saving
                const migrated = migrateEstimate(est);
                // bring the plan's loose material (floor, blocking, hardware,
                // foam sealer and sill plates) up to date; if it changed, the
                // project shows as unsaved so the new numbers get saved
                data.estimateData = withPlanLoose(migrated);
                // the estimate version this screen starts from (to notice someone else's save)
                baseAtRef.current = data.estimateAt?.toMillis?.() || null;
                setProjectData(data);
                setSavedEstimate(migrated);
                setProjectBytes(approxDocBytes(docSnap.data()));
                setLastSavedAt(data.updatedAt?.toDate?.() || null);
            } else {
                console.log('No such project document! Cannot load:', pId);
                setProjectId(null);
            }
        } catch (error) {
            console.error('Error loading project:', pId, error);
            setProjectId(null);
        } finally {
            loadingRef.current = false;
            setIsLoading(false);
            setIsLoaded(true);
        }
    }, [getProjectPath, resetHistory]);

    /* ── saving ─────────────────────────────────────────────────────── */
    const savingRef = useRef(false);
    const savedEstimateRef = useRef(null);
    savedEstimateRef.current = savedEstimate;
    // the history entry this session keeps adding to: { id, by, atMs, sections }
    const histEntryRef = useRef(null);
    const writeHistory = useCallback(async (path, prevEst, nextEst, at) => {
        const sections = changeSummary(prevEst, nextEst);
        if (!sections.length) return;
        const actor = actorOf(user);
        const now = at.toMillis();
        const last = histEntryRef.current;
        try {
            if (continuesEntry(last, user.uid, now) && last.path === path) {
                const merged = mergeSummary(last.sections, sections);
                await updateHistory(path, last.id, { sections: merged, at, by: actor });
                histEntryRef.current = { ...last, sections: merged, atMs: now };
            } else {
                const id = await addHistory(path, { by: actor, at, startedAt: at, sections });
                histEntryRef.current = { id, path, by: actor, atMs: now, sections };
            }
        } catch (e) {
            console.warn('History entry not written:', e);
        }
    }, [user]);

    /** lastChance: the project was just taken over; save what is pending before it goes read-only. */
    const saveProject = useCallback(async ({ lastChance = false } = {}) => {
        const data = dataRef.current;
        const pId = projectIdRef.current;
        if (!user || !pId || !data || savingRef.current || (readOnlyRef.current && lastChance !== true)) return false;
        const path = getProjectPath(pId);
        if (!path) return false;

        savingRef.current = true;
        setIsSaving(true);
        const estimate = data.estimateData;
        try {
            const updatedAt = Timestamp.now();
            const updatedBy = actorOf(user);
            const before = savedEstimateRef.current;
            // meta (status, client, revisions, contract) is written on its own: never overwrite it here
            const { meta: _meta, ...rest } = data;
            const record = {
                ...rest,
                estimateData: slimEstimate(estimate),
                updatedAt,
                updatedBy,
                createdAt: data.createdAt || updatedAt,
            };
            const bytes = approxDocBytes(record);
            record.sizeBytes = bytes;
            setProjectBytes(bytes);
            if (bytes > DOC_LIMIT_BYTES) {
                throw new Error(`The project is ${fmtKB(bytes)}, over the 1 MB a project can hold. Remove unused plan walls or levels, or split the project.`);
            }
            record.estimateAt = updatedAt;   // changes only when the estimate is saved (not its information)
            await runTransaction(db, async (tx) => {
                const ref = doc(db, path);
                const snap = await tx.get(ref);
                const server = snap.data() || {};
                if (!forceSaveRef.current && isConflict(baseAtRef.current, server.estimateAt)) {
                    const err = new Error('Someone else saved this project while you had it open.');
                    err.conflict = { by: server.updatedBy || null, at: server.estimateAt?.toDate?.() || null };
                    throw err;
                }
                tx.update(ref, record);
            });
            baseAtRef.current = updatedAt.toMillis();
            forceSaveRef.current = false;
            writeHistory(path, before, estimate, updatedAt);
            // keep the in-memory estimate as is (edits made while saving stay unsaved)
            setSavedEstimate(estimate);
            setSaveError(null);
            setLastSavedAt(updatedAt.toDate());
            setProjectData((p) => (p ? { ...p, updatedAt, updatedBy } : p));
            setProjectsList((list) => list
                .map((p) => (p.id === pId ? { ...p, updatedAt: updatedAt.toDate(), updatedBy, sizeBytes: bytes } : p))
                .sort((a, b) => b.updatedAt - a.updatedAt));
            return true;
        } catch (error) {
            if (error?.conflict) setConflict(error.conflict);
            else console.error('Error saving project:', error);
            setSaveError(error?.message || 'Save failed');
            return false;
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }, [user, getProjectPath, writeHistory]);

    // a viewer's screen may refresh numbers, but nothing of theirs is saved
    const isDirty = !readOnly && Boolean(projectData && savedEstimate && projectData.estimateData !== savedEstimate);
    dirtyRef.current = isDirty;
    saveRef.current = saveProject;
    const saveStatus = readOnly ? 'readonly' : isSaving ? 'saving' : saveError ? 'error' : isDirty ? 'dirty' : 'saved';

    // autosave a moment after the last change; retried after an error
    useEffect(() => {
        if (!isDirty || isSaving || conflict) return undefined;   // a conflict waits for the person to choose
        const t = setTimeout(() => { saveProject(); }, saveError ? AUTOSAVE_MS * 4 : AUTOSAVE_MS);
        return () => clearTimeout(t);
    }, [isDirty, isSaving, saveError, conflict, projectData?.estimateData, saveProject]);

    /** After a conflict: 'reload' takes the saved version (drops mine), 'mine' saves over it. */
    const resolveConflict = useCallback(async (choice) => {
        const pId = projectIdRef.current;
        if (choice === 'reload') { setConflict(null); setSaveError(null); await loadProject(pId, { discard: true }); return; }
        forceSaveRef.current = true;
        setConflict(null);
        setSaveError(null);
        await saveRef.current?.();
    }, [loadProject]);

    /** Take the project from whoever is editing it, with the latest saved version. */
    const takeOver = useCallback(async () => {
        if (!canEditRole) return;
        meRef.current = { ...meRef.current, editing: true, editSince: Timestamp.now(), ready: true };
        await writeMeRef.current();
        // give their last autosave a moment, then start from what is saved
        setTimeout(() => { if (projectIdRef.current) loadProject(projectIdRef.current, { discard: true }); }, 1500);
    }, [canEditRole, loadProject]);

    // warn before closing the tab with unsaved changes
    useEffect(() => {
        if (!isDirty && !isSaving) return undefined;
        const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [isDirty, isSaving]);

    /* ── editing ────────────────────────────────────────────────────── */
    /**
     * Apply a change to estimateData. Every change is an undo step except:
     * changes within COALESCE_MS of the previous one (one step per burst) and
     * changes made inside runSilently (automatic defaults).
     */
    const updateProject = useCallback((updaterFn) => {
        if (readOnlyRef.current) return;
        const silent = silentRef.current;
        setProjectData((prevData) => {
            if (!prevData) return null;
            const base = prevData.estimateData || blankEstimateData();
            const next = updaterFn(base);
            if (next === base) return prevData;
            if (!silent) {
                const now = Date.now();
                const past = pastRef.current;
                // updaters may run twice in dev; never record the same state twice
                if (past[past.length - 1] !== base && now - lastPushRef.current > COALESCE_MS) {
                    past.push(base);
                    if (past.length > HISTORY_LIMIT) past.shift();
                }
                lastPushRef.current = now;
                futureRef.current = [];
            }
            return { ...prevData, estimateData: next };
        });
        if (!silent) queueMicrotask(syncHistorySize);
    }, [syncHistorySize]);

    const runSilently = useCallback((fn) => {
        const was = silentRef.current;
        silentRef.current = true;
        try { fn(); } finally { silentRef.current = was; }
    }, []);

    const undo = useCallback(() => {
        if (readOnlyRef.current) return false;
        const cur = dataRef.current;
        const prev = pastRef.current.pop();
        if (!cur || !prev) return false;
        futureRef.current.push(cur.estimateData);
        lastPushRef.current = 0;
        setProjectData({ ...cur, estimateData: prev });
        syncHistorySize();
        return true;
    }, [syncHistorySize]);

    const redo = useCallback(() => {
        if (readOnlyRef.current) return false;
        const cur = dataRef.current;
        const next = futureRef.current.pop();
        if (!cur || !next) return false;
        pastRef.current.push(cur.estimateData);
        lastPushRef.current = 0;
        setProjectData({ ...cur, estimateData: next });
        syncHistorySize();
        return true;
    }, [syncHistorySize]);

    const updateEstimateData = updateProject; // older name, still used by some pages

    /** After a project's information changed in Firestore (status, revisions, contract): show it here too. */
    const applyMeta = useCallback((pId, meta) => {
        setProjectData((p) => (p && projectIdRef.current === pId ? { ...p, meta } : p));
        setProjectsList((list) => list.map((x) => (x.id === pId ? { ...x, meta } : x)));
    }, []);

    /**
     * Brings every selected item's price up to date with the company's price
     * list: walls, panel nails, loose material and bracing. Each item is looked
     * up again by vendor, family and size; one that is no longer there keeps
     * the price it had. One undo step.
     */
    const refreshProjectPrices = useCallback(async () => {
        const data = dataRef.current;
        if (!data || readOnlyRef.current) return;
        setIsSaving(true);
        try {
            // a deep copy, changed in place below and applied in one update
            const newEstimateData = JSON.parse(JSON.stringify(data.estimateData));

            const refreshItem = async (selItem) => {
                const familyLabel = selItem?.familyLabel || selItem?.item?.familyLabel || selItem?.item?.familyDisplay;
                const sizeLabel = selItem?.sizeLabel || selItem?.item?.sizeLabel || selItem?.item?.sizeDisplay;
                if (!selItem || !selItem.vendorId || !familyLabel || !sizeLabel) return selItem;
                const latest = await getFinalItem({ familyLabel, sizeLabel, vendorId: selItem.vendorId });
                return latest ? slimSelection({ ...selItem, item: latest }) : selItem;
            };

            for (const level of newEstimateData.levels || []) {
                for (const section of [...(level.exteriorSections || []), ...(level.interiorSections || [])]) {
                    for (const key in section.sel) section.sel[key] = await refreshItem(section.sel[key]);
                    for (const ex of section.extras || []) ex.item = await refreshItem(ex.item);
                }
                for (const key in level.looseMaterials?.sel || {}) level.looseMaterials.sel[key] = await refreshItem(level.looseMaterials.sel[key]);
                for (const key in level.panelNails?.sel || {}) level.panelNails.sel[key] = await refreshItem(level.panelNails.sel[key]);
                for (const ex of level.panelNails?.extras || []) ex.sel = await refreshItem(ex.sel);
            }
            for (const key in newEstimateData.bracing?.sel || {}) newEstimateData.bracing.sel[key] = await refreshItem(newEstimateData.bracing.sel[key]);
            for (const section of newEstimateData.looseList || []) {
                for (const row of section.rows || []) row.item = await refreshItem(row.item);
                for (const key in section.sel || {}) section.sel[key] = await refreshItem(section.sel[key]);
            }

            // when the prices were last brought up to date (Revisions warns when they get old)
            updateProject((prev) => ({ ...prev, ...newEstimateData, summaryInfo: { ...(newEstimateData.summaryInfo || {}), pricesAt: new Date().toISOString() } }));
        } catch (err) {
            console.error('Error during price refresh:', err);
        } finally {
            setIsSaving(false);
        }
    }, [updateProject]);

    useEffect(() => {
        if (appId) {
            fetchProjectsList(appId);
        } else {
            setProjectsList([]);
            setProjectData(null);
            setProjectId(null);
        }
    }, [appId, fetchProjectsList]);

    // Remember which project/user combo we already tried to load, so a missing
    // document or a permission error does not trigger an endless reload loop.
    const attemptedLoadRef = useRef(null);
    useEffect(() => {
        if (initialProjectId && !projectData && !isLoading && user?.uid && appId) {
            const key = `${appId}:${initialProjectId}`;
            if (attemptedLoadRef.current === key) return;
            attemptedLoadRef.current = key;
            loadProject(initialProjectId);
        }
    }, [initialProjectId, projectData, isLoading, user?.uid, appId, loadProject]);

    // money shows in the open project's currency (set before the pages render)
    setCurrency(currencyOf(projectData?.estimateData?.summaryInfo));

    const value = useMemo(() => ({
        projectId,
        projectData,
        projectsList,
        appId,
        fetchProjectsList,
        createNewProject,
        applyMeta,
        loadProject,
        saveProject,
        updateEstimateData,
        updateProject,
        runSilently,
        undo,
        redo,
        canUndo: historySize.past > 0,
        canRedo: historySize.future > 0,
        refreshProjectPrices,
        blankLevel,
        blankSection,
        blankLooseRow,
        blankLooseSection,
        blankLevelLooseSection,
        isLoaded,
        isLoading,
        isSaving,
        isDirty,
        saveStatus,
        saveError,
        lastSavedAt,
        isListLoading,
        readOnly,
        projectBytes,
        presence: active,
        lockedBy,
        canEditRole,
        takeOver,
        conflict,
        resolveConflict,
    }), [
        projectId, projectData, projectsList, appId, fetchProjectsList, createNewProject, applyMeta,
        loadProject, saveProject, updateEstimateData, updateProject, runSilently, undo, redo, historySize,
        refreshProjectPrices, isLoaded, isLoading, isSaving, isDirty, saveStatus, saveError, lastSavedAt, isListLoading, readOnly, projectBytes,
        active, lockedBy, canEditRole, takeOver, conflict, resolveConflict,
    ]);

    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export const useProject = () => useContext(ProjectContext);
