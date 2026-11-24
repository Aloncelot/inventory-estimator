// src/app/fonts.js — self-hosted Google fonts (next/font). Replaces the CSS
// @import of fonts.googleapis.com, which blocked first paint behind two extra
// round trips and sent every visitor to Google. Each font exposes a CSS
// variable; globals.css / landing.css build their font stacks from them.
import { Zalando_Sans_Expanded, IBM_Plex_Sans_Condensed, Audiowide, Archivo, IBM_Plex_Sans, Antonio } from 'next/font/google';

// ---- the estimator (/app, /projects) ----
export const titles = Zalando_Sans_Expanded({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--ff-titles', display: 'swap', adjustFontFallback: false });
export const body = IBM_Plex_Sans_Condensed({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--ff-body', display: 'swap' });
// only the sidebar wordmark uses it: no preload
export const brand = Audiowide({ subsets: ['latin'], weight: '400', variable: '--ff-brand', display: 'swap', preload: false });

// ---- the landing site (/, /privacy, /cookies) ----
// Antonio: tall condensed display, like the lettering on a lumber bundle tag
export const lpDisplay = Antonio({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--ff-lp-display', display: 'swap' });
// Archivo carries one role: the wordmark
export const lpHead = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--ff-lp-head', display: 'swap' });
export const lpBody = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--ff-lp-body', display: 'swap' });

export const appFontVars = `${titles.variable} ${body.variable} ${brand.variable}`;
export const landingFontVars = `${lpDisplay.variable} ${lpHead.variable} ${lpBody.variable}`;
