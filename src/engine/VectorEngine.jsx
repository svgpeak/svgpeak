

/* Mesin ekspor AI/EPS (dipangkas dari mesin dokumen vektor; tanpa UI editor) */
const VCTX = (() => { try { return document.createElement('canvas').getContext('2d'); } catch (e) { return null; } })();
const cssToHex = c => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join('').toLowerCase();
  try { VCTX.fillStyle = '#000000'; VCTX.fillStyle = c; const v = VCTX.fillStyle; if (v[0] === '#') return v; const m = v.match(/\d+/g); if (m) return '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join(''); } catch (e) {}
  return '#000000';
};
const VE = (() => {
const uid = () => 'n' + Math.random().toString(36).slice(2, 9);

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

const dot = (a, b) => a.x * b.x + a.y * b.y;

const cross = (a, b) => a.x * b.y - a.y * b.x;

const rd = v => Math.round(v * 1000) / 1000;

const P = n => ({ x: n.x, y: n.y });

const NUM = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?';

const nums = s => (s.match(new RegExp(NUM, 'g')) || []).map(Number);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const mmul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];

function parseTransform(str) {
    let m = [1, 0, 0, 1, 0, 0]; if (!str) return m;
    const re = /(\w+)\s*\(([^)]*)\)/g; let r;
    while ((r = re.exec(str))) {
      const a = nums(r[2]); let t = [1, 0, 0, 1, 0, 0];
      if (r[1] === 'translate') t = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
      else if (r[1] === 'scale') t = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
      else if (r[1] === 'rotate') { const g = (a[0] || 0) * Math.PI / 180, c = Math.cos(g), s = Math.sin(g); t = [c, s, -s, c, 0, 0]; if (a.length > 2) t = mmul(mmul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]); }
      else if (r[1] === 'matrix' && a.length >= 6) t = a.slice(0, 6);
      else if (r[1] === 'skewX') t = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0];
      else if (r[1] === 'skewY') t = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
      m = mmul(m, t);
    }
    return m;
  }

const isId = m => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

const tp = (m, p) => p && ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

const bake = (subs, m) => isId(m) ? subs : subs.map(sp => ({ ...sp, nodes: sp.nodes.map(n => ({ ...n, ...tp(m, n), handleIn: tp(m, n.handleIn), handleOut: tp(m, n.handleOut) })) }));

function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry || (x1 === x2 && y1 === y2)) return null;
    const phi = phiDeg * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = c * dx + s * dy, yp = -s * dx + c * dy;
    const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
    if (lam > 1) { const q = Math.sqrt(lam); rx *= q; ry *= q; }
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    let co = Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / (den || 1))); if (!!fa === !!fs) co = -co;
    const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
    const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    const th1 = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx);
    const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry, vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
    let dth = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), dl = dth / n, t = 4 / 3 * Math.tan(dl / 4);
    const pt = a => [cx + rx * Math.cos(a) * c - ry * Math.sin(a) * s, cy + rx * Math.cos(a) * s + ry * Math.sin(a) * c];
    const dv = a => [-rx * Math.sin(a) * c - ry * Math.cos(a) * s, -rx * Math.sin(a) * s + ry * Math.cos(a) * c];
    const out = []; let a = th1;
    for (let i = 0; i < n; i++) {
      const b = a + dl, p0 = pt(a), d0 = dv(a), p1 = i === n - 1 ? [x2, y2] : pt(b), d1 = dv(b);
      out.push([p0[0] + t * d0[0], p0[1] + t * d0[1], p1[0] - t * d1[0], p1[1] - t * d1[1], p1[0], p1[1]]); a = b;
    }
    return out;
  }

function arcArgs(str) {
    const rn = new RegExp('\\s*,?\\s*(' + NUM + ')', 'y'), rf = /\s*,?\s*([01])/y; let pos = 0; const out = [];
    const rdr = r => { r.lastIndex = pos; const m = r.exec(str); if (!m) return null; pos = r.lastIndex; return +m[1]; };
    for (;;) { const v = []; for (const k of 'nnnffnn') { const t = rdr(k === 'f' ? rf : rn); if (t === null) return out; v.push(t); } out.push(v); }
  }

function parsePath(d, mat) {
    const subs = []; let cur = null, cx = 0, cy = 0, sx = 0, sy = 0, pc = null, pq = null, prev = '';
    const mk = (x, y) => ({ id: uid(), x, y, type: 'corner', handleIn: null, handleOut: null });
    const begin = (x, y) => { cur = { id: uid(), closed: false, nodes: [mk(x, y)] }; subs.push(cur); };
    const line = (x, y) => { if (!cur) begin(cx, cy); cur.nodes.push(mk(x, y)); cx = x; cy = y; };
    const cubic = (x1, y1, x2, y2, x, y) => {
      if (!cur) begin(cx, cy);
      const L = cur.nodes[cur.nodes.length - 1];
      L.handleOut = (x1 === L.x && y1 === L.y) ? null : { x: x1, y: y1 };
      const n = mk(x, y); n.handleIn = (x2 === x && y2 === y) ? null : { x: x2, y: y2 };
      cur.nodes.push(n); cx = x; cy = y; pc = { x: x2, y: y2 };
    };
    const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g; let m;
    while ((m = re.exec(d || ''))) {
      const t = m[1], T = t.toUpperCase(), abs = t === T;
      if (T === 'Z') { if (cur) { cur.closed = true; const f = cur.nodes[0], l = cur.nodes[cur.nodes.length - 1]; if (cur.nodes.length > 1 && Math.hypot(l.x - f.x, l.y - f.y) < 1e-6) { f.handleIn = l.handleIn; cur.nodes.pop(); } } cx = sx; cy = sy; cur = null; pc = pq = null; prev = 'Z'; continue; }
      const cnt = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7 }[T];
      const a = T === 'A' ? arcArgs(m[2]).flat() : nums(m[2]);
      for (let i = 0, first = true; i + cnt <= a.length; i += cnt, first = false) {
        const ox = abs ? 0 : cx, oy = abs ? 0 : cy;
        if (T === 'M') { const x = a[i] + ox, y = a[i + 1] + oy; if (first) { begin(x, y); sx = x; sy = y; cx = x; cy = y; } else line(x, y); pc = pq = null; }
        else if (T === 'L') line(a[i] + ox, a[i + 1] + oy);
        else if (T === 'H') line(a[i] + ox, cy);
        else if (T === 'V') line(cx, a[i] + oy);
        else if (T === 'C') cubic(a[i] + ox, a[i + 1] + oy, a[i + 2] + ox, a[i + 3] + oy, a[i + 4] + ox, a[i + 5] + oy);
        else if (T === 'S') { const r = (prev === 'C' || prev === 'S') && pc ? { x: 2 * cx - pc.x, y: 2 * cy - pc.y } : { x: cx, y: cy }; cubic(r.x, r.y, a[i] + ox, a[i + 1] + oy, a[i + 2] + ox, a[i + 3] + oy); }
        else if (T === 'Q' || T === 'T') {
          let qx, qy, x, y;
          if (T === 'Q') { qx = a[i] + ox; qy = a[i + 1] + oy; x = a[i + 2] + ox; y = a[i + 3] + oy; }
          else { const r = (prev === 'Q' || prev === 'T') && pq ? { x: 2 * cx - pq.x, y: 2 * cy - pq.y } : { x: cx, y: cy }; qx = r.x; qy = r.y; x = a[i] + ox; y = a[i + 1] + oy; }
          cubic(cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y); pq = { x: qx, y: qy };
        }
        else if (T === 'A') {
          const x = a[i + 5] + ox, y = a[i + 6] + oy, segs = arcToCubics(cx, cy, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], x, y);
          if (segs) segs.forEach(s => cubic(...s)); else line(x, y);
        }
        prev = T;
      }
      prev = T;
    }
    let out = bake(subs.filter(sp => sp.nodes.length > 1), mat || [1, 0, 0, 1, 0, 0]);
    out.forEach(sp => {
      const ns = sp.nodes, n = ns.length;
      ns.forEach((nd, i) => {
        if (nd.handleIn && nd.handleOut) {
          const vi = sub(nd, nd.handleIn), vo = sub(nd.handleOut, nd);
          if (Math.abs(Math.atan2(cross(vi, vo), dot(vi, vo))) < 0.08) nd.type = Math.abs(Math.hypot(vi.x, vi.y) - Math.hypot(vo.x, vo.y)) < 0.5 ? 'symmetric' : 'smooth'; else nd.type = 'corner';
        } else if (nd.handleIn || nd.handleOut) {
          /* Node ber-handle tunggal hanya 'smooth' jika handle-nya segaris dengan segmen lurus di sisi seberangnya; jika tidak = sudut (corner) */
          const pv = (sp.closed || i > 0) ? ns[(i - 1 + n) % n] : null;
          const nx = (sp.closed || i < n - 1) ? ns[(i + 1) % n] : null;
          const vi = nd.handleIn ? sub(nd, nd.handleIn) : (pv ? sub(nd, pv) : null);
          const vo = nd.handleOut ? sub(nd.handleOut, nd) : (nx ? sub(nx, nd) : null);
          if (vi && vo && Math.hypot(vi.x, vi.y) > 1e-6 && Math.hypot(vo.x, vo.y) > 1e-6 && Math.abs(Math.atan2(cross(vi, vo), dot(vi, vo))) < 0.08) nd.type = 'smooth';
          else nd.type = 'corner';
        }
      });
    });
    return out;
  }

const pc2 = (p, ox = 0, oy = 0) => rd(p.x - ox) + ' ' + rd(p.y - oy);

const seg = (a, b, ox = 0, oy = 0) => (a.handleOut || b.handleIn) ? ' C ' + pc2(a.handleOut || a, ox, oy) + ' ' + pc2(b.handleIn || b, ox, oy) + ' ' + pc2(b, ox, oy) : ' L ' + pc2(b, ox, oy);

function serializeSub(sp, ox = 0, oy = 0) {
    const ns = sp.nodes; if (!ns.length) return '';
    let d = 'M ' + pc2(ns[0], ox, oy);
    for (let i = 1; i < ns.length; i++) d += seg(ns[i - 1], ns[i], ox, oy);
    if (sp.closed) { const a = ns[ns.length - 1], b = ns[0]; if (a.handleOut || b.handleIn) d += seg(a, b, ox, oy); d += ' Z'; }
    return d;
  }

const serializePath = (o, ox = 0, oy = 0) => o.subs.map(sp => serializeSub(sp, ox, oy)).join(' ');

function shapeD(el) {
    const g = k => parseFloat(el.getAttribute(k)) || 0, t = el.tagName;
    if (t === 'path') return el.getAttribute('d') || '';
    if (t === 'rect') { const x = g('x'), y = g('y'), w = g('width'), h = g('height'); let rx = g('rx'), ry = g('ry'); if (!rx) rx = ry; if (!ry) ry = rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`; }
    if (t === 'circle' || t === 'ellipse') { const cx = g('cx'), cy = g('cy'), rx = t === 'circle' ? g('r') : g('rx'), ry = t === 'circle' ? g('r') : g('ry'); return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`; }
    if (t === 'line') return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
    if (t === 'polyline' || t === 'polygon') { const a = nums(el.getAttribute('points') || ''); let d = ''; for (let i = 0; i + 1 < a.length; i += 2) d += (i ? 'L' : 'M') + a[i] + ' ' + a[i + 1]; return d + (t === 'polygon' ? 'Z' : ''); }
    return null;
  }

function parseSVG(str) {
    const dom = new DOMParser().parseFromString(str, 'image/svg+xml'), svg = dom.querySelector('svg');
    if (!svg || dom.querySelector('parsererror')) return { viewBox: [0, 0, 100, 100], objects: [], unsupported: false, error: true };
    let vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(isNaN) || vb[2] <= 0 || vb[3] <= 0) vb = [0, 0, parseFloat(svg.getAttribute('width')) || 100, parseFloat(svg.getAttribute('height')) || 100];
    const objects = [], used = new Set(), frames = new Set(); let auto = 0, badGrad = false;
    const gdefs = new Map(); svg.querySelectorAll('linearGradient,radialGradient').forEach(ge => { const gid = ge.getAttribute('id'); if (gid) gdefs.set(gid, ge); });
    const gHref = e => (e.getAttribute('href') || e.getAttribute('xlink:href') || '').replace(/^#/, '');
    const gattr = (el, k) => { for (let e = el, i = 0; e && i < 6; i++) { const v = e.getAttribute(k); if (v != null) return v; const hr = gHref(e); e = hr ? gdefs.get(hr) : null; } return null; };
    const gstops = el => { for (let e = el, i = 0; e && i < 6; i++) { const st = Array.from(e.children).filter(c => c.tagName === 'stop'); if (st.length) return st.map(t => { const so = (t.getAttribute('offset') || '0').trim(), st0 = t.getAttribute('style') || '', pm = k => { const mm = st0.match(new RegExp('(?:^|;)\\s*' + k + '\\s*:\\s*([^;]+)')); return mm ? mm[1].trim() : t.getAttribute(k); }; return { offset: Math.max(0, Math.min(1, so.endsWith('%') ? parseFloat(so) / 100 : parseFloat(so) || 0)), color: pm('stop-color') || '#000000', op: pm('stop-opacity') != null ? parseFloat(pm('stop-opacity')) : 1 }; }); const hr = gHref(e); e = hr ? gdefs.get(hr) : null; } return []; };
    const attachGrad = (po, fillStr, m) => {
      const mm = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(fillStr || ''); if (!mm) return;
      const ge = gdefs.get(mm[1]), stops = ge && gstops(ge); if (!stops || !stops.length) { badGrad = true; return; }
      const dsyAttr = gattr(ge, 'data-sy');
      const rad = ge.tagName === 'radialGradient', obb = (gattr(ge, 'gradientUnits') || 'objectBoundingBox') !== 'userSpaceOnUse', gt = gattr(ge, 'gradientTransform'), M = (gt && !dsyAttr) ? parseTransform(gt) : [1, 0, 0, 1, 0, 0];
      const bb = obb ? docBounds({ objects: [po] }) : null; if (obb && !bb) { badGrad = true; return; }
      const num = (k, def) => { const v = gattr(ge, k); if (v == null) return def; const f = parseFloat(v); return isNaN(f) ? def : (String(v).trim().endsWith('%') ? f / 100 : f); };
      const P = (x, y) => { let X = M[0] * x + M[2] * y + M[4], Y = M[1] * x + M[3] * y + M[5]; if (bb) { X = bb[0] + X * (bb[2] - bb[0]); Y = bb[1] + Y * (bb[3] - bb[1]); } else { const X2 = m[0] * X + m[2] * Y + m[4]; Y = m[1] * X + m[3] * Y + m[5]; X = X2; } return [X, Y]; };
      const base = gattr(ge, 'data-base-color') || stops[Math.floor(stops.length / 2)].color, bf = typeof cssToHex === 'function' ? cssToHex(base) : base;
      po.fill = bf;
      if (rad) { const c = P(num('cx', 0.5), num('cy', 0.5)), k = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) * (bb ? ((bb[2] - bb[0]) + (bb[3] - bb[1])) / 2 : Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1); po.grad = { type: 'radial', base: bf, cx: c[0], cy: c[1], r: num('r', 0.5) * k, stops }; if (dsyAttr != null) po.grad.sy = parseFloat(dsyAttr) || 1; if (gattr(ge, 'fx') != null || gattr(ge, 'fy') != null) { const fp = P(num('fx', num('cx', 0.5)), num('fy', num('cy', 0.5))); po.grad.fx = fp[0]; po.grad.fy = fp[1]; } }
      else { const a = P(num('x1', 0), num('y1', 0)), b = P(num('x2', 1), num('y2', 0)); po.grad = { type: 'linear', base: bf, x1: a[0], y1: a[1], x2: b[0], y2: b[1], stops }; }
      const spm = gattr(ge, 'spreadMethod'); if (po.grad && (spm === 'reflect' || spm === 'repeat')) po.grad.spread = spm;
    };
    const prop = (el, k) => { const st = el.getAttribute('style'); if (st) { const m = st.match(new RegExp('(?:^|;)\\s*' + k + '\\s*:\\s*([^;]+)')); if (m) return m[1].trim(); } return el.getAttribute(k); };
    const walk = (el, inh, grp, mat) => {
      const tag = el.tagName; if (!tag || ['defs', 'clipPath', 'mask', 'style', 'title', 'desc', 'metadata'].includes(tag)) return;
      const cur = { ...inh };
      ['fill', 'stroke', 'stroke-width', 'fill-rule'].forEach(k => { const v = prop(el, k); if (v != null && v !== 'inherit') cur[k] = v; });
      const op = prop(el, 'opacity'); if (op != null && !isNaN(parseFloat(op))) cur.opacity = (cur.opacity ?? 1) * parseFloat(op);
      const m = el.getAttribute('transform') ? mmul(mat, parseTransform(el.getAttribute('transform'))) : mat;
      if (tag === 'g') { const gid = el.getAttribute('id') || uid(); if (el.getAttribute('data-container') === 'frame') frames.add(gid); Array.from(el.children).forEach(c => walk(c, cur, gid, m)); return; }
      if (tag === 'image') {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href'), iw = parseFloat(el.getAttribute('width')), ih = parseFloat(el.getAttribute('height'));
        if (!href || !(iw > 0) || !(ih > 0)) return;
        const io = makeImageObj(href, iw, ih, parseFloat(el.getAttribute('x')) || 0, parseFloat(el.getAttribute('y')) || 0, el.getAttribute('id') || 'image-' + (++auto), el.getAttribute('preserveAspectRatio') || 'xMidYMid meet', m);
        let name = io.name; const base = name; let k = 2; while (used.has(name)) name = base + '-' + k++; used.add(name);
        objects.push({ ...io, name, opacity: cur.opacity ?? 1, group: grp }); return;
      }
      const d = shapeD(el); if (d == null) return;
      const subs = parsePath(d, m); if (!subs.length) return;
      let name = el.getAttribute('id') || 'path-' + (++auto); const base = name; let k = 2; while (used.has(name)) name = base + '-' + k++; used.add(name);
      const sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const po = { id: uid(), name, type: 'path', fill: cur.fill || '#000000', stroke: cur.stroke || 'none', strokeWidth: (parseFloat(cur['stroke-width'] ?? '1') || 0) * sc, opacity: cur.opacity ?? 1, fillRule: cur['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero', group: grp, subs };
      if (/^url\(/.test(po.fill)) { attachGrad(po, po.fill, m); if (!po.grad) po.fill = '#808080'; }
      if (/^url\(/.test(po.stroke)) { po.stroke = '#808080'; badGrad = true; }
      objects.push(po);
    };
    Array.from(svg.children).forEach(c => walk(c, {}, null, [1, 0, 0, 1, 0, 0]));
    objects.forEach(o => { if (o.group && (frames.has(o.group) || /^Frame-\d+$/.test(o.group))) { o.containerType = 'frame'; if (o.name === o.group + '-bg') { o.isAutoFrame = true; o.isFrameBg = true; } } });
    return { viewBox: vb, objects, unsupported: badGrad || !!svg.querySelector('pattern,text,use,filter,clipPath,mask') };
  }

function makeImageObj(href, w, h, x, y, name, par, m) {
    const d = 'M' + x + ' ' + y + 'L' + (x + w) + ' ' + y + 'L' + (x + w) + ' ' + (y + h) + 'L' + x + ' ' + (y + h) + 'Z';
    return { id: uid(), name: name || 'image', type: 'image', fill: '#000000', stroke: 'none', strokeWidth: 0, opacity: 1, fillRule: 'nonzero', group: null, img: { href, w, h, par: par || 'none' }, subs: parsePath(d, m || [1, 0, 0, 1, 0, 0]) };
  }

function imageMatrix(o) {
    const im = o.img, ns = o.subs[0] && o.subs[0].nodes; if (!im || !ns || ns.length < 2) return null;
    if (ns.length === 4 && !ns.some(n => n.handleIn || n.handleOut)) { const p0 = ns[0], p1 = ns[1], p3 = ns[3]; return [(p1.x - p0.x) / im.w, (p1.y - p0.y) / im.w, (p3.x - p0.x) / im.h, (p3.y - p0.y) / im.h, p0.x, p0.y]; }
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; ns.forEach(n => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    return [(x1 - x0) / im.w, 0, 0, (y1 - y0) / im.h, x0, y0];
  }

function docBounds(doc, only) {
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    const add = (x, y, pad) => { if (x - pad < x0) x0 = x - pad; if (x + pad > x1) x1 = x + pad; if (y - pad < y0) y0 = y - pad; if (y + pad > y1) y1 = y + pad; };
    doc.objects.forEach(o => { if (only && !only.has(o.id)) return; const pad = o.stroke !== 'none' ? (o.strokeWidth || 0) / 2 : 0;
      o.subs.forEach(sp => { const ns = sp.nodes, n = ns.length; ns.forEach(q => add(q.x, q.y, pad));
        for (let i = 0; i < (sp.closed ? n : n - 1); i++) { const a = ns[i], b = ns[(i + 1) % n]; if (a.handleOut || b.handleIn) for (let k = 1; k < 16; k++) { const q = segPoint(a, b, k / 16); add(q.x, q.y, pad); } } }); });
    return x0 > x1 ? null : [x0, y0, x1, y1];
  }

const gradOn = o => !!(o && o.grad && o.grad.base === o.fill);

const gradXml = (g, id, ox = 0, oy = 0) => {
    const r = v => Math.round(v * 1e4) / 1e4, sp = g.spread && g.spread !== 'pad' ? ' spreadMethod="' + g.spread + '"' : '';
    const st = g.stops.map(t => '<stop offset="' + r(t.offset) + '" stop-color="' + esc(t.color) + '"' + (t.op != null && t.op !== 1 ? ' stop-opacity="' + r(t.op) + '"' : '') + '/>').join('');
    if (g.type === 'radial') { const fx = g.fx != null ? ' fx="' + r(g.fx - ox) + '" fy="' + r(g.fy - oy) + '"' : ''; const gt = (g.sy != null && Math.abs(g.sy - 1) > 0.01) ? ' data-sy="' + r(g.sy) + '" gradientTransform="matrix(1 0 0 ' + r(g.sy) + ' 0 ' + r((g.cy - oy) * (1 - g.sy)) + ')"' : ''; return '<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + r(g.cx - ox) + '" cy="' + r(g.cy - oy) + '" r="' + r(g.r) + '"' + fx + gt + sp + '>' + st + '</radialGradient>'; }
    return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + r(g.x1 - ox) + '" y1="' + r(g.y1 - oy) + '" x2="' + r(g.x2 - ox) + '" y2="' + r(g.y2 - oy) + '"' + sp + '>' + st + '</linearGradient>';
  };

function serializeDoc(doc, opt) {
    opt = opt || {};
    if (doc.objects.some(o => o.hidden)) doc = { ...doc, objects: doc.objects.filter(o => !o.hidden) };   /* layer tersembunyi tidak ikut diekspor (ala Figma) */
    if (opt.area === 'sel' && opt.only) { doc = { ...doc, objects: doc.objects.filter(o => opt.only.has(o.id)) }; }
    let [vx, vy, vw, vh] = doc.viewBox; let body = '', open = null, hasImg = false, gdefs = '', gn = 0; const used = new Set(), gseen = new Set();
    if (opt.area === 'content' || opt.area === 'sel') { const bb = docBounds(doc); if (bb && bb[2] > bb[0] && bb[3] > bb[1]) { vx = Math.floor(bb[0] * 100) / 100; vy = Math.floor(bb[1] * 100) / 100; vw = Math.ceil((bb[2] - vx) * 100) / 100; vh = Math.ceil((bb[3] - vy) * 100) / 100; } }
    /* v7.1: origin dinormalisasi ke (0,0) -> viewBox selalu "0 0 W H" sehingga Illustrator/CorelDRAW/Affinity menaruh objek tepat di artboard */
    const ox = vx, oy = vy; vw = Math.max(1, rd(vw)); vh = Math.max(1, rd(vh));
    const uq = b => { b = String(b || 'path').replace(/[^\w\-.:]/g, '-'); if (!/^[A-Za-z_]/.test(b)) b = 'id-' + b; let k = b, i = 2; while (used.has(k)) k = b + '-' + i++; used.add(k); return k; };
    const r6 = v => Math.round(v * 1e6) / 1e6;
    if (opt.bg && opt.bg.mode === 'solid') body += '<rect x="0" y="0" width="' + vw + '" height="' + vh + '" fill="' + esc(opt.bg.color || '#ffffff') + '"/>';
    doc.objects.forEach(o => {
      if (o.group !== open) { if (open) body += '</g>'; if (o.group) { const isF = o.containerType === 'frame' || o.isAutoFrame || o.isFrameBg || /^frame/i.test(o.group); body += '<g' + (gseen.has(o.group) ? '' : ' id="' + esc(o.group) + '"') + (isF ? ' data-container="frame"' : '') + '>'; gseen.add(o.group); } open = o.group; }
      if (o.img) { const m = imageMatrix(o); if (!m) return; hasImg = true;
        const mS = [m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy];
        body += '<image id="' + uq(o.name) + '" href="' + esc(o.img.href) + '" xlink:href="' + esc(o.img.href) + '" x="0" y="0" width="' + r6(o.img.w) + '" height="' + r6(o.img.h) + '" preserveAspectRatio="' + esc(o.img.par || 'none') + '" transform="matrix(' + mS.map(r6).join(' ') + ')"' + (o.opacity !== 1 ? ' opacity="' + rd(o.opacity) + '"' : '') + '/>'; return; }
      let fillA = esc(o.fill); if (gradOn(o)) { const gid = 'grad-' + (++gn); gdefs += gradXml(o.grad, gid, ox, oy); fillA = 'url(#' + gid + ')'; }
      body += '<path id="' + uq(o.name) + '" fill="' + fillA + '"' + (o.stroke !== 'none' && o.strokeWidth > 0 ? ' stroke="' + esc(o.stroke) + '" stroke-width="' + rd(o.strokeWidth) + '"' : '') + (o.opacity !== 1 ? ' opacity="' + rd(o.opacity) + '"' : '') + (o.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '') + ' d="' + serializePath(o, ox, oy) + '"/>';
    });
    if (open) body += '</g>';
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"' + (hasImg ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : '') + ' version="1.1" width="' + vw + '" height="' + vh + '" viewBox="0 0 ' + vw + ' ' + vh + '">' + (gdefs ? '<defs>' + gdefs + '</defs>' : '') + body + '</svg>';
  }

function segPoint(a, b, t) {
    if (!a.handleOut && !b.handleIn) return lerp(a, b, t);
    const p1 = a.handleOut || P(a), p2 = b.handleIn || P(b), u = 1 - t;
    return { x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y };
  }

const b64enc = str => { const u8 = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

const embedLines = svg => (b64enc(svg).match(/.{1,100}/g) || []).map(l => '%SVGPeak-Data: ' + l).join('\n') + '\n';

const hex01 = hx => { const h = cssToHex(hx || '#000000'); return [1, 3, 5].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4)).join(' '); };

const hasPaint = o => { const f = o.fill && o.fill !== 'none', s = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0; return { f, s }; };

function pathOps(o, mv, ln, cu, cz) {
    let t = '';
    o.subs.forEach(sp => {
      const ns = sp.nodes, n = ns.length; if (!n) return;
      t += mv(ns[0]);
      const lim = sp.closed ? n : n - 1;
      for (let i = 0; i < lim; i++) {
        const a = ns[i], b = ns[(i + 1) % n];
        if (a.handleOut || b.handleIn) { const c1 = a.handleOut || a, c2 = b.handleIn || b; t += cu(c1, c2, b); }
        else if (i < n - 1) t += ln(b);
      }
      if (sp.closed) t += cz();
    });
    return t;
  }

function exportEPS(doc, opt) {
    opt = opt || {};
    const svgStr = serializeDoc(doc, opt), parsed = parseSVG(svgStr), [vx, vy, vw, vh] = parsed.viewBox;
    let ps = '%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: SVGPeak Auto Trace\n%%BoundingBox: 0 0 ' + Math.ceil(vw) + ' ' + Math.ceil(vh) + '\n%%HiResBoundingBox: 0 0 ' + rd(vw) + ' ' + rd(vh) + '\n%%LanguageLevel: 2\n%%Pages: 1\n%%EndComments\n';
    ps += embedLines(svgStr);
    ps += 'gsave\n0 ' + rd(vh) + ' translate 1 -1 scale\n' + rd(-vx) + ' ' + rd(-vy) + ' translate\n';
    if (opt.bg && opt.bg.mode === 'solid') ps += hex01(opt.bg.color) + ' setrgbcolor\n' + rd(vx) + ' ' + rd(vy) + ' ' + rd(vw) + ' ' + rd(vh) + ' rectfill\n';
    parsed.objects.forEach(o => {
      if (o.img) return; const { f, s } = hasPaint(o); if (!f && !s) return;
      ps += 'newpath\n' + pathOps(o, p => rd(p.x) + ' ' + rd(p.y) + ' moveto\n', p => rd(p.x) + ' ' + rd(p.y) + ' lineto\n',
        (c1, c2, p) => rd(c1.x) + ' ' + rd(c1.y) + ' ' + rd(c2.x) + ' ' + rd(c2.y) + ' ' + rd(p.x) + ' ' + rd(p.y) + ' curveto\n', () => 'closepath\n');
      const fOp = o.fillRule === 'evenodd' ? 'eofill' : 'fill';
      if (f && s) ps += 'gsave ' + hex01(o.fill) + ' setrgbcolor ' + fOp + ' grestore\n' + hex01(o.stroke) + ' setrgbcolor ' + rd(o.strokeWidth) + ' setlinewidth stroke\n';
      else if (f) ps += hex01(o.fill) + ' setrgbcolor ' + fOp + '\n';
      else ps += hex01(o.stroke) + ' setrgbcolor ' + rd(o.strokeWidth) + ' setlinewidth stroke\n';
    });
    return ps + 'grestore\nshowpage\n%%EOF\n';
  }

function exportAI(doc, opt) {
    opt = opt || {};
    const svgStr = serializeDoc(doc, opt), parsed = parseSVG(svgStr), [vx, vy, vw, vh] = parsed.viewBox;
    const gs = []; let stm = 'q\n1 0 0 -1 ' + rd(-vx) + ' ' + rd(vh + vy) + ' cm\n';
    if (opt.bg && opt.bg.mode === 'solid') stm += hex01(opt.bg.color) + ' rg\n' + rd(vx) + ' ' + rd(vy) + ' ' + rd(vw) + ' ' + rd(vh) + ' re f\n';
    parsed.objects.forEach(o => {
      if (o.img) return; const { f, s } = hasPaint(o); if (!f && !s) return;
      const op = o.opacity != null && o.opacity < 1; let gi = 0;
      if (op) { gs.push(rd(o.opacity)); gi = gs.length; stm += 'q\n/GS' + gi + ' gs\n'; }
      if (f) stm += hex01(o.fill) + ' rg\n';
      if (s) stm += hex01(o.stroke) + ' RG ' + rd(o.strokeWidth) + ' w\n';
      stm += pathOps(o, p => rd(p.x) + ' ' + rd(p.y) + ' m\n', p => rd(p.x) + ' ' + rd(p.y) + ' l\n',
        (c1, c2, p) => rd(c1.x) + ' ' + rd(c1.y) + ' ' + rd(c2.x) + ' ' + rd(c2.y) + ' ' + rd(p.x) + ' ' + rd(p.y) + ' c\n', () => 'h\n');
      const eo = o.fillRule === 'evenodd';
      stm += (f && s ? (eo ? 'B*' : 'B') : f ? (eo ? 'f*' : 'f') : 'S') + '\n';
      if (op) stm += 'Q\n';
    });
    stm += 'Q\n';
    const res = gs.length ? '<< /ExtGState << ' + gs.map((a, i) => '/GS' + (i + 1) + ' << /Type /ExtGState /ca ' + a + ' /CA ' + a + ' >>').join(' ') + ' >> >>' : '<< >>';
    const box = '[0 0 ' + rd(vw) + ' ' + rd(vh) + ']';
    const objs = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ' + box + ' /ArtBox ' + box + ' /Contents 4 0 R /Resources ' + res + ' >>\nendobj\n',
      '4 0 obj\n<< /Length ' + stm.length + ' >>\nstream\n' + stm + 'endstream\nendobj\n',
      '5 0 obj\n<< /Producer (SVGPeak Auto Trace) /Creator (SVGPeak) >>\nendobj\n'
    ];
    let pdf = '%PDF-1.4\n' + embedLines(svgStr); const offs = [];   /* semua ASCII → panjang string = offset byte */
    objs.forEach(o => { offs.push(pdf.length); pdf += o; });
    const xp = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(p => { pdf += String(p).padStart(10, '0') + ' 00000 n \n'; });
    return pdf + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xp + '\n%%EOF\n';
  }

return { parseSVG, exportEPS, exportAI };
})();

export { VE };
