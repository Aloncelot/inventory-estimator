// src/app/page.jsx — the public landing page; the estimator is at /app
import Landing from '@/components/landing/Landing';
import './landing.css';
import { landingFontVars } from './fonts';

export const metadata = {
  title: 'Estimate Hub: framing estimates from the plans to the warehouse',
  description: 'Takeoff from plan PDFs, wall panels, loose material, labor, quotes, change orders, inventory and purchase orders for framing and panel shops.',
};

export default function Home() {
  // display: contents keeps the wrapper out of layout; it only carries the font variables
  return <div className={landingFontVars} style={{ display: 'contents' }}><Landing /></div>;
}
