// src/lib/utils.js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function titleizeSlug(s = '') {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Extract feet from size strings like: 2x10"-10'  -> 10   |  8 ft -> 8
export function feetFromSize(size = '') {
  const m = String(size).match(/(\d+)\s*(?:'|ft)\b/i);
  return m ? Number(m[1]) : null;
}