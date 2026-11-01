import React, { useRef, useState, useEffect, useCallback as atUseCallback } from 'react';
import ReactDOM from 'react-dom';
import { atUsePanZoom, AtCheck } from './TraceSharedUI.jsx';
import { rvUseWide, rvUseBodyFlag, rvUseResizeTick, getCheckerPattern, RvSide } from './CanvasRenderUtils.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { Ico, Slider } from './CommonControls.jsx';
import { Seg, M3ColorInput } from './ColorPicker.jsx';
import { AtColorChip } from './PaletteComponents.jsx';

/* =====================================================================
   SegEditor — Editor Segmentasi Manual dengan Perbandingan Gambar Asli & Zoom
   ===================================================================== */
const SegEditor = ({ sess, job, imgUrl, imgElem, onApply, onCancel, onSwitchToTrace, onSwitchToNodeEdit, onSwitchToCompare, flash }) => {
  const { labels, palette, w, h } = sess;
  const detectedColorPool = (job && job.detectedPool && job.detectedPool.length) ? job.detectedPool : (palette ? palette.map(c => c.hex) : []);
  const rawRgba = sess.rawRgba || (sess.workData && sess.workData.data) || null;
  const origRef = useRef(null);

  const [tool, setTool] = useState('fill');
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(4);
  const [brushShape, setBrushShape] = useState('circle');
  const [lockTarget, setLockTarget] = useState(false);
  const [fillScope, setFillScope] = useState('contig'); /* 'contig' | 'global' | 'similar' */
  const [fillTol, setFillTol] = useState(18);
  const [wandTol, setWandTol] = useState(26);
  const [wandContig, setWandContig] = useState(true);
  const [specklePx, setSpecklePx] = useState(12);
  const [bounds, setBounds] = useState(false); /* Default mati agar ribuan segmen tetap sangat ringan & bersih */
  const [cmpMode, setCmpMode] = useState('seg'); /* default: tab Segmen. 'side' | 'split' | 'overlay' | 'seg' | 'orig' */
  const [splitPos, setSplitPos] = useState(0.5);
  const [overlayOp, setOverlayOp] = useState(40);
  const [bmp, setBmp] = useState(() => (imgElem && imgElem.complete && imgElem.naturalWidth) ? imgElem : (job && job.img && job.img.complete && job.img.naturalWidth ? job.img : null));
  const [v, pz] = atUsePanZoom();
  const interRef = useRef(false), wheelT = useRef(0), zoomLblRef = useRef(null);
  const vRef = useRef(v); if (!interRef.current) vRef.current = v;
  const [segSideOpen, setSegSideOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000);
  const segWide = rvUseWide(1000);
  rvUseBodyFlag();
  const [histLen, setHistLen] = useState({ u: 0, r: 0 });

  const cvRef = useRef(null), wrapRef = useRef(null), strokeRef = useRef(null);
  const hoverRef = useRef(null), rectPreviewRef = useRef(null), rafDrawRef = useRef(0);
  const hudCursorWrapRef = useRef(null), hudCursorSwRef = useRef(null), hudCursorTxtRef = useRef(null);
  const segRsz = rvUseResizeTick(wrapRef);
  const offCvRef = useRef(sess._segOffCache ? sess._segOffCache.cv : null);
  const offImgDataRef = useRef(sess._segOffCache ? sess._segOffCache.imgData : null);

  /* Hitung & cache bounding-box per label [minX, minY, maxX, maxY] agar gradien Linear/Radial di SegEditor dirender akurat & instan (<0.3ms) */
  const ensureLabelBboxes = atUseCallback((forceRecompute = false) => {
    const pLen = palette.length;
    if (!forceRecompute && sess._segLabelBbs && sess._segLabelBbs.pLen >= pLen && sess._segLabelBbs.w === w && sess._segLabelBbs.h === h && !sess._segLabelBbs.dirty) {
      return sess._segLabelBbs;
    }
    const cap = Math.max(pLen + 16, 64);
    const bMinX = new Int32Array(cap).fill(w);
    const bMinY = new Int32Array(cap).fill(h);
    const bMaxX = new Int32Array(cap).fill(-1);
    const bMaxY = new Int32Array(cap).fill(-1);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const L = labels[row + x];
        if (L >= 0 && L < cap) {
          if (x < bMinX[L]) bMinX[L] = x;
          if (x > bMaxX[L]) bMaxX[L] = x;
          if (y < bMinY[L]) bMinY[L] = y;
          if (y > bMaxY[L]) bMaxY[L] = y;
        }
      }
    }
    const bbs = { bMinX, bMinY, bMaxX, bMaxY, pLen: cap, w, h, dirty: false };
    sess._segLabelBbs = bbs;
    return bbs;
  }, [labels, palette.length, w, h, sess]);

  /* [PERF-32BIT-LUT + LIVE GRADIENT] Buffer piksel persisten O(1) menggunakan 32-bit Uint32Array LUT & 256-entry Gradient Ramp LUT */
  const syncOffscreenRect = atUseCallback((x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1, forceRebuild = false) => {
    let off = offCvRef.current;
    if (!off) {
      off = document.createElement('canvas');
      off.width = w; off.height = h;
      offCvRef.current = off;
    }
    if (off.width !== w || off.height !== h) {
      off.width = w; off.height = h;
      offImgDataRef.current = null;
    }
    if (!forceRebuild && x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1 &&
        sess._segOffCache && sess._segOffCache.cv === off && sess._segOffCache.bounds === bounds &&
        sess._segOffCache.w === w && sess._segOffCache.h === h && !sess._segOffCache.dirty) {
      return;
    }
    const ctx = off.getContext('2d');
    let imgData = offImgDataRef.current;
    if (!imgData) {
      imgData = ctx.createImageData(w, h);
      offImgDataRef.current = imgData;
    }
    const buf32 = new Uint32Array(imgData.data.buffer);
    const pLen = palette.length;
    const palLut32 = new Uint32Array(pLen);
    const darkLut32 = new Uint32Array(pLen);
    let hasAnyGrad = false;
    for (let i = 0; i < pLen; i++) {
      const c = palette[i] || { r: 200, g: 200, b: 200 };
      const r = c.r & 255, g = c.g & 255, b = c.b & 255;
      const a = c.opacity != null ? Math.round(VMT.clamp(c.opacity, 0, 1) * 255) : 255;
      palLut32[i] = (a << 24) | (b << 16) | (g << 8) | r;
      darkLut32[i] = (255 << 24) | ((b >> 2) << 16) | ((g >> 2) << 8) | (r >> 2);
      if (c.grad && c.grad.stops && c.grad.stops.length >= 2) hasAnyGrad = true;
    }

    let gradInfos = null;
    if (hasAnyGrad) {
      const bbs = ensureLabelBboxes(false);
      gradInfos = new Array(pLen).fill(null);
      for (let i = 0; i < pLen; i++) {
        const c = palette[i];
        if (!c || !c.grad || !c.grad.stops || c.grad.stops.length < 2) continue;
        const ramp = VMT.buildGradRampLut32(c.grad, c.opacity ?? 1);
        if (!ramp) continue;
        const hasBb = i < bbs.pLen && bbs.bMinX[i] <= bbs.bMaxX[i];
        const bx0 = hasBb ? bbs.bMinX[i] : 0;
        const by0 = hasBb ? bbs.bMinY[i] : 0;
        const bx1 = hasBb ? bbs.bMaxX[i] : w - 1;
        const by1 = hasBb ? bbs.bMaxY[i] : h - 1;
        const bw = Math.max(2, bx1 - bx0), bh = Math.max(2, by1 - by0);
        const cx = (bx0 + bx1) * 0.5, cy = (by0 + by1) * 0.5;
        if (c.grad.type === 'radial') {
          const rad = Math.max(2, Math.hypot(bw * 0.5, bh * 0.5) * 0.85);
          gradInfos[i] = { isRadial: true, cx, cy, invR255: 255 / rad, lut32: ramp.lut32, dark32: ramp.dark32 };
        } else {
          const angDeg = c.grad.angleDeg ?? c.grad.angle ?? 135;
          const angRad = ((angDeg - 90) * Math.PI) / 180;
          const ux = Math.cos(angRad), uy = Math.sin(angRad);
          const halfSpan = Math.max(1, 0.5 * (Math.abs(ux) * bw + Math.abs(uy) * bh));
          const gx1 = cx - ux * halfSpan, gy1 = cy - uy * halfSpan;
          const invSpan255 = 255 / (2 * halfSpan);
          gradInfos[i] = { isRadial: false, gx1, gy1, ux255: ux * invSpan255, uy255: uy * invSpan255, lut32: ramp.lut32, dark32: ramp.dark32 };
        }
      }
    }

    const fallback32 = (255 << 24) | (200 << 16) | (200 << 8) | 200;
    const ax = VMT.clamp(Math.floor(x0) - 1, 0, w - 1);
    const ay = VMT.clamp(Math.floor(y0) - 1, 0, h - 1);
    const bx = VMT.clamp(Math.ceil(x1) + 1, 0, w - 1);
    const by = VMT.clamp(Math.ceil(y1) + 1, 0, h - 1);

    if (!hasAnyGrad && !bounds) {
      for (let y = ay; y <= by; y++) {
        const row = y * w;
        for (let x = ax; x <= bx; x++) {
          const p = row + x, L = labels[p];
          buf32[p] = L < 0 ? 0 : (L < pLen ? palLut32[L] : fallback32);
        }
      }
    } else if (!hasAnyGrad && bounds) {
      for (let y = ay; y <= by; y++) {
        const row = y * w;
        for (let x = ax; x <= bx; x++) {
          const p = row + x, L = labels[p];
          if (L < 0) { buf32[p] = 0; continue; }
          if ((x < w - 1 && labels[p + 1] !== L) || (y < h - 1 && labels[p + w] !== L)) {
            buf32[p] = L < pLen ? darkLut32[L] : fallback32;
          } else {
            buf32[p] = L < pLen ? palLut32[L] : fallback32;
          }
        }
      }
    } else {
      for (let y = ay; y <= by; y++) {
        const row = y * w;
        for (let x = ax; x <= bx; x++) {
          const p = row + x, L = labels[p];
          if (L < 0) { buf32[p] = 0; continue; }
          const isBnd = bounds && ((x < w - 1 && labels[p + 1] !== L) || (y < h - 1 && labels[p + w] !== L));
          const gi = L < pLen ? gradInfos[L] : null;
          if (gi) {
            let idx = gi.isRadial
              ? (Math.hypot(x - gi.cx, y - gi.cy) * gi.invR255) | 0
              : ((x - gi.gx1) * gi.ux255 + (y - gi.gy1) * gi.uy255) | 0;
            if (idx < 0) idx = 0; else if (idx > 255) idx = 255;
            buf32[p] = isBnd ? gi.dark32[idx] : gi.lut32[idx];
          } else {
            buf32[p] = L < pLen ? (isBnd ? darkLut32[L] : palLut32[L]) : fallback32;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0, ax, ay, bx - ax + 1, by - ay + 1);
    sess._segOffCache = { cv: off, imgData, w, h, bounds, dirty: false };
  }, [labels, palette, w, h, bounds, sess, ensureLabelBboxes]);

  useEffect(() => {
    syncOffscreenRect(0, 0, w - 1, h - 1, false);
    scheduleDraw();
  }, [syncOffscreenRect, w, h, bounds]);

  useEffect(() => {
    if (imgElem && imgElem.complete && imgElem.naturalWidth) { setBmp(imgElem); return; }
    if (!imgUrl) return;
    let on = true;
    const im = new Image();
    im.onload = () => { if (on) setBmp(im); };
    im.src = imgUrl;
    return () => { on = false; };
  }, [imgUrl, imgElem]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const wh = e => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), cur = vRef.current;
      let d = e.deltaY; if (e.deltaMode === 1) d *= 16;
      const dx = (e.clientX - r.left) - r.width / 2;
      const dy = (e.clientY - r.top) - r.height / 2;
      const nz = VMT.clamp(cur.z * Math.exp(-VMT.clamp(d, -240, 240) * 0.0018), 0.1, 60), k = nz / cur.z;
      vRef.current = { z: nz, tx: dx - (dx - cur.tx) * k, ty: dy - (dy - cur.ty) * k };
      interRef.current = true;
      if (zoomLblRef.current) zoomLblRef.current.textContent = Math.round(nz * 100) + '%';
      scheduleDraw();
      clearTimeout(wheelT.current);
      wheelT.current = setTimeout(() => { wheelT.current = 0; interRef.current = false; pz.set(vRef.current); }, 140);
    };
    el.addEventListener('wheel', wh, { passive: false });
    return () => el.removeEventListener('wheel', wh);
  }, []);

  const undoRef = useRef([]), redoRef = useRef([]);
  const dirtyRef = useRef(false);
  const pixelsDirtyRef = useRef(false);
  const syncHist = () => setHistLen({ u: undoRef.current.length, r: redoRef.current.length });

  const invalidateLabelBbs = () => {
    if (sess._segLabelBbs) sess._segLabelBbs.dirty = true;
  };
  const syncSingleLabelRect = i => {
    const bbs = ensureLabelBboxes(false);
    if (i >= 0 && i < bbs.pLen && bbs.bMinX[i] <= bbs.bMaxX[i]) {
      syncOffscreenRect(bbs.bMinX[i], bbs.bMinY[i], bbs.bMaxX[i], bbs.bMaxY[i], true);
    } else {
      syncOffscreenRect(0, 0, w - 1, h - 1, true);
    }
  };

  const snapshot = () => {
    if (!origRef.current) origRef.current = labels.slice();
    undoRef.current.push(labels.slice());
    if (undoRef.current.length > 40) undoRef.current.shift();
    redoRef.current.length = 0;
    dirtyRef.current = true;
    pixelsDirtyRef.current = true;
    if (sess._segOffCache) sess._segOffCache.dirty = true;
    invalidateLabelBbs();
    syncHist();
  };
  const undo = () => {
    const s = undoRef.current.pop(); if (!s) return;
    redoRef.current.push(labels.slice());
    labels.set(s);
    invalidateLabelBbs();
    syncHist();
    syncOffscreenRect(0, 0, w - 1, h - 1, true);
    scheduleDraw();
  };
  const redo = () => {
    const s = redoRef.current.pop(); if (!s) return;
    undoRef.current.push(labels.slice());
    labels.set(s);
    invalidateLabelBbs();
    syncHist();
    syncOffscreenRect(0, 0, w - 1, h - 1, true);
    scheduleDraw();
  };
  /* ---- Ganti warna/gradien/opasitas palet label (in-place pada sess.palette) ---- */
  const origPalRef = useRef(null);
  if (!origPalRef.current) origPalRef.current = palette.map(c => ({ ...c, grad: c.grad ? { ...c.grad, stops: (c.grad.stops || []).map(s => ({ ...s })) } : null }));
  const [palTick, setPalTick] = useState(0);
  const [hexDraft, setHexDraft] = useState(null);
  const setPalEntry = (i, hx) => {
    const c = palette[i];
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hx || '').trim());
    if (!c || !m) return false;
    const h = '#' + m[1].toLowerCase();
    if (c.hex && c.hex.toLowerCase() === h && !c.grad) return true;
    const [r, g, b] = VMT.rgbOf(h);
    c.hex = h; c.r = r; c.g = g; c.b = b;
    try { const [L, a, b2] = VMT.rgb2lab(r, g, b); c.L = L; c.a = a; c.b2 = b2; } catch (e) {}
    c.grad = null; c.userGrad = null; c.isGradient = false; c.userSolid = true;
    dirtyRef.current = true;
    syncSingleLabelRect(i);
    scheduleDraw();
    setPalTick(t => t + 1);
    return true;
  };
  const setPalGradEntry = (i, newGrad, midHx) => {
    const c = palette[i];
    if (!c) return;
    if (!newGrad || !newGrad.stops || newGrad.stops.length < 2) {
      setPalEntry(i, midHx || c.hex);
      return;
    }
    const h = (midHx || newGrad.base || newGrad.stops[0].color || c.hex || '#000000').toLowerCase();
    const [r, g, b] = VMT.rgbOf(h);
    const ang = newGrad.angleDeg ?? newGrad.angle ?? 135;
    c.hex = h; c.r = r; c.g = g; c.b = b;
    c.isGradient = true;
    c.userSolid = false;
    c.grad = {
      ...newGrad,
      base: h,
      angleDeg: ang,
      angle: ang,
      _userCreated: true,
      userCreated: true,
      stops: newGrad.stops.map(s => ({ ...s }))
    };
    c.userGrad = c.grad;
    dirtyRef.current = true;
    syncSingleLabelRect(i);
    scheduleDraw();
    setPalTick(t => t + 1);
  };
  const setPalOpacityEntry = (i, nextOp) => {
    const c = palette[i];
    if (!c) return;
    c.opacity = VMT.clamp(nextOp == null ? 1 : +nextOp, 0, 1);
    if (c.grad) {
      c.grad = { ...c.grad, opacity: c.opacity };
      c.userGrad = c.grad;
    }
    dirtyRef.current = true;
    syncSingleLabelRect(i);
    scheduleDraw();
    setPalTick(t => t + 1);
  };
  const resetPalEntry = i => {
    const o = origPalRef.current[i], c = palette[i];
    if (!o || !c) return;
    Object.assign(c, o, {
      grad: o.grad ? { ...o.grad, stops: (o.grad.stops || []).map(s => ({ ...s })) } : null,
      userGrad: o.userGrad ? { ...o.userGrad, stops: (o.userGrad.stops || []).map(s => ({ ...s })) } : null
    });
    syncOffscreenRect(0, 0, w - 1, h - 1, true);
    scheduleDraw();
    setHexDraft(null);
    setPalTick(t => t + 1);
  };
  const restoreAllPal = () => {
    origPalRef.current.forEach((o, i) => { if (palette[i]) Object.assign(palette[i], o); });
  };
  /* ---- Warna custom: tambah entri baru ke akhir palet (indeks lama tidak bergeser) ---- */
  const [customHex, setCustomHex] = useState('#ff5722');
  const [customGrad, setCustomGrad] = useState(null);
  const [customOp, setCustomOp] = useState(1);
  const addCustomColor = (hx) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hx || '').trim());
    if (!m) { flash('Kode warna tidak valid — gunakan format #RRGGBB'); return; }
    let hh = m[1].toLowerCase();
    if (hh.length === 3) hh = hh[0] + hh[0] + hh[1] + hh[1] + hh[2] + hh[2];
    const h = '#' + hh;
    const dup = !customGrad ? palette.findIndex(c => c && c.hex && c.hex.toLowerCase() === h && !c.grad) : -1;
    if (dup >= 0) {
      setColor(dup);
      if (tool === 'picker' || tool === 'pan') setTool('fill');
      flash('Warna ' + h.toUpperCase() + ' sudah ada di palet — dipilih sebagai warna aktif');
      return;
    }
    const [r, g, b] = VMT.rgbOf(h);
    const entry = {
      r, g, b, hex: h, count: 0, custom: true,
      opacity: customOp,
      isGradient: !!(customGrad && customGrad.stops && customGrad.stops.length >= 2),
      grad: (customGrad && customGrad.stops && customGrad.stops.length >= 2) ? { ...customGrad, base: h, opacity: customOp } : null,
      userGrad: (customGrad && customGrad.stops && customGrad.stops.length >= 2) ? { ...customGrad, base: h, opacity: customOp } : null
    };
    try { const [L, a, b2] = VMT.rgb2lab(r, g, b); entry.L = L; entry.a = a; entry.b2 = b2; } catch (e) {}
    palette.push(entry);
    setColor(palette.length - 1);
    if (tool === 'picker' || tool === 'pan') setTool('fill');
    setPalTick(t => t + 1);
    flash('Warna custom ' + h.toUpperCase() + ' ditambahkan & dipilih — gunakan alat Fill/Pensil untuk menerapkannya');
  };
  const revert = () => {
    if (origRef.current) {
      snapshot();
      labels.set(origRef.current);
    }
    restoreAllPal();
    if (palette.length > origPalRef.current.length) {
      palette.length = origPalRef.current.length;
      setColor(c => Math.min(c, palette.length - 1));
    }
    syncOffscreenRect(0, 0, w - 1, h - 1, true);
    scheduleDraw();
    setHexDraft(null);
    setPalTick(t => t + 1);
    flash('Segmentasi & warna dikembalikan ke hasil awal');
  };
  const cancelEdit = () => { restoreAllPal(); onCancel(); };

  const topPad = 64; /* ruang untuk bar atas melayang agar gambar & keterangan tidak tertutup */
  const getLayout = (cw, ch) => {
    const vCur = vRef.current;
    const ah = Math.max(60, ch - topPad - 14), cy = topPad + ah / 2;
    if (cmpMode === 'side' && bmp) {
      const hw = cw / 2;
      const fit = Math.min((hw - 14) / w, ah / h) * 0.94;
      const z = fit * vCur.z;
      const oxSeg = hw / 2 + vCur.tx - (w * z) / 2;
      const oySeg = cy + vCur.ty - (h * z) / 2;
      const oxOrig = hw + hw / 2 + vCur.tx - (w * z) / 2;
      return { isSide: true, hw, z, oxSeg, oySeg, oxOrig, oyOrig: oySeg };
    }
    const fit = Math.min(cw / w, ah / h) * 0.96;
    const z = fit * vCur.z;
    const ox = cw / 2 + vCur.tx - (w * z) / 2;
    const oy = cy + vCur.ty - (h * z) / 2;
    return { isSide: false, z, oxSeg: ox, oySeg: oy, oxOrig: ox, oyOrig: oy };
  };

  const drawNow = atUseCallback(() => {
    rafDrawRef.current = 0;
    const cv = cvRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    if (!offCvRef.current) syncOffscreenRect(0, 0, w - 1, h - 1);
    const off = offCvRef.current;
    if (!off) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (!cw || !ch) return;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = getCheckerPattern(x); x.fillRect(0, 0, cw, ch);

    const L = getLayout(cw, ch);
    const hp = hoverRef.current;
    const rp = rectPreviewRef.current;

    const drawCursorOverlay = (ox, oy) => {
      if (rp) {
        const rx0 = Math.min(rp.x0, rp.x1), ry0 = Math.min(rp.y0, rp.y1);
        const rw = Math.abs(rp.x1 - rp.x0) + 1, rh = Math.abs(rp.y1 - rp.y0) + 1;
        const cHex = (palette[color] && palette[color].hex) || '#4f46e5';
        x.save();
        x.fillStyle = cHex + '55';
        x.strokeStyle = '#ffffff';
        x.lineWidth = 1.6;
        x.fillRect(ox + rx0 * L.z, oy + ry0 * L.z, rw * L.z, rh * L.z);
        x.strokeRect(ox + rx0 * L.z, oy + ry0 * L.z, rw * L.z, rh * L.z);
        x.restore();
        return;
      }
      if (!hp || hp.x < 0 || hp.y < 0 || hp.x >= w || hp.y >= h) return;
      const cx = ox + (hp.x + 0.5) * L.z;
      const cy = oy + (hp.y + 0.5) * L.z;
      if (tool === 'pencil') {
        const rad = Math.max(3, (size * L.z) / 2);
        x.save();
        x.strokeStyle = '#ffffff'; x.lineWidth = 2;
        if (brushShape === 'square') {
          x.strokeRect(cx - rad, cy - rad, rad * 2, rad * 2);
          x.strokeStyle = (palette[color] && palette[color].hex) || '#4f46e5';
          x.lineWidth = 1.2;
          x.strokeRect(cx - rad, cy - rad, rad * 2, rad * 2);
        } else {
          x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.stroke();
          x.strokeStyle = (palette[color] && palette[color].hex) || '#4f46e5';
          x.lineWidth = 1.2;
          x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.stroke();
        }
        x.restore();
      } else {
        x.save();
        x.strokeStyle = '#ffffff'; x.lineWidth = 1.8;
        x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = '#4f46e5'; x.lineWidth = 1;
        x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.stroke();
        x.restore();
      }
    };

    if (L.isSide) {
      x.save(); x.beginPath(); x.rect(0, 0, L.hw, ch); x.clip();
      x.imageSmoothingEnabled = false;
      x.drawImage(off, L.oxSeg, L.oySeg, w * L.z, h * L.z);
      drawCursorOverlay(L.oxSeg, L.oySeg);
      x.restore();

      if (bmp) {
        x.save(); x.beginPath(); x.rect(L.hw, 0, L.hw, ch); x.clip();
        x.imageSmoothingEnabled = L.z < 2;
        x.drawImage(bmp, L.oxOrig, L.oyOrig, w * L.z, h * L.z);
        drawCursorOverlay(L.oxOrig, L.oyOrig);
        x.restore();
      }
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(L.hw, 0); x.lineTo(L.hw, ch); x.stroke();
      x.font = '600 10px sans-serif';
      const ly = topPad + 4;
      x.fillStyle = 'rgba(0,0,0,.68)'; x.fillRect(8, ly, 128, 18); x.fillStyle = '#fff'; x.fillText('EDITOR SEGMENTASI', 14, ly + 9.5);
      x.fillStyle = 'rgba(0,0,0,.68)'; x.fillRect(L.hw + 8, ly, 86, 18); x.fillStyle = '#fff'; x.fillText('GAMBAR ASLI', L.hw + 14, ly + 9.5);
    } else if (cmpMode === 'split' && bmp) {
      /* [SPLIT-DALAM-GAMBAR] Pembagi relatif terhadap lebar gambar; garis/handle/label hanya di area gambar */
      const iw = w * L.z, ih = h * L.z;
      const sx = L.oxSeg + iw * splitPos;
      const vx0 = Math.max(L.oxSeg, 0), vx1 = Math.min(L.oxSeg + iw, cw);
      const vy0 = Math.max(L.oySeg, topPad), vy1 = Math.min(L.oySeg + ih, ch);
      x.save(); x.beginPath(); x.rect(0, 0, cw, ch); x.clip();
      x.imageSmoothingEnabled = false;
      x.drawImage(off, L.oxSeg, L.oySeg, w * L.z, h * L.z);
      x.restore();

      x.save(); x.beginPath(); x.rect(sx, 0, cw - sx, ch); x.clip();
      x.imageSmoothingEnabled = L.z < 2;
      x.drawImage(bmp, L.oxOrig, L.oyOrig, w * L.z, h * L.z);
      x.restore();

      drawCursorOverlay(L.oxSeg, L.oySeg);

      if (vx1 > vx0 && vy1 > vy0 && sx >= vx0 && sx <= vx1) {
        const my = (vy0 + vy1) / 2;
        x.strokeStyle = '#fff'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(sx, vy0); x.lineTo(sx, vy1); x.stroke();
        x.fillStyle = '#4f46e5';
        x.beginPath(); x.arc(sx, my, 12, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.font = '10px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('◂ ▸', sx, my + 0.5);
        x.textAlign = 'left'; x.font = '600 10px sans-serif';
        const ly = vy0 + 4;
        if (sx - vx0 > 100) { x.fillStyle = 'rgba(0,0,0,.68)'; x.fillRect(vx0 + 8, ly, 84, 18); x.fillStyle = '#fff'; x.fillText('SEGMENTASI', vx0 + 14, ly + 9.5); }
        if (vx1 - sx > 96) { x.fillStyle = 'rgba(0,0,0,.68)'; x.fillRect(vx1 - 88, ly, 80, 18); x.fillStyle = '#fff'; x.fillText('GAMBAR ASLI', vx1 - 82, ly + 9.5); }
      }
    } else if (cmpMode === 'overlay' && bmp) {
      x.imageSmoothingEnabled = false;
      x.drawImage(off, L.oxSeg, L.oySeg, w * L.z, h * L.z);
      x.save();
      x.globalAlpha = overlayOp / 100;
      x.imageSmoothingEnabled = L.z < 2;
      x.drawImage(bmp, L.oxOrig, L.oyOrig, w * L.z, h * L.z);
      x.restore();
      drawCursorOverlay(L.oxSeg, L.oySeg);
    } else if (cmpMode === 'orig' && bmp) {
      x.imageSmoothingEnabled = L.z < 2;
      x.drawImage(bmp, L.oxOrig, L.oyOrig, w * L.z, h * L.z);
      drawCursorOverlay(L.oxOrig, L.oyOrig);
    } else {
      x.imageSmoothingEnabled = false;
      x.drawImage(off, L.oxSeg, L.oySeg, w * L.z, h * L.z);
      drawCursorOverlay(L.oxSeg, L.oySeg);
    }
  }, [bmp, cmpMode, splitPos, overlayOp, v, w, h, tool, size, brushShape, color, palette]);

  const scheduleDraw = atUseCallback(() => {
    if (!rafDrawRef.current) {
      rafDrawRef.current = requestAnimationFrame(drawNow);
    }
  }, [drawNow]);

  useEffect(() => { scheduleDraw(); }, [scheduleDraw, v, cmpMode, splitPos, overlayOp, tool, size, brushShape, color]);
  useEffect(() => () => { if (rafDrawRef.current) cancelAnimationFrame(rafDrawRef.current); }, []);

  /* Pintasan Keyboard Editor Segmentasi (B=Kuas, G=Fill, W=Magic Wand, R=Kotak, Z=Zap, I=Pipet, H=Geser, Ctrl+Z=Undo) */
  useEffect(() => {
    const kd = e => {
      const t = e.target;
      if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo(); return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') setTool('pencil');
      else if (k === 'g') setTool('fill');
      else if (k === 'w') setTool('wand');
      else if (k === 'r') setTool('rect');
      else if (k === 'z') setTool('zap');
      else if (k === 'i') setTool('picker');
      else if (k === 'h') setTool('pan');
      else if (k === '[') setSize(s => Math.max(1, s - 1));
      else if (k === ']') setSize(s => Math.min(40, s + 1));
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  const toLabel = e => {
    const r = wrapRef.current.getBoundingClientRect();
    const cw = r.width, ch = r.height;
    const lx = e.clientX - r.left, ly = e.clientY - r.top;
    const L = getLayout(cw, ch);
    if (L.isSide && lx > L.hw) {
      return { x: Math.floor((lx - L.oxOrig) / L.z), y: Math.floor((ly - L.oyOrig) / L.z), lx, cw, fx: (lx - L.oxOrig) / Math.max(1e-6, w * L.z), sd: lx - (L.oxOrig + w * L.z * splitPos) };
    }
    return { x: Math.floor((lx - L.oxSeg) / L.z), y: Math.floor((ly - L.oySeg) / L.z), lx, cw, fx: (lx - L.oxSeg) / Math.max(1e-6, w * L.z), sd: lx - (L.oxSeg + w * L.z * splitPos) };
  };

  const onDown = e => {
    if (e.button === 1 || (e.button === 0 && e.spaceKey)) {
      strokeRef.current = { pan: true, sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const { x, y, lx, cw, sd } = toLabel(e);
    if (cmpMode === 'split' && bmp && y >= 0 && y < h && Math.abs(sd) < 16) {
      strokeRef.current = { splitDrag: true };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === 'pan') {
      strokeRef.current = { pan: true, sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    /* Alt+Klik atau Alat Picker langsung mengambil warna segmen */
    if (tool === 'picker' || e.altKey) {
      if (x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] >= 0) {
        const picked = labels[y * w + x];
        setColor(picked);
        flash(`Warna #${picked + 1} (${palette[picked]?.hex?.toUpperCase() || ''}) dipilih`);
        if (tool === 'picker') setTool('fill');
      }
      return;
    }
    if (x < 0 || y < 0 || x >= w || y >= h) {
      strokeRef.current = { pan: true, sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const startLbl = labels[y * w + x];
    if (tool === 'pencil') {
      snapshot();
      const lockLbl = lockTarget ? startLbl : -999;
      const dirty = VMT.segLine(labels, w, h, x, y, x, y, color, size, brushShape, lockLbl);
      if (dirty) syncOffscreenRect(dirty.x0, dirty.y0, dirty.x1, dirty.y1, true);
      strokeRef.current = { lx: x, ly: y, lockLbl };
      scheduleDraw();
    } else if (tool === 'rect') {
      strokeRef.current = { rect: true, x0: x, y0: y, x1: x, y1: y, lockLbl: lockTarget ? startLbl : -999 };
      rectPreviewRef.current = { x0: x, y0: y, x1: x, y1: y };
      scheduleDraw();
    } else if (tool === 'fill') {
      snapshot();
      const effScope = e.shiftKey ? 'global' : fillScope;
      const n2 = VMT.segFill(labels, w, h, x, y, color, { scope: effScope, palette, tol: fillTol });
      syncOffscreenRect(0, 0, w - 1, h - 1, true);
      scheduleDraw();
      flash(effScope === 'global'
        ? `Ganti semua warna sama: ${n2.toLocaleString('id-ID')} piksel`
        : effScope === 'similar'
        ? `Smart Fill (Toleransi ${fillTol}): ${n2.toLocaleString('id-ID')} piksel`
        : `Flood Fill segmen: ${n2.toLocaleString('id-ID')} piksel`);
    } else if (tool === 'wand') {
      snapshot();
      const n2 = VMT.segWandFill(labels, rawRgba, w, h, x, y, color, wandTol, wandContig && !e.shiftKey);
      syncOffscreenRect(0, 0, w - 1, h - 1, true);
      scheduleDraw();
      flash(`Magic Fill Warna Asli: ${n2.toLocaleString('id-ID')} piksel disatukan`);
    } else if (tool === 'zap') {
      snapshot();
      const n2 = VMT.segZap(labels, w, h, x, y);
      syncOffscreenRect(0, 0, w - 1, h - 1, true);
      scheduleDraw();
      flash(n2 ? `Zap: ${n2.toLocaleString('id-ID')} piksel dilebur ke tetangga` : 'Tidak ada segmen di titik ini');
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const updateHudCursorDom = (x, y) => {
    const wrapEl = hudCursorWrapRef.current;
    if (!wrapEl) return;
    if (x >= 0 && y >= 0 && x < w && y < h) {
      const lbl = labels[y * w + x];
      const col = lbl >= 0 ? palette[lbl] : null;
      if (col) {
        wrapEl.style.display = 'inline-flex';
        if (hudCursorSwRef.current) hudCursorSwRef.current.style.background = col.hex || '#4f46e5';
        if (hudCursorTxtRef.current) hudCursorTxtRef.current.textContent = `(${x}, ${y}) · #${lbl + 1}`;
        return;
      }
    }
    wrapEl.style.display = 'none';
  };

  const onMove = e => {
    const info = toLabel(e);
    hoverRef.current = { x: info.x, y: info.y };
    updateHudCursorDom(info.x, info.y);

    const st = strokeRef.current;
    if (!st) {
      if (tool === 'pencil') scheduleDraw();
      return;
    }
    if (st.splitDrag) {
      setSplitPos(VMT.clamp(info.fx, 0.05, 0.95));
      return;
    }
    if (st.pan) {
      vRef.current = { ...vRef.current, tx: st.tx + (e.clientX - st.sx), ty: st.ty + (e.clientY - st.sy) };
      interRef.current = true;
      scheduleDraw();
      return;
    }
    if (st.rect) {
      st.x1 = VMT.clamp(info.x, 0, w - 1);
      st.y1 = VMT.clamp(info.y, 0, h - 1);
      rectPreviewRef.current = { x0: st.x0, y0: st.y0, x1: st.x1, y1: st.y1 };
      scheduleDraw();
      return;
    }
    if (tool !== 'pencil') return;
    const cx = VMT.clamp(info.x, 0, w - 1), cy = VMT.clamp(info.y, 0, h - 1);
    const dirty = VMT.segLine(labels, w, h, st.lx, st.ly, cx, cy, color, size, brushShape, st.lockLbl);
    if (dirty) syncOffscreenRect(dirty.x0, dirty.y0, dirty.x1, dirty.y1, true);
    st.lx = cx; st.ly = cy;
    scheduleDraw();
  };

  const onUp = () => {
    const st = strokeRef.current;
    if (st && st.pan) {
      interRef.current = false;
      pz.set(vRef.current);
      strokeRef.current = null;
      return;
    }
    if (st && st.rect) {
      snapshot();
      const n2 = VMT.segRectFill(labels, w, h, st.x0, st.y0, st.x1, st.y1, color, st.lockLbl);
      rectPreviewRef.current = null;
      syncOffscreenRect(Math.min(st.x0, st.x1), Math.min(st.y0, st.y1), Math.max(st.x0, st.x1), Math.max(st.y0, st.y1), true);
      scheduleDraw();
      flash(`Kotak Isi: ${n2.toLocaleString('id-ID')} piksel diwarnai`);
    }
    strokeRef.current = null;
  };

  const runCleanSmallSegments = () => {
    snapshot();
    VMT.enforceMinPixels(labels, w, h, specklePx, null, palette);
    syncOffscreenRect(0, 0, w - 1, h - 1, true);
    scheduleDraw();
    flash(`Seluruh segmen kecil (< ${specklePx} px) berhasil dilebur ke tetangga`);
  };

  const TOOLS = [
    ['fill', 'Ember Fill (G)', 'drop', 'atSegTool_fill'],
    ['wand', 'Magic Fill (W)', 'wand', 'atSegTool_wand'],
    ['pencil', 'Kuas (B)', 'pencil', 'atSegTool_pencil'],
    ['rect', 'Kotak Isi (R)', 'shapes', 'atSegTool_rect'],
    ['zap', 'Lebur / Zap (Z)', 'bolt', 'atSegTool_zap'],
    ['picker', 'Pipet (I)', 'pipette', 'atSegTool_picker'],
  ];

  const activeColObj = palette[color] || { hex: '#4f46e5' };

  const open = segSideOpen && segWide;
  const segActions = (<><button type="button" className="rv-btn" data-tip="atSegUndo" disabled={!histLen.u} onClick={undo}>Undo {histLen.u}</button><button type="button" className="rv-btn" data-tip="atSegRedo" disabled={!histLen.r} onClick={redo}>Redo {histLen.r}</button><button type="button" className="rv-btn" data-tip="atSegRevert" onClick={revert}>Revert</button><button type="button" className={'rv-btn' + (bounds ? ' on' : '')} data-tip="atSegBounds" onClick={() => setBounds(!bounds)}>Batas</button><button type="button" className="rv-btn" data-tip="atBtnBack" onClick={cancelEdit}>Batal</button><button type="button" className="rv-exp rv-sg-apply" data-tip="atSegApply" onClick={() => onApply(dirtyRef.current, pixelsDirtyRef.current)}><Ico n="check" size={14} /> Terapkan</button></>);
  return ReactDOM.createPortal((<div className={'rv-root rv-seg-root' + (open ? ' sg-open' : '')}><div className={'rv-stage' + (open ? ' side-open' : '')}><div className="rv-seg-canvas"><div ref={wrapRef} className="at-seged-wrap rv-seg-wrap" style={{
        cursor: tool === 'pan' ? 'grab' : 'crosshair',
        right: open ? 'calc(var(--rv-side-w) + 28px)' : 0
      }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => {
        hoverRef.current = null;
        updateHudCursorDom(-1, -1);
        if (tool === 'pencil') scheduleDraw();
      }}><canvas ref={cvRef} className="at-cmp-cv" /><div className="at-seged-hud"><span className="hud-i"><i style={{
              background: activeColObj.grad && VMT.gradToCss(activeColObj.grad) || activeColObj.hex
            }} />Aktif #{color + 1}<span className="hud-m">{activeColObj.hex.toUpperCase()}</span></span><span ref={hudCursorWrapRef} style={{
            display: 'none',
            alignItems: 'center',
            gap: 6
          }}><span className="hud-sep" /><span className="hud-i"><i ref={hudCursorSwRef} />Kursor<span ref={hudCursorTxtRef} className="hud-m" /></span></span></div></div></div><div className="rv-zoom rv-glass"><button type="button" className="rv-ibtn" data-tip="atCmpZoomIn" onClick={() => pz.zoomAt(0, 0, vRef.current.z * 1.25, vRef.current)} aria-label="Perbesar"><Ico n="zoomIn" size={15} /></button><span ref={zoomLblRef} className="at-zoomv">{Math.round(v.z * 100)}%</span><button type="button" className="rv-ibtn" data-tip="atCmpZoomOut" onClick={() => pz.zoomAt(0, 0, vRef.current.z / 1.25, vRef.current)} aria-label="Perkecil"><Ico n="zoomOut" size={15} /></button><button type="button" className="rv-ibtn" data-tip="atCmpZoomFit" onClick={pz.reset} aria-label="Pas layar"><Ico n="fit" size={15} /></button></div><div className="rv-dock-wrap"><div className="rv-hint rv-glass"><kbd className="kbd">Alt</kbd>+klik = pipet · <kbd className="kbd">Shift</kbd>+Fill = ganti semua warna sama</div><div className="rv-dock row rv-glass"><Seg tip="atSegCmpModes" o={[['side', 'Samping'], ['split', 'Split'], ['overlay', 'Overlay'], ['seg', 'Segmen'], ['orig', 'Asli']]} v={cmpMode} on={setCmpMode} /><button type="button" data-tip="atSegTool_pan" className={'rv-btn' + (tool === 'pan' ? ' on' : '')} onClick={() => setTool(tool === 'pan' ? 'fill' : 'pan')}><Ico n="expand" size={13} /> Geser</button>{cmpMode === 'overlay' && <><span className="rv-sep" /><span className="rv-lbl">Opasitas asli</span><Slider tip="atSegOverlayOp" min={0} max={90} value={overlayOp} on={setOverlayOp} style={{
            width: 130
          }} /><span className="at-val">{overlayOp}%</span></>}</div></div><RvSide open={segSideOpen} onToggle={() => setSegSideOpen(o => !o)} icon="brush" title="Alat Edit Segmentasi" sub={w + '×' + h + ' px · ' + palette.length + ' warna'}><div className="rv-sgp"><div className="rv-sg-acts">{segActions}</div><div className="space-y-3"><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5"><Ico n="brush" size={14} /> Alat Edit Segmentasi</span><span className="text-[10.5px] mut font-normal">Bebas-Lag ({w}×{h})</span></div><div className="at-seged-tools">{TOOLS.map(([id, label, ic, tipKey]) => <button key={id} type="button" data-tip={tipKey} className={'at-seged-tbtn' + (tool === id ? ' on' : '')} onClick={() => setTool(id)}><Ico n={ic} size={16} /><span>{label}</span></button>)}</div><div className="mt-3 pt-3 space-y-2.5" style={{
              borderTop: '1px solid var(--line)'
            }}>{tool === 'fill' && <div className="space-y-2"><div className="text-[11px] font-semibold mut">Mode Cakupan Ember Fill:</div><Seg tip="atSegFillScope" o={[['contig', '1 Segmen'], ['similar', 'Toleransi'], ['global', 'Semua Warna']]} v={fillScope} on={setFillScope} />{fillScope === 'similar' && <div><div className="flex justify-between text-[11px] mb-1"><span className="mut">Toleransi Kemiripan Segmen:</span><span className="font-semibold">{fillTol}</span></div><Slider min={2} max={60} value={fillTol} on={setFillTol} /></div>}<div className="text-[10.5px] mut leading-relaxed">{fillScope === 'contig' ? 'Mewarnai 1 pulau segmen yang diklik. Gunakan mode Toleransi atau Magic Fill jika gambar terpecah menjadi banyak segmen kecil.' : fillScope === 'similar' ? 'Sekali klik langsung mewarnai segmen yang diklik beserta segmen-segmen tetangga yang warnanya mirip!' : 'Sekali klik mengganti seluruh segmen yang berlabel warna ini di seluruh gambar.'}</div></div>}{tool === 'wand' && <div className="space-y-2"><div className="flex justify-between text-[11px]"><span className="mut font-semibold">Toleransi Warna Gambar Asli:</span><span className="font-bold">{wandTol}</span></div><Slider min={4} max={80} value={wandTol} on={setWandTol} /><AtCheck wrap={true} checked={wandContig} onChange={setWandContig}>Hanya Area Terhubung (Contiguous)</AtCheck><div className="text-[10.5px] mut leading-relaxed">Mendeteksi area dari <b>gambar bitmap asli</b> lalu menyatukan banyak segmen pecah sekaligus menjadi warna aktif hanya dengan 1 klik.</div></div>}{(tool === 'pencil' || tool === 'rect') && <div className="space-y-2">{tool === 'pencil' && <div><div className="flex items-center justify-between text-[11px] mb-1"><span className="mut font-semibold">Ukuran Kuas (<kbd className="kbd">[</kbd> <kbd className="kbd">]</kbd>):</span><span className="font-bold">{size} px</span></div><div className="flex items-center gap-2"><Slider tip="atSegBrush" min={1} max={35} value={size} on={setSize} style={{
                      flex: 1
                    }} /><Seg o={[['circle', 'Bulat'], ['square', 'Kotak']]} v={brushShape} on={setBrushShape} /></div></div>}<AtCheck wrap={true} checked={lockTarget} onChange={setLockTarget}>Kunci Segmen Awal (Hanya timpa warna titik klik pertama)</AtCheck></div>}{tool === 'zap' && <div className="text-[11px] mut leading-relaxed">Klik pada segmen bintik/pecahan mana pun untuk menghapus dan meleburnya secara otomatis ke warna tetangga dominan di sekelilingnya.</div>}</div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5"><Ico n="palette" size={14} /> Pilih & Edit Warna Label ({palette.length})</span><span className="font-mono text-[11px] font-semibold" style={{
                color: 'var(--acc)'
              }}>#{color + 1} · {activeColObj.grad && activeColObj.grad.stops && activeColObj.grad.stops.length >= 2 ? activeColObj.grad.type === 'radial' ? 'RADIAL' : 'LINEAR' : activeColObj.hex.toUpperCase()}</span></div><div className="at-swrow rv-sg-swrow" data-tip="atSegPalette" style={{
              justifyContent: 'flex-start'
            }}>{palette.map((c, i) => <AtColorChip key={i} compact={true} hex={c.hex} grad={c.grad && c.grad.stops && c.grad.stops.length >= 2 ? c.grad : null} opacity={c.opacity != null ? c.opacity : 1} detectedPool={detectedColorPool} data-pt={palTick} selected={color === i} onSelect={() => {
                setColor(i);
                if (tool === 'picker' || tool === 'pan') setTool('fill');
              }} onGradChange={(newG, midHx) => setPalGradEntry(i, newG, midHx)} onOpacityChange={op => setPalOpacityEntry(i, op)} onChange={nh => setPalEntry(i, nh)} onRemove={() => {}} />)}</div><div className="mt-3 pt-2.5" style={{
              borderTop: '1px solid var(--line)'
            }}><div className="flex items-center justify-between mb-1.5"><span className="text-[11px] font-semibold" style={{
                  color: 'var(--ink)'
                }}>Warna / Gradien Label Aktif (#{color + 1})</span>{origPalRef.current[color] && (origPalRef.current[color].hex !== activeColObj.hex || !!origPalRef.current[color].grad !== !!activeColObj.grad) && <button type="button" className="text-[10.5px] font-semibold" style={{
                  color: 'var(--acc)',
                  background: 'none',
                  border: 0,
                  cursor: 'pointer',
                  padding: 0
                }} onClick={() => resetPalEntry(color)}>Reset #{color + 1}</button>}</div><M3ColorInput key={'active-seg-col-' + color} origValue={origPalRef.current[color] ? origPalRef.current[color].hex : undefined} value={activeColObj.hex || '#000000'} grad={activeColObj.grad && activeColObj.grad.stops && activeColObj.grad.stops.length >= 2 ? activeColObj.grad : null} opacity={activeColObj.opacity != null ? activeColObj.opacity : 1} label={`LABEL #${color + 1}`} detectedPool={detectedColorPool} onGradChange={(ng, mh) => setPalGradEntry(color, ng, mh)} onOpacityChange={op => setPalOpacityEntry(color, op)} onChange={nh => setPalEntry(color, nh)} onReset={origPalRef.current[color] && (origPalRef.current[color].hex !== activeColObj.hex || !!origPalRef.current[color].grad !== !!activeColObj.grad) ? () => resetPalEntry(color) : null} /><div className="text-[10px] mut mt-1 leading-snug">Ubah langsung warna <b>Solid</b>, <b>Linear Gradient</b>, <b>Radial Gradient</b>, atau <b>Transparansi</b> untuk seluruh segmen berlabel #{color + 1}.</div></div><div className="mt-3 pt-2.5" style={{
              borderTop: '1px solid var(--line)'
            }}><div className="text-[11px] font-semibold mut mb-1.5">Tambah Warna / Gradien Baru ke Palet</div><M3ColorInput value={/^#[0-9a-f]{6}$/i.test(customHex) ? customHex : '#000000'} grad={customGrad} opacity={customOp} label="CUSTOM HEX" detectedPool={detectedColorPool} onGradChange={(ng, mh) => {
                setCustomGrad(ng);
                if (mh) setCustomHex(mh);
              }} onOpacityChange={op => setCustomOp(op)} onChange={nh => setCustomHex(nh)} /><div className="grid grid-cols-2 gap-1.5 mt-2"><button type="button" className="btn sec text-xs justify-center" onClick={() => addCustomColor(customHex)}><Ico n="plus" size={13} /> Tambah Baru</button><button type="button" className="btn pri text-xs justify-center" onClick={() => {
                  if (customGrad && customGrad.stops && customGrad.stops.length >= 2) {
                    setPalGradEntry(color, customGrad, customHex);
                    if (customOp != null) setPalOpacityEntry(color, customOp);
                    flash(`Gradien diterapkan ke Label Aktif #${color + 1}`);
                  } else {
                    setPalEntry(color, customHex);
                    if (customOp != null) setPalOpacityEntry(color, customOp);
                    flash(`Warna ${customHex.toUpperCase()} diterapkan ke Label Aktif #${color + 1}`);
                  }
                }}><Ico n="check" size={13} /> Isi ke #{color + 1}</button></div></div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center gap-1.5"><Ico n="sparkle" size={14} /><span>Pembersih Segmen Kecil Massal</span></div><div className="text-[11px] mut mb-2 leading-relaxed">Jika gambar memiliki terlalu banyak serpihan segmen kecil, lebur otomatis seluruh pulau segmen di bawah ukuran piksel ini:</div><div className="flex items-center gap-2 mb-2"><Slider min={2} max={120} value={specklePx} on={setSpecklePx} style={{
                flex: 1
              }} /><span className="at-val">&lt; {specklePx} px</span></div><button type="button" data-tip="atSegCleanSpeckle" className="btn sec w-full text-xs" onClick={runCleanSmallSegments}><Ico n="wand" size={13} /> Lebur Segmen &lt; {specklePx} Piksel Sekarang</button></div></div></div></RvSide></div><div className="rv-top">{onSwitchToTrace || onSwitchToNodeEdit || onSwitchToCompare ? <div className="rv-tabs rv-glass" role="tablist">{onSwitchToTrace && <button type="button" role="tab" aria-selected={false} data-tip="atRtTabProcess" className="rv-tab" onClick={() => onApply(dirtyRef.current, pixelsDirtyRef.current, onSwitchToTrace)}><Ico n="layers" size={14} /><span>Alur 7 tahap</span></button>}<button type="button" role="tab" aria-selected={true} className="rv-tab on" title="Edit segmen"><Ico n="brush" size={14} /><span>Edit segmen</span></button>{onSwitchToNodeEdit && <button type="button" role="tab" aria-selected={false} data-tip="atRtTabNodeEdit" className="rv-tab" title="Vector Editor" onClick={() => onApply(dirtyRef.current, pixelsDirtyRef.current, onSwitchToNodeEdit)}><Ico n="vector" size={14} /><span>Vector Editor</span></button>}{onSwitchToCompare && <button type="button" role="tab" aria-selected={false} data-tip="atRtTabCompare" className="rv-tab" onClick={() => onApply(dirtyRef.current, pixelsDirtyRef.current, onSwitchToCompare)}><Ico n="eye" size={14} /><span>Bandingkan</span></button>}</div> : <div className="rv-tabs rv-glass"><Seg tip="atSegCmpModes" o={[['side', 'Samping'], ['split', 'Split'], ['overlay', 'Overlay'], ['seg', 'Segmen'], ['orig', 'Asli']]} v={cmpMode} on={setCmpMode} /><button type="button" data-tip="atSegTool_pan" className={'rv-btn' + (tool === 'pan' ? ' on' : '')} style={{
        alignSelf: 'center',
        marginLeft: 4
      }} onClick={() => setTool(tool === 'pan' ? 'fill' : 'pan')}><Ico n="expand" size={13} /> Geser</button></div>}{!open ? <div className="rv-acts rv-glass">{segActions}</div> : <div className="rv-acts rv-glass"><button type="button" className="rv-exp" onClick={() => onApply(dirtyRef.current, pixelsDirtyRef.current)}><Ico n="check" size={14} /> Terapkan</button><button type="button" className="rv-ibtn" onClick={cancelEdit} aria-label="Kembali"><Ico n="x" size={16} /></button></div>}</div></div>), document.body);
};

export { SegEditor };
