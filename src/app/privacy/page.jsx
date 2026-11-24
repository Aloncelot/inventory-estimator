// src/app/privacy/page.jsx — the privacy policy
import { PrivacyPolicy } from '@/components/landing/Legal';
import '../landing.css';
import { landingFontVars } from '../fonts';

export const metadata = {
  title: 'Privacy policy | Nebula Estimator',
  description: 'What Nebula Estimator collects, where it is kept, who can see it and the choices you have.',
};

export default function Privacy() {
  return <div className={landingFontVars} style={{ display: 'contents' }}><PrivacyPolicy /></div>;
}
