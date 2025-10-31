// src/context/ProjectContext.jsx
'use client';
 import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
 import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
 import { db, auth } from '@/lib/firebase'; 
 import { useAuth } from '@/AuthContext'; 

 // Helper to generate unique IDs
 const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);

 // 1. DEFINE THE DEFAULT BLANK STRUCTURE for a section, level, etc.
 const blankSection = (props = {}) => ({
  id: generateId('section-'),
  lengthLF: 0,
  heightFt: 12,
  studSpacingIn: 16,
  studMultiplier: 1,
  kind: 'partition', // for interior
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
  looseMaterials: { /* ...any defaults for loose materials... */ },
  panelNails: { /* ...any defaults for panel nails... */ },
  // ... other level-specific data
  ...props,
 });

 const blankEstimateData = () => ({
  levels: [blankLevel({ index: 0 })],
  manufactureEstimate: { /* ...defaults for manufacture... */ },
  nailsAndBracing: { /* ...defaults for nails/bracing... */ },
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
            console.error("Cannot get projects collection path: Missing appId.");
            return null;
        };
         return `artifacts/${appId}/projects`;
     }, [appId]);

    const getProjectPath = useCallback((pId) => {
        const collectionPath = getProjectsCollectionPath();
        if (!collectionPath || !pId) return null;
            return `artifacts/${appId}/projects/${pId}`;
    }, [getProjectsCollectionPath, appId]); // Added appId dependency

    // --- Fetch Project List ---
    const fetchProjectsList = useCallback(async (currentUserId) => {
        const collectionPath = getProjectsCollectionPath();
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
    }, [getProjectsCollectionPath, isListLoading, db]); // db was missing

    // --- Create New Project ---
    const createNewProject = useCallback(async (name) => {
        const collectionPath = getProjectsCollectionPath();
        if (!user || !collectionPath || isSaving) { // <-- Fix: Added {}
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
                // 2. SET THE DEFAULT ESTIMATE DATA
                estimateData: blankEstimateData(), 
            };
            const docRef = await addDoc(collection(db, collectionPath), newProjectData);
            fetchProjectsList(); 
            return docRef.id; 
        } catch (error) {
            console.error("Error creating new project:", error);
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [user, getProjectsCollectionPath, isSaving, db, fetchProjectsList]); // db/fetchProjectsList missing


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
                // 3. ENSURE DATA STRUCTURE ON LOAD
                if (!data.estimateData) {
                   data.estimateData = blankEstimateData();
                }
                if (!data.estimateData.levels || data.estimateData.levels.length === 0) {
                   data.estimateData.levels = [blankLevel({ index: 0 })];
                }
                  setProjectData(data);
            } else {
                  setProjectId(null); 
              }
        } catch (error) {
            console.error("Error loading project:", pId, error);
            setProjectId(null); 
        } finally {
            setIsLoading(false);
            setIsLoaded(true); 
        }
    }, [isLoading, getProjectPath, db]); // db was missing

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
             setProjectData(saveData); // Update local state with new timestamp
             setProjectsList(list => list.map(p => p.id === pId ? {...p, updatedAt: saveData.updatedAt.toDate()} : p).sort((a,b) => b.updatedAt - a.updatedAt));
         } catch (error) {
             console.error("Error saving project:", error);
         } finally {
             setIsSaving(false);
         }
     }, [user, projectId, projectData, isSaving, getProjectPath, db]); // db was missing

    // 4. NEW HELPER FUNCTION TO UPDATE PROJECT DATA
    // This allows any component to update its part of the state
    const updateProject = useCallback((newEstimateData) => {
         setProjectData(prev => {
             if (!prev) return null;
             return {
                 ...prev,
                estimateData: newEstimateData
            };
        });
    }, []); 

    // DEPRECATED: We will call updateProject directly
    const updateEstimateData = updateProject;


    // --- Auto-fetch list on user/appId change ---
    useEffect(() => {
        if (appId) { // <-- Fix: check for appId (not default)
            fetchProjectsList(appId); // Pass appId
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
         updateEstimateData,
         updateProject, 
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