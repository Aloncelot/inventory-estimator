// src/components/ProjectView.jsx
 'use client';
 import { useState, useEffect } from 'react';
 import { useProject } from '@/context/ProjectContext'; // Ensure alias works or use relative path

 export default function ProjectView() {
     const {
         projectsList,
         fetchProjectsList,
         createNewProject,
         loadProject,
         isListLoading,
         isSaving,
         appId, // Get appId from context
         projectId // Currently loaded project ID
     } = useProject();
     const [newProjectName, setNewProjectName] = useState('');

     // Determine if the core functionalities are ready (appId loaded, user logged in - user check happens in context)
     const isReady = appId && appId !== 'default-app-id';

     // Fetch list on mount if not already loading (context might auto-fetch)
     useEffect(() => {
         if (!isListLoading && isReady) { // Fetch only if ready
             // fetchProjectsList(); // Context should handle initial fetch on load/auth
         }
     }, [fetchProjectsList, isListLoading, isReady]);

     const handleCreateProject = async (e) => {
         e.preventDefault();
         if (!newProjectName.trim() || isSaving || !isReady) return; // Check isReady
         const createdId = await createNewProject(newProjectName);
         if (createdId) {
             setNewProjectName('');
             loadProject(createdId); // Load the newly created project
             console.log("Created and loading project:", createdId);
         } else {
             console.error("Failed to create project");
             // TODO: Show user feedback
         }
     };

     const handleLoadProject = (idToLoad) => {
        if (idToLoad === projectId || !isReady) return; // Check isReady
        console.log("Load project clicked:", idToLoad);
        loadProject(idToLoad);
     };

     return (
         <div className="app-content">
             {/* Page Title Card */}
             <div className="ew-card">
                 <h2 className="ew-h2 nova-flat-turquoise" style={{ margin: 0 }}>Projects Management</h2>
             </div>

             {/* Create New Project Card */}
             <div className="ew-card">
                 <h3 className="ew-h3">Create New Project</h3>
                 <form onSubmit={handleCreateProject} className="ew-inline" style={{ alignItems: 'stretch', gap: '8px' }}>
                     <input
                         type="text"
                         value={newProjectName}
                         onChange={(e) => setNewProjectName(e.target.value)}
                         placeholder="New project name..."
                         className="ew-input"
                         style={{ flexGrow: 1 }}
                         disabled={isSaving || !isReady} // Disable if not ready
                         aria-label="New project name"
                     />
                     <button type="submit" className="ew-btn ew-btn--turq" disabled={!newProjectName.trim() || isSaving || !isReady}> {/* Disable if not ready */}
                         {isSaving ? 'Creating...' : 'Create Project'}
                     </button>
                 </form>
                  {!isReady && <p className="ew-subtle" style={{color: 'orange', marginTop: '8px'}}>Waiting for App ID configuration...</p>}
             </div>

             {/* Existing Projects List Card */}
             <div className="ew-card">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                     <h3 className="ew-h3" style={{ margin: 0 }}>Existing Projects</h3>
                     <button onClick={fetchProjectsList} className="ew-btn" style={{ padding: '4px 8px' }} disabled={isListLoading || !isReady}> {/* Disable if not ready */}
                         {isListLoading ? 'Refreshing...' : 'Refresh'}
                     </button>
                 </div>
                 {!isReady ? (
                     <p className="ew-subtle">App configuration loading...</p>
                 ) : isListLoading && projectsList.length === 0 ? (
                     <p className="ew-subtle">Loading projects...</p>
                 ) : projectsList.length === 0 ? (
                     <p className="ew-subtle">No projects found. Create one above.</p>
                 ) : (
                     <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                         {projectsList.map((proj) => (
                             <li key={proj.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                     {/* Project Info */}
                                     <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                                         {/* Project Name (Clickable to Load) */}
                                         <button
                                            onClick={() => handleLoadProject(proj.id)}
                                            style={{
                                                background: 'none', border: 'none', padding: 0, margin: 0,
                                                color: proj.id === projectId ? 'var(--text-primary)' : 'var(--text-accent)', // Highlight if loaded
                                                textAlign: 'left', cursor: 'pointer',
                                                fontWeight: proj.id === projectId ? 'bold' : 'normal',
                                                fontSize: '1em',
                                                fontFamily: 'inherit', textDecoration: 'underline',
                                            }}
                                            title={`Load project: ${proj.name}`}
                                            disabled={!isReady} // Disable if not ready
                                         >
                                            {proj.name} {proj.id === projectId ? '(Loaded)' : ''}
                                         </button>
                                         {/* Last Updated Time */}
                                         <div className="ew-subtle" style={{ fontSize: '11px', marginTop: '2px', whiteSpace: 'nowrap' }}>
                                             Last updated: {proj.updatedAt ? proj.updatedAt.toLocaleString() : 'N/A'}
                                         </div>
                                     </div>
                                     {/* Load Button */}
                                     <button
                                         onClick={() => handleLoadProject(proj.id)}
                                         className="ew-btn"
                                         disabled={proj.id === projectId || !isReady} // Disable if not ready
                                         style={{ flexShrink: 0 }}
                                     >
                                         {proj.id === projectId ? 'Currently Loaded' : 'Load Project'}
                                     </button>
                                 </div>
                             </li>
                         ))}
                     </ul>
                 )}
             </div>
         </div>
     );
 }
