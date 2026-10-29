// src/domain/aggregate/projectTotals.js
// Category totals for Summary and page headers, calculated from the estimate
// data itself (see src/domain/estimate). Nothing depends on which views were open.
import { wallPanelsOf, looseOf, computeTrusses, projectOf } from '../estimate';

export const wallPanelsTotal = (est = {}) => wallPanelsOf(est).total;
export const trussesTotal = (est = {}) => computeTrusses(est).total;
export const looseTotal = (est = {}) => looseOf(est).total;
export const projectTotals = (est = {}) => projectOf(est);
