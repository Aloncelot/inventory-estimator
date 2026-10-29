// src/context/ProjectContext.jsx
'use client';
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase'; 
import { useAuth } from '@/AuthContext'; 
import { getFinalItem } from '@/lib/catalog';
import { migrateEstimate } from '@/domain/estimate/migrate';
import { slimEstimate, slimSelection } from '@/domain/lib/selection';

const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);

// --- 1. DEFINE THE DEFAULT BLANK STRUCTURE ---
const blankSection = (props = {}) => ({
  id: generateId('section-'),
  name: "",
  lengthLF: 0,
  heightFt: 12,
  studSpacingIn: 16,
  studMultiplier: 1,
  kind: props.kind || 'partition',
  waste: { bottomPlate: 10, topPlate: 10, studs: 60, blocking: 10, sheathing: 20 },
  sel: { bottomPlate:null, topPlate:null, studs:null, blocking:null, sheathing:null },
  notes: {},
  extras: [],
  ...props,
});

const blankLevel = (props = {}) => ({
  id: generateId('level-'),
  name: `Level ${props.index + 1 || 1}`,
  exteriorSections: [blankSection({ kind: 'exterior', name: 'Section 1' })],
  interiorSections: [blankSection({ kind: 'partition', name: 'Section 1' })],
  looseMaterials: {},
  panelNails: {},
  ...props,
});

const blankTrussRow = (label, defaultAmount = 0) => ({
  id: generateId('truss-'),
  label: label,
  subtotal: defaultAmount,
});

// Helper to create rows with defaults
const blankLooseRow = (type, vendor, family, size) => ({
  id: generateId('loose-item-'),
  type: type || 'Custom Item',
  item: null, 
  defaultVendor: vendor,
  defaultFamily: family,
  defaultSize: size,
  qty: 0,
  wastePct: 5,
  notes: '',
  plan: '',
  inputs: {},
});

const blankLooseSection = (name = "New Section") => ({
  id: generateId('loose-sec-'),
  name: name,
  rows: [], 
  collapsed: false,
  inputs: {}, 
  sel: {},    
  waste: {},  
});

// --- Template for Level sections (1st Level, etc.) ---
const blankLevelLooseSection = (index) => {
    const n = index + 1;
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    const name = `${n}${suffix} Level`;
    return {
        id: generateId('loose-sec-'),
        name: name,
        collapsed: false,
        inputs: {}, 
        sel: {},    
        waste: {},
        rows: [
            blankLooseRow("Rimboard", "Gillies & Prittie Warehouse", "SPF#2", `2x4"-16'`),
            blankLooseRow("Joist", "Gillies & Prittie Warehouse", "SPF#2", `2x12"-16'`),
            blankLooseRow("I-Joist", "Gillies & Prittie Warehouse", "NI-60 I-Joists", `2-1/2x14"`),
            blankLooseRow("Beams", "Gillies & Prittie Warehouse", "LVL", `1-3/4x9-1/2"`),
            blankLooseRow("Beams", "Gillies & Prittie Warehouse", "SPF#2", `2x12"-10'`),
            blankLooseRow("Blocking", "Gillies & Prittie Warehouse", "SPF#2", `2x12"-16'`),
            blankLooseRow("Subfloor", "Gillies & Prittie Warehouse", "OSB T&G", `4x8'-3/4"`),
            blankLooseRow("Glue", "Gillies & Prittie Warehouse", "Construction Adhesive", `28oz-ea`),
            blankLooseRow("Strapping", "Gillies & Prittie Warehouse", "Strapping", `1x3"-16'`),
        ]
    };
};

const blankEstimateData = () => ({
  levels: [blankLevel({ index: 0 })],
  manufactureEstimate: {},
  nailsAndBracing: {},
  trusses: [
    blankTrussRow("Roof Trusses & Hangers"),
    blankTrussRow("1st Floor Trusses & Hangers")
  ],
  looseList: [
    blankLooseSection("Foundation"),
    blankLooseSection("Basement"),
    blankLevelLooseSection(0), // Default with rows
    blankLooseSection("Roof"),
  ],
  summaryInfo: {
    projectName: "",
    address: "",
    drawingsDate: "",
    estimateDate: "",
    isTaxExempt: false,
    taxState: null,
    shipping: 0,
  },
  snapshotTotals: null 
});

const ProjectContext = createContext();

const HISTORY_LIMIT = 100;
const COALESCE_MS = 500;      // typing bursts become one undo step
const AUTOSAVE_MS = 2500;     // save this long after the last change

export function ProjectProvider({ children, initialProjectId = null }) {
    const { user } = useAuth();
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

    useEffect(() => {
        setAppId(user ? user.uid : null);
    }, [user]);

    const getProjectsCollectionPath = useCallback(() => (appId ? `artifacts/${appId}/projects` : null), [appId]);
    const getProjectPath = useCallback((pId) => (appId && pId ? `artifacts/${appId}/projects/${pId}` : null), [appId]);

    const fetchProjectsList = useCallback(async (currentUserId) => {
        const collectionPath = currentUserId ? `artifacts/${currentUserId}/projects` : null;
        if (!collectionPath) return;
        setIsListLoading(true);
        try {
            const q = query(collection(db, collectionPath), orderBy('updatedAt', 'desc'));
            const querySnapshot = await getDocs(q);
            setProjectsList(querySnapshot.docs.map((d) => ({
                id: d.id,
                name: d.data().name || 'Untitled',
                updatedAt: d.data().updatedAt?.toDate(),
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
        if (!user || !collectionPath) return null;
        setIsSaving(true);
        try {
            const docRef = await addDoc(collection(db, collectionPath), {
                name: name || 'Untitled Project',
                ownerId: user.uid,
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
    const loadProject = useCallback(async (pId) => {
        if (!pId || loadingRef.current) return;
        const path = getProjectPath(pId);
        if (!path) return;
        // never drop unsaved work when switching projects
        if (dirtyRef.current && saveRef.current) await saveRef.current();

        loadingRef.current = true;
        setIsLoading(true);
        setIsLoaded(false);
        setProjectData(null);
        setSavedEstimate(null);
        setSaveError(null);
        resetHistory();
        setProjectId(pId);

        try {
            const docSnap = await getDoc(doc(db, path));
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (!data.estimateData) data.estimateData = blankEstimateData();
                const est = data.estimateData;
                if (!est.levels || est.levels.length === 0) est.levels = [blankLevel({ index: 0 })];
                if (!est.trusses) {
                    est.trusses = [blankTrussRow('Roof Trusses & Hangers'), blankTrussRow('1st Floor Trusses & Hangers')];
                } else if (est.trusses.length > 0 && est.trusses[0].base) {
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
                data.estimateData = migrateEstimate(est);
                setProjectData(data);
                setSavedEstimate(data.estimateData);
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
    const saveProject = useCallback(async () => {
        const data = dataRef.current;
        const pId = projectIdRef.current;
        if (!user || !pId || !data || savingRef.current) return false;
        const path = getProjectPath(pId);
        if (!path) return false;

        savingRef.current = true;
        setIsSaving(true);
        const estimate = data.estimateData;
        try {
            const updatedAt = Timestamp.now();
            await setDoc(doc(db, path), {
                ...data,
                estimateData: slimEstimate(estimate),
                updatedAt,
                createdAt: data.createdAt || updatedAt,
            });
            // keep the in-memory estimate as is (edits made while saving stay unsaved)
            setSavedEstimate(estimate);
            setSaveError(null);
            setLastSavedAt(updatedAt.toDate());
            setProjectData((p) => (p ? { ...p, updatedAt } : p));
            setProjectsList((list) => list
                .map((p) => (p.id === pId ? { ...p, updatedAt: updatedAt.toDate() } : p))
                .sort((a, b) => b.updatedAt - a.updatedAt));
            return true;
        } catch (error) {
            console.error('Error saving project:', error);
            setSaveError(error?.message || 'Save failed');
            return false;
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }, [user, getProjectPath]);

    const isDirty = Boolean(projectData && savedEstimate && projectData.estimateData !== savedEstimate);
    dirtyRef.current = isDirty;
    saveRef.current = saveProject;
    const saveStatus = isSaving ? 'saving' : saveError ? 'error' : isDirty ? 'dirty' : 'saved';

    // autosave a moment after the last change; retried after an error
    useEffect(() => {
        if (!isDirty || isSaving) return undefined;
        const t = setTimeout(() => { saveProject(); }, saveError ? AUTOSAVE_MS * 4 : AUTOSAVE_MS);
        return () => clearTimeout(t);
    }, [isDirty, isSaving, saveError, projectData?.estimateData, saveProject]);

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
        const cur = dataRef.current;
        const next = futureRef.current.pop();
        if (!cur || !next) return false;
        pastRef.current.push(cur.estimateData);
        lastPushRef.current = 0;
        setProjectData({ ...cur, estimateData: next });
        syncHistorySize();
        return true;
    }, [syncHistorySize]);

    const updateEstimateData = updateProject;

    const refreshProjectPrices = useCallback(async () => {
        const data = dataRef.current;
        if (!data) return;
        setIsSaving(true);
        try {
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
            for (const key in newEstimateData.nailsAndBracing?.sel || {}) newEstimateData.nailsAndBracing.sel[key] = await refreshItem(newEstimateData.nailsAndBracing.sel[key]);
            for (const ex of newEstimateData.nailsAndBracing?.extras || []) ex.sel = await refreshItem(ex.sel);
            for (const section of newEstimateData.looseList || []) {
                for (const row of section.rows || []) row.item = await refreshItem(row.item);
                for (const key in section.sel || {}) section.sel[key] = await refreshItem(section.sel[key]);
            }

            updateProject((prev) => ({ ...prev, ...newEstimateData }));
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
        if (initialProjectId && !projectData && !isLoading && user?.uid) {
            const key = `${user.uid}:${initialProjectId}`;
            if (attemptedLoadRef.current === key) return;
            attemptedLoadRef.current = key;
            loadProject(initialProjectId);
        }
    }, [initialProjectId, projectData, isLoading, user?.uid, loadProject]);

    const value = useMemo(() => ({
        projectId,
        projectData,
        projectsList,
        appId,
        fetchProjectsList,
        createNewProject,
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
    }), [
        projectId, projectData, projectsList, appId, fetchProjectsList, createNewProject,
        loadProject, saveProject, updateEstimateData, updateProject, runSilently, undo, redo, historySize,
        refreshProjectPrices, isLoaded, isLoading, isSaving, isDirty, saveStatus, saveError, lastSavedAt, isListLoading,
    ]);

    return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export const useProject = () => useContext(ProjectContext);
