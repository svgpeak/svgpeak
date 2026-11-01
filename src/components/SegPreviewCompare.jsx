import React, { useState, useRef, useEffect, useMemo as atUseMemo, useCallback as atUseCallback } from 'react';
import { atUsePanZoom, AtCheck } from './TraceSharedUI.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { getCheckerPattern } from './CanvasRenderUtils.jsx';
import { Seg } from './ColorPicker.jsx';
import { Ico, Slider } from './CommonControls.jsx';

/* =====================================================================
   SegPreviewCompare — Komparator Interaktif Segmentasi vs Gambar Asli
   dengan Fungsi Zoom & Pan (Digunakan di Pipeline Advanced -> Tab Segmentasi)
   ===================================================================== */
const SegPreviewCompare = ({ seg, imgUrl, job, imgElem }) => {
  const { labels, palette, w, h } = seg;
  const [mode, setMode] = useState('split');
  const [split, setSplit] = useState(0.5);
  const [overlayOp, setOverlayOp] = useState(45);
  const [bounds, setBounds] = useState(true);
  const [bmp, setBmp] = useState(() => (imgElem && imgElem.complete && imgElem.naturalWidth) ? imgElem : (job && job.img && job.img.complete && job.img.naturalWidth ? job.img : null));
  const [v, pz] = atUsePanZoom();
  const vRef = useRef(v); vRef.current = v;
  const wrapRef = useRef(null), cvRef = useRef(null), dragRef = useRef(null);

  useEffect(() => {
    if (!imgUrl) return;
    let on = true;
    const im = new Image();
    im.onload = () => { if (on) setBmp(im); };
    im.src = imgUrl;
    return () => { on = false; };
  }, [imgUrl]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const wh = e => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), cur = vRef.current;
      let d = e.deltaY; if (e.deltaMode === 1) d *= 16;
      const dx = (e.clientX - r.left) - r.width / 2;
      const dy = (e.clientY - r.top) - r.height / 2;
      pz.zoomAt(dx, dy, cur.z * Math.exp(-VMT.clamp(d, -240, 240) * 0.0018), cur);
    };
    el.addEventListener('wheel', wh, { passive: false });
    return () => el.removeEventListener('wheel', wh);
  }, []);

  const segCanvas = atUseMemo(() => {
    const off = document.createElement('canvas');
    VMT.renderSeg(off, labels, palette, w, h, { bounds });
    return off;
  }, [labels, palette, w, h, bounds, seg]);

  const draw = atUseCallback(() => {
    const cv = cvRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (!cw || !ch) return;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = getCheckerPattern(x);
    x.fillRect(0, 0, cw, ch);

    const fit = Math.min(cw / w, ch / h) * 0.94;
    const z = fit * v.z, ox = cw / 2 + v.tx - (w * z) / 2, oy = ch / 2 + v.ty - (h * z) / 2;

    const drawOrig = (cx, cw2, alpha = 1) => {
      if (!bmp) return;
      x.save(); x.beginPath(); x.rect(cx, 0, cw2, ch); x.clip();
      x.globalAlpha = alpha;
      x.imageSmoothingEnabled = v.z < 2.5;
      x.drawImage(bmp, ox, oy, w * z, h * z);
      x.restore();
    };
    const drawSeg = (cx, cw2, alpha = 1) => {
      x.save(); x.beginPath(); x.rect(cx, 0, cw2, ch); x.clip();
      x.globalAlpha = alpha;
      x.imageSmoothingEnabled = false;
      x.drawImage(segCanvas, ox, oy, w * z, h * z);
      x.restore();
    };

    if (mode === 'split') {
      /* [SPLIT-DALAM-GAMBAR] Pembagi relatif terhadap lebar gambar; garis/handle/label hanya di area gambar */
      const iw = w * z, ih = h * z;
      const sx = ox + iw * split;
      const vx0 = Math.max(ox, 0), vx1 = Math.min(ox + iw, cw);
      const vy0 = Math.max(oy, 0), vy1 = Math.min(oy + ih, ch);
      drawOrig(0, cw, 1);
      drawSeg(sx, ox + iw - sx, 1);
      if (vx1 > vx0 && vy1 > vy0 && sx >= vx0 && sx <= vx1) {
        const my = (vy0 + vy1) / 2;
        x.strokeStyle = '#ffffff'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(sx, vy0); x.lineTo(sx, vy1); x.stroke();
        x.fillStyle = '#4f46e5';
        x.beginPath(); x.arc(sx, my, 13, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.font = '11px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('◂ ▸', sx, my + 0.5);
        x.textAlign = 'left'; x.font = '600 10px sans-serif';
        if (sx - vx0 > 64) { x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(vx0 + 8, vy0 + 8, 48, 18); x.fillStyle = '#fff'; x.fillText('ASLI', vx0 + 16, vy0 + 17.5); }
        if (vx1 - sx > 92) { x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(vx1 - 84, vy0 + 8, 76, 18); x.fillStyle = '#fff'; x.fillText('SEGMENTASI', vx1 - 78, vy0 + 17.5); }
      }
    } else if (mode === 'side') {
      const hw = cw / 2;
      const sideFit = Math.min((hw - 12) / w, (ch - 12) / h) * 0.94;
      const sz = sideFit * v.z;
      const oxL = hw / 2 + v.tx - (w * sz) / 2, oyL = ch / 2 + v.ty - (h * sz) / 2;
      const oxR = hw + hw / 2 + v.tx - (w * sz) / 2, oyR = oyL;
      if (bmp) {
        x.save(); x.beginPath(); x.rect(0, 0, hw, ch); x.clip();
        x.imageSmoothingEnabled = v.z < 2.5;
        x.drawImage(bmp, oxL, oyL, w * sz, h * sz);
        x.restore();
      }
      x.save(); x.beginPath(); x.rect(hw, 0, hw, ch); x.clip();
      x.imageSmoothingEnabled = false;
      x.drawImage(segCanvas, oxR, oyR, w * sz, h * sz);
      x.restore();
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(hw, 0); x.lineTo(hw, ch); x.stroke();
      x.font = '600 10px sans-serif';
      x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(8, 8, 48, 18); x.fillStyle = '#fff'; x.fillText('ASLI', 16, 17.5);
      x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(hw + 8, 8, 76, 18); x.fillStyle = '#fff'; x.fillText('SEGMENTASI', hw + 14, 17.5);
    } else if (mode === 'overlay') {
      drawSeg(0, cw, 1);
      drawOrig(0, cw, overlayOp / 100);
    } else if (mode === 'orig') {
      drawOrig(0, cw, 1);
    } else {
      drawSeg(0, cw, 1);
    }
  }, [bmp, segCanvas, mode, split, overlayOp, v, w, h]);
  useEffect(() => { draw(); }, [draw]);

  const toLocal = e => { const r = wrapRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const imgGeom = () => {
    const wr = wrapRef.current, cw = wr.clientWidth, ch = wr.clientHeight;
    const z = Math.min(cw / w, ch / h) * 0.94 * v.z;
    return { z, ox: cw / 2 + v.tx - (w * z) / 2, oy: ch / 2 + v.ty - (h * z) / 2 };
  };
  const onDown = e => {
    if (e.button !== 0) return;
    const { x, y } = toLocal(e);
    let nearSplit = false;
    if (mode === 'split') {
      const g = imgGeom();
      nearSplit = Math.abs(x - (g.ox + w * g.z * split)) < 18 && y >= g.oy && y <= g.oy + h * g.z;
    }
    dragRef.current = { sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, split: nearSplit };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = e => {
    const dr = dragRef.current; if (!dr) return;
    if (dr.split) { const g = imgGeom(); setSplit(VMT.clamp((toLocal(e).x - g.ox) / Math.max(1, w * g.z), 0.02, 0.98)); }
    else pz.set({ ...v, tx: dr.tx + (e.clientX - dr.sx), ty: dr.ty + (e.clientY - dr.sy) });
  };
  const onUp = () => { dragRef.current = null; };

  return (<div className="at-cmp"><div className="at-cmp-bar"><Seg tip="atSegCmpModes" o={[['split', 'Split'], ['side', 'Samping'], ['overlay', 'Overlay'], ['seg', 'Segmentasi'], ['orig', 'Asli']]} v={mode} on={setMode} /><div className="at-cmp-zoom"><AtCheck tip="atSegBounds" checked={bounds} onChange={setBounds}>Batas</AtCheck><button type="button" className="btn sec" data-tip="atCmpZoomIn" style={{
        padding: 6
      }} onClick={() => pz.zoomAt(0, 0, v.z * 1.25, v)} aria-label="Perbesar"><Ico n="zoomIn" size={13} /></button><span className="at-zoomv">{Math.round(v.z * 100)}%</span><button type="button" className="btn sec" data-tip="atCmpZoomOut" style={{
        padding: 6
      }} onClick={() => pz.zoomAt(0, 0, v.z / 1.25, v)} aria-label="Perkecil"><Ico n="zoomOut" size={13} /></button><button type="button" className="btn sec" data-tip="atCmpZoomFit" style={{
        padding: 6
      }} onClick={pz.reset} aria-label="Reset Zoom"><Ico n="fit" size={13} /></button></div></div>{mode === 'overlay' && <div className="flex items-center gap-3 px-2 py-1 rounded-lg" style={{
    background: 'var(--sub)'
  }}><span className="text-[11px] mut font-medium">Opasitas Gambar Asli:</span><Slider tip="atSegOverlayOp" min={0} max={100} value={overlayOp} on={setOverlayOp} style={{
      flex: 1,
      maxWidth: 200
    }} /><span className="at-val">{overlayOp}%</span></div>}<div ref={wrapRef} className="at-cmp-wrap chk" style={{
    height: 'min(48vh, 430px)',
    minHeight: 280
  }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><canvas ref={cvRef} className="at-cmp-cv" /></div><div className="at-hint">Bandingkan segmentasi MRF dengan gambar asli · seret untuk geser (pan) · gunakan scroll mouse atau tombol ± untuk zoom</div></div>);
};

export { SegPreviewCompare };
