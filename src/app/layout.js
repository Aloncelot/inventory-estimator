// src/app/layout.js
import "./globals.css";
import { AuthProvider } from "@/AuthContext";

export const metadata = {
  title: "Estimate Hub",
  description: "Framing estimates from the plans: wall panels, loose material, labor, quotes, and the warehouse that supplies them.",
};

// Applies the saved theme before first paint (no light/dark flash).
const themeScript = `(function(){var h=document.documentElement;try{var t=localStorage.getItem('theme');if(t==='dark')t='quasar';if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'quasar':'light';h.classList.toggle('dark',t!=='light');h.classList.toggle('graphite',t==='graphite');}catch(e){h.classList.add('dark');}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
