import React, { useState, useRef, useEffect, useMemo as atUseMemo, useCallback as atUseCallback } from 'react';
import { atUsePanZoom } from './TraceSharedUI.jsx';
import { rvUseResizeTick, parseSvgForCanvas, buildVectorBitmapCache, buildWireframeCache, rvSafe, getCheckerPattern, fillCanvasPath, resolveCanvasPaint, drawColorHighlightVeil, createWorldOccGrid, drawScreenPinSpritesBatch, drawHighlightHud } from './CanvasRenderUtils.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { Ico } from './CommonControls.jsx';
import { Seg } from './ColorPicker.jsx';

const CompareView = ({ imgUrl, imgElem, svg, regs, hiddenLabels, W, H, bgPickMode, onToggleBgLabel, initialMode, highlightLabel, highlightHex, floating, pad, dockExtra, bitmapOnly }) => {
  const [mode, setMode] = useState(initialMode || 'split');
  const [split, setSplit] = useState(0.5);
  const [bmp, setBmp] = useState(() => (imgElem && imgElem.complete && imgElem.naturalWidth) ? imgElem : null);
  const [v, pz] = atUsePanZoom();
  const interRef = useRef(false), rafRef = useRef(0), wheelT = useRef(0), drawRef = useRef(null);
  const zoomLblRef = useRef(null);
  const vRef = useRef(v); if (!interRef.current) vRef.current = v;
  /* [PERF] Pan/zoom tidak lagi me-render ulang React tiap event: view disimpan di ref, kanvas digambar maksimal 1x per frame (rAF), state baru dikomit saat gestur selesai */
  const scheduleDraw = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (zoomLblRef.current) zoomLblRef.current.textContent = Math.round(vRef.current.z * 100) + '%';
      if (drawRef.current) drawRef.current();
    });
  };
  const wrapRef = useRef(), cvRef = useRef(), dragRef = useRef(null);
  const rszTick = rvUseResizeTick(wrapRef);
  const padRef = useRef(pad); padRef.current = pad;
  const padKey = pad ? pad.t + ',' + pad.r + ',' + pad.b + ',' + pad.l : '';

  const vecPaths = atUseMemo(() => parseSvgForCanvas(svg), [svg]);
  const vecBmpRef = useRef({ paths: null, w: 0, h: 0, cv: null });
  const getLazyVecBmpCache = () => {
    const r = vecBmpRef.current;
    if (r.paths === vecPaths && r.w === W && r.h === H && r.cv) return r.cv;
    const cv = buildVectorBitmapCache(vecPaths, W, H);
    vecBmpRef.current = { paths: vecPaths, w: W, h: H, cv };
    return cv;
  };
  const wireCache = atUseMemo(() => buildWireframeCache(regs), [regs]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const wh = e => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), cur = vRef.current;
      let d = e.deltaY; if (e.deltaMode === 1) d *= 16;
      const sf = rvSafe(el, padRef.current);
      const dx = (e.clientX - r.left) - sf.cx;
      const dy = (e.clientY - r.top) - sf.cy;
      const nz = VMT.clamp(cur.z * Math.exp(-VMT.clamp(d, -240, 240) * 0.0018), 0.1, 60), k = nz / cur.z;
      vRef.current = { z: nz, tx: dx - (dx - cur.tx) * k, ty: dy - (dy - cur.ty) * k };
      interRef.current = true; scheduleDraw();
      clearTimeout(wheelT.current);
      wheelT.current = setTimeout(() => { wheelT.current = 0; interRef.current = false; pz.set(vRef.current); }, 140);
    };
    el.addEventListener('wheel', wh, { passive: false });
    return () => el.removeEventListener('wheel', wh);
  }, []);

  useEffect(() => {
    if (imgElem && imgElem.complete && imgElem.naturalWidth) { setBmp(imgElem); return; }
    if (!imgUrl) return;
    let on = true;
    const im = new Image();
    im.onload = () => { if (on) setBmp(im); };
    im.src = imgUrl;
    return () => { on = false; };
  }, [imgUrl, imgElem]);

  const draw = atUseCallback(() => {
    const cv = cvRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const v = vRef.current;
    /* [CRISP-VECTOR] Supersampling minimum 2.0x DPR agar tepi kurva SVG 100% tajam tanpa efek piksel saat di-zoom */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (!cw || !ch) return;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = getCheckerPattern(x);
    x.fillRect(0, 0, cw, ch);
    const pd = padRef.current || {}, padT = pd.t || 0, padR = pd.r || 0, padB = pd.b || 0;
    const sf = rvSafe(wrap, pd);
    const fit = Math.min(sf.aw / W, sf.ah / H) * 0.96;
    const z = fit * v.z, ox = sf.cx + v.tx - (W * z) / 2, oy = sf.cy + v.ty - (H * z) / 2;

    const drawBmp = (cx, cw2) => {
      if (!bmp) return;
      x.save(); x.beginPath(); x.rect(cx, 0, cw2, ch); x.clip();
      x.imageSmoothingEnabled = v.z < 3;
      if (x.imageSmoothingEnabled) x.imageSmoothingQuality = interRef.current ? 'low' : 'high';
      x.drawImage(bmp, ox, oy, W * z, H * z);
      x.restore();
    };
    const renderVectorItems = (alphaMul = 1, targetOx = ox, targetOy = oy, targetZ = z) => {
      /* Render Path2D vektor secara langsung pada semua tingkat zoom (v.z > 1) agar tepi garis 100% bebas piksel/blur */
      if (interRef.current && v.z <= 1.0 && vecPaths.length > 140 && alphaMul >= 0.99) {
        const bmpCache = getLazyVecBmpCache();
        if (bmpCache) {
          x.save();
          x.globalAlpha = alphaMul;
          x.imageSmoothingEnabled = true;
          x.drawImage(bmpCache, targetOx, targetOy, W * targetZ, H * targetZ);
          x.restore();
          return;
        }
      }
      x.save();
      x.translate(targetOx, targetOy); x.scale(targetZ, targetZ);
      const maxAntiGapW = 0.75 / Math.max(0.1, targetZ);
      for (const it of vecPaths) {
        x.globalAlpha = (it.opacity ?? 1) * alphaMul;
        if (it.fill && it.fill !== 'none') {
          fillCanvasPath(x, it);
        }
        if (it.stroke && it.stroke !== 'none' && it.strokeWidth > 0) {
          x.strokeStyle = resolveCanvasPaint(x, it.stroke, it.strokeGrad);
          x.lineWidth = Math.min(it.strokeWidth, maxAntiGapW);
          x.lineJoin = it.lineJoin || 'round';
          x.lineCap = it.lineCap || 'round';
          x.stroke(it.p2d);
        }
      }
      x.globalAlpha = 1;
      x.restore();
    };
    const drawVec = (cx, cw2, cy = 0, ch2 = ch) => {
      if (!vecPaths.length) return;
      x.save(); x.beginPath(); x.rect(cx, cy, cw2, ch2); x.clip();
      renderVectorItems(1, ox, oy, z);
      x.restore();
    };
    let hlCount = null;
    const hlOn = !!highlightHex;
    const applyHl = (cx, cw2, tx, ty, tz, cy = 0, ch2 = ch) => {
      x.save(); x.beginPath(); x.rect(cx, cy, cw2, ch2); x.clip();
      hlCount = drawColorHighlightVeil(x, vecPaths, highlightHex, cw, ch, tx, ty, tz, dpr);
      x.restore();
    };
    const drawWireframe = (cx, cw2) => {
      x.save(); x.beginPath(); x.rect(cx, 0, cw2, ch); x.clip();
      if (vecPaths.length) {
        renderVectorItems(0.24, ox, oy, z);
      }
      const hid = new Set(hiddenLabels || []);
      const padDoc = 10 / z;
      const vMinX = (cx - ox) / z - padDoc;
      const vMaxX = (cx + cw2 - ox) / z + padDoc;
      const vMinY = (0 - oy) / z - padDoc;
      const vMaxY = (ch - oy) / z + padDoc;

      /* World-Locked Occupancy Grid (100% stabil terhadap translasi pan ox/oy, tanpa flicker) */
      const denseMode = wireCache.totalNodes > 900;
      const occObj = denseMode ? createWorldOccGrid(vMinX, vMaxX, vMinY, vMaxY, z, 3.5) : null;

      const passItems = (isDimPass) => {
        x.save();
        x.translate(ox, oy); x.scale(z, z);
        x.globalAlpha = isDimPass ? 0.13 : 1;
        /* 1. Gambar garis lurus & kurva memakai Path2D per-region yang sudah digabung */
        for (const rg of wireCache.items) {
          if (hid.has(rg.label)) continue;
          const isDim = highlightLabel != null && rg.label !== highlightLabel;
          if (isDim !== isDimPass) continue;
          if (rg.maxX < vMinX || rg.minX > vMaxX || rg.maxY < vMinY || rg.minY > vMaxY) continue;
          if (rg.rgHasLine) {
            x.strokeStyle = '#10b981';
            x.lineWidth = 1.6 / z;
            x.stroke(rg.rgLineP2d);
          }
          if (rg.rgHasCurve) {
            x.strokeStyle = '#4f46e5';
            x.lineWidth = 1.4 / z;
            x.stroke(rg.rgCurveP2d);
          }
        }
        x.restore();

        /* 2. Gambar seluruh simpul C0 (Kotak Oranye) & G1 (Lingkaran Biru) via High-DPI Sprite Atlas */
        x.save();
        x.globalAlpha = isDimPass ? 0.13 : 1;
        for (const rg of wireCache.items) {
          if (hid.has(rg.label)) continue;
          const isDim = highlightLabel != null && rg.label !== highlightLabel;
          if (isDim !== isDimPass) continue;
          if (rg.maxX < vMinX || rg.minX > vMaxX || rg.maxY < vMinY || rg.minY > vMaxY) continue;
          drawScreenPinSpritesBatch(x, rg.rgSharpPts, 'sharp', 3.0, 1.1, 1, ox, oy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occObj);
          drawScreenPinSpritesBatch(x, rg.rgSmoothPts, 'smooth', 2.85, 1.1, 2, ox, oy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occObj);
        }
        x.restore();
      };

      if (highlightLabel != null) passItems(true);
      passItems(false);
      x.globalAlpha = 1;
      x.restore();
    };

    if (mode === 'split') {
      /* [SPLIT-DALAM-GAMBAR] Posisi pembagi relatif terhadap lebar GAMBAR (bukan kanvas); vektor/highlight di-clip ke kotak gambar; garis & handle hanya di area gambar */
      const iw = W * z, ih = H * z;
      const sx = ox + iw * split;
      const vx0 = Math.max(ox, 0), vx1 = Math.min(ox + iw, cw);
      const vy0 = Math.max(oy, 0), vy1 = Math.min(oy + ih, ch);
      drawBmp(0, cw); drawVec(sx, ox + iw - sx, oy, ih);
      if (hlOn) applyHl(sx, ox + iw - sx, ox, oy, z, oy, ih);
      if (vx1 > vx0 && vy1 > vy0 && sx >= vx0 && sx <= vx1) {
        const my = (vy0 + vy1) / 2;
        x.strokeStyle = '#fff'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(sx, vy0); x.lineTo(sx, vy1); x.stroke();
        x.fillStyle = '#4f46e5';
        x.beginPath(); x.arc(sx, my, 13, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('◂ ▸', sx, my + 0.5);
        x.textAlign = 'left'; x.font = '600 10px sans-serif';
        const lyy = Math.max(vy0, padT) + 8;
        if (sx - vx0 > 70) { x.fillStyle = 'rgba(0,0,0,.62)'; x.fillRect(vx0 + 8, lyy, 56, 18); x.fillStyle = '#fff'; x.fillText('BITMAP', vx0 + 14, lyy + 9.5); }
        if (vx1 - sx > 70) { x.fillStyle = 'rgba(0,0,0,.62)'; x.fillRect(vx1 - 64, lyy, 56, 18); x.fillStyle = '#fff'; x.fillText('VEKTOR', vx1 - 58, lyy + 9.5); }
      }
    } else if (mode === 'side') {
      const hw = cw / 2;
      const sideFit = Math.min((hw - 12) / W, (ch - 12) / H) * 0.94;
      const sz = sideFit * v.z;
      const oxL = hw / 2 + v.tx - (W * sz) / 2, oyL = ch / 2 + v.ty - (H * sz) / 2;
      const oxR = hw + hw / 2 + v.tx - (W * sz) / 2, oyR = oyL;
      if (bmp) {
        x.save(); x.beginPath(); x.rect(0, 0, hw, ch); x.clip();
        x.imageSmoothingEnabled = v.z < 3;
        x.drawImage(bmp, oxL, oyL, W * sz, H * sz);
        x.restore();
      }
      if (vecPaths.length) {
        x.save(); x.beginPath(); x.rect(hw, 0, hw, ch); x.clip();
        renderVectorItems(1, oxR, oyR, sz);
        x.restore();
        if (hlOn) applyHl(hw, hw, oxR, oyR, sz);
      }
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(hw, 0); x.lineTo(hw, ch); x.stroke();
      x.font = '600 10px sans-serif';
      x.fillStyle = 'rgba(0,0,0,.62)'; x.fillRect(8, 8 + padT, 56, 18); x.fillStyle = '#fff'; x.fillText('BITMAP', 14, 17.5 + padT);
      x.fillStyle = 'rgba(0,0,0,.62)'; x.fillRect(hw + 8, 8 + padT, 56, 18); x.fillStyle = '#fff'; x.fillText('VEKTOR', hw + 14, 17.5 + padT);
    } else if (mode === 'wire') {
      drawWireframe(0, cw);
    } else if (mode === 'vector') {
      drawVec(0, cw);
      if (hlOn) applyHl(0, cw, ox, oy, z);
    } else {
      drawBmp(0, cw);
    }
    if (hlOn && mode !== 'bitmap') drawHighlightHud(x, highlightHex, mode === 'wire' ? null : hlCount, 8, ch - 32 - padB);
  }, [bmp, vecPaths, wireCache, mode, split, v, W, H, regs, hiddenLabels, highlightHex, highlightLabel, rszTick, padKey]);
  drawRef.current = draw;
  useEffect(() => { draw(); }, [draw]);

  const toLocal = e => { const r = wrapRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  /* Geometri kotak gambar di kanvas (sama dengan perhitungan di draw) untuk hit-test & drag pembagi Split */
  const imgGeom = () => {
    const sf = rvSafe(wrapRef.current, padRef.current);
    const fit = Math.min(sf.aw / W, sf.ah / H) * 0.96;
    const z = fit * vRef.current.z;
    return { z, ox: sf.cx + vRef.current.tx - (W * z) / 2, oy: sf.cy + vRef.current.ty - (H * z) / 2 };
  };
  const onDown = e => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    const { x, y } = toLocal(e);
    if (e.button === 0 && bgPickMode && onToggleBgLabel && wrapRef.current) {
      const sf = rvSafe(wrapRef.current, padRef.current);
      const fit = Math.min(sf.aw / W, sf.ah / H) * 0.96;
      const z = fit * vRef.current.z, ox = sf.cx + vRef.current.tx - (W * z) / 2, oy = sf.cy + vRef.current.ty - (H * z) / 2;
      const docX = (x - ox) / z, docY = (y - oy) / z;
      if (docX >= 0 && docY >= 0 && docX <= W && docY <= H) {
        onToggleBgLabel(docX, docY);
        return;
      }
    }
    let nearSplit = false;
    if (e.button === 0 && mode === 'split') {
      const g = imgGeom();
      nearSplit = Math.abs(x - (g.ox + W * g.z * split)) < 18 && y >= g.oy && y <= g.oy + H * g.z;
    }
    dragRef.current = { sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty, split: nearSplit };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onMove = e => {
    const dr = dragRef.current; if (!dr) return;
    if (dr.split) { const g = imgGeom(); setSplit(VMT.clamp((toLocal(e).x - g.ox) / Math.max(1, W * g.z), 0.02, 0.98)); }
    else { vRef.current = { ...vRef.current, tx: dr.tx + (e.clientX - dr.sx), ty: dr.ty + (e.clientY - dr.sy) }; interRef.current = true; scheduleDraw(); }
  };
  const onUp = () => { dragRef.current = null; if (interRef.current) { clearTimeout(wheelT.current); wheelT.current = 0; interRef.current = false; pz.set(vRef.current); } };

  if (floating) {
    const hintTxt = bgPickMode
      ? 'Klik warna pada gambar untuk menjadikannya latar transparan'
      : mode === 'wire'
      ? 'Kotak oranye = sudut tajam C⁰ · Bulat biru = halus G¹ · Hijau = lurus · Ungu = kurva Bézier'
      : null;
    return (<React.Fragment><div ref={wrapRef} className="at-cmp-wrap chk rv-canvas" data-tip="atCmpCanvas" style={{
    cursor: bgPickMode ? 'crosshair' : undefined
  }} onContextMenu={e => e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><canvas ref={cvRef} className="at-cmp-cv" /></div><div className="rv-zoom rv-glass"><button type="button" className="rv-ibtn" data-tip="atCmpZoomIn" onClick={() => pz.zoomAt(0, 0, vRef.current.z * 1.25, vRef.current)} aria-label="Perbesar"><Ico n="zoomIn" size={15} /></button><span ref={zoomLblRef} className="at-zoomv">{Math.round(v.z * 100)}%</span><button type="button" className="rv-ibtn" data-tip="atCmpZoomOut" onClick={() => pz.zoomAt(0, 0, vRef.current.z / 1.25, vRef.current)} aria-label="Perkecil"><Ico n="zoomOut" size={15} /></button><button type="button" className="rv-ibtn" data-tip="atCmpZoomFit" onClick={pz.reset} aria-label="Pas layar"><Ico n="fit" size={15} /></button></div><div className="rv-dock-wrap" style={bitmapOnly ? {
    display: 'none'
  } : undefined}>{hintTxt && <div className="rv-hint rv-glass">{hintTxt}</div>}<div className="rv-dock row rv-glass"><Seg o={[['split', 'Split'], ['side', 'Samping'], ['bitmap', 'Asli'], ['vector', 'Vektor'], ['wire', 'Outline']]} v={mode} on={setMode} tip="atCmpModes" tips={{
        split: 'atCmp_split',
        side: 'atCmp_side',
        bitmap: 'atCmp_bitmap',
        vector: 'atCmp_vector',
        wire: 'atCmp_wire'
      }} />{dockExtra}</div></div></React.Fragment>);
  }

  return (<div className="at-cmp"><div className="at-cmp-bar"><Seg o={[['split', 'Split'], ['side', 'Samping'], ['bitmap', 'Asli'], ['vector', 'Vektor'], ['wire', 'Outline/Node']]} v={mode} on={setMode} tip="atCmpModes" tips={{
      split: 'atCmp_split',
      side: 'atCmp_side',
      bitmap: 'atCmp_bitmap',
      vector: 'atCmp_vector',
      wire: 'atCmp_wire'
    }} /><div className="at-cmp-zoom"><button type="button" className="btn sec" data-tip="atCmpZoomIn" style={{
        padding: 6
      }} onClick={() => pz.zoomAt(0, 0, vRef.current.z * 1.25, vRef.current)} aria-label="Perbesar"><Ico n="zoomIn" size={13} /></button><span ref={zoomLblRef} className="at-zoomv">{Math.round(v.z * 100)}%</span><button type="button" className="btn sec" data-tip="atCmpZoomOut" style={{
        padding: 6
      }} onClick={() => pz.zoomAt(0, 0, vRef.current.z / 1.25, vRef.current)} aria-label="Perkecil"><Ico n="zoomOut" size={13} /></button><button type="button" className="btn sec" data-tip="atCmpZoomFit" style={{
        padding: 6
      }} onClick={pz.reset} aria-label="Pas layar"><Ico n="fit" size={13} /></button></div></div><div ref={wrapRef} className="at-cmp-wrap chk" data-tip="atCmpCanvas" style={{
    cursor: bgPickMode ? 'crosshair' : undefined
  }} onContextMenu={e => e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><canvas ref={cvRef} className="at-cmp-cv" /></div><div className="at-hint">{bgPickMode ? 'Mode Hapus Latar aktif: klik warna pada gambar untuk menjadikannya transparan (klik lagi di palet untuk memulihkan)' : mode === 'wire' ? 'Inspeksi Geometri: Kotak Oranye = Sharp Corner C⁰ · Bulat Biru = Smooth Corner G¹ · Garis Hijau = Lurus (L) · Garis Ungu = Kurva Bézier (C)' : 'Seret garis pembagi untuk membandingkan · pilih Outline/Node untuk inspeksi sudut tajam vs halus · scroll/tombol ± untuk zoom'}</div></div>);
};

export { CompareView };
