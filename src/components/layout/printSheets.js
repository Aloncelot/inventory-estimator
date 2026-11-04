// src/components/layout/printSheets.js
// Drawing sheets for print / PDF: the same plan model drawn as crisp SVG
// (isometric, Anatomy kit) on 17×11 sheets with a title strip, plus the
// material check. Opens the browser's print dialog ("Save as PDF").

import { ISO_CSS } from '@/lib/anatomy/iso-kit.mjs';
import { buildingFigure, wallFrameFigure } from '@/components/layout/planFigures';
import { feet } from '@/domain/lib/units';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

const SHEET_CSS = `
@page { size: 17in 11in; margin: 0.4in; }
* { box-sizing: border-box; }
body { margin: 0; font: 11px/1.4 "IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif; color: #24211c; background: #fff; }
.sheet { width: 16.2in; height: 10.2in; display: grid; grid-template-rows: 1fr auto; gap: 10px; page-break-after: always; break-after: page; }
.sheet:last-child { page-break-after: auto; break-after: auto; }
.draw { border: 1px solid #6f6a63; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 12px; }
.draw svg { width: 100%; height: 100%; max-height: 8.6in; }
.strip { display: grid; grid-template-columns: 2fr 3fr 1fr; gap: 0; border: 1px solid #6f6a63; }
.strip > div { padding: 6px 10px; border-right: 1px solid #6f6a63; }
.strip > div:last-child { border-right: 0; }
.strip .lbl { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: .08em; color: #7a746c; }
.strip .big { font-size: 15px; font-weight: 700; }
table { border-collapse: collapse; width: 100%; margin: 0 0 10px; }
th, td { border-bottom: 1px solid #d4d0ca; padding: 3px 6px; text-align: left; }
th { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #7a746c; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
h3 { margin: 8px 0 4px; font-size: 13px; }
.cols { columns: 2; column-gap: 24px; }
.cols > div { break-inside: avoid; }
.iso { --anatomy-page:#fff;--anatomy-card:#fff;--anatomy-paper:#fff;--anatomy-face:#fff;--anatomy-top:#fbfbf9;
  --anatomy-shade-0:#c4c4be;--anatomy-shade-1:#cfcfca;--anatomy-shade-2:#d9d9d4;--anatomy-shade-3:#e4e4df;
  --anatomy-lit-top:#e2ebcf;--anatomy-lit-shade:#c9d7ab;--anatomy-hi:#24211c;--anatomy-mid:#6f6a63;--anatomy-lo:#a29d96;
  --anatomy-faint:#c2bdb6;--anatomy-lit:#2f3a06;--anatomy-halo:#6f6a63;--anatomy-halo-opacity:.2; }
.iso-face-text { fill: #4a453f; }
.bv-k-exterior { --anatomy-top:#f1d3cf; --anatomy-shade-0:#c98a82; --anatomy-shade-1:#d59c95; --anatomy-shade-2:#e0aea8; --anatomy-shade-3:#eac1bb; }
.bv-k-bearing  { --anatomy-top:#f3e0c3; --anatomy-shade-0:#cfa463; --anatomy-shade-1:#d9b277; --anatomy-shade-2:#e2c08c; --anatomy-shade-3:#ebcfa3; }
.bv-k-shear    { --anatomy-top:#e4d4ec; --anatomy-shade-0:#a585b6; --anatomy-shade-1:#b296c1; --anatomy-shade-2:#c0a8cc; --anatomy-shade-3:#cdbad7; }
.bv-k-knee     { --anatomy-top:#cfeae4; --anatomy-shade-0:#73b5a7; --anatomy-shade-1:#87c1b4; --anatomy-shade-2:#9bcdc1; --anatomy-shade-3:#b0d8ce; }
.bv-k-partition{ --anatomy-top:#d5e3f0; --anatomy-shade-0:#7fa6c9; --anatomy-shade-1:#93b4d2; --anatomy-shade-2:#a7c2db; --anatomy-shade-3:#bbd0e4; }
.bv-glass { fill: none; stroke: #5e8fb8; stroke-width: .6; }
.bv-glass.bv-door { stroke: #8a6d3b; stroke-dasharray: 2 2; }
.wf-header { --anatomy-top:#f3e0c3; --anatomy-shade-0:#cfa463; --anatomy-shade-1:#d9b277; --anatomy-shade-2:#e2c08c; --anatomy-shade-3:#ebcfa3; }
.wf-king, .wf-jack { --anatomy-top:#e8efdb; --anatomy-shade-0:#a9ba86; --anatomy-shade-1:#b6c595; --anatomy-shade-2:#c3d0a6; --anatomy-shade-3:#d1dbb8; }
.wf-cripple, .wf-sill { --anatomy-top:#e1ecf3; --anatomy-shade-0:#98b4c7; --anatomy-shade-1:#a7bfd0; --anatomy-shade-2:#b6cada; --anatomy-shade-3:#c6d6e3; }
.wf-sheet { --anatomy-top:#efe3cf; --anatomy-shade-0:#c9b18a; --anatomy-shade-1:#d3bd99; --anatomy-shade-2:#ddc9a9; --anatomy-shade-3:#e6d6ba; }
.wf-panel-no { fill: #6f6a63; font-family: ui-monospace, Menlo, Consolas, monospace; }
`;

function strip({ projectName, levelName, title, sheet, of }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `<div class="strip">
    <div><span class="lbl">Project</span><span class="big">${esc(projectName || 'Untitled')}</span></div>
    <div><span class="lbl">${esc(levelName)}</span><span class="big">${esc(title)}</span></div>
    <div><span class="lbl">Sheet · ${esc(today)}</span><span class="big">${sheet} / ${of}</span></div>
  </div>`;
}

/** Build the sheets and open the print dialog. */
export function printPlanSheets({ model, check, wallParts = [], levelName, projectName, panelLenFt }) {
  if (!model) return;
  const pages = [];
  const building = buildingFigure(model, { azimuth: 45 }).svg;
  pages.push({ title: 'Walls from the plan (isometric)', body: `<div class="draw iso" data-theme="light">${building}</div>` });
  if (wallParts.length) {
    const back = wallFrameFigure(wallParts, { azimuth: 75, sheets: 'off', height: 520 }).svg;
    const f = wallParts[0].frame;
    const panels = f.panels.map((p, i) => `P${i + 1} ${feet(p.length)}`).join(' · ');
    const ops = f.openings.map((o) => `${o.type === 'door' ? 'Door' : 'Window'} ${feet(o.a1 - o.a0)} × ${feet(o.z1 - o.z0)}${o.type === 'window' ? `, sill ${feet(o.z0)}` : ''}`).join(' · ') || 'none';
    pages.push({
      title: `Framing · ${wallParts.map((p) => p.label).join(' + ')} · ${feet(wallParts[0].lengthIn)}`,
      body: `<div class="draw iso" data-theme="light" style="flex-direction:column;gap:8px">${back}<div style="align-self:stretch">Panels: ${esc(panels)} · Openings: ${esc(ops)} · Studs ${feet(f.studLen)} @ section spacing</div></div>`,
    });
  }
  const tables = check.map((g) => `<div>
    <h3>${esc(g.label)} <small style="font-weight:400;color:#7a746c">${esc(g.sectionName || 'no section in Wall panels')} · ${g.walls} walls · ${fmt(g.lengthFt)} LF</small></h3>
    <table><thead><tr><th>Material</th><th class="n">Estimate</th><th class="n">Waste %</th><th class="n">Final</th><th class="n">Layout uses</th><th class="n">Leftover</th></tr></thead><tbody>
    ${g.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.est.raw.toFixed(1)}</td><td class="n">${r.est.waste}%</td><td class="n">${Math.ceil(r.est.final)}</td><td class="n"><b>${r.needed}</b></td><td class="n">${g.linked ? r.leftover : '—'}</td></tr>`).join('')}
    </tbody></table>
    <div style="color:#7a746c">Openings: ${g.counts.kings || 0} kings, ${g.counts.jacks || 0} jacks, ${g.counts.headers || 0} headers (${g.openings.headerLF.toFixed(1)} LF), ${g.counts.cripples || 0} cripples, ${g.counts.sills || 0} sills</div>
  </div>`).join('');
  pages.push({ title: `Material check · panels up to ${panelLenFt}'`, body: `<div class="draw" style="display:block;overflow:visible"><div class="cols">${tables}</div></div>` });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(projectName || 'Plan')} · ${esc(levelName)}</title>
    <style>${ISO_CSS}${SHEET_CSS}</style></head><body class="iso" data-theme="light">
    ${pages.map((p, i) => `<section class="sheet">${p.body}${strip({ projectName, levelName, title: p.title, sheet: i + 1, of: pages.length })}</section>`).join('')}
    </body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  }, 400);
}
