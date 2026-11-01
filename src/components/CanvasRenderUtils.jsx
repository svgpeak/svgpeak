import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { VMT } from '../engine/VmtEngine.jsx';
import { ICONS, Ico } from './CommonControls.jsx';

/* Parse dokumen SVG menjadi daftar perintah Path2D murni agar dirender secara vektor asli
   di kanvas CompareView (100% tajam di zoom berapa pun, tidak pernah blur!) */
function resolveCanvasPaint(ctx, paintStr, gradDesc) {
  if (!gradDesc) {
    return (paintStr && paintStr.startsWith('url(')) ? '#000000' : paintStr;
  }
  const cgKey = gradDesc.type === 'radial'
    ? `R:${gradDesc.cx},${gradDesc.cy},${gradDesc.r},${gradDesc.fx ?? ''},${gradDesc.fy ?? ''}`
    : `L:${gradDesc.x1},${gradDesc.y1},${gradDesc.x2},${gradDesc.y2}`;
  if (gradDesc._cachedCg && gradDesc._cachedCgKey === cgKey) return gradDesc._cachedCg;
  try {
    let cg;
    if (gradDesc.type === 'radial') {
      cg = ctx.createRadialGradient(
        gradDesc.fx ?? gradDesc.cx, gradDesc.fy ?? gradDesc.cy, 0,
        gradDesc.cx, gradDesc.cy, Math.max(0.1, gradDesc.r)
      );
    } else {
      cg = ctx.createLinearGradient(gradDesc.x1, gradDesc.y1, gradDesc.x2, gradDesc.y2);
    }
    for (const st of gradDesc.stops) {
      let col = st._cssCol;
      if (!col) {
        col = st.color || '#000000';
        if (st.op != null && st.op < 0.999 && /^#[0-9a-fA-F]{6}$/.test(col)) {
          const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
          col = `rgba(${r},${g},${b},${st.op})`;
        }
        st._cssCol = col;
      }
      cg.addColorStop(Math.max(0, Math.min(1, st.offset)), col);
    }
    gradDesc._cachedCg = cg;
    gradDesc._cachedCgKey = cgKey;
    return cg;
  } catch (e) {
    return (gradDesc.stops && gradDesc.stops[0] && gradDesc.stops[0].color) || '#000000';
  }
}

function fillCanvasPath(ctx, it) {
  const g = it.fillGrad;
  if (g && g.type === 'radial' && g.sy != null && Math.abs(g.sy - 1) > 0.02) {
    const sy = g.sy, cy = g.cy || 0;
    if (typeof DOMMatrix !== 'undefined') {
      if (!it._ellipP2d || it._ellipSrcP2d !== it.p2d || it._ellipSy !== sy || it._ellipCy !== cy) {
        const invSy = 1 / Math.max(0.05, sy);
        const ep = new Path2D();
        ep.addPath(it.p2d, new DOMMatrix([1, 0, 0, invSy, 0, cy * (1 - invSy)]));
        it._ellipP2d = ep;
        it._ellipSrcP2d = it.p2d;
        it._ellipSy = sy;
        it._ellipCy = cy;
      }
      ctx.save();
      ctx.translate(0, cy * (1 - sy));
      ctx.scale(1, sy);
      ctx.fillStyle = resolveCanvasPaint(ctx, it.fill, g);
      ctx.fill(it._ellipP2d, it.fillRule || 'evenodd');
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.clip(it.p2d, it.fillRule || 'evenodd');
    ctx.translate(0, cy * (1 - sy));
    ctx.scale(1, sy);
    ctx.fillStyle = resolveCanvasPaint(ctx, it.fill, g);
    const R = Math.max(10, g.r * 2.5);
    ctx.fillRect(g.cx - R, g.cy - R, R * 2, R * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = resolveCanvasPaint(ctx, it.fill, g);
    ctx.fill(it.p2d, it.fillRule || 'evenodd');
  }
}

let _lastSvgParseStr = null, _lastSvgParseRes = null;
let _checkerPattern = null;
function getCheckerPattern(ctx) {
  if (_checkerPattern) return _checkerPattern;
  try {
    const pCv = document.createElement('canvas');
    pCv.width = 28; pCv.height = 28;
    const px = pCv.getContext('2d');
    px.fillStyle = '#ffffff'; px.fillRect(0, 0, 28, 28);
    px.fillStyle = '#e4e4e7'; px.fillRect(14, 0, 14, 14); px.fillRect(0, 14, 14, 14);
    _checkerPattern = ctx.createPattern(pCv, 'repeat');
    return _checkerPattern;
  } catch (e) { return '#ffffff'; }
}

/* =====================================================================
   [PERF-100%] High-DPI Screen-Space Node Pin Sprite Atlas &
   World-Locked Occupancy Grid (Bebas Tessellation Arc/Stroke & Bebas Shimmer Saat Pan)
   ===================================================================== */
let _sharedOccBuf = new Uint8Array(65536);
function createWorldOccGrid(vMinX, vMaxX, vMinY, vMaxY, z, cellPx = 3.5) {
  const invCell = z / cellPx;
  const baseCellX = Math.floor(vMinX * invCell);
  const baseCellY = Math.floor(vMinY * invCell);
  const gCols = Math.max(1, Math.min(2048, Math.floor(vMaxX * invCell) - baseCellX + 2));
  const gRows = Math.max(1, Math.min(2048, Math.floor(vMaxY * invCell) - baseCellY + 2));
  const needed = gCols * gRows;
  if (_sharedOccBuf.length < needed) {
    _sharedOccBuf = new Uint8Array(Math.max(needed, _sharedOccBuf.length * 2));
  }
  _sharedOccBuf.fill(0, 0, needed);
  return { grid: _sharedOccBuf, gCols, gRows, baseCellX, baseCellY, invCell };
}

function drawScreenPinSpritesBatch(ctx, ptsFlat, kind, rCss, lwCss, bitMask, ox, oy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occObj) {
  if (!ptsFlat || !ptsFlat.length) return;
  const grid = occObj ? occObj.grid : null;
  const gCols = occObj ? occObj.gCols : 0, gRows = occObj ? occObj.gRows : 0;
  const baseCellX = occObj ? occObj.baseCellX : 0, baseCellY = occObj ? occObj.baseCellY : 0;
  const invCell = occObj ? occObj.invCell : 1;
  const isSharp = kind === 'sharp';
  const isJunc = kind === 'junc';
  let visEst = 0;
  if (!isSharp) {
    for (let i = 0, n = ptsFlat.length; i < n; i += 2) {
      const px = ptsFlat[i], py = ptsFlat[i + 1];
      if (px >= vMinX && px <= vMaxX && py >= vMinY && py <= vMaxY) {
        if (++visEst > 320) break;
      }
    }
  }
  const useFastRect = isSharp || (!!occObj && visEst > 320) || visEst > 320;
  const fillCol = isSharp ? '#f59e0b' : kind === 'round' ? '#ec4899' : isJunc ? '#a855f7' : '#06b6d4';
  const borderCol = (isSharp || kind === 'round') ? '#0f172a' : '#ffffff';

  if (useFastRect) {
    /* [SKIA INTEGER BLIT FASTPATH] Koordinat piksel bulat di device space (setTransform 1,0,0,1,0,0) -> SkBlitter::blitRect murni (<1.5ms)! */
    const outerPath = new Path2D();
    const innerPath = new Path2D();
    const rInPx = Math.max(2, Math.round((isSharp ? rCss * 0.82 : rCss * 0.76) * dpr));
    const rOutPx = rInPx + Math.max(1, Math.round(lwCss * 0.85 * dpr));
    const dInPx = rInPx * 2, dOutPx = rOutPx * 2;
    const oxPx = ox * dpr, oyPx = oy * dpr, zPx = z * dpr;
    let count = 0;
    for (let i = 0, n = ptsFlat.length; i < n; i += 2) {
      const px = ptsFlat[i], py = ptsFlat[i + 1];
      if (px < vMinX || px > vMaxX || py < vMinY || py > vMaxY) continue;
      if (grid) {
        const gx = Math.floor(px * invCell) - baseCellX;
        const gy = Math.floor(py * invCell) - baseCellY;
        if (gx >= 0 && gx < gCols && gy >= 0 && gy < gRows) {
          const gIdx = gy * gCols + gx;
          if (grid[gIdx] & bitMask) continue;
          grid[gIdx] |= bitMask;
        }
      }
      const sx = Math.round(oxPx + px * zPx);
      const sy = Math.round(oyPx + py * zPx);
      outerPath.rect(sx - rOutPx, sy - rOutPx, dOutPx, dOutPx);
      innerPath.rect(sx - rInPx, sy - rInPx, dInPx, dInPx);
      count++;
    }
    if (!count) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = borderCol;
    ctx.fill(outerPath);
    ctx.fillStyle = fillCol;
    ctx.fill(innerPath);
    ctx.restore();
    return;
  }

  const path = new Path2D();
  const r = rCss * 0.85;
  const rD = r * 1.18;
  let count = 0;
  for (let i = 0, n = ptsFlat.length; i < n; i += 2) {
    const px = ptsFlat[i], py = ptsFlat[i + 1];
    if (px < vMinX || px > vMaxX || py < vMinY || py > vMaxY) continue;
    const sx = ox + px * z, sy = oy + py * z;
    if (isJunc) {
      path.moveTo(sx, sy - rD);
      path.lineTo(sx + rD, sy);
      path.lineTo(sx, sy + rD);
      path.lineTo(sx - rD, sy);
      path.closePath();
    } else {
      path.moveTo(sx + r, sy);
      path.arc(sx, sy, r, 0, Math.PI * 2);
    }
    count++;
  }
  if (!count) return;
  ctx.fillStyle = fillCol;
  ctx.fill(path);
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = lwCss;
  ctx.stroke(path);
}

const _globalPath2dCache = new Map();
function getCachedPath2D(d) {
  if (!d) return new Path2D();
  let p = _globalPath2dCache.get(d);
  if (p) return p;
  p = new Path2D(d);
  if (_globalPath2dCache.size >= 12000) {
    const fk = _globalPath2dCache.keys().next().value;
    _globalPath2dCache.delete(fk);
  }
  _globalPath2dCache.set(d, p);
  return p;
}

function parseSvgForCanvas(svgStr) {
  if (!svgStr) return [];
  if (svgStr === _lastSvgParseStr && _lastSvgParseRes) return _lastSvgParseRes;
  const fastRaw = (typeof VMT !== 'undefined' && VMT.getFastSvgCanvasItems) ? VMT.getFastSvgCanvasItems(svgStr) : null;
  if (fastRaw) {
    const items = fastRaw.map(it => ({ ...it, p2d: getCachedPath2D(it.d) }));
    _lastSvgParseStr = svgStr;
    _lastSvgParseRes = items;
    return items;
  }
  try {
    const dom = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
    const root = dom.querySelector('svg');
    if (!root) return [];
    const grads = new Map();
    root.querySelectorAll('linearGradient, radialGradient').forEach(ge => {
      const id = ge.getAttribute('id');
      if (!id) return;
      const isRad = (ge.tagName || '').toLowerCase() === 'radialgradient';
      const stops = Array.from(ge.querySelectorAll('stop')).map(st => {
        const rawOff = (st.getAttribute('offset') || '0').trim();
        const off = rawOff.endsWith('%') ? parseFloat(rawOff) / 100 : parseFloat(rawOff) || 0;
        const opAttr = st.getAttribute('stop-opacity');
        const op = opAttr != null ? Math.max(0, Math.min(1, parseFloat(opAttr))) : 1;
        return { offset: Math.max(0, Math.min(1, off)), color: st.getAttribute('stop-color') || '#000000', op };
      });
      if (!stops.length) return;
      const baseCol = ge.getAttribute('data-base-color') || stops[0].color;
      if (isRad) {
        const syAttr = ge.getAttribute('data-sy');
        grads.set(id, {
          type: 'radial',
          base: baseCol,
          sy: syAttr != null ? parseFloat(syAttr) : 1,
          cx: parseFloat(ge.getAttribute('cx')) || 0,
          cy: parseFloat(ge.getAttribute('cy')) || 0,
          r: parseFloat(ge.getAttribute('r')) || 1,
          fx: ge.getAttribute('fx') != null ? parseFloat(ge.getAttribute('fx')) : undefined,
          fy: ge.getAttribute('fy') != null ? parseFloat(ge.getAttribute('fy')) : undefined,
          stops
        });
      } else {
        grads.set(id, {
          type: 'linear',
          base: baseCol,
          x1: parseFloat(ge.getAttribute('x1')) || 0,
          y1: parseFloat(ge.getAttribute('y1')) || 0,
          x2: parseFloat(ge.getAttribute('x2')) || 0,
          y2: parseFloat(ge.getAttribute('y2')) || 0,
          stops
        });
      }
    });
    const parseUrlGrad = str => {
      const m = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(str || '');
      return m ? (grads.get(m[1]) || null) : null;
    };
    const items = [];
    const walk = (el, inh) => {
      const tag = (el.tagName || '').toLowerCase();
      if (!tag || ['defs', 'style', 'title', 'desc', 'metadata'].includes(tag)) return;
      const fillStr = el.getAttribute('fill') || inh.fill;
      const strokeStr = el.getAttribute('stroke') || inh.stroke;
      const cur = {
        fill: fillStr,
        fillGrad: parseUrlGrad(fillStr),
        fillRule: el.getAttribute('fill-rule') || inh.fillRule || 'nonzero',
        stroke: strokeStr,
        strokeGrad: parseUrlGrad(strokeStr),
        strokeWidth: (strokeStr && strokeStr !== 'none') ? (parseFloat(el.getAttribute('stroke-width') ?? inh.strokeWidth ?? 1) || 0) : 0,
        lineJoin: el.getAttribute('stroke-linejoin') || inh.lineJoin || 'round',
        lineCap: el.getAttribute('stroke-linecap') || inh.lineCap || 'round',
        opacity: (el.getAttribute('opacity') != null ? parseFloat(el.getAttribute('opacity')) : 1) * (inh.opacity ?? 1),
      };
      if (tag === 'g') {
        for (const ch of el.children) walk(ch, cur);
        return;
      }
      if (tag === 'rect') {
        const rx = parseFloat(el.getAttribute('x')) || 0, ry = parseFloat(el.getAttribute('y')) || 0;
        const rw = parseFloat(el.getAttribute('width')) || 0, rh = parseFloat(el.getAttribute('height')) || 0;
        if (rw > 0 && rh > 0) {
          const p2d = new Path2D();
          p2d.rect(rx, ry, rw, rh);
          items.push({ ...cur, p2d });
        }
        return;
      }
      if (tag === 'path') {
        const d = el.getAttribute('d');
        const outerKey = el.getAttribute('data-outer-key') || '';
        const holeKeysAttr = el.getAttribute('data-hole-keys') || '';
        const holeKeys = holeKeysAttr ? holeKeysAttr.split(',').filter(Boolean) : [];
        if (d) items.push({ ...cur, d, p2d: getCachedPath2D(d), outerKey, holeKeys });
      }
    };
    for (const ch of root.children) walk(ch, { fill: '#000000', stroke: 'none', strokeWidth: 0, opacity: 1 });
    _lastSvgParseStr = svgStr;
    _lastSvgParseRes = items;
    return items;
  } catch (e) {
    return [];
  }
}

/* =====================================================================
   [HL-COLOR] Sorot objek berdasarkan warna palet
   Seluruh kanvas ditutup tirai gelap, lalu tirai "dihapus" tepat di piksel yang TERLIHAT
   (bukan yang tertutup layer lain) milik warna terpilih — akurat untuk mode Stack/Cut-out/Grouped.
   ===================================================================== */
let _hlCv = null;
const _hlNorm = c => {
  if (!c) return '';
  c = String(c).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return c;
};
let _hlCacheKey = '', _hlCacheCount = 0;
function drawColorHighlightVeil(x, items, hex, cw, ch, tx, ty, tz, dpr) {
  const target = _hlNorm(hex);
  if (!target || !items || !items.length) return -1;
  if (!_hlCv) _hlCv = document.createElement('canvas');
  const bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr));
  const matchIndices = [];
  for (let i = 0, n = items.length; i < n; i++) {
    const it = items[i];
    const hasFill = it.fill && it.fill !== 'none';
    const doStroke = it.stroke && it.stroke !== 'none' && it.strokeWidth > 0;
    if (!hasFill && !doStroke) continue;
    const itemHex = it.fillGrad ? (it.fillGrad.base || (it.fillGrad.stops[0] && it.fillGrad.stops[0].color)) : (hasFill ? it.fill : it.stroke);
    if (_hlNorm(itemHex) === target) matchIndices.push(i);
  }
  const firstItemP2d = items[0] && items[0].p2d;
  const cKey = `${bw}x${bh}|${dpr.toFixed(2)}|${tx.toFixed(2)},${ty.toFixed(2)},${tz.toFixed(5)}|${items.length}|${matchIndices.join(',')}`;
  if (_hlCv.width === bw && _hlCv.height === bh && _hlCacheKey === cKey && _hlCv._firstP2d === firstItemP2d) {
    x.save();
    x.globalAlpha = 0.74;
    x.imageSmoothingEnabled = true;
    x.drawImage(_hlCv, 0, 0, cw, ch);
    x.restore();
    return _hlCacheCount;
  }
  if (_hlCv.width !== bw || _hlCv.height !== bh) { _hlCv.width = bw; _hlCv.height = bh; }
  const o = _hlCv.getContext('2d');
  const VEIL_SOLID = '#060a16';
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  o.globalAlpha = 1;
  o.fillStyle = VEIL_SOLID;
  o.fillRect(0, 0, bw, bh);
  if (matchIndices.length > 0) {
    o.setTransform(dpr * tz, 0, 0, dpr * tz, dpr * tx, dpr * ty);
    const matchSet = new Set(matchIndices);
    const firstMatch = matchIndices[0];
    for (let i = firstMatch, n = items.length; i < n; i++) {
      const it = items[i];
      const hasFill = it.fill && it.fill !== 'none';
      const doStroke = it.stroke && it.stroke !== 'none' && it.strokeWidth > 0;
      if (!hasFill && !doStroke) continue;
      const isMatch = matchSet.has(i);
      o.globalCompositeOperation = isMatch ? 'destination-out' : 'source-over';
      o.fillStyle = VEIL_SOLID;
      o.strokeStyle = VEIL_SOLID;
      if (hasFill) o.fill(it.p2d, it.fillRule || 'evenodd');
      if (doStroke) {
        o.lineWidth = it.strokeWidth;
        o.lineJoin = it.lineJoin || 'round';
        o.lineCap = it.lineCap || 'round';
        o.stroke(it.p2d);
      }
    }
    o.globalCompositeOperation = 'source-over';
  }
  _hlCacheKey = cKey;
  _hlCacheCount = matchIndices.length;
  _hlCv._firstP2d = firstItemP2d;
  x.save();
  x.globalAlpha = 0.74;
  x.imageSmoothingEnabled = true;
  x.drawImage(_hlCv, 0, 0, cw, ch);
  x.restore();
  return matchIndices.length;
}
function drawHighlightHud(x, hex, count, px, py) {
  x.save();
  const txt = 'SOROT ' + String(hex).toUpperCase() + (count == null || count < 0 ? '' : (count > 0 ? ' · ' + count + ' bagian' : ' · tidak tampak'));
  x.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  const tw = x.measureText(txt).width;
  x.fillStyle = 'rgba(15, 23, 42, 0.9)';
  x.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  x.lineWidth = 1;
  x.beginPath();
  if (x.roundRect) x.roundRect(px, py, tw + 42, 24, 8); else x.rect(px, py, tw + 42, 24);
  x.fill(); x.stroke();
  x.fillStyle = hex; x.strokeStyle = '#ffffff'; x.lineWidth = 1.5;
  x.beginPath(); x.arc(px + 14, py + 12, 6, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = '#f8fafc'; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText(txt, px + 28, py + 12.5);
  x.restore();
}


/* ===== Helper layout melayang (Perakitan SVG) ===== */
Object.assign(ICONS, {
  rvSide: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M15 3v18',
  rvChevR: 'M9 6l6 6-6 6'
});
/* Area aman kanvas: pusat & ukuran efektif setelah dikurangi panel yang melayang di atasnya */
function rvSafe(wrap, pad) {
  const cw = wrap.clientWidth, ch = wrap.clientHeight, p = pad || {};
  const l = p.l || 0, r = p.r || 0, t = p.t || 0, b = p.b || 0;
  const aw = Math.max(80, cw - l - r), ah = Math.max(80, ch - t - b);
  return { cw, ch, cx: l + aw / 2, cy: t + ah / 2, aw, ah };
}
const rvUseWide = (px) => {
  const [w, setW] = useState(() => typeof window !== 'undefined' && window.innerWidth >= px);
  useEffect(() => {
    const f = () => setW(window.innerWidth >= px);
    window.addEventListener('resize', f, { passive: true });
    return () => window.removeEventListener('resize', f);
  }, [px]);
  return w;
};
/* Memicu render ulang kanvas saat ukuran wadah berubah (kanvas kini mengikuti ukuran jendela) */
const rvUseResizeTick = (ref) => {
  const [t, setT] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastW = el.clientWidth || 0;
    let lastH = el.clientHeight || 0;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth || 0, nh = el.clientHeight || 0;
      if (nw === lastW && nh === lastH) return;
      lastW = nw; lastH = nh;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setT(n => n + 1));
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return t;
};
let _rvBodyOpenCount = 0;
const rvUseBodyFlag = () => {
  useEffect(() => {
    _rvBodyOpenCount++;
    document.body.classList.add('rv-open');
    return () => {
      _rvBodyOpenCount = Math.max(0, _rvBodyOpenCount - 1);
      if (_rvBodyOpenCount === 0) document.body.classList.remove('rv-open');
    };
  }, []);
};
const RvPortal = ({ children, cls }) => {
  rvUseBodyFlag();
  return ReactDOM.createPortal((<div className={'rv-root' + (cls ? ' ' + cls : '')}>{children}</div>), document.body);
};
/* Panel samping melayang yang bisa dilipat */
const RvSide = ({ open, onToggle, icon, title, sub, cls, children }) => open ? (<aside className={'rv-side rv-glass' + (cls ? ' ' + cls : '')}><div className="rv-side-h"><span className="rv-side-ic"><Ico n={icon} size={15} /></span><div className="rv-side-t"><b>{title}</b>{sub && <small>{sub}</small>}</div><button type="button" className="rv-ibtn" onClick={onToggle} aria-label="Sembunyikan panel" title="Sembunyikan panel"><Ico n="rvChevR" size={16} /></button></div><div className="rv-side-b">{children}</div></aside>) : (<button type="button" className="rv-side-open rv-glass" onClick={onToggle} aria-label="Tampilkan panel" title="Tampilkan panel"><Ico n="rvSide" size={17} /></button>);

/* =====================================================================
   CompareView — Pratinjau Bitmap vs Vektor (True Vector Path2D Rendering
   + Inspeksi Simpul Sharp Corner C0 vs Smooth Corner G1 & Garis Lurus L)
   ===================================================================== */
/* Pre-cache geometri Wireframe & Path2D untuk CompareView agar pan/zoom ribuan node 100% ringan 60fps */
const _regWireWeakCache = new WeakMap();
const _loopWireWeakCache = new WeakMap();
function buildWireframeCache(regs) {
  if (!regs || !regs.length) return { items: [], totalNodes: 0 };
  let totalNodes = 0;
  const items = regs.map(rg => {
    const loopsArr = rg.loops;
    if (loopsArr) {
      const hitReg = _regWireWeakCache.get(loopsArr);
      if (hitReg && hitReg.label === rg.label) {
        totalNodes += hitReg.nodeCount;
        return hitReg.item;
      }
    }
    let regNodes = 0;
    const loops = [];
    const rgLineP2d = new Path2D();
    const rgCurveP2d = new Path2D();
    let rgHasLine = false, rgHasCurve = false;
    let rgMinX = Infinity, rgMinY = Infinity, rgMaxX = -Infinity, rgMaxY = -Infinity;
    const rgSharp = [], rgSmooth = [];
    for (const lp of (rg.loops || [])) {
      if (lp.segs && lp.segs.length) {
        const lineP2d = new Path2D();
        const curveP2d = new Path2D();
        let hasLine = false, hasCurve = false;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const sharpArr = [];
        const smoothArr = [];
        for (const sg of lp.segs) {
          const x0 = sg.P0[0], y0 = sg.P0[1], x3 = sg.P3[0], y3 = sg.P3[1];
          if (x0 < minX) minX = x0; if (x0 > maxX) maxX = x0;
          if (y0 < minY) minY = y0; if (y0 > maxY) maxY = y0;
          if (x3 < minX) minX = x3; if (x3 > maxX) maxX = x3;
          if (y3 < minY) minY = y3; if (y3 > maxY) maxY = y3;
          if (sg.isLine) {
            lineP2d.moveTo(x0, y0);
            lineP2d.lineTo(x3, y3);
            hasLine = true;
          } else {
            const x1 = sg.P1[0], y1 = sg.P1[1], x2 = sg.P2[0], y2 = sg.P2[1];
            if (x1 < minX) minX = x1; if (x1 > maxX) maxX = x1;
            if (y1 < minY) minY = y1; if (y1 > maxY) maxY = y1;
            if (x2 < minX) minX = x2; if (x2 > maxX) maxX = x2;
            if (y2 < minY) minY = y2; if (y2 > maxY) maxY = y2;
            curveP2d.moveTo(x0, y0);
            curveP2d.bezierCurveTo(x1, y1, x2, y2, x3, y3);
            hasCurve = true;
          }
          if (sg.startSharp) { sharpArr.push(x0, y0); rgSharp.push(x0, y0); }
          else { smoothArr.push(x0, y0); rgSmooth.push(x0, y0); }
          regNodes++;
        }
        if (hasLine) { rgLineP2d.addPath(lineP2d); rgHasLine = true; }
        if (hasCurve) { rgCurveP2d.addPath(curveP2d); rgHasCurve = true; }
        if (minX < rgMinX) rgMinX = minX; if (maxX > rgMaxX) rgMaxX = maxX;
        if (minY < rgMinY) rgMinY = minY; if (maxY > rgMaxY) rgMaxY = maxY;
        loops.push({
          hasSegs: true,
          hasLine,
          hasCurve,
          lineP2d,
          curveP2d,
          sharpPts: new Float32Array(sharpArr),
          smoothPts: new Float32Array(smoothArr),
          minX: minX - 4, minY: minY - 4, maxX: maxX + 4, maxY: maxY + 4
        });
      } else if (lp.d) {
        const p2d = getCachedPath2D(lp.d);
        rgCurveP2d.addPath(p2d);
        rgHasCurve = true;
        rgMinX = -Infinity; rgMinY = -Infinity; rgMaxX = Infinity; rgMaxY = Infinity;
        loops.push({
          hasSegs: false,
          p2d,
          minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity
        });
      }
    }
    totalNodes += regNodes;
    const item = {
      label: rg.label,
      loops,
      rgHasLine,
      rgHasCurve,
      rgLineP2d,
      rgCurveP2d,
      rgSharpPts: new Float32Array(rgSharp),
      rgSmoothPts: new Float32Array(rgSmooth),
      minX: rgMinX - 4, minY: rgMinY - 4, maxX: rgMaxX + 4, maxY: rgMaxY + 4
    };
    if (loopsArr) {
      _regWireWeakCache.set(loopsArr, { label: rg.label, item, nodeCount: regNodes });
    }
    return item;
  });
  return { items, totalNodes };
}

/* Render offscreen bitmap cache untuk layer vektor statis (di-cache secara global via WeakMap per vecPaths)
   agar perpindahan tab & pan/zoom pada gambar bergradien + ribuan node berjalan instan O(1) (<0.05 ms) */
const _sharedVecBmpWeakCache = new WeakMap();
function buildVectorBitmapCache(vecPaths, W, H) {
  if (!vecPaths || !vecPaths.length || !W || !H) return null;
  const hit = _sharedVecBmpWeakCache.get(vecPaths);
  if (hit && hit.w === W && hit.h === H && hit.cv) return hit.cv;
  try {
    let bMinX = 0, bMinY = 0, bMaxX = W, bMaxY = H;
    for (let i = 0, n = vecPaths.length; i < n; i++) {
      const bb = vecPaths[i].bb;
      if (bb) {
        if (bb[0] - 8 < bMinX) bMinX = Math.floor(bb[0] - 8);
        if (bb[1] - 8 < bMinY) bMinY = Math.floor(bb[1] - 8);
        if (bb[2] + 8 > bMaxX) bMaxX = Math.ceil(bb[2] + 8);
        if (bb[3] + 8 > bMaxY) bMaxY = Math.ceil(bb[3] + 8);
      }
    }
    const spanW = Math.max(1, bMaxX - bMinX);
    const spanH = Math.max(1, bMaxY - bMinY);
    if (spanW > W * 2.5 || spanH > H * 2.5) return null;
    const maxDim = 2048;
    const sc = Math.min(2.0, maxDim / Math.max(spanW, spanH, 1));
    const cw = Math.max(1, Math.round(spanW * sc));
    const ch = Math.max(1, Math.round(spanH * sc));
    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    off._scale = sc;
    off._bx = bMinX;
    off._by = bMinY;
    off._bw = spanW;
    off._bh = spanH;
    const ox = off.getContext('2d');
    ox.scale(sc, sc);
    if (bMinX !== 0 || bMinY !== 0) ox.translate(-bMinX, -bMinY);
    for (const it of vecPaths) {
      ox.globalAlpha = it.opacity ?? 1;
      if (it.fill && it.fill !== 'none') {
        fillCanvasPath(ox, it);
      }
      if (it.stroke && it.stroke !== 'none' && it.strokeWidth > 0) {
        ox.strokeStyle = resolveCanvasPaint(ox, it.stroke, it.strokeGrad);
        ox.lineWidth = it.strokeWidth;
        ox.lineJoin = it.lineJoin || 'miter';
        ox.lineCap = it.lineCap || 'butt';
        ox.stroke(it.p2d);
      }
    }
    ox.globalAlpha = 1;
    _sharedVecBmpWeakCache.set(vecPaths, { w: W, h: H, cv: off });
    return off;
  } catch (e) {
    return null;
  }
}

export { fillCanvasPath, resolveCanvasPaint, parseSvgForCanvas, rvUseResizeTick, buildVectorBitmapCache, buildWireframeCache, rvSafe, getCheckerPattern, drawColorHighlightVeil, createWorldOccGrid, drawScreenPinSpritesBatch, drawHighlightHud, rvUseWide, rvUseBodyFlag, RvSide, getCachedPath2D, RvPortal };
