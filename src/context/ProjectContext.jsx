// src/context/ProjectContext.jsx
'use client';
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase'; 
import { useAuth } from '@/AuthContext'; 
import { getFinalItem } from '@/lib/catalog';

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
  exteriorSections: [blankSection({ kind: 'exterior' })],
  interiorSections: [blankSection({ kind: 'partition' })],
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
    const name = `${index === 0 ? '1st' : index === 1 ? '2nd' : (index + 1) + 'th'} Level`;
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

export function ProjectProvider({ children, initialProjectId = null }) {
     const { user } = useAuth();
     const [projectId, setProjectId] = useState(initialProjectId);
     const [projectData, setProjectData] = useState(null); 
     const [projectsList, setProjectsList] = useState([]); 
     const [isLoaded, setIsLoaded] = useState(false); 
     const [isLoading, setIsLoading] = useState(false); 
     const [isListLoading, setIsListLoading] = useState(false); 
     const [isSaving, setIsSaving] = useState(false);
     const [appId, setAppId] = useState(null); 

     useEffect(() => {
        if (user) {
            setAppId(user.uid);
        } else {
            setAppId(null);
        }
    }, [user]);

    const getProjectsCollectionPath = useCallback(() => {
        if (!appId) return null;
         return `artifacts/${appId}/projects`;
     }, [appId]);

    const getProjectPath = useCallback((pId) => {
        const collectionPath = getProjectsCollectionPath();
        if (!collectionPath || !pId) return null;
            return `artifacts/${appId}/projects/${pId}`;
    }, [getProjectsCollectionPath, appId]);

    const fetchProjectsList = useCallback(async (currentUserId) => {
        const collectionPath = currentUserId ? `artifacts/${currentUserId}/projects` : null;
        if (!collectionPath || isListLoading) return;
        setIsListLoading(true);
        try {
            const q = query(collection(db, collectionPath), orderBy('updatedAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const list = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || 'Untitled',
                updatedAt: doc.data().updatedAt?.toDate() 
            }));
            setProjectsList(list);
        } catch (error) {
            console.error("Error fetching projects list:", error);
            setProjectsList([]);
        } finally {
            setIsListLoading(false);
        }
    }, [db]);

    const createNewProject = useCallback(async (name) => {
        const collectionPath = getProjectsCollectionPath();
        if (!user || !collectionPath || isSaving) return null;
        setIsSaving(true); 
        try {
            const newProjectData = {
                name: name || "Untitled Project",
                ownerId: user.uid,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                estimateData: blankEstimateData(),
            };
            const docRef = await addDoc(collection(db, collectionPath), newProjectData);
            fetchProjectsList(appId);
            return docRef.id; 
        } catch (error) {
            console.error("Error creating new project:", error);
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [user, getProjectsCollectionPath, isSaving, db, fetchProjectsList, appId]);


    const loadProject = useCallback(async (pId) => {
        if (!pId || isLoading) return;
        const path = getProjectPath(pId);
        if (!path) return; 

        setIsLoading(true);
        setIsLoaded(false);
        setProjectData(null); 
        setProjectId(pId); 

        try {
            const docRef = doc(db, path);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                if (!data.estimateData) data.estimateData = blankEstimateData();
                if (!data.estimateData.levels || data.estimateData.levels.length === 0) {
                   data.estimateData.levels = [blankLevel({ index: 0 })];
                }
                if (!data.estimateData.trusses) {
                    data.estimateData.trusses = [
                        blankTrussRow("Roof Trusses & Hangers"),
                        blankTrussRow("1st Floor Trusses & Hangers")
                    ];
                } else if (data.estimateData.trusses.length > 0 && data.estimateData.trusses[0].base) {
                    const oldGroup = data.estimateData.trusses[0];
                    data.estimateData.trusses = [...(oldGroup.base || []), ...(oldGroup.extras || [])];
                }

                if (!data.estimateData.summaryInfo) data.estimateData.summaryInfo = blankEstimateData().summaryInfo;
                else {
                    if (data.estimateData.summaryInfo.isTaxExempt === undefined) data.estimateData.summaryInfo.isTaxExempt = false;
                    if (data.estimateData.summaryInfo.taxState === undefined) data.estimateData.summaryInfo.taxState = null;
                    if (data.estimateData.summaryInfo.shipping === undefined) data.estimateData.summaryInfo.shipping = 0;
                }
                if (data.estimateData.snapshotTotals === undefined) data.estimateData.snapshotTotals = null;

                // --- Migration for Loose List ---
                if (!data.estimateData.looseList) {
                   data.estimateData.looseList = [
                    blankLooseSection("Foundation"),
                    blankLooseSection("Basement"),
                    blankLevelLooseSection(0), // New project structure
                    blankLooseSection("Roof"),
                   ];
                } else {
                    // --- NEW: Check if 1st Level is empty in existing project ---
                    const looseList = data.estimateData.looseList;
                    const level1Index = looseList.findIndex(s => s.name === "1st Level");
                    if (level1Index !== -1) {
                        // If 1st Level exists but has 0 rows, inject the defaults
                        if (!looseList[level1Index].rows || looseList[level1Index].rows.length === 0) {
                            const template = blankLevelLooseSection(0);
                            // Copy default rows to the existing section
                            looseList[level1Index].rows = template.rows;
                        }
                    }
                }
                  
                setProjectData(data);
            } else {
                  console.log("No such project document! Cannot load:", pId);
                  setProjectId(null); 
              }
        } catch (error) {
            console.error("Error loading project:", pId, error);
            setProjectId(null); 
        } finally {
            setIsLoading(false);
            setIsLoaded(true); 
        }
    }, [isLoading, getProjectPath, db]);

     const saveProject = useCallback(async (pId = projectId, data = projectData) => {
         if (!user || !pId || !data || isSaving) return;
         const path = getProjectPath(pId);
          if (!path) return; 

         setIsSaving(true);
         try {
             const docRef = doc(db, path);
             const saveData = {
                 ...data,
                 updatedAt: Timestamp.now(),
                 createdAt: data.createdAt || Timestamp.now(), 
             };
             await setDoc(docRef, saveData, { merge: true }); 
             setProjectData(saveData);
             setProjectsList(list => list.map(p => p.id === pId ? {...p, updatedAt: saveData.updatedAt.toDate()} : p).sort((a,b) => b.updatedAt - a.updatedAt));
         } catch (error) {
             console.error("Error saving project:", error);
         } finally {
             setIsSaving(false);
         }
     }, [user, projectId, projectData, isSaving, getProjectPath, db]);

    const updateProject = useCallback((updaterFn) => {
         setProjectData(prevData => {
             if (!prevData) return null;
             const newEstimateData = updaterFn(prevData.estimateData || blankEstimateData());
             return {
                 ...prevData,
                estimateData: newEstimateData
            };
        });
    }, []); 

    const updateEstimateData = updateProject;

    const refreshProjectPrices = useCallback(async () => {
      if (!projectData) return;
      setIsSaving(true); 

      try {
        let newEstimateData = JSON.parse(JSON.stringify(projectData.estimateData));

        const refreshItem = async (selItem) => {
          if (!selItem || !selItem.vendorId || !selItem.familyLabel || !selItem.sizeLabel) return selItem;
          const latestItemData = await getFinalItem({
            familyLabel: selItem.familyLabel,
            sizeLabel: selItem.sizeLabel,
            vendorId: selItem.vendorId,
          });
          if (latestItemData) return { ...selItem, item: latestItemData };
          else return selItem;
        };

        for (const level of newEstimateData.levels) {
          const allSections = [...(level.exteriorSections || []), ...(level.interiorSections || [])];
          for (const section of allSections) {
            for (const key in section.sel) section.sel[key] = await refreshItem(section.sel[key]);
            for (let i = 0; i < section.extras.length; i++) section.extras[i].item = await refreshItem(section.extras[i].item);
          }
          if (level.looseMaterials?.sel) {
            for (const key in level.looseMaterials.sel) level.looseMaterials.sel[key] = await refreshItem(level.looseMaterials.sel[key]);
          }
          if (level.panelNails?.sel) {
             for (const key in level.panelNails.sel) level.panelNails.sel[key] = await refreshItem(level.panelNails.sel[key]);
          }
        }
        
        if (newEstimateData.nailsAndBracing?.sel) {
           for (const key in newEstimateData.nailsAndBracing.sel) newEstimateData.nailsAndBracing.sel[key] = await refreshItem(newEstimateData.nailsAndBracing.sel[key]);
        }
        
        if (newEstimateData.looseList) {
           for (const section of newEstimateData.looseList) {
               for (let i = 0; i < section.rows.length; i++) {
                   section.rows[i].item = await refreshItem(section.rows[i].item);
               }
               if (section.sel) {
                 for (const key in section.sel) {
                   section.sel[key] = await refreshItem(section.sel[key]);
                 }
               }
           }
        }

        updateProject(prev => ({ ...prev, ...newEstimateData }));
        console.log("Price refresh complete!");
      } catch (err) {
        console.error("Error during price refresh:", err);
      } finally {
        setIsSaving(false); 
      }
    }, [projectData, updateProject]);

    useEffect(() => {
        if (appId) {
            fetchProjectsList(appId);
        } else {
            setProjectsList([]); 
            setProjectData(null); 
            setProjectId(null);
        }
    }, [appId, fetchProjectsList]);

     useEffect(() => {
        if (initialProjectId && !projectData && !isLoading && user?.uid) {
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
         refreshProjectPrices, 
         blankLevel,
         blankSection,
         blankLooseRow, 
         blankLooseSection, 
         blankLevelLooseSection, 
         isLoaded,
         isLoading,
         isSaving,
         isListLoading
     }), [
         projectId, projectData, projectsList, appId, fetchProjectsList, createNewProject,
         loadProject, saveProject, updateEstimateData, updateProject,
         refreshProjectPrices, 
         isLoaded, isLoading, isSaving, isListLoading
     ]);

     return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
 }

 export const useProject = () => {
     return useContext(ProjectContext);
 };