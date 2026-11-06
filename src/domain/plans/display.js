// src/domain/plans/display.js
// How plan walls and openings are shown: a colour per wall type, window and
// door, and which of them are hidden. Hiding only affects the drawings; hidden
// walls still count in the estimate. Stored in the project (estimateData.planDisplay).

export const DEFAULT_COLORS = {
  exterior: '#c0392b', bearing: '#d68910', shear: '#8e44ad', partition: '#2e86c1', knee: '#16a085',
  window: '#e5b800', door: '#00a3c4', post: '#3d3a35', hardware: '#d35400', blocking: '#27ae60', sheartag: '#8e44ad', missed: '#e5007a', structwall: '#ff7a00', junction: '#0b7a75', beam: '#a0522d',
};
export const DISPLAY_ITEMS = [
  { key: 'exterior', label: 'Exterior' }, { key: 'bearing', label: 'Bearing' }, { key: 'shear', label: 'Shear wall' },
  { key: 'partition', label: 'Partition' }, { key: 'knee', label: 'Knee wall' }, { key: 'window', label: 'Windows' }, { key: 'door', label: 'Doors' }, { key: 'post', label: 'Posts' }, { key: 'hardware', label: 'Hardware' }, { key: 'blocking', label: 'Blocking' }, { key: 'sheartag', label: 'Shear tags' }, { key: 'missed', label: 'Not placed' }, { key: 'structwall', label: 'Structural only' }, { key: 'junction', label: 'Corners & T' }, { key: 'beam', label: 'Beams' },
];

export function displayOf(planDisplay) {
  return {
    colors: { ...DEFAULT_COLORS, ...(planDisplay?.colors || {}) },
    hidden: { ...(planDisplay?.hidden || {}) },
  };
}

/** Mix a colour toward white (amount 0–1), for the lighter 3D surfaces. */
export function lighten(hex, amount = 0.45) {
  const h = String(hex || '#999999').replace('#', '');
  const v = (i) => parseInt(h.slice(i, i + 2), 16) || 0;
  const mix = (c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0');
  return `#${mix(v(0))}${mix(v(2))}${mix(v(4))}`;
}
