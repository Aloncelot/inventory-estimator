// src/app/cookies/page.jsx — the cookie policy
import { CookiePolicy } from '@/components/landing/Legal';
import '../landing.css';
import { landingFontVars } from '../fonts';

export const metadata = {
  title: 'Cookie policy | Nebula Estimator',
  description: 'The cookies and browser storage Nebula Estimator uses, and how to change your choice.',
};

export default function Cookies() {
  return <div className={landingFontVars} style={{ display: 'contents' }}><CookiePolicy /></div>;
}
