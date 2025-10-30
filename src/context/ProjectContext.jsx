// src/context/ProjectContext.jsx
'use client';
 import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
 import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
 import { db, auth } from '@/lib/firebase'; // Adjust path if needed
 import { useAuth } from '@/AuthContext'; 

 // Helper to generate unique IDs for levels/sections if needed
 const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);

 const ProjectContext = createContext({
    projectId: null,
    projectData: null, // Holds the entire estimate structure
    projectsList: [], // List of user's projects { id, name, updatedAt }
    fetchProjectsList: async () => {}, // Function to load the list
    createNewProject: async (name) => { return null; }, // Function to create a new project, returns new ID
    loadProject: async () => {},
    saveProject: async () => {},
    updateEstimateData: (newData) => {}, // Function to update parts or all of estimateData
    // Add more functions here to update specific parts (e.g., updateLevel, updateSection)
    isLoaded: false,
    isLoading: true,
    isSaving: false,
    isListLoading: false,
 });

 export function ProjectProvider({ children, initialProjectId = null }) {
     const { user } = useAuth();
     const [projectId, setProjectId] = useState(initialProjectId);
     const [projectData, setProjectData] = useState(null); // Data for the *currently loaded* project
     const [projectsList, setProjectsList] = useState([]); // List of *all* user projects
     const [isLoaded, setIsLoaded] = useState(false); // Is the *current* project loaded?
     const [isLoading, setIsLoading] = useState(false); // Is the *current* project loading?
     const [isListLoading, setIsListLoading] = useState(false); // Is the project *list* loading?
     const [isSaving, setIsSaving] = useState(false);
     const [appId, setAppId] = useState(null); // Will be set by auth user

     // --- App ID ---
     useEffect(() => {
        if (user) {
            // User is logged in, set the appId from their UID
            setAppId(user.uid);
        } else {
            // User is logged out, reset the appId
            setAppId(null);
        }
    }, [user]); // This effect runs whenever the user object changes

     // --- Firestore Path ---
    const getProjectsCollectionPath = useCallback(() => {
        if (!appId) {
            console.error("Cannot get projects collection path: Missing appId.");
            return null;
        };
         // Using private user path
         return `artifacts/${appId}/projects`;
     }, [appId]);

    const getProjectPath = useCallback((pId) => {
        const collectionPath = getProjectsCollectionPath();
        if (!collectionPath || !pId) return null;
            return `artifacts/${appId}/projects/${pId}`;
    }, [getProjectsCollectionPath]);

    const fetchProjectsList = useCallback(async () => {
        const collectionPath = getProjectsCollectionPath();
        if (!collectionPath || isListLoading) return;

        console.log("Fetching projects list:", collectionPath);
        setIsListLoading(true);
        try {
            const q = query(collection(db, collectionPath), orderBy('updatedAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const list = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || 'Untitled',
                updatedAt: doc.data().updatedAt?.toDate() // Convert Firestore Timestamp to JS Date
            }));
            setProjectsList(list);
            console.log("Projects list fetched:", list.length);
        } catch (error) {
            console.error("Error fetching projects list:", error);
            setProjectsList([]); // Reset list on error
        } finally {
            setIsListLoading(false);
        }
    }, [getProjectsCollectionPath, db]);

    // --- Create New Project ---
    const createNewProject = useCallback(async (name) => {
        const collectionPath = getProjectsCollectionPath();
        if (!user || !collectionPath || isSaving) 
            console.error("Cannot create project: User not logged in path or missing.");
            return null;

        console.log("Creating new project:", name);
        setIsSaving(true); // Use isSaving flag for creation too
        try {
            const newProjectData = {
                name: name || "Untitled Project",
                 ownerId: user.uid,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                estimateData: { // Initial minimal estimate data
                    levels: [{ id: generateId('level-'), name: 'Level 1' }],
                    // Add other initial structures if needed
                }
            };
            const docRef = await addDoc(collection(db, collectionPath), newProjectData);
            console.log("New project created with ID:", docRef.id);
            // Optionally refresh the list or add locally
            fetchProjectsList(); // Refresh the list
            return docRef.id; // Return the new ID
        } catch (error) {
            console.error("Error creating new project:", error);
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [user, getProjectsCollectionPath, db, fetchProjectsList]);


    // --- Load Project ---
    const loadProject = useCallback(async (pId) => {
        if (!pId || isLoading) return;
        const path = getProjectPath(pId);
        if (!path) return; // Error logged in getProjectPath

        console.log("Loading project:", path);
        setIsLoading(true);
        setIsLoaded(false);
        setProjectData(null); // Clear previous data
        setProjectId(pId); // Set ID immediately

        try {
            const docRef = doc(db, path);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Ensure estimateData and levels exist
                if (!data.estimateData) data.estimateData = {};
                  if (!data.estimateData.levels || data.estimateData.levels.length === 0) {
                     data.estimateData.levels = [{ id: generateId('level-'), name: 'Level 1' }];
                  }
                  setProjectData(data);
                  console.log("Project loaded:", pId);
            } else {
                  console.log("No such project document! Cannot load:", pId);
                  // Should not happen if created via createNewProject
                  setProjectId(null); // Reset ID if load fails
              }
        } catch (error) {
            console.error("Error loading project:", pId, error);
            // Handle error state appropriately
            setProjectId(null); // Reset ID on error
        } finally {
            setIsLoading(false);
            setIsLoaded(true); // Mark as loaded even if data is null (indicates attempt finished)
        }
    }, [ getProjectPath, db]);

     // --- Save Project ---
     const saveProject = useCallback(async (pId = projectId, data = projectData) => {
         if (!user || !pId || !data || isSaving) {
            console.error("Cannot save project: User not logged in or missing data/ID.");
            return;
        }
         const path = getProjectPath(pId);
          if (!path) return; // Error logged in getProjectPath

         console.log("Saving project:", path);
         setIsSaving(true);
         try {
             const docRef = doc(db, path);
             const saveData = {
                 ...data,
                 updatedAt: Timestamp.now(),
                 createdAt: data.createdAt || Timestamp.now(), // Ensure createdAt exists
             };
             await setDoc(docRef, saveData, { merge: true }); // Use merge: true to avoid overwriting fields unintentionally
             setProjectData(saveData); // Update local state with new timestamp
             console.log("Project saved successfully.");
             setProjectsList(list => list.map(p => p.id === pId ? {...p, updatedAt: saveData.updatedAt.toDate()} : p).sort((a,b) => b.updatedAt - a.updatedAt));
         } catch (error) {
             console.error("Error saving project:", error);
             // Handle error state
         } finally {
             setIsSaving(false);
         }
     }, [user, projectId, projectData, getProjectPath, db]);

    // --- Update Estimate Data ---
    // Provides a way for components to update parts of the estimate
    // For complex updates (like adding/removing sections), might need more specific functions
    const updateEstimateData = useCallback((newData) => {
         setProjectData(prev => {
             if (!prev) return null;
             return {
                 ...prev,
                estimateData: {
                    ...prev.estimateData,
                    ...newData // Merges new data into estimateData
                }
            };
        });
        }, []); 

    // --- Auto-fetch list on user change ---
    useEffect(() => {
        if (appId) {
            fetchProjectsList();
        } else {
            setProjectsList([]); // Clear list if logged out or appId missing
            setProjectData(null); // Clear current project
            setProjectId(null);
        }
    }, [appId, fetchProjectsList]);

    // --- Auto-load initial project ID ---
     useEffect(() => {
        if (initialProjectId && !projectData && !isLoading && user?.uid) {
            loadProject(initialProjectId);
        }
        // Run only once when initialProjectId or user becomes available
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
         isLoaded,
         isLoading,
         isSaving,
         isListLoading
     }), [
         projectId, projectData, projectsList, fetchProjectsList, createNewProject,
         loadProject, saveProject, updateEstimateData,
         isLoaded, isLoading, isSaving, isListLoading
     ]);

     return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
 }

 // Custom hook to use the project context
 export const useProject = () => {
     return useContext(ProjectContext);
 };