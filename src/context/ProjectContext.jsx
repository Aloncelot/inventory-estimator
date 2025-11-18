// src/context/ProjectContext.jsx
'use client';
 import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
 import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
 import { db, auth } from '@/lib/firebase'; 
 import { useAuth } from '@/AuthContext'; 
 import { getFinalItem } from '@/lib/catalog';

 const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);

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


 const blankEstimateData = () => ({
  levels: [blankLevel({ index: 0 })],
  manufactureEstimate: {},
  nailsAndBracing: {},
  trusses: [
    blankTrussRow("Roof Trusses & Hangers"),
    blankTrussRow("1st Floor Trusses & Hangers")
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
 // ------------------------------------------

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

     // --- App ID (from auth user) ---
     useEffect(() => {
        if (user) {
            setAppId(user.uid);
        } else {
            setAppId(null);
        }
    }, [user]);

     // --- Firestore Path ---
    const getProjectsCollectionPath = useCallback(() => {
        if (!appId) {
            return null;
        };
         return `artifacts/${appId}/projects`;
     }, [appId]);

    const getProjectPath = useCallback((pId) => {
        const collectionPath = getProjectsCollectionPath();
        if (!collectionPath || !pId) return null;
            return `artifacts/${appId}/projects/${pId}`;
    }, [getProjectsCollectionPath, appId]);

    // --- Fetch Project List ---
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

    // --- Create New Project ---
    const createNewProject = useCallback(async (name) => {
        const collectionPath = getProjectsCollectionPath();
        if (!user || !collectionPath || isSaving) {
            console.error("Cannot create project: User not logged in, path missing, or already saving.");
            return null;
        }

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


    // --- Load Project ---
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
                
                if (!data.estimateData) {
                   data.estimateData = blankEstimateData();
                }
                if (!data.estimateData.levels || data.estimateData.levels.length === 0) {
                   data.estimateData.levels = [blankLevel({ index: 0 })];
                }                
                if (!data.estimateData.trusses) {
                    data.estimateData.trusses = [
                        blankTrussRow("Roof Trusses & Hangers"),
                        blankTrussRow("1st Floor Trusses & Hangers")
                    ];
                } else if (
                    data.estimateData.trusses.length > 0 && 
                    data.estimateData.trusses[0].base
                ) {
                    const oldGroup = data.estimateData.trusses[0];
                    data.estimateData.trusses = [
                        ...(oldGroup.base || []),
                        ...(oldGroup.extras || [])
                    ];
                }

                // *** NUEVO: Asegurar que los datos de impuestos existan en proyectos antiguos ***
                if (!data.estimateData.summaryInfo) {
                    data.estimateData.summaryInfo = blankEstimateData().summaryInfo;
                } else {
                    if (data.estimateData.summaryInfo.isTaxExempt === undefined) {
                        data.estimateData.summaryInfo.isTaxExempt = false;
                    }
                    if (data.estimateData.summaryInfo.taxState === undefined) {
                        data.estimateData.summaryInfo.taxState = null;
                    }
                    if (data.estimateData.summaryInfo.shipping === undefined) {
                        data.estimateData.summaryInfo.shipping = 0;
                    }
                }                  
                if (data.estimateData.snapshotTotals === undefined) {
                  data.estimateData.snapshotTotals = null;
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

     // --- Save Project ---
     const saveProject = useCallback(async (pId = projectId, data = projectData) => {
         if (!user || !pId || !data || isSaving) {
            console.error("Cannot save project: User not logged in or missing data/ID.");
            return;
        }
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

    // --- updateProject ---
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
      if (!projectData) {
        console.error("No project data to refresh.");
        return;
      }

      console.log("Starting price refresh...");
      setIsSaving(true); // Show loading spinner

      try {
        // Create a deep copy of the estimate data to modify
        let newEstimateData = JSON.parse(JSON.stringify(projectData.estimateData));

        // Helper function to refresh a single item selection object (like sel.studs)
        const refreshItem = async (selItem) => {
          if (!selItem || !selItem.vendorId || !selItem.familyLabel || !selItem.sizeLabel) {
            return selItem; // Can't refresh this item
          }
          
          const latestItemData = await getFinalItem({
            familyLabel: selItem.familyLabel,
            sizeLabel: selItem.sizeLabel,
            vendorId: selItem.vendorId,
          });

          if (latestItemData) {
            // Overwrite the 'item' object with the fresh data from Firestore
            return { ...selItem, item: latestItemData };
          } else {
            // If item not found (maybe discontinued), keep the old one
            console.warn(`Could not refresh price for ${selItem.familyLabel} | ${selItem.sizeLabel}`);
            return selItem;
          }
        };

        // 1. Refresh Levels (Exterior/Interior/Loose/Nails)
        for (const level of newEstimateData.levels) {
          // --- Exterior/Interior Sections ---
          const allSections = [
            ...(level.exteriorSections || []), 
            ...(level.interiorSections || [])
          ];
          for (const section of allSections) {
            // Refresh 'sel' object (studs, plates, etc.)
            for (const key in section.sel) {
              section.sel[key] = await refreshItem(section.sel[key]);
            }
            // Refresh 'extras' array
            for (let i = 0; i < section.extras.length; i++) {
              section.extras[i].item = await refreshItem(section.extras[i].item);
            }
          }
          
          // --- LoosePanelMaterials & PanelNails ---
          if (level.looseMaterials?.sel) {
            for (const key in level.looseMaterials.sel) {
              level.looseMaterials.sel[key] = await refreshItem(level.looseMaterials.sel[key]);
            }
          }
          if (level.panelNails?.sel) {
             for (const key in level.panelNails.sel) {
              level.panelNails.sel[key] = await refreshItem(level.panelNails.sel[key]);
            }
          }
        }
        
        // 2. Refresh General Nails & Bracing
        if (newEstimateData.nailsAndBracing?.sel) {
           for (const key in newEstimateData.nailsAndBracing.sel) {
              newEstimateData.nailsAndBracing.sel[key] = await refreshItem(newEstimateData.nailsAndBracing.sel[key]);
            }
        }
        
        // 3. Refresh Trusses (Trusses are manual $, no items to refresh)

        // 4. Update the main project state with the new data
        updateProject(prev => ({ ...prev, ...newEstimateData }));
        
        console.log("Price refresh complete!");

      } catch (err) {
        console.error("Error during price refresh:", err);
      } finally {
        setIsSaving(false); // Hide loading spinner
      }

    }, [projectData, updateProject]);

    // --- (Resto de los hooks: auto-fetch, auto-load, context value... no cambian) ---
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
         isLoaded,
         isLoading,
         isSaving,
         isListLoading
     }), [
         projectId, projectData, projectsList, appId, fetchProjectsList, createNewProject,
         loadProject, saveProject, updateEstimateData, updateProject,
         isLoaded, isLoading, isSaving, isListLoading, refreshProjectPrices
     ]);

     return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
 }

 export const useProject = () => {
     return useContext(ProjectContext);
 };