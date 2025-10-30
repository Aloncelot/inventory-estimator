 'use client';

 import { useMemo } from 'react';
 import { useProject } from '@/context/ProjectContext'; 
 import { useAuth } from '@/AuthContext'; 

 const MENU = [
     { key: 'auth',       label: 'Login / Logout',     icon: '/icons/login.png' },
     { key: 'project',    label: 'Project',            icon: '/icons/files.png' }, // Enabled one
     { key: 'trusses',    label: 'Trusses',            icon: '/icons/roof.png' },
     { key: 'wallpanels', label: 'Wall Panels',        icon: '/icons/wood.png' }, // Enabled one
     { key: 'loose',      label: 'Loose Material',     icon: '/icons/loose.png' },
     { key: 'labor',      label: 'Labor',              icon: '/icons/worker.png' },
     { key: 'summary',    label: 'Summary',            icon: '/icons/search.png' }, // Enabled one
     { key: 'takeoff',    label: 'Takeoff list',       icon: '/icons/list.png' },
     { key: 'quote',      label: 'Quote (QuickBooks)', icon: '/icons/dollar.png' },
     { key: 'export',     label: 'Export',             icon: '/icons/download.png' },
     { key: 'items',      label: 'Material List',      icon: '/icons/trolley.png'}, // Material list from firestore database, we work this later
     { key: 'save',       label: 'Save',               icon: '/icons/save.png' }, // Save action item
     { key: 'mode',       label: 'Light Mode',         icon: '/icons/brightness.png'} // Light / dark mode, we work this later
 ];


 export default function Sidebar({
     active = 'wallpanels',
     collapsed = false,
     onChange,           // (key) => void
     onCollapsedChange,  // (bool) => void
 }) {
     const { saveProject, isSaving, projectData, projectId } = useProject(); // Get save function and state
     const { user, signIn, signOutUser } = useAuth(); // Get auth state and functions
     const items = useMemo(() => MENU, []);

     // Find index of the *navigation* item that is active
     const activeNavIdx = Math.max(
         0,
         // Exclude non-navigation items like 'save', 'mode', 'auth' when finding active index
         items.filter(i => !['save', 'mode', 'auth'].includes(i.key))
              .findIndex(i => i.key === active)
     );
     // Calculate visual top offset based on ALL items before the active one
     const activeVisualIdx = items.findIndex(i => i.key === active); // Use the actual index for visual positioning if needed
     // Adjusted offset calculation
     const topOffset = 6 + (activeVisualIdx >= 0 ? activeVisualIdx * 56 : 0);


     // Disable save button if no project is loaded or if already saving OR if user is not logged in
     const canSave = !!user && !!projectId && !!projectData && !isSaving;

     const handleItemClick = (item) => {
        // Handle specific action items first
        if (item.key === 'save') {
            if (canSave) {
                saveProject();
            }
            return; // Don't navigate
        }
        if (item.key === 'mode') {
            // TODO: Implement theme toggle logic
            console.log("Toggle theme clicked");
            return; // Don't navigate
        }
        if (item.key === 'auth') {
             if (user) {
                 signOutUser(); // Call sign out function from context
             } else {
                 signIn(); // Call sign in function from context
             }
             return; // Don't navigate
        }

        // If it's a regular navigation item, call onChange
        onChange?.(item.key);
     };

     return (
         <aside className={`sidebar ${collapsed ? 'open' : ''}`}>
             <header>
                  {/* ... header content (burger, logo) ... */}
                  <button
                     type="button"
                     className="sidebar-burger"
                     onClick={() => onCollapsedChange?.(!collapsed)}
                     title={collapsed ? 'Expand' : 'Collapse'}
                 >
                      <img
                         src="/icons/menu.png"
                         alt={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                         width={24} height={24} aria-hidden
                      />
                 </button>
             </header>

             <nav
                 className="menu"
                 // Use corrected topOffset
                 style={{ ['--top']: `${topOffset}px` }}
                 role="navigation"
                 aria-label="Main"
             >
                 {items.map((it, idx) => {
                     // isActive is true only for the currently active *navigation* section
                     const isActive = it.key === active && !['save', 'mode', 'auth'].includes(it.key);

                     // Determine if item should be visually disabled
                     let isDisabled = false;
                     if (it.key === 'save') {
                         isDisabled = !canSave; // Disable based on save state & auth state
                     } else if (['project', 'wallpanels', 'summary'].includes(it.key)) {
                         // REVERT: Disable core sections if NOT logged in
                         isDisabled = !user;
                         // If you want 'project' always enabled, adjust:
                         // isDisabled = !user && (it.key === 'wallpanels' || it.key === 'summary');
                     } else if (!['auth', 'mode'].includes(it.key)) {
                         // Disable other placeholder navigation items (like trusses, labor, etc.)
                         isDisabled = true;
                     }
                     // 'auth' and 'mode' are never visually disabled here


                     // Determine aria-disabled
                     // Disable navigation items if not logged in (adjust based on isDisabled logic above)
                     const navDisabled = !user && !['project', 'auth', 'mode'].includes(it.key); // Re-evaluate if project should be disabled
                     // ariaDisabled should reflect the visual isDisabled state primarily
                     const ariaDisabled = (it.key === 'save' && !canSave) || isDisabled || navDisabled; // Simplified


                     // Decide label text
                      let labelText = it.label;
                      if (it.key === 'save' && isSaving) {
                          labelText = 'Saving...';
                      }
                     // Update auth label based on user state
                     if (it.key === 'auth') {
                         labelText = user ? 'Logout' : 'Login';
                     }
                     // Decide label text for mode button based on state (future)
                     // if (it.key === 'mode') { labelText = isDarkMode ? 'Light Mode' : 'Dark Mode'; }


                     return (
                         <button
                             key={it.key}
                             type="button"
                             className={`menu-item ${isActive ? ' active' : ''} ${isDisabled ? ' disabled' : ''}`}
                             // Only allow click if not visually disabled
                             onClick={() => !isDisabled && handleItemClick(it)}
                             title={it.label} // Keep original title for tooltip consistency
                             aria-current={isActive ? 'page' : undefined}
                             aria-disabled={ariaDisabled ? true : undefined}
                         >
                             {/* ... img tag ... */}
                              <img
                                  src={it.icon}
                                  alt="" // Alt text empty as button has text label
                                  width={20} height={20}
                                  className="menu-ico"
                                  aria-hidden
                              />
                             {/* Use dynamic label text */}
                             <p className="menu-label">{labelText}</p>
                         </button>
                     );
                 })}
             </nav>
             <div className="side-foot" style={{ marginTop: 'auto', textAlign: collapsed ? 'center' : 'left', padding: collapsed ? '10px 0' : '10px' }}>
                {user && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '8px', padding: '0 10px' }}>
                        {/* Optional: User Avatar/Icon */}
                        {/* <img src={user.photoURL || '/icons/user-default.png'} alt="User" width={24} height={24} style={{ borderRadius: '50%' }} /> */}
                        {!collapsed && (
                            <span className="ew-subtle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user.displayName || user.email}>
                                {user.displayName || user.email}
                            </span>
                        )}
                    </div>
                )}
            </div>
         </aside>
     );
 }
