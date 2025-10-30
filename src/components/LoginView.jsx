// src/components/LoginView.jsx

'use client';
 import { useAuth } from "@/AuthContext"; 

 export default function LoginView() {
     const { signIn, loading } = useAuth();

     return (
         <div className="app-content">
             <div className="ew-card" style={{ maxWidth: '400px', margin: 'auto', textAlign: 'center', marginTop: '50px' }}>
                 <h2 className="ew-h2 nova-flat-turquoise">Welcome to the Inventory Estimator</h2>
                 <p className="ew-subtle" style={{ margin: '15px 0' }}>
                     Please sign in with your Google account to create and manage your project estimates.
                 </p>
                 <button
                     onClick={signIn}
                     className="ew-btn ew-btn--turq"
                     disabled={loading} // Disable while auth state is loading
                     style={{
                         display: 'inline-flex',
                         alignItems: 'center',
                         gap: '8px',
                         padding: '10px 15px',
                         fontSize: '1em'
                     }}
                 >
                     <img src="/icons/google.png" alt="" width={18} height={18} />
                     Sign in with Google
                 </button>
             </div>
         </div>
     );
 }
