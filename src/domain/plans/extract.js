// src/domain/plans/extract.js
// Reads the vector drawing of one PDF page (through pdf.js) into plain data:
// straight line segments with their stroke style, and text items. Everything is
// in viewport points (rotation applied, y pointing down), so 1 pt = 1/72" on the
// printed sheet. Pure apart from the pdf.js page object it receives; the same
// code runs in the browser and in the Node tests.

const PATH = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

const hex2 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
const grayHex = (g) => `#${hex2(g)}${hex2(g)}${hex2(g)}`;
const cmykHex = (c, m, y, k) => `#${hex2((1 - c) * (1 - k))}${hex2((1 - m) * (1 - k))}${hex2((1 - y) * (1 - k))}`;
const colorFrom = (args) => {
  if (!args || !args.length) return '#000000';
  if (typeof args[0] === 'string') return args[0].toLowerCase();
  if (args.length === 1) return grayHex(args[0]);
  if (args.length === 3) return `#${hex2(args[0])}${hex2(args[1])}${hex2(args[2])}`;
  if (args.length === 4) return cmykHex(...args);
  return '#000000';
};

/**
 * Extract segments and text from a pdf.js page.
 * @param {object} page pdf.js PDFPageProxy
 * @param {object} OPS pdf.js OPS table
 * @returns {Promise<{width:number,height:number,segments:Array,texts:Array}>}
 */
export async function extractPage(page, OPS) {
  const vp = page.getViewport({ scale: 1 });
  const ol = await page.getOperatorList();
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  let st = { ctm: vp.transform.slice(), lw: 1, stroke: '#000000', fill: '#000000', dashed: false };
  const stack = [];
  const segments = [];
  const fills = [];

  const emitPath = (paintOp, data) => {
    const stroked = strokeOps.has(paintOp);
    const filled = fillOps.has(paintOp);
    if (!stroked && !filled) return;
    const w = +(st.lw * scaleOf(st.ctm)).toFixed(3);
    const style = `${w}|${st.stroke}${st.dashed ? '|d' : ''}`;
    let sx = 0, sy = 0, cx = 0, cy = 0;
    const pts = [];
    let curved = false;
    const flushPoly = () => {
      if (filled && pts.length >= 4 && !curved) fills.push({ pts: pts.slice(), color: st.fill });
      pts.length = 0; curved = false;
    };
    for (let i = 0; i < data.length;) {
      const op = data[i++];
      if (op === PATH.moveTo) {
        flushPoly();
        [cx, cy] = apply(st.ctm, data[i++], data[i++]); sx = cx; sy = cy; pts.push([cx, cy]);
      } else if (op === PATH.lineTo) {
        const [x, y] = apply(st.ctm, data[i++], data[i++]);
        if (stroked) segments.push({ x1: cx, y1: cy, x2: x, y2: y, w, style });
        cx = x; cy = y; pts.push([cx, cy]);
      } else if (op === PATH.curveTo) {
        i += 4; const [x, y] = apply(st.ctm, data[i++], data[i++]); curved = true;
        // keep the chord of every curve: door swings are found by their arcs
        if (stroked) segments.push({ x1: cx, y1: cy, x2: x, y2: y, w, style, arc: true });
        cx = x; cy = y;
      } else if (op === PATH.quadraticCurveTo) {
        i += 2; [cx, cy] = apply(st.ctm, data[i++], data[i++]); curved = true;
      } else if (op === PATH.closePath) {
        if (stroked && (cx !== sx || cy !== sy)) segments.push({ x1: cx, y1: cy, x2: sx, y2: sy, w, style });
        cx = sx; cy = sy;
      } else break;
    }
    flushPoly();
  };

  const { fnArray, argsArray } = ol;
  for (let k = 0; k < fnArray.length; k++) {
    const fn = fnArray[k];
    const a = argsArray[k];
    switch (fn) {
      case OPS.save: stack.push({ ...st, ctm: st.ctm.slice() }); break;
      case OPS.restore: if (stack.length) st = stack.pop(); break;
      case OPS.transform: st.ctm = mul(st.ctm, a); break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ...st, ctm: st.ctm.slice() });
        if (Array.isArray(a?.[0]) && a[0].length === 6) st.ctm = mul(st.ctm, a[0]);
        break;
      case OPS.paintFormXObjectEnd: if (stack.length) st = stack.pop(); break;
      case OPS.setLineWidth: st.lw = a[0]; break;
      case OPS.setDash: st.dashed = Array.isArray(a?.[0]) && a[0].length > 0; break;
      case OPS.setGState:
        for (const [key, val] of a?.[0] || []) {
          if (key === 'LW') st.lw = val;
          if (key === 'D') st.dashed = Array.isArray(val?.[0]) && val[0].length > 0;
        }
        break;
      case OPS.setStrokeRGBColor: case OPS.setStrokeGray: case OPS.setStrokeCMYKColor:
      case OPS.setStrokeColor: case OPS.setStrokeColorN:
        st.stroke = colorFrom(a); break;
      case OPS.setFillRGBColor: case OPS.setFillGray: case OPS.setFillCMYKColor:
      case OPS.setFillColor: case OPS.setFillColorN:
        st.fill = colorFrom(a); break;
      case OPS.constructPath: {
        // pdf.js ≥ 5: [paintOp, [Float32Array pathData], minMax]
        const paintOp = a[0];
        const data = Array.isArray(a[1]) ? a[1][0] : a[1];
        if (data && data.length) emitPath(paintOp, data);
        break;
      }
      default: break;
    }
  }

  // filled thin rectangles (solid "poche" walls) become their two long edges
  for (const f of fills) {
    const p = f.pts;
    if (p.length < 4 || p.length > 5) continue;
    const xs = p.map((q) => q[0]); const ys = p.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const axis = p.slice(0, 4).every((q, i) => { const r = p[(i + 1) % 4]; return Math.abs(q[0] - r[0]) < 0.01 || Math.abs(q[1] - r[1]) < 0.01; });
    if (!axis) continue;
    const style = `fill|${f.color}`;
    if (x1 - x0 >= y1 - y0) {
      segments.push({ x1: x0, y1: y0, x2: x1, y2: y0, w: 0, style, fill: true });
      segments.push({ x1: x0, y1, x2: x1, y2: y1, w: 0, style, fill: true });
    } else {
      segments.push({ x1: x0, y1: y0, x2: x0, y2: y1, w: 0, style, fill: true });
      segments.push({ x1, y1: y0, x2: x1, y2: y1, w: 0, style, fill: true });
    }
  }

  const tc = await page.getTextContent();
  const texts = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const m = mul(vp.transform, it.transform);
    texts.push({ str: it.str, x: m[4], y: m[5], size: Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]), angle: Math.atan2(m[1], m[0]) });
  }
  return { width: vp.width, height: vp.height, segments, texts };
}
