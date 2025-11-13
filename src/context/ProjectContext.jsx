// src/context/ProjectContext.jsx
'use client';
 import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
 import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
 import { db, auth } from '@/lib/firebase'; 
 import { useAuth } from '@/AuthContext'; 

 // Helper to generate unique IDs
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

 const blankEstimateData = () => ({
  levels: [blankLevel({ index: 0 })],
  manufactureEstimate: {},
  nailsAndBracing: {},
  summaryInfo: {
    projectName: "",
    address: "",
    drawingsDate: "",
    estimateDate: ""
  }
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
     const [appId, setAppId] = useState(null); // <-- Start as null, not 'default-app-id'

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
            // This is noisy, let's remove the console.error
            // console.error("Cannot get projects collection path: Missing appId.");
            return null;
        };
         // Using private user path
         return `artifacts/${appId}/projects`; // <-- Removed 'public'
     }, [appId]);

    const getProjectPath = useCallback((pId) => {
        const collectionPath = getProjectsCollectionPath();
        if (!collectionPath || !pId) return null;
            return `artifacts/${appId}/projects/${pId}`; // <-- Removed 'public'
    }, [getProjectsCollectionPath, appId]); // Added appId

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
                // **THIS IS THE FIX**: Set the default estimate data
                estimateData: blankEstimateData(), 
            };
            const docRef = await addDoc(collection(db, collectionPath), newProjectData);
            fetchProjectsList(appId); // Refresh the list
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
                
                // **THIS IS THE FIX**: If project has no estimateData, create it
                if (!data.estimateData) {
                   data.estimateData = blankEstimateData();
                }
                // **THIS IS THE FIX**: If estimateData has no levels, create one
                if (!data.estimateData.levels || data.estimateData.levels.length === 0) {
                   data.estimateData.levels = [blankLevel({ index: 0 })];
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

    // **THIS IS THE FIX**: The stable updater function
    const updateProject = useCallback((updaterFn) => {
         setProjectData(prevData => {
             if (!prevData) return null;
             // updaterFn is (prevEstimate) => newEstimate
             const newEstimateData = updaterFn(prevData.estimateData || blankEstimateData());
             return {
                 ...prevData,
                estimateData: newEstimateData
            };
        });
    }, []); 

    // Legacy function, points to new one
    const updateEstimateData = updateProject;

    // --- Auto-fetch list on user/appId change ---
    useEffect(() => {
        if (appId) {
            fetchProjectsList(appId);
        } else {
            setProjectsList([]); 
            setProjectData(null); 
            setProjectId(null);
        }
    }, [appId, fetchProjectsList]);

    // --- Auto-load initial project ID ---
     useEffect(() => {
        if (initialProjectId && !projectData && !isLoading && user?.uid) {
            loadProject(initialProjectId);
        }
     }, [initialProjectId, projectData, isLoading, user?.uid, loadProject]);
    
     // --- Context Value ---
     const value = useMemo(() => ({
         projectId,
         projectData,
         projectsList,
         appId,
         fetchProjectsList,
         createNewProject,
         loadProject,
         saveProject,
         updateEstimateData, // Pass legacy
         updateProject,      // Pass new stable updater
         blankLevel,
         blankSection,
         isLoaded,
         isLoading,
         isSaving,
         isListLoading
     }), [
         projectId, projectData, projectsList, appId, fetchProjectsList, createNewProject,
         loadProject, saveProject, updateEstimateData, updateProject,
         isLoaded, isLoading, isSaving, isListLoading
     ]);

     return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
 }

 export const useProject = () => {
     return useContext(ProjectContext);
 };