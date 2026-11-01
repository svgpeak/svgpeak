import React, { useState, useRef, useEffect, useMemo as atUseMemo, useCallback as atUseCallback } from 'react';
import ReactDOM from 'react-dom';
import { VMT } from '../engine/VmtEngine.jsx';
import { parseSvgForCanvas, rvUseWide, rvUseResizeTick, getCachedPath2D, rvUseBodyFlag, rvSafe, getCheckerPattern, fillCanvasPath, resolveCanvasPaint, createWorldOccGrid, drawScreenPinSpritesBatch, RvSide } from './CanvasRenderUtils.jsx';
import { atUsePanZoom, AtToggle, AtNum, AtCheck } from './TraceSharedUI.jsx';
import { Ico, Slider } from './CommonControls.jsx';
import { M3ColorInput, Seg } from './ColorPicker.jsx';

/* =====================================================================
   NodeEditor — Editor Simpul (Node), Handle Bézier, Garis Lurus 2 Node,
   & Radius Sudut Interaktif (Tajam ↔ Rounded + Copy/Paste Radius)
   ===================================================================== */
function ndExtractNodesFromLoop(lp) {
  if (!lp) return [];
  if (lp._editorNodes && lp._editorNodes.length >= 2) {
    return lp._editorNodes.map(n => ({ ...n }));
  }
  let segs = lp.segs;
  if (segs && segs.length === 1) {
    const s0 = segs[0];
    const sp = ndSplitCubic(s0.P0, s0.P1, s0.P2, s0.P3, 0.5);
    segs = [
      { P0: s0.P0, P1: sp.Q0, P2: sp.R0, P3: sp.S, isLine: !!s0.isLine, startSharp: !!s0.startSharp, endSharp: false },
      { P0: sp.S, P1: sp.R1, P2: sp.Q2, P3: s0.P3, isLine: !!s0.isLine, startSharp: false, endSharp: !!s0.endSharp }
    ];
  }
  const nodes = [];
  if (segs && segs.length >= 2) {
    const m = segs.length;
    for (let i = 0; i < m; i++) {
      const s = segs[i];
      const prev = segs[(i - 1 + m) % m];
      const x = s.P0[0], y = s.P0[1];
      const inX = prev.P2[0], inY = prev.P2[1];
      const outX = s.P1[0], outY = s.P1[1];
      const inLine = !!prev.isLine;
      const outLine = !!s.isLine;
      const sharp = !!(s.startSharp || prev.endSharp || (inLine && outLine));
      nodes.push({
        x, y,
        inX: inLine ? x : inX,
        inY: inLine ? y : inY,
        outX: outLine ? x : outX,
        outY: outLine ? y : outY,
        inLine,
        outLine,
        sharp,
        handleMode: sharp ? 'corner' : 'smooth',
        radius: 0
      });
    }
  } else if (lp.pts && lp.pts.length >= 2) {
    for (let i = 0; i < lp.pts.length; i++) {
      const p = lp.pts[i];
      nodes.push({
        x: p[0], y: p[1],
        inX: p[0], inY: p[1],
        outX: p[0], outY: p[1],
        inLine: true, outLine: true,
        sharp: true, handleMode: 'corner', radius: 0
      });
    }
  }
  return nodes;
}

/* [COLOR-OV] salinan helper normalisasi warna untuk scope Vector Editor */
function _hexNormC(c) {
  if (typeof c !== 'string') return null;
  c = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(c);
  if (m) { const h = m[1]; return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  m = /^#([0-9a-f]{6})[0-9a-f]{2}$/.exec(c);
  if (m) return '#' + m[1];
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c);
  if (m) return '#' + [m[1], m[2], m[3]].map(v => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, '0')).join('');
  return null;
}
function ndCloneLoopsFromRegs(regs, topoMeta = null) {
  const out = [];
  if (!regs) return out;
  const skipSet = (topoMeta && topoMeta.skipInEditor) ? topoMeta.skipInEditor : null;
  const twinMap = (topoMeta && topoMeta.twinMap) ? topoMeta.twinMap : null;
  const promotedOuters = (topoMeta && topoMeta.promotedOuters) ? topoMeta.promotedOuters : null;

  for (let rIdx = 0; rIdx < regs.length; rIdx++) {
    const rg = regs[rIdx];
    const loops = (rg && rg.loops) || [];
    for (let lIdx = 0; lIdx < loops.length; lIdx++) {
      const lp = loops[lIdx];
      const key = rIdx + ':' + lIdx;
      if (skipSet && skipSet.has(key)) continue;
      const nodes = ndExtractNodesFromLoop(lp);
      if (nodes.length >= 2) {
        const isPromoted = !!(promotedOuters && promotedOuters.has(key));
        out.push({
          id: key,
          rIdx,
          lIdx,
          label: rg.label,
          color: rg.color,
          hidden: !!rg.hidden,
          signedArea: isPromoted ? -Math.abs(lp.signedArea || lp.area || 1) : lp.signedArea,
          area: lp.area,
          twinKeys: (twinMap && twinMap.has(key)) ? twinMap.get(key).slice() : [],
          dirty: !!lp._editorDirty,
          colorOv: lp._colorOv || null,
          gradOffset: lp._editorGradOffset ? lp._editorGradOffset.slice() : [0, 0],
          nodes
        });
      }
    }
  }
  return out;
}

function ndEstimateNodeRadius(nodes, idx) {
  const n = nodes.length;
  if (!n || idx < 0 || idx >= n) return 0;
  const nd = nodes[idx];
  if (nd.radius && nd.radius > 0) return Math.round(nd.radius * 10) / 10;
  const dIn = Math.hypot((nd.inX ?? nd.x) - nd.x, (nd.inY ?? nd.y) - nd.y);
  const dOut = Math.hypot((nd.outX ?? nd.x) - nd.x, (nd.outY ?? nd.y) - nd.y);
  if (dIn > 0.25 || dOut > 0.25) {
    return Math.max(1, Math.round(((dIn + dOut) * 0.5 / 0.55228475) * 10) / 10);
  }
  /* Cek jika node ini adalah titik singgung busur fillet pendek hasil auto-trace */
  const prev = nodes[(idx - 1 + n) % n];
  const next = nodes[(idx + 1) % n];
  if (!nd.sharp) {
    const cPrev = Math.hypot(nd.x - prev.x, nd.y - prev.y);
    const cNext = Math.hypot(next.x - nd.x, next.y - nd.y);
    const shortChord = Math.min(cPrev, cNext);
    if (shortChord > 0.5 && shortChord < 80) {
      return Math.max(1, Math.round((shortChord * 0.7) * 10) / 10);
    }
  }
  return 0;
}

function ndComputeNodeFillet(nodes, i) {
  const m = nodes.length;
  const nd = nodes[i];
  const r = +(nd.radius || 0);
  if (!(r > 0.15) || m < 3) return null;
  const prev = nodes[(i - 1 + m) % m];
  const next = nodes[(i + 1) % m];
  const vxIn = prev.x - nd.x, vyIn = prev.y - nd.y;
  const vxOut = next.x - nd.x, vyOut = next.y - nd.y;
  const lenIn = Math.hypot(vxIn, vyIn);
  const lenOut = Math.hypot(vxOut, vyOut);
  if (lenIn < 0.5 || lenOut < 0.5) return null;
  const uInX = vxIn / lenIn, uInY = vyIn / lenIn;
  const uOutX = vxOut / lenOut, uOutY = vyOut / lenOut;
  const dot = VMT.clamp(uInX * uOutX + uInY * uOutY, -0.9995, 0.9995);
  const theta = Math.acos(dot);
  if (theta > Math.PI - 0.02 || theta < 0.02) return null;
  const maxD = Math.min(lenIn * 0.46, lenOut * 0.46);
  const d = Math.min(r, maxD);
  if (d < 0.15) return null;
  const tIn = [nd.x + uInX * d, nd.y + uInY * d];
  const tOut = [nd.x + uOutX * d, nd.y + uOutY * d];
  const halfAng = theta * 0.5;
  const turnAng = Math.PI - theta;
  const trueArcR = d * Math.tan(halfAng);
  const hLen = (4 / 3) * Math.tan(turnAng * 0.25) * trueArcR;
  const c1 = [tIn[0] - uInX * hLen, tIn[1] - uInY * hLen];
  const c2 = [tOut[0] - uOutX * hLen, tOut[1] - uOutY * hLen];
  const midX = 0.125 * tIn[0] + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * tOut[0];
  const midY = 0.125 * tIn[1] + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * tOut[1];
  const bisX = uInX + uOutX, bisY = uInY + uOutY;
  const bisLen = Math.hypot(bisX, bisY) || 1;
  const centerDist = Math.min(d / Math.cos(halfAng), Math.min(lenIn, lenOut) * 0.55);
  const handleCenter = [nd.x + (bisX / bisLen) * centerDist, nd.y + (bisY / bisLen) * centerDist];
  return { tIn, c1, c2, tOut, mid: [midX, midY], handleCenter, d: Math.round(d * 10) / 10, reqR: r, uIn: [uInX, uInY], uOut: [uOutX, uOutY] };
}

function ndNodesToSegs(nodes) {
  const m = nodes.length;
  if (m < 2) return [];
  const fillets = new Array(m);
  for (let i = 0; i < m; i++) {
    fillets[i] = ndComputeNodeFillet(nodes, i);
  }
  const segs = [];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const ni = nodes[i], nj = nodes[j];
    const fi = fillets[i], fj = fillets[j];
    if (fi) {
      segs.push({
        P0: [fi.tIn[0], fi.tIn[1]],
        P1: [fi.c1[0], fi.c1[1]],
        P2: [fi.c2[0], fi.c2[1]],
        P3: [fi.tOut[0], fi.tOut[1]],
        isLine: false,
        startSharp: false,
        endSharp: false,
        _isFillet: true,
        _filletNode: i
      });
    }
    const p0 = fi ? [fi.tOut[0], fi.tOut[1]] : [ni.x, ni.y];
    const p3 = fj ? [fj.tIn[0], fj.tIn[1]] : [nj.x, nj.y];
    const outDist = Math.hypot((ni.outX ?? ni.x) - ni.x, (ni.outY ?? ni.y) - ni.y);
    const inDist = Math.hypot((nj.inX ?? nj.x) - nj.x, (nj.inY ?? nj.y) - nj.y);
    const isLine = !!((ni.outLine && nj.inLine) || (outDist < 0.08 && inDist < 0.08));
    let p1, p2;
    if (isLine) {
      p1 = [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3];
      p2 = [p0[0] + (p3[0] - p0[0]) * 2 / 3, p0[1] + (p3[1] - p0[1]) * 2 / 3];
    } else {
      p1 = fi
        ? [p0[0] + (p3[0] - p0[0]) * 0.33, p0[1] + (p3[1] - p0[1]) * 0.33]
        : [ni.outX ?? (p0[0] + (p3[0] - p0[0]) / 3), ni.outY ?? (p0[1] + (p3[1] - p0[1]) / 3)];
      p2 = fj
        ? [p0[0] + (p3[0] - p0[0]) * 0.67, p0[1] + (p3[1] - p0[1]) * 0.67]
        : [nj.inX ?? (p0[0] + (p3[0] - p0[0]) * 2 / 3), nj.inY ?? (p0[1] + (p3[1] - p0[1]) * 2 / 3)];
    }
    segs.push({
      P0: p0,
      P1: p1,
      P2: p2,
      P3: p3,
      isLine,
      startSharp: fi ? false : !!ni.sharp,
      endSharp: fj ? false : !!nj.sharp,
      _fromNode: i,
      _toNode: j
    });
  }
  return segs;
}

function ndEvalCubic(P0, P1, P2, P3, t) {
  const mt = 1 - t;
  const c0 = mt * mt * mt;
  const c1 = 3 * mt * mt * t;
  const c2 = 3 * mt * t * t;
  const c3 = t * t * t;
  return [
    c0 * P0[0] + c1 * P1[0] + c2 * P2[0] + c3 * P3[0],
    c0 * P0[1] + c1 * P1[1] + c2 * P2[1] + c3 * P3[1]
  ];
}

function ndSplitCubic(P0, P1, P2, P3, t) {
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const Q0 = lerp(P0, P1, t);
  const Q1 = lerp(P1, P2, t);
  const Q2 = lerp(P2, P3, t);
  const R0 = lerp(Q0, Q1, t);
  const R1 = lerp(Q1, Q2, t);
  const S = lerp(R0, R1, t);
  return { Q0, Q2, R0, R1, S };
}

function ndSampleLoopPts(segs, origSignedArea) {
  const pts = [];
  for (const s of segs) {
    if (s.isLine) {
      pts.push([s.P0[0], s.P0[1]]);
    } else {
      const steps = 6;
      for (let k = 0; k < steps; k++) {
        pts.push(ndEvalCubic(s.P0, s.P1, s.P2, s.P3, k / steps));
      }
    }
  }
  return pts;
}

function ndBuildRegsFromEdLoops(origRegs, edLoops, topoMeta = null) {
  if (!origRegs) return [];
  const byKey = new Map();
  const twinUpdateByKey = new Map();

  for (const el of edLoops) {
    const k = el.id || (el.rIdx + ':' + el.lIdx);
    byKey.set(k, el);
    if (el.twinKeys && el.twinKeys.length && el.dirty) {
      for (const tk of el.twinKeys) twinUpdateByKey.set(tk, el);
    }
  }

  const skipInEditor = (topoMeta && topoMeta.skipInEditor) ? topoMeta.skipInEditor : new Set();
  const initTwinMap = (topoMeta && topoMeta.twinMap) ? topoMeta.twinMap : new Map();
  const coveredHoles = (topoMeta && topoMeta.coveredHoles) ? topoMeta.coveredHoles : new Set();
  const promotedOuters = (topoMeta && topoMeta.promotedOuters) ? topoMeta.promotedOuters : new Set();

  const deletedTwinKeys = new Set();
  initTwinMap.forEach((twins, primaryKey) => {
    if (!skipInEditor.has(primaryKey) && !byKey.has(primaryKey)) {
      for (const tk of twins) deletedTwinKeys.add(tk);
    }
  });

  return origRegs.map((rg, rIdx) => {
    const origLoops = (rg && rg.loops) || [];
    const nextLoops = origLoops.map((lp, lIdx) => {
      if (!lp) return null;
      const key = rIdx + ':' + lIdx;
      const isCovered = coveredHoles.has(key) || !!lp._coveredHole;
      const origState = lp._origState || {
        segs: lp.segs, d: lp.d, pts: lp.pts, area: lp.area, signedArea: lp.signedArea
      };

      /* 1. Kontur utama yang ada di edLoops */
      const el = byKey.get(key);
      if (el) {
        if (!el.dirty) {
          return {
            ...lp,
            _origState: origState,
            _loopKey: key,
            _coveredHole: isCovered
          };
        }
        const segs = ndNodesToSegs(el.nodes);
        if (!segs.length) return null;
        const d = VMT.segsToD(segs, true);
        const pts = ndSampleLoopPts(segs, lp.signedArea);
        const rawSigned = pts.length >= 3 ? VMT.signedPolyArea(pts) : lp.signedArea;
        const absArea = Math.abs(rawSigned) || lp.area;
        const wasHole = (typeof lp.signedArea === 'number' ? lp.signedArea > 0 : false) && !promotedOuters.has(key);
        const signedArea = wasHole ? absArea : -absArea;
        const gx = (el.gradOffset && el.gradOffset[0]) || 0;
        const gy = (el.gradOffset && el.gradOffset[1]) || 0;
        const baseGrad = (origState && origState.grad) !== undefined ? origState.grad : lp.grad;
        const shiftedGrad = (baseGrad && (Math.abs(gx) > 1e-3 || Math.abs(gy) > 1e-3))
          ? (baseGrad.type === 'radial'
              ? { ...baseGrad, cx: (baseGrad.cx || 0) + gx, cy: (baseGrad.cy || 0) + gy, ...(baseGrad.fx != null ? { fx: baseGrad.fx + gx, fy: (baseGrad.fy || 0) + gy } : {}) }
              : { ...baseGrad, x1: (baseGrad.x1 || 0) + gx, y1: (baseGrad.y1 || 0) + gy, x2: (baseGrad.x2 || 0) + gx, y2: (baseGrad.y2 || 0) + gy })
          : baseGrad;
        return {
          ...lp,
          _origState: { ...origState, grad: baseGrad },
          _loopKey: key,
          _coveredHole: isCovered,
          _editorDirty: true,
          _editorGradOffset: [gx, gy],
          grad: shiftedGrad,
          segs,
          d,
          pts: pts.length >= 3 ? pts : lp.pts,
          area: absArea,
          signedArea,
          _editorNodes: el.nodes.map(n => ({ ...n }))
        };
      }

      /* 2. Kontur yang tadinya aktif di edLoops (atau twin-nya) namun dihapus pengguna */
      if (!skipInEditor.has(key) || deletedTwinKeys.has(key)) {
        return null;
      }

      /* 3. Kontur twin (pasangan batas bersama) dari kontur yang diedit */
      const twinSource = twinUpdateByKey.get(key);
      if (twinSource) {
        const srcSegs = ndNodesToSegs(twinSource.nodes);
        if (!srcSegs.length) return null;
        const revSegs = VMT.reverseBezierSegs(srcSegs);
        const revD = VMT.segsToD(revSegs, true);
        const srcPts = ndSampleLoopPts(srcSegs, twinSource.signedArea);
        const revPts = srcPts.slice().reverse();
        const rawSigned = revPts.length >= 3 ? VMT.signedPolyArea(revPts) : lp.signedArea;
        const absArea = Math.abs(rawSigned) || lp.area;
        const wasHole = (typeof lp.signedArea === 'number' ? lp.signedArea > 0 : true) && !promotedOuters.has(key);
        const signedArea = wasHole ? absArea : -absArea;
        return {
          ...lp,
          _origState: origState,
          _loopKey: key,
          _coveredHole: isCovered,
          _editorDirty: true,
          segs: revSegs,
          d: revD,
          pts: revPts.length >= 3 ? revPts : lp.pts,
          area: absArea,
          signedArea,
          _editorNodes: ndExtractNodesFromLoop({ segs: revSegs })
        };
      }

      /* 4. Kontur internal / covered hole yang tidak diedit */
      return {
        ...lp,
        _origState: origState,
        _loopKey: key,
        _coveredHole: isCovered
      };
    }).filter(Boolean);

    /* Jika outer loop terhapus dan hanya tersisa hole non-promosi, jangan promosikan hole yatim menjadi bentuk solid */
    if (nextLoops.length && nextLoops.length < origLoops.length &&
        nextLoops.every(l => l.signedArea > 0 && !promotedOuters.has(l._loopKey))) {
      return { ...rg, loops: [] };
    }
    const withOv = nextLoops.map(l => {
      const e = byKey.get(l._loopKey);
      if (!e) return l;
      if (e.colorOv) return { ...l, _colorOv: e.colorOv };
      return l._colorOv ? { ...l, _colorOv: null } : l;
    });
    return { ...rg, loops: withOv };
  });
}

/* Pre-cache per-loop Path2D, segmen, fillet, klasifikasi simpul, dan bounding box untuk NodeEditor agar ribuan node 100% 60fps */
function ndEnsureLoopCache(lp) {
  if (lp._cache && lp._cacheNodesRef === lp.nodes) return lp._cache;
  const nodes = lp.nodes || [];
  const m = nodes.length;
  if (m < 2) {
    const empty = {
      segCount: 0, fillets: [], drawPts: new Float32Array(0),
      sharpPts: new Float32Array(0), smoothPts: new Float32Array(0), roundPts: new Float32Array(0),
      fillP2d: null, lineP2d: null, curveP2d: null, filletP2d: null,
      hasLine: false, hasCurve: false, hasFillet: false,
      minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0
    };
    lp._cache = empty;
    lp._cacheNodesRef = nodes;
    return empty;
  }
  const fillets = new Array(m);
  const drawPts = new Float32Array(m * 2);
  let sharpCnt = 0, smoothCnt = 0, roundCnt = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < m; i++) {
    const nd = nodes[i];
    const hasRad = nd.radius > 0.15;
    const fl = hasRad ? ndComputeNodeFillet(nodes, i) : null;
    fillets[i] = fl;
    const dx = fl ? fl.mid[0] : nd.x;
    const dy = fl ? fl.mid[1] : nd.y;
    drawPts[i * 2] = dx;
    drawPts[i * 2 + 1] = dy;
    if (hasRad) roundCnt++;
    else if (nd.sharp) sharpCnt++;
    else smoothCnt++;
    if (nd.x < minX) minX = nd.x; if (nd.x > maxX) maxX = nd.x;
    if (nd.y < minY) minY = nd.y; if (nd.y > maxY) maxY = nd.y;
    if (dx < minX) minX = dx; if (dx > maxX) maxX = dx;
    if (dy < minY) minY = dy; if (dy > maxY) maxY = dy;
  }

  const sharpPts = new Float32Array(sharpCnt * 2);
  const smoothPts = new Float32Array(smoothCnt * 2);
  const roundPts = new Float32Array(roundCnt * 2);
  let si = 0, smi = 0, ri = 0;
  for (let i = 0; i < m; i++) {
    const nd = nodes[i];
    const dx = drawPts[i * 2], dy = drawPts[i * 2 + 1];
    if (nd.radius > 0.15) { roundPts[ri++] = dx; roundPts[ri++] = dy; }
    else if (nd.sharp) { sharpPts[si++] = dx; sharpPts[si++] = dy; }
    else { smoothPts[smi++] = dx; smoothPts[smi++] = dy; }
  }

  const fillP2d = new Path2D();
  const lineP2d = new Path2D();
  const curveP2d = new Path2D();
  const filletP2d = new Path2D();
  let hasLine = false, hasCurve = false, hasFillet = false, fillStarted = false;

  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const ni = nodes[i], nj = nodes[j];
    const fi = fillets[i], fj = fillets[j];
    if (fi) {
      const f0x = fi.tIn[0], f0y = fi.tIn[1];
      const f1x = fi.c1[0], f1y = fi.c1[1];
      const f2x = fi.c2[0], f2y = fi.c2[1];
      const f3x = fi.tOut[0], f3y = fi.tOut[1];
      filletP2d.moveTo(f0x, f0y);
      filletP2d.bezierCurveTo(f1x, f1y, f2x, f2y, f3x, f3y);
      if (!fillStarted) { fillP2d.moveTo(f0x, f0y); fillStarted = true; }
      else fillP2d.lineTo(f0x, f0y);
      fillP2d.bezierCurveTo(f1x, f1y, f2x, f2y, f3x, f3y);
      hasFillet = true;
    }
    const p0x = fi ? fi.tOut[0] : ni.x;
    const p0y = fi ? fi.tOut[1] : ni.y;
    const p3x = fj ? fj.tIn[0] : nj.x;
    const p3y = fj ? fj.tIn[1] : nj.y;
    const outDx = (ni.outX ?? ni.x) - ni.x, outDy = (ni.outY ?? ni.y) - ni.y;
    const inDx = (nj.inX ?? nj.x) - nj.x, inDy = (nj.inY ?? nj.y) - nj.y;
    const isLine = !!((ni.outLine && nj.inLine) || (outDx * outDx + outDy * outDy < 0.0064 && inDx * inDx + inDy * inDy < 0.0064));
    if (!fillStarted) { fillP2d.moveTo(p0x, p0y); fillStarted = true; }
    if (isLine) {
      lineP2d.moveTo(p0x, p0y);
      lineP2d.lineTo(p3x, p3y);
      fillP2d.lineTo(p3x, p3y);
      hasLine = true;
    } else {
      const p1x = fi ? (p0x + (p3x - p0x) * 0.33) : (ni.outX ?? (p0x + (p3x - p0x) / 3));
      const p1y = fi ? (p0y + (p3y - p0y) * 0.33) : (ni.outY ?? (p0y + (p3y - p0y) / 3));
      const p2x = fj ? (p0x + (p3x - p0x) * 0.67) : (nj.inX ?? (p0x + (p3x - p0x) * 2 / 3));
      const p2y = fj ? (p0y + (p3y - p0y) * 0.67) : (nj.inY ?? (p0y + (p3y - p0y) * 2 / 3));
      if (p1x < minX) minX = p1x; if (p1x > maxX) maxX = p1x;
      if (p1y < minY) minY = p1y; if (p1y > maxY) maxY = p1y;
      if (p2x < minX) minX = p2x; if (p2x > maxX) maxX = p2x;
      if (p2y < minY) minY = p2y; if (p2y > maxY) maxY = p2y;
      curveP2d.moveTo(p0x, p0y);
      curveP2d.bezierCurveTo(p1x, p1y, p2x, p2y, p3x, p3y);
      fillP2d.bezierCurveTo(p1x, p1y, p2x, p2y, p3x, p3y);
      hasCurve = true;
    }
  }
  if (fillStarted) fillP2d.closePath();

  const cache = {
    segCount: m, fillets, drawPts,
    sharpPts, smoothPts, roundPts,
    fillP2d: fillStarted ? fillP2d : null,
    lineP2d, curveP2d, filletP2d,
    hasLine, hasCurve, hasFillet,
    minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8,
    cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5
  };
  lp._cache = cache;
  lp._cacheNodesRef = nodes;
  return cache;
}

/* [PERF-TRANSLATE] Translasi cache kontur secara O(1) via DOMMatrix saat selesai memindahkan objek (tanpa hitung ulang fillet/segmen) */
function ndTranslateLoopCache(baseCache, dx, dy) {
  if (!baseCache || !baseCache.segCount) return null;
  if (!dx && !dy) return baseCache;
  const mat = typeof DOMMatrix !== 'undefined' ? new DOMMatrix([1, 0, 0, 1, dx, dy]) : null;
  if (!mat) return null;
  const trP2d = src => {
    if (!src) return null;
    const p = new Path2D();
    p.addPath(src, mat);
    return p;
  };
  const trPts = src => {
    if (!src || !src.length) return src;
    const out = new Float32Array(src.length);
    for (let i = 0, n = src.length; i < n; i += 2) {
      out[i] = src[i] + dx;
      out[i + 1] = src[i + 1] + dy;
    }
    return out;
  };
  const fillets = baseCache.fillets ? baseCache.fillets.map(fl => fl ? {
    ...fl,
    tIn: [fl.tIn[0] + dx, fl.tIn[1] + dy],
    c1: [fl.c1[0] + dx, fl.c1[1] + dy],
    c2: [fl.c2[0] + dx, fl.c2[1] + dy],
    tOut: [fl.tOut[0] + dx, fl.tOut[1] + dy],
    mid: [fl.mid[0] + dx, fl.mid[1] + dy],
    handleCenter: [fl.handleCenter[0] + dx, fl.handleCenter[1] + dy]
  } : null) : [];
  return {
    segCount: baseCache.segCount,
    fillets,
    drawPts: trPts(baseCache.drawPts),
    sharpPts: trPts(baseCache.sharpPts),
    smoothPts: trPts(baseCache.smoothPts),
    roundPts: trPts(baseCache.roundPts),
    fillP2d: trP2d(baseCache.fillP2d),
    lineP2d: trP2d(baseCache.lineP2d),
    curveP2d: trP2d(baseCache.curveP2d),
    filletP2d: trP2d(baseCache.filletP2d),
    hasLine: baseCache.hasLine,
    hasCurve: baseCache.hasCurve,
    hasFillet: baseCache.hasFillet,
    minX: baseCache.minX + dx,
    minY: baseCache.minY + dy,
    maxX: baseCache.maxX + dx,
    maxY: baseCache.maxY + dy,
    cx: baseCache.cx + dx,
    cy: baseCache.cy + dy
  };
}

/* [PERF-100%] Gabungkan seluruh kontur ke dalam 4x4 Spatial Grid Chunks (tanpa bergantung pada activeLoopIdx)
   menggunakan typed-array copy .set() agar tidak pernah dibangun ulang saat memilih objek/node berbeda! */
function ndBuildInactiveSpatialCache(loops, _unusedActiveIdx, hiddenLabels, W, H) {
  const GRID = 4;
  const cellW = Math.max(1, (W || 800) / GRID);
  const cellH = Math.max(1, (H || 600) / GRID);
  const hidSet = new Set(hiddenLabels || []);
  const rawChunks = Array.from({ length: GRID * GRID }, () => ({
    minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
    lineP2d: new Path2D(), curveP2d: new Path2D(), filletP2d: new Path2D(),
    hasLine: false, hasCurve: false, hasFillet: false,
    sharpList: [], smoothList: [], roundList: [],
    sharpLen: 0, smoothLen: 0, roundLen: 0,
    count: 0
  }));

  for (let lIdx = 0, nLoops = loops.length; lIdx < nLoops; lIdx++) {
    const lp = loops[lIdx];
    if (!lp || lp.hidden || hidSet.has(lp.label)) continue;
    const c = ndEnsureLoopCache(lp);
    if (!c.segCount) continue;
    const gx = Math.max(0, Math.min(GRID - 1, Math.floor(c.cx / cellW)));
    const gy = Math.max(0, Math.min(GRID - 1, Math.floor(c.cy / cellH)));
    const ch = rawChunks[gy * GRID + gx];
    ch.count++;
    if (c.minX < ch.minX) ch.minX = c.minX;
    if (c.minY < ch.minY) ch.minY = c.minY;
    if (c.maxX > ch.maxX) ch.maxX = c.maxX;
    if (c.maxY > ch.maxY) ch.maxY = c.maxY;

    if (c.hasLine) { ch.lineP2d.addPath(c.lineP2d); ch.hasLine = true; }
    if (c.hasCurve) { ch.curveP2d.addPath(c.curveP2d); ch.hasCurve = true; }
    if (c.hasFillet) { ch.filletP2d.addPath(c.filletP2d); ch.hasFillet = true; }

    if (c.sharpPts.length) { ch.sharpList.push(c.sharpPts); ch.sharpLen += c.sharpPts.length; }
    if (c.smoothPts.length) { ch.smoothList.push(c.smoothPts); ch.smoothLen += c.smoothPts.length; }
    if (c.roundPts.length) { ch.roundList.push(c.roundPts); ch.roundLen += c.roundPts.length; }
  }

  const mergeFloat32 = (list, totalLen) => {
    if (!totalLen) return new Float32Array(0);
    if (list.length === 1) return list[0];
    const out = new Float32Array(totalLen);
    let off = 0;
    for (let i = 0; i < list.length; i++) {
      out.set(list[i], off);
      off += list[i].length;
    }
    return out;
  };

  const chunks = [];
  const allSharpList = [], allSmoothList = [], allRoundList = [];
  let allSharpLen = 0, allSmoothLen = 0, allRoundLen = 0;
  for (const ch of rawChunks) {
    if (!ch.count) continue;
    const sp = mergeFloat32(ch.sharpList, ch.sharpLen);
    const smp = mergeFloat32(ch.smoothList, ch.smoothLen);
    const rp = mergeFloat32(ch.roundList, ch.roundLen);
    if (sp.length) { allSharpList.push(sp); allSharpLen += sp.length; }
    if (smp.length) { allSmoothList.push(smp); allSmoothLen += smp.length; }
    if (rp.length) { allRoundList.push(rp); allRoundLen += rp.length; }
    chunks.push({
      minX: ch.minX, minY: ch.minY, maxX: ch.maxX, maxY: ch.maxY,
      lineP2d: ch.lineP2d, curveP2d: ch.curveP2d, filletP2d: ch.filletP2d,
      hasLine: ch.hasLine, hasCurve: ch.hasCurve, hasFillet: ch.hasFillet,
      sharpPts: sp,
      smoothPts: smp,
      roundPts: rp
    });
  }
  return {
    chunks,
    allSharpPts: mergeFloat32(allSharpList, allSharpLen),
    allSmoothPts: mergeFloat32(allSmoothList, allSmoothLen),
    allRoundPts: mergeFloat32(allRoundList, allRoundLen)
  };
}

/* [PERF-SEED-FILL] Bangun daftar path SVG awal SEKALI saat sesi Vector Editor dibuka (langsung memakai cache sess.svg bila tersedia) */
function ndBuildSeedFillLayers(origRegs, edLoops, topoMeta, sess, cfgUsed, W, H) {
  let allPaths = null;
  if (sess && sess.svg) {
    const parsed = parseSvgForCanvas(sess.svg);
    if (parsed && parsed.length && parsed.some(it => it.outerKey)) {
      allPaths = parsed;
    }
  }
  if (!allPaths) {
    const hiddenLabels = (sess && sess.hiddenLabels) || [];
    const stackMode = (sess && sess.stackMode) || (cfgUsed && cfgUsed.stackMode) || 'stack';
    const strokeOn = (sess && sess.stroke != null) ? sess.stroke : (cfgUsed ? cfgUsed.stroke !== false : true);
    const bgOpt = (cfgUsed && (cfgUsed.transparency === 'white' || cfgUsed.transparency === 'custom'))
      ? (cfgUsed.transparency === 'custom' ? (cfgUsed.customColor || '#ffffff') : '#ffffff')
      : 'none';
    const svg = VMT.assembleSVG(origRegs, W, H, {
      stackMode,
      stroke: strokeOn,
      bg: bgOpt,
      safetyBg: hiddenLabels.length === 0 && !(sess && sess.stats && sess.stats.alpha && sess.stats.alpha.hasAlpha),
      hiddenLabels,
      includeLoopKeys: true,
    });
    allPaths = parseSvgForCanvas(svg);
  }
  const origDByKey = new Map();
  const initialLoopKeySet = new Set();
  for (let rIdx = 0; rIdx < (origRegs ? origRegs.length : 0); rIdx++) {
    const loops = (origRegs[rIdx] && origRegs[rIdx].loops) || [];
    for (let lIdx = 0; lIdx < loops.length; lIdx++) {
      const lp = loops[lIdx];
      const k = (lp && lp._loopKey) || (rIdx + ':' + lIdx);
      if (lp && lp.d) origDByKey.set(k, lp.d);
    }
  }
  for (let i = 0; i < edLoops.length; i++) {
    initialLoopKeySet.add(edLoops[i].id);
    if (edLoops[i].twinKeys) {
      for (const tk of edLoops[i].twinKeys) initialLoopKeySet.add(tk);
    }
  }
  return { seedPaths: allPaths, origDByKey, initialLoopKeySet };
}

const NodeEditor = ({
  sess, job, fileName, cfgUsed, onApply, onCancel, onSwitchToSegEdit, onSwitchToTrace, onSwitchToCompare, flash
}) => {
  const W = sess.W || (job && job.w) || 800;
  const H = sess.H || (job && job.h) || 600;
  const topoMeta = atUseMemo(() => {
    const hiddenLabels = sess.hiddenLabels || [];
    const stackMode = sess.stackMode || (cfgUsed && cfgUsed.stackMode) || 'stack';
    return VMT.classifyLoopsForNodeEditor(sess.regs, W, H, {
      stackMode,
      hiddenLabels,
      safetyBg: hiddenLabels.length === 0 && !(sess.stats && sess.stats.alpha && sess.stats.alpha.hasAlpha),
    });
  }, [sess.regs, sess.hiddenLabels, sess.stats, sess.stackMode, cfgUsed, W, H]);

  const [edLoops, setEdLoops] = useState(() => ndCloneLoopsFromRegs(sess.regs, topoMeta));
  const edLoopsRef = useRef(edLoops);
  edLoopsRef.current = edLoops;

  const [tool, setTool] = useState('select'); /* 'select' | 'add' | 'delete' | 'line' | 'radius' | 'sharp' | 'copyrad' | 'pasterad' | 'pan' */
  /* Default seret area kosong langsung menggeser kanvas (pan) agar navigasi jauh lebih mudah! */
  const [emptyDragMode, setEmptyDragMode] = useState('pan'); /* 'pan' | 'marquee' */
  const [activeLoopIdx, setActiveLoopIdxRaw] = useState(0);
  /* [COLOR-PALETTE] true bila pengguna benar-benar memilih sebuah objek (bukan sekadar indeks default 0) */
  const [objPicked, setObjPicked] = useState(false);
  const setActiveLoopIdx = (v) => { setObjPicked(true); setActiveLoopIdxRaw(v); };
  const colorSnapRef = useRef(false);
  const [selNodes, setSelNodes] = useState(() => []); /* array of node indices in activeLoopIdx */
  const [lineFirstNode, setLineFirstNode] = useState(null); /* { loopIdx, nodeIdx } */
  const [removeMidOnLine, setRemoveMidOnLine] = useState(true);
  const [radiusVal, setRadiusVal] = useState(14);
  const [copiedRadius, setCopiedRadius] = useState(14);
  const [hasCopiedRadius, setHasCopiedRadius] = useState(false);
  const [showAllHandles, setShowAllHandles] = useState(false);
  /* [VIS-CTRL] Visibilitas node & handle Bézier: global (semua objek lain) dan khusus objek terpilih */
  const [showNodesAll, setShowNodesAll] = useState(true);
  const [showHandlesAllObj, setShowHandlesAllObj] = useState(false);
  const [showNodesSel, setShowNodesSel] = useState(true);
  const [showHandlesSel, setShowHandlesSel] = useState(true);
  const [showGhost, setShowGhost] = useState(false);
  const [ghostOp, setGhostOp] = useState(30);
  const [showFill, setShowFill] = useState(true);
  const [moveObjScope, setMoveObjScope] = useState('object'); /* 'object' | 'contour' | 'region' */
  const [snapMasterOn, setSnapMasterOn] = useState(true);
  const [snapTolPx, setSnapTolPx] = useState(8);
  const [snapGridSize, setSnapGridSize] = useState(10);
  const [snapConfig, setSnapConfig] = useState(() => ({
    s1_grid: true,
    s2_pixel: true,
    s3_ortho: true,
    s4_nodeAlign: true,
    s5_nodePoint: true,
    s6_segMid: true,
    s7_pathEdge: true,
    s8_angle: true,
    s9_handleTangent: true,
    s10_canvasEdge: true,
    s11_canvasCenter: true,
    s12_objBbox: true,
  }));
  const activeSnapRef = useRef(null);
  const [snapStatusText, setSnapStatusText] = useState('');
  const hitCtxRef = useRef(null);
  const [sideOpen, setSideOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000);
  const wideScr = rvUseWide(1000);
  const open = sideOpen && wideScr;

  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [histCount, setHistCount] = useState({ u: 0, r: 0 });
  const dirtyRef = useRef(false);

  const [bmp, setBmp] = useState(null);
  const [v, pz] = atUsePanZoom();
  const interRef = useRef(false), rafDrawRef = useRef(0), rafHoverRef = useRef(0), wheelT = useRef(0), drawRef = useRef(null);
  const zoomLblRef = useRef(null);
  const vRef = useRef(v);
  if (!interRef.current) vRef.current = v;

  const wrapRef = useRef(null), cvRef = useRef(null);
  const rszTick = rvUseResizeTick(wrapRef);
  const dragRef = useRef(null);
  const hoverRef = useRef(null);
  const marqueeRef = useRef(null);
  const spaceDownRef = useRef(false);
  const touchPtsRef = useRef(new Map());
  const pinchRef = useRef(null);

  /* [PERF-100%] Offscreen Cache 2-Tingkat:
     1) inactiveLayerCacheRef: menyimpan render statis seluruh kontur non-aktif agar drag node/handle/radius/marquee O(1) (0.1 ms)
     2) panOverscanCacheRef: menyimpan render overscan (+320px di 4 sisi) pada resolusi z & dpr penuh agar pan/geser kanvas 100% instan O(1) tanpa blur & tanpa node berkedip */
  const inactiveLayerCacheRef = useRef({ cv: null, cv2: null, key: '' });
  const panOverscanCacheRef = useRef({ cv: null, key: '', ox: 0, oy: 0, z: 1, dpr: 1, cw: 0, ch: 0 });
  const sceneVerRef = useRef(1);

  /* [PERF-COLOR-FIX] Pisahkan perubahan geometri (node/posisi/visibilitas) dari perubahan warna (colorOv)
     agar mengganti warna objek dengan ribuan node berjalan O(1) (< 0.1 ms) tanpa membangun ulang spatial cache / Path2D! */
  const geomTrackRef = useRef({ loops: edLoops, ver: 1, geomLoops: edLoops });
  const edGeomVer = atUseMemo(() => {
    sceneVerRef.current++;
    const prev = geomTrackRef.current.loops;
    let geomChanged = prev.length !== edLoops.length;
    if (!geomChanged) {
      for (let i = 0, n = edLoops.length; i < n; i++) {
        const a = prev[i], b = edLoops[i];
        if (!a || !b || a.id !== b.id || a.nodes !== b.nodes || a.hidden !== b.hidden || a.gradOffset !== b.gradOffset || a.dirty !== b.dirty) {
          geomChanged = true;
          break;
        }
      }
    }
    if (geomChanged) {
      geomTrackRef.current = { loops: edLoops, ver: geomTrackRef.current.ver + 1, geomLoops: edLoops };
    } else {
      geomTrackRef.current.loops = edLoops;
    }
    return geomTrackRef.current.ver;
  }, [edLoops]);

  const totalNodesCount = atUseMemo(() => {
    let cnt = 0;
    const gl = geomTrackRef.current.geomLoops;
    for (const lp of gl) cnt += (lp.nodes ? lp.nodes.length : 0);
    return cnt;
  }, [edGeomVer]);

  const inactiveSpatialCache = atUseMemo(
    () => ndBuildInactiveSpatialCache(geomTrackRef.current.geomLoops, -1, sess.hiddenLabels, W, H),
    [edGeomVer, sess.hiddenLabels, W, H]
  );
  const spatialCacheRef = useRef({ loops: geomTrackRef.current.geomLoops, hidden: sess.hiddenLabels, cache: inactiveSpatialCache });
  spatialCacheRef.current = { loops: geomTrackRef.current.geomLoops, hidden: sess.hiddenLabels, cache: inactiveSpatialCache };
  const getLiveSpatialCache = () => {
    const curLoops = edLoopsRef.current;
    const sc = spatialCacheRef.current;
    if (sc && sc.loops === curLoops && sc.hidden === sess.hiddenLabels && sc.cache) return sc.cache;
    const built = ndBuildInactiveSpatialCache(curLoops, -1, sess.hiddenLabels, W, H);
    spatialCacheRef.current = { loops: curLoops, hidden: sess.hiddenLabels, cache: built };
    return built;
  };

  const seedFillLayers = atUseMemo(
    () => ndBuildSeedFillLayers(sess.regs, edLoops, topoMeta, sess, cfgUsed, W, H),
    [sess.regs, sess.svg, sess.hiddenLabels, sess.stackMode, sess.stroke, topoMeta, cfgUsed, W, H]
  );

  /* Incremental O(K) Path2D & Color/Gradient/Opacity update — TIDAK PERNAH memanggil VMT.assembleSVG saat menggeser objek/node! */
  const pathGeomCacheRef = useRef(new WeakMap());
  const assembledFillLayers = atUseMemo(() => {
    if (!showFill || !seedFillLayers.seedPaths.length) {
      return { allPaths: [], belowPaths: [], activePaths: [], abovePaths: [], loopByKey: new Map(), origDByKey: seedFillLayers.origDByKey };
    }
    const { seedPaths, origDByKey, initialLoopKeySet } = seedFillLayers;
    const loopByKey = new Map();
    let anyDirty = false;
    let anyColorOv = false;
    for (let i = 0, n = edLoops.length; i < n; i++) {
      const lp = edLoops[i];
      if (lp.dirty) anyDirty = true;
      if (lp.colorOv) anyColorOv = true;
      loopByKey.set(lp.id, lp);
      if (lp.twinKeys) {
        for (const tk of lp.twinKeys) loopByKey.set(tk, lp);
      }
    }
    const anyDeleted = edLoops.length < initialLoopKeySet.size;
    let allPaths = seedPaths;

    if (anyDirty || anyColorOv || anyDeleted) {
      const updated = [];
      for (let pi = 0, pn = seedPaths.length; pi < pn; pi++) {
        let it = seedPaths[pi];
        const oKey = it.outerKey;
        if (oKey && initialLoopKeySet.has(oKey) && !loopByKey.has(oKey)) {
          continue; /* Objek/kontur ini telah dihapus pengguna */
        }
        const olp = oKey ? loopByKey.get(oKey) : null;
        const hKeys = it.holeKeys || [];
        let geomDirty = !!(olp && olp.dirty);
        let holeDeleted = false;
        if (!geomDirty && hKeys.length) {
          for (let hi = 0; hi < hKeys.length; hi++) {
            const hk = hKeys[hi];
            const hlp = loopByKey.get(hk);
            if (hlp && hlp.dirty) { geomDirty = true; break; }
            if (initialLoopKeySet.has(hk) && !hlp) { holeDeleted = true; break; }
          }
        }
        if (geomDirty || holeDeleted) {
          const liveP2d = new Path2D();
          let hasSub = false;
          if (oKey) {
            if (olp) {
              const oc = ndEnsureLoopCache(olp);
              if (oc && oc.fillP2d) { liveP2d.addPath(oc.fillP2d); hasSub = true; }
            } else if (origDByKey.has(oKey)) {
              liveP2d.addPath(getCachedPath2D(origDByKey.get(oKey)));
              hasSub = true;
            }
          }
          for (let hi = 0; hi < hKeys.length; hi++) {
            const hk = hKeys[hi];
            const hlp = loopByKey.get(hk);
            if (hlp) {
              const hc = ndEnsureLoopCache(hlp);
              if (hc && hc.fillP2d) { liveP2d.addPath(hc.fillP2d); hasSub = true; }
            } else if (!initialLoopKeySet.has(hk) && origDByKey.has(hk)) {
              liveP2d.addPath(getCachedPath2D(origDByKey.get(hk)));
              hasSub = true;
            }
          }
          if (hasSub) {
            let nextFillGrad = it.fillGrad;
            if (olp && olp.gradOffset && it.fillGrad && (olp.gradOffset[0] || olp.gradOffset[1])) {
              const gx = olp.gradOffset[0] || 0, gy = olp.gradOffset[1] || 0;
              nextFillGrad = it.fillGrad.type === 'radial'
                ? { ...it.fillGrad, cx: (it.fillGrad.cx || 0) + gx, cy: (it.fillGrad.cy || 0) + gy, ...(it.fillGrad.fx != null ? { fx: it.fillGrad.fx + gx, fy: (it.fillGrad.fy || 0) + gy } : {}) }
                : { ...it.fillGrad, x1: (it.fillGrad.x1 || 0) + gx, y1: (it.fillGrad.y1 || 0) + gy, x2: (it.fillGrad.x2 || 0) + gx, y2: (it.fillGrad.y2 || 0) + gy };
            }
            it = { ...it, p2d: liveP2d, fillGrad: nextFillGrad };
          }
        }
        if (anyColorOv && olp && olp.colorOv) {
          const baseCol = it._baseColor || it.fill;
          const baseGrad = it._baseGrad !== undefined ? it._baseGrad : it.fillGrad;
          const applied = VMT._applyColorOvToComp(baseCol, baseGrad, olp.colorOv, it.opacity ?? 1);
          const oc = ndEnsureLoopCache(olp);
          const compBb = oc && oc.segCount ? [oc.minX + 8, oc.minY + 8, oc.maxX - 8, oc.maxY - 8] : [0, 0, W, H];
          const resolvedGrad = applied.grad ? VMT.resolveGradCoordsForBbox(applied.grad, compBb, W, H) : null;
          let nextGradDesc = resolvedGrad ? VMT._buildCanvasGradDesc(resolvedGrad, applied.color) : null;
          if (nextGradDesc && !applied.grad?.userCreated && olp.gradOffset && (olp.gradOffset[0] || olp.gradOffset[1])) {
            const gx = olp.gradOffset[0] || 0, gy = olp.gradOffset[1] || 0;
            nextGradDesc = nextGradDesc.type === 'radial'
              ? { ...nextGradDesc, cx: (nextGradDesc.cx || 0) + gx, cy: (nextGradDesc.cy || 0) + gy, ...(nextGradDesc.fx != null ? { fx: nextGradDesc.fx + gx, fy: (nextGradDesc.fy || 0) + gy } : {}) }
              : { ...nextGradDesc, x1: (nextGradDesc.x1 || 0) + gx, y1: (nextGradDesc.y1 || 0) + gy, x2: (nextGradDesc.x2 || 0) + gx, y2: (nextGradDesc.y2 || 0) + gy };
          }
          const nextFill = nextGradDesc ? applied.color : applied.color;
          const hasSt = it.stroke && it.stroke !== 'none' && it.strokeWidth > 0;
          it = {
            ...it,
            fill: nextFill,
            fillGrad: nextGradDesc,
            stroke: hasSt ? nextFill : 'none',
            strokeGrad: hasSt ? nextGradDesc : null,
            opacity: applied.opacity ?? (it.opacity ?? 1)
          };
        }
        updated.push(it);
      }
      allPaths = updated;
    }

    return {
      allPaths,
      belowPaths: allPaths,
      activePaths: [],
      abovePaths: [],
      loopByKey,
      origDByKey
    };
  }, [seedFillLayers, edLoops, showFill, W, H]);

  /* [COLOR-PALETTE] Objek terpilih -> mendukung Solid, Linear Gradient, Radial Gradient, dan Transparansi */
  const colorTarget = (() => {
    if (!objPicked) return null;
    let idx = activeLoopIdx;
    const sel = edLoops[idx];
    if (!sel) return null;
    const origRg = sess.regs && sess.regs[sel.rIdx];
    if (!origRg) return null;
    /* Kontur lubang (hole) tidak punya warna sendiri -> pakai kontur luar yang melingkupinya */
    if (typeof sel.signedArea === 'number' && sel.signedArea > 0) {
      const outerKeyMap = topoMeta && topoMeta.outerKeyByHole;
      const parentOuterKey = outerKeyMap && sel.id ? outerKeyMap.get(sel.id) : null;
      if (parentOuterKey) {
        const pIdx = edLoops.findIndex(o => o.id === parentOuterKey);
        if (pIdx >= 0) idx = pIdx;
      } else {
        const hp = (origRg.loops && origRg.loops[sel.lIdx] && origRg.loops[sel.lIdx].pts) || [];
        const probe = hp.length ? hp[0] : null;
        let best = -1, bestArea = Infinity;
        if (probe) {
          for (let i = 0; i < edLoops.length; i++) {
            const o = edLoops[i];
            if (o.rIdx !== sel.rIdx || o === sel || !(o.signedArea <= 0)) continue;
            const op = (origRg.loops[o.lIdx] && origRg.loops[o.lIdx].pts) || [];
            let inside = false;
            for (let a = 0, b = op.length - 1; a < op.length; b = a++) {
              const xi = op[a][0], yi = op[a][1], xj = op[b][0], yj = op[b][1];
              if (((yi > probe[1]) !== (yj > probe[1])) && (probe[0] < (xj - xi) * (probe[1] - yi) / (yj - yi || 1e-9) + xi)) inside = !inside;
            }
            const ar = Math.abs(o.area || 0);
            if (inside && ar < bestArea) { best = i; bestArea = ar; }
          }
        }
        if (best >= 0) idx = best;
      }
    }
    const el = edLoops[idx];
    const baseLoop = origRg.loops && origRg.loops[el.lIdx];
    const origGrad = (baseLoop && baseLoop.grad) || origRg.grad || null;
    const origColor = _hexNormC((origGrad && origGrad.base) ? origGrad.base : origRg.color) || '#6366f1';
    const origOpacity = (baseLoop && baseLoop.opacity != null) ? baseLoop.opacity : (origRg.opacity != null ? origRg.opacity : 1);
    const applied = VMT._applyColorOvToComp(origColor, origGrad, el.colorOv, origOpacity);
    const curGrad = applied.grad;
    const curColor = _hexNormC(applied.color) || origColor;
    const curOpacity = applied.opacity != null ? applied.opacity : 1;
    const raw = [];
    if (curGrad && curGrad.stops && curGrad.stops.length) {
      for (const st of curGrad.stops) raw.push(st.color);
    } else {
      raw.push(curColor);
    }
    const seen = new Set(), entries = [];
    for (const c of raw) {
      const k = _hexNormC(c);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      entries.push({ orig: origColor, cur: k });
    }
    if (!entries.length) entries.push({ orig: origColor, cur: curColor });
    return {
      idx,
      label: origRg.label,
      origColor,
      origGrad,
      origOpacity,
      curColor,
      curGrad,
      curOpacity,
      isGrad: !!(curGrad && curGrad.stops && curGrad.stops.length >= 2),
      entries,
      hasOv: !!el.colorOv
    };
  })();

  const setObjColor = (loopIdx, origKey, newHex) => {
    const nh = _hexNormC(newHex);
    if (!nh) return;
    if (!colorSnapRef.current) { snapshot(loopIdx); colorSnapRef.current = true; }
    dirtyRef.current = true;
    setEdLoops(prev => prev.map((el, i) => {
      if (i !== loopIdx) return el;
      const ov = { ...(el.colorOv || {}) };
      delete ov.__grad;
      ov.__solid = true;
      ov[origKey] = nh;
      return { ...el, colorOv: ov };
    }));
  };
  const setObjGrad = (loopIdx, origKey, newGrad, midHex) => {
    if (!colorSnapRef.current) { snapshot(loopIdx); colorSnapRef.current = true; }
    dirtyRef.current = true;
    setEdLoops(prev => prev.map((el, i) => {
      if (i !== loopIdx) return el;
      const ov = { ...(el.colorOv || {}) };
      if (!newGrad || !newGrad.stops || newGrad.stops.length < 2) {
        delete ov.__grad;
        ov.__solid = true;
        if (midHex) ov[origKey] = _hexNormC(midHex) || origKey;
      } else {
        delete ov.__solid;
        ov.__grad = { ...newGrad, userCreated: true, stops: newGrad.stops.map(s => ({ ...s })) };
        if (midHex) ov[origKey] = _hexNormC(midHex) || origKey;
      }
      return { ...el, colorOv: ov };
    }));
  };
  const setObjOpacity = (loopIdx, nextOp) => {
    if (!colorSnapRef.current) { snapshot(loopIdx); colorSnapRef.current = true; }
    dirtyRef.current = true;
    const clOp = VMT.clamp(nextOp == null ? 1 : +nextOp, 0, 1);
    setEdLoops(prev => prev.map((el, i) => {
      if (i !== loopIdx) return el;
      const ov = { ...(el.colorOv || {}), __opacity: clOp };
      return { ...el, colorOv: ov };
    }));
  };
  const resetObjColors = (loopIdx) => {
    snapshot(loopIdx);
    colorSnapRef.current = false;
    dirtyRef.current = true;
    setEdLoops(prev => prev.map((el, i) => i === loopIdx ? { ...el, colorOv: null } : el));
    flash('Warna & transparansi objek dikembalikan ke asli');
  };

  /* [PERF] Jadwalkan 1x redraw kanvas per frame (60fps) tanpa memicu re-render React saat pan/zoom/hover/drag */
  const scheduleDraw = () => {
    if (rafDrawRef.current) return;
    rafDrawRef.current = requestAnimationFrame(() => {
      rafDrawRef.current = 0;
      if (zoomLblRef.current) zoomLblRef.current.textContent = Math.round(vRef.current.z * 100) + '%';
      if (drawRef.current) drawRef.current();
    });
  };

  /* Render instan sinkron (0ms input lag) khusus saat drag objek/node/handle agar 100% real-time mengikuti kursor */
  const drawNow = () => {
    if (rafDrawRef.current) {
      cancelAnimationFrame(rafDrawRef.current);
      rafDrawRef.current = 0;
    }
    if (drawRef.current) drawRef.current();
  };

  /* Geser kanvas secara instan (untuk tombol D-Pad & keyboard pan) */
  const panByStep = (dx, dy) => {
    const nextV = { ...vRef.current, tx: vRef.current.tx + dx, ty: vRef.current.ty + dy };
    vRef.current = nextV;
    pz.set(nextV);
    scheduleDraw();
  };

  rvUseBodyFlag();

  useEffect(() => {
    if (!job || !job.url) return;
    let on = true;
    const im = new Image();
    im.onload = () => { if (on) setBmp(im); };
    im.src = job.url;
    return () => { on = false; };
  }, [job && job.url]);

  useEffect(() => () => {
    if (rafDrawRef.current) cancelAnimationFrame(rafDrawRef.current);
    if (rafHoverRef.current) cancelAnimationFrame(rafHoverRef.current);
  }, []);

  /* Copy-On-Write Snapshot: mempertahankan referensi & _cache untuk kontur yang tidak diubah */
  const cloneLoopsCOW = (srcLoops, targetLoopIdx = null) => {
    const isSet = targetLoopIdx instanceof Set;
    const isArr = Array.isArray(targetLoopIdx);
    const tSet = isSet ? targetLoopIdx : isArr ? new Set(targetLoopIdx) : null;
    return srcLoops.map((lp, idx) => {
      if (tSet ? !tSet.has(idx) : (targetLoopIdx != null && idx !== targetLoopIdx)) return lp;
      return {
        ...lp,
        _cache: lp._cache || null,
        _cacheNodesRef: null,
        nodes: lp.nodes.map(n => ({ ...n }))
      };
    });
  };

  const snapshot = (targetLoopIdx = null) => {
    const snap = cloneLoopsCOW(edLoopsRef.current, targetLoopIdx);
    undoStack.current.push({ loops: snap, activeLoopIdx, selNodes: selNodes.slice() });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current.length = 0;
    dirtyRef.current = true;
    setHistCount({ u: undoStack.current.length, r: 0 });
  };

  const pushSnapshotFromPreDrag = (preDragLoop, loopIdx, prevActiveLoopIdx, prevSelNodes) => {
    const snap = edLoopsRef.current.map((lp, idx) => idx === loopIdx ? preDragLoop : lp);
    undoStack.current.push({ loops: snap, activeLoopIdx: prevActiveLoopIdx, selNodes: prevSelNodes });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current.length = 0;
    dirtyRef.current = true;
    setHistCount({ u: undoStack.current.length, r: 0 });
  };

  const undo = () => {
    if (!undoStack.current.length) return;
    const curSnap = cloneLoopsCOW(edLoopsRef.current, null);
    redoStack.current.push({ loops: curSnap, activeLoopIdx, selNodes: selNodes.slice() });
    const prev = undoStack.current.pop();
    setEdLoops(prev.loops);
    setActiveLoopIdx(prev.activeLoopIdx);
    setSelNodes(prev.selNodes);
    setHistCount({ u: undoStack.current.length, r: redoStack.current.length });
    flash('Undo perubahan node');
  };

  const redo = () => {
    if (!redoStack.current.length) return;
    const curSnap = cloneLoopsCOW(edLoopsRef.current, null);
    undoStack.current.push({ loops: curSnap, activeLoopIdx, selNodes: selNodes.slice() });
    const nxt = redoStack.current.pop();
    setEdLoops(nxt.loops);
    setActiveLoopIdx(nxt.activeLoopIdx);
    setSelNodes(nxt.selNodes);
    setHistCount({ u: undoStack.current.length, r: redoStack.current.length });
    flash('Redo perubahan node');
  };

  const revertAll = () => {
    snapshot();
    const baseRegs = sess.origRegs || sess.regs;
    const fresh = baseRegs.map(rg => ({
      ...rg,
      loops: (rg.loops || []).map(lp => {
        const orig = lp._origState || lp;
        return {
          ...lp,
          segs: orig.segs,
          d: orig.d,
          pts: orig.pts,
          area: orig.area,
          signedArea: orig.signedArea,
          _editorNodes: null,
          _editorDirty: false,
          _colorOv: null
        };
      })
    }));
    const freshMeta = VMT.classifyLoopsForNodeEditor(fresh, W, H, {
      stackMode: sess.stackMode || (cfgUsed && cfgUsed.stackMode) || 'stack',
      hiddenLabels: sess.hiddenLabels || [],
      safetyBg: (sess.hiddenLabels || []).length === 0 && !(sess.stats && sess.stats.alpha && sess.stats.alpha.hasAlpha),
    });
    setEdLoops(ndCloneLoopsFromRegs(fresh, freshMeta));
    setActiveLoopIdxRaw(0);
    setObjPicked(false);
    setSelNodes([]);
    setLineFirstNode(null);
    dirtyRef.current = true;
    flash('Seluruh node dikembalikan ke hasil trace awal');
  };

  /* Wheel zoom & Trackpad 2-finger pan/pinch tanpa memicu re-render React setiap tick */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const wh = e => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), cur = vRef.current;
      const pad = { t: 64, r: open ? 352 : 0, b: 96, l: 0 };
      const sf = rvSafe(el, pad);
      /* Jika Shift ditekan saat scroll atau ada deltaX signifikan pada trackpad tanpa ctrlKey, dukung pan halus */
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.8 && Math.abs(e.deltaX) > 2) {
        vRef.current = { ...cur, tx: cur.tx - e.deltaX, ty: cur.ty - e.deltaY };
      } else {
        let d = e.deltaY;
        if (e.deltaMode === 1) d *= 16;
        const dx = (e.clientX - r.left) - sf.cx;
        const dy = (e.clientY - r.top) - sf.cy;
        const nz = VMT.clamp(cur.z * Math.exp(-VMT.clamp(d, -240, 240) * 0.0018), 0.1, 60);
        const k = nz / cur.z;
        vRef.current = { z: nz, tx: dx - (dx - cur.tx) * k, ty: dy - (dy - cur.ty) * k };
      }
      interRef.current = true;
      scheduleDraw();
      clearTimeout(wheelT.current);
      wheelT.current = setTimeout(() => { wheelT.current = 0; interRef.current = false; pz.set(vRef.current); }, 140);
    };
    el.addEventListener('wheel', wh, { passive: false });
    return () => el.removeEventListener('wheel', wh);
  }, [open]);

  const getTransform = () => {
    const wrap = wrapRef.current;
    if (!wrap) return { z: 1, ox: 0, oy: 0, cw: 800, ch: 600 };
    const vCur = vRef.current;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const pad = { t: 64, r: open ? 352 : 0, b: 96, l: 0 };
    const sf = rvSafe(wrap, pad);
    const fit = Math.min(sf.aw / W, sf.ah / H) * 0.92;
    const z = fit * vCur.z;
    const ox = sf.cx + vCur.tx - (W * z) / 2;
    const oy = sf.cy + vCur.ty - (H * z) / 2;
    return { z, ox, oy, cw, ch };
  };

  const screenToDoc = (clientX, clientY) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0, sx: 0, sy: 0, z: 1 };
    const r = wrap.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    const { z, ox, oy } = getTransform();
    return { x: (sx - ox) / z, y: (sy - oy) / z, sx, sy, z, ox, oy };
  };

  /* ---- Operasi Inti Edit Node ---- */
  const deleteSelectedNodes = (targetLoopIdx = activeLoopIdx, targetIndices = selNodes) => {
    const lp = edLoopsRef.current[targetLoopIdx];
    if (!lp || !targetIndices.length) {
      flash('Pilih minimal 1 node terlebih dahulu');
      return;
    }
    targetIndices = Array.from(new Set(targetIndices)).filter(i => i >= 0 && i < lp.nodes.length);
    if (!targetIndices.length) return;
    const delSet = new Set(targetIndices);
    const remNodes = lp.nodes.filter((_, idx) => !delSet.has(idx));
    const remAllLine = remNodes.length === 2 && remNodes.every(n => n.inLine && n.outLine);
    if (remNodes.length < 2 || remAllLine) {
      /* Sisa node tidak cukup membentuk kontur tertutup berluas -> hapus seluruh kontur ini
         (bisa dibatalkan dengan Undo). Dengan begitu node apa pun selalu bisa dihapus. */
      snapshot();
      const remain = edLoopsRef.current.length - 1;
      setEdLoops(prev => prev.filter((_, idx) => idx !== targetLoopIdx));
      setActiveLoopIdx(Math.max(0, Math.min(targetLoopIdx, remain - 1)));
      setSelNodes([]);
      setLineFirstNode(null);
      flash('Node dihapus — kontur ikut dihapus karena sisa node tidak cukup membentuk bangun tertutup (Undo untuk membatalkan)');
      return;
    }
    snapshot();
    const nextNodes = remNodes.map(n => ({ ...n }));
    const m = nextNodes.length;
    for (let i = 0; i < m; i++) {
      const ni = nextNodes[i];
      const nj = nextNodes[(i + 1) % m];
      if (ni.outLine && nj.inLine) {
        ni.outX = ni.x; ni.outY = ni.y;
        nj.inX = nj.x; nj.inY = nj.y;
      }
    }
    setEdLoops(prev => prev.map((item, idx) => idx === targetLoopIdx ? { ...item, dirty: true, _cache: null, nodes: nextNodes } : item));
    setSelNodes([]);
    flash(`${targetIndices.length} node dihapus`);
  };

  const insertNodeOnSegment = (loopIdx, fromNodeIdx, tParam = 0.5) => {
    const lp = edLoopsRef.current[loopIdx];
    if (!lp || lp.nodes.length < 2) return;
    snapshot();
    const nodes = lp.nodes.map(n => ({ ...n }));
    const m = nodes.length;
    const i = ((fromNodeIdx % m) + m) % m;
    const j = (i + 1) % m;
    const ni = nodes[i], nj = nodes[j];
    const t = VMT.clamp(tParam, 0.1, 0.9);
    const isLine = !!((ni.outLine && nj.inLine) || (Math.hypot((ni.outX ?? ni.x) - ni.x, (ni.outY ?? ni.y) - ni.y) < 0.08 && Math.hypot((nj.inX ?? nj.x) - nj.x, (nj.inY ?? nj.y) - nj.y) < 0.08));
    let newNode;
    if (isLine) {
      const nx = ni.x + (nj.x - ni.x) * t;
      const ny = ni.y + (nj.y - ni.y) * t;
      newNode = {
        x: nx, y: ny,
        inX: nx, inY: ny,
        outX: nx, outY: ny,
        inLine: true, outLine: true,
        sharp: true, handleMode: 'corner', radius: 0
      };
    } else {
      const P0 = [ni.x, ni.y];
      const P1 = [ni.outX ?? (ni.x + (nj.x - ni.x) / 3), ni.outY ?? (ni.y + (nj.y - ni.y) / 3)];
      const P2 = [nj.inX ?? (ni.x + (nj.x - ni.x) * 2 / 3), nj.inY ?? (ni.y + (nj.y - ni.y) * 2 / 3)];
      const P3 = [nj.x, nj.y];
      const sp = ndSplitCubic(P0, P1, P2, P3, t);
      ni.outX = sp.Q0[0]; ni.outY = sp.Q0[1]; ni.outLine = false;
      nj.inX = sp.Q2[0]; nj.inY = sp.Q2[1]; nj.inLine = false;
      newNode = {
        x: sp.S[0], y: sp.S[1],
        inX: sp.R0[0], inY: sp.R0[1],
        outX: sp.R1[0], outY: sp.R1[1],
        inLine: false, outLine: false,
        sharp: false, handleMode: 'smooth', radius: 0
      };
    }
    nodes.splice(i + 1, 0, newNode);
    setEdLoops(prev => prev.map((item, idx) => idx === loopIdx ? { ...item, dirty: true, _cache: null, nodes } : item));
    setActiveLoopIdx(loopIdx);
    setSelNodes([i + 1]);
    flash('Node baru ditambahkan pada segmen');
  };

  const addNodeFromSelection = () => {
    const lp = edLoopsRef.current[activeLoopIdx];
    if (!lp || lp.nodes.length < 2) return;
    const m = lp.nodes.length;
    if (selNodes.length === 2) {
      const [a, b] = selNodes;
      if ((a + 1) % m === b) { insertNodeOnSegment(activeLoopIdx, a, 0.5); return; }
      if ((b + 1) % m === a) { insertNodeOnSegment(activeLoopIdx, b, 0.5); return; }
    }
    const targetIdx = selNodes.length >= 1 ? selNodes[0] : 0;
    insertNodeOnSegment(activeLoopIdx, targetIdx, 0.5);
  };

  /* Luruskan 2 node yang dipilih menjadi garis lurus */
  const straightenTwoNodes = (loopIdx = activeLoopIdx, idxA = selNodes[0], idxB = selNodes[1], alignAxis = null) => {
    const lp = edLoopsRef.current[loopIdx];
    if (!lp || idxA == null || idxB == null || idxA === idxB) {
      flash('Pilih 2 node pada kontur yang sama untuk diluruskan');
      return;
    }
    snapshot();
    let nodes = lp.nodes.map(n => ({ ...n }));
    const m = nodes.length;
    let a = ((idxA % m) + m) % m;
    let b = ((idxB % m) + m) % m;

    if (alignAxis === 'h') {
      const avgY = (nodes[a].y + nodes[b].y) * 0.5;
      const dyA = avgY - nodes[a].y, dyB = avgY - nodes[b].y;
      nodes[a].y = avgY; nodes[a].inY += dyA; nodes[a].outY += dyA;
      nodes[b].y = avgY; nodes[b].inY += dyB; nodes[b].outY += dyB;
    } else if (alignAxis === 'v') {
      const avgX = (nodes[a].x + nodes[b].x) * 0.5;
      const dxA = avgX - nodes[a].x, dxB = avgX - nodes[b].x;
      nodes[a].x = avgX; nodes[a].inX += dxA; nodes[a].outX += dxA;
      nodes[b].x = avgX; nodes[b].inX += dxB; nodes[b].outX += dxB;
    }

    const fwdDist = (b - a + m) % m;
    const bwdDist = (a - b + m) % m;
    const startIdx = fwdDist <= bwdDist ? a : b;
    const endIdx = fwdDist <= bwdDist ? b : a;
    const spanSteps = Math.min(fwdDist, bwdDist);

    const nStart = nodes[startIdx];
    const nEnd = nodes[endIdx];
    const sx = nStart.x, sy = nStart.y;
    const ex = nEnd.x, ey = nEnd.y;

    if (spanSteps === 1) {
      nStart.outLine = true;
      nStart.outX = sx; nStart.outY = sy;
      nEnd.inLine = true;
      nEnd.inX = ex; nEnd.inY = ey;
    } else if (removeMidOnLine && (m - (spanSteps - 1)) >= 3) {
      const midRemove = new Set();
      for (let s = 1; s < spanSteps; s++) {
        midRemove.add((startIdx + s) % m);
      }
      nStart.outLine = true;
      nStart.outX = sx; nStart.outY = sy;
      nStart.sharp = true;
      nEnd.inLine = true;
      nEnd.inX = ex; nEnd.inY = ey;
      nEnd.sharp = true;
      const refStart = nStart, refEnd = nEnd;
      nodes = nodes.filter((_, idx) => !midRemove.has(idx));
      const newA = nodes.indexOf(refStart);
      const newB = nodes.indexOf(refEnd);
      setEdLoops(prev => prev.map((item, idx) => idx === loopIdx ? { ...item, dirty: true, _cache: null, nodes } : item));
      setSelNodes([newA, newB].filter(ix => ix >= 0));
      flash(`Garis lurus dibuat antara 2 node (${spanSteps - 1} node di tengah dilebur)`);
      return;
    } else {
      for (let s = 0; s <= spanSteps; s++) {
        const curIdx = (startIdx + s) % m;
        const u = s / spanSteps;
        const nd = nodes[curIdx];
        if (s > 0 && s < spanSteps) {
          nd.x = sx + (ex - sx) * u;
          nd.y = sy + (ey - sy) * u;
          nd.radius = 0;
          nd.sharp = true;
        }
        if (s < spanSteps) {
          nd.outLine = true;
          nd.outX = nd.x; nd.outY = nd.y;
        }
        if (s > 0) {
          nd.inLine = true;
          nd.inX = nd.x; nd.inY = nd.y;
        }
      }
    }

    setEdLoops(prev => prev.map((item, idx) => idx === loopIdx ? { ...item, dirty: true, _cache: null, nodes } : item));
    flash(alignAxis === 'h'
      ? '2 node diratakan horizontal & diluruskan'
      : alignAxis === 'v'
      ? '2 node diratakan vertikal & diluruskan'
      : 'Segmen di antara 2 node berhasil diluruskan menjadi garis lurus');
  };

  /* Ubah node tajam menjadi rounded (Radius) */
  const applyRadiusToNodes = (loopIdx, indices, rValue, recordSnap = true) => {
    const lp = edLoopsRef.current[loopIdx];
    if (!lp || !indices.length) return;
    if (recordSnap) snapshot();
    else dirtyRef.current = true;
    const cleanR = VMT.clamp(+rValue || 0, 0, 160);
    const idxSet = new Set(indices);
    const nodes = lp.nodes.map((nd, idx) => {
      if (!idxSet.has(idx)) return nd;
      if (cleanR <= 0.1) {
        return {
          ...nd,
          radius: 0,
          sharp: true,
          handleMode: 'corner',
          inX: nd.inLine ? nd.x : nd.inX,
          inY: nd.inLine ? nd.y : nd.inY,
          outX: nd.outLine ? nd.x : nd.outX,
          outY: nd.outLine ? nd.y : nd.outY
        };
      }
      return {
        ...nd,
        radius: cleanR,
        sharp: false,
        handleMode: 'smooth'
      };
    });
    setEdLoops(prev => prev.map((item, idx) => idx === loopIdx ? { ...item, dirty: true, _cache: null, nodes } : item));
  };

  /* Ubah node rounded menjadi tajam (C0) */
  const makeNodesSharp = (loopIdx = activeLoopIdx, indices = selNodes) => {
    const lp = edLoopsRef.current[loopIdx];
    if (!lp || !indices.length) {
      flash('Pilih atau klik node rounded yang ingin diubah menjadi tajam');
      return;
    }
    snapshot();
    const m = lp.nodes.length;
    let nodes = lp.nodes.map(n => ({ ...n }));

    for (const idx of indices) {
      if (idx < 0 || idx >= m) continue;
      const nd = nodes[idx];
      const prev = nodes[(idx - 1 + m) % m];
      const next = nodes[(idx + 1) % m];
      if (!(nd.radius > 0) && !nd.sharp) {
        const dIn = Math.hypot((nd.inX ?? nd.x) - nd.x, (nd.inY ?? nd.y) - nd.y);
        const dOut = Math.hypot((nd.outX ?? nd.x) - nd.x, (nd.outY ?? nd.y) - nd.y);
        if (dIn > 0.5 && dOut > 0.5) {
          const hx = ((nd.inX - nd.x) + (nd.outX - nd.x)) * 0.35;
          const hy = ((nd.inY - nd.y) + (nd.outY - nd.y)) * 0.35;
          if (Math.hypot(hx, hy) < 28) {
            nd.x += hx * 0.45;
            nd.y += hy * 0.45;
          }
        }
      }
      nd.radius = 0;
      nd.sharp = true;
      nd.handleMode = 'corner';
      nd.inX = nd.x; nd.inY = nd.y;
      nd.outX = nd.x; nd.outY = nd.y;
      nd.inLine = true;
      nd.outLine = true;
      if (prev.sharp) { prev.outLine = true; prev.outX = prev.x; prev.outY = prev.y; }
      if (next.sharp) { next.inLine = true; next.inX = next.x; next.inY = next.y; }
    }

    setEdLoops(prev => prev.map((item, idx) => idx === loopIdx ? { ...item, dirty: true, _cache: null, nodes } : item));
    flash(indices.length === 1 ? 'Node berhasil diubah menjadi sudut tajam (C⁰)' : `${indices.length} node diubah menjadi sudut tajam (C⁰)`);
  };

  /* Copy Radius dari suatu node */
  const copyRadiusFromNode = (loopIdx = activeLoopIdx, nodeIdx = selNodes[0]) => {
    const lp = edLoopsRef.current[loopIdx];
    if (!lp || nodeIdx == null || !lp.nodes[nodeIdx]) {
      flash('Pilih sebuah node terlebih dahulu untuk menyalin radiusnya');
      return;
    }
    const r = ndEstimateNodeRadius(lp.nodes, nodeIdx);
    const val = r > 0 ? r : radiusVal;
    setCopiedRadius(val);
    setHasCopiedRadius(true);
    setRadiusVal(val);
    flash(`Radius ${val} px disalin dari Node #${nodeIdx + 1} (siap di-paste ke node lain)`);
  };

  /* Paste Radius ke node lain */
  const pasteRadiusToNodes = (loopIdx = activeLoopIdx, indices = selNodes) => {
    if (!indices || !indices.length) {
      flash('Pilih atau klik node tujuan untuk menempelkan radius');
      return;
    }
    const rToApply = copiedRadius > 0 ? copiedRadius : radiusVal;
    applyRadiusToNodes(loopIdx, indices, rToApply, true);
    flash(`Radius ${rToApply} px ditempel ke ${indices.length === 1 ? 'Node #' + (indices[0] + 1) : indices.length + ' node'}`);
  };

  /* Munculkan / Tarik Handle Bézier untuk node yang dipilih */
  const pullOutBezierHandles = () => {
    const lp = edLoopsRef.current[activeLoopIdx];
    if (!lp || !selNodes.length) {
      flash('Pilih minimal 1 node untuk memunculkan handle Bézier');
      return;
    }
    snapshot();
    const m = lp.nodes.length;
    const selSet = new Set(selNodes);
    const nodes = lp.nodes.map((nd, idx) => {
      if (!selSet.has(idx)) return { ...nd };
      const prev = lp.nodes[(idx - 1 + m) % m];
      const next = lp.nodes[(idx + 1) % m];
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const tLen = Math.hypot(tx, ty) || 1;
      const ux = tx / tLen, uy = ty / tLen;
      const dPrev = Math.hypot(nd.x - prev.x, nd.y - prev.y) * 0.33;
      const dNext = Math.hypot(next.x - nd.x, next.y - nd.y) * 0.33;
      return {
        ...nd,
        radius: 0,
        sharp: false,
        handleMode: 'smooth',
        inLine: false,
        outLine: false,
        inX: nd.x - ux * dPrev,
        inY: nd.y - uy * dPrev,
        outX: nd.x + ux * dNext,
        outY: nd.y + uy * dNext
      };
    });
    setEdLoops(prev => prev.map((item, idx) => idx === activeLoopIdx ? { ...item, dirty: true, _cache: null, nodes } : item));
    flash('Handle kurva Bézier G¹ dimunculkan — seret titik lingkaran handle untuk melengkungkan kurva');
  };

  const setSelectedHandleMode = mode => {
    const lp = edLoopsRef.current[activeLoopIdx];
    if (!lp || !selNodes.length) return;
    snapshot();
    const selSet = new Set(selNodes);
    const nodes = lp.nodes.map((nd, idx) => {
      if (!selSet.has(idx)) return nd;
      const nextNd = { ...nd, handleMode: mode, sharp: mode === 'corner' };
      if (mode === 'symmetric') {
        const vx = (nd.outX ?? nd.x) - nd.x, vy = (nd.outY ?? nd.y) - nd.y;
        const len = Math.hypot(vx, vy);
        if (len > 0.2) {
          nextNd.inX = nd.x - vx;
          nextNd.inY = nd.y - vy;
        }
      }
      return nextNd;
    });
    setEdLoops(prev => prev.map((item, idx) => idx === activeLoopIdx ? { ...item, dirty: true, _cache: null, nodes } : item));
    flash(`Mode handle Bézier diatur ke: ${mode === 'smooth' ? 'Smooth (G¹ Sejajar)' : mode === 'symmetric' ? 'Simetris (G²)' : 'Sudut Bebas (C⁰ Independen)'}`);
  };

  /* =====================================================================
     12 FUNGSI SNAPPING MULTI-SKENARIO & PEMINDAHAN OBJEK SVG (MOVE OBJECT)
     ===================================================================== */
  const SNAP_SCENARIOS = [
    { id: 's1_grid', num: 1, title: 'Snap Kisi Kanvas (Grid Snap)', tag: 'Grid', desc: 'Kunci node & objek ke perpotongan kisi piksel reguler' },
    { id: 's2_pixel', num: 2, title: 'Snap Piksel Presisi (Pixel-Crisp)', tag: 'Piksel', desc: 'Bulatkan koordinat ke 0.5 / 1.0 px agar tepi vektor tajam' },
    { id: 's3_ortho', num: 3, title: 'Snap Sumbu Sejajar Tetangga (Ortho 0°/90°)', tag: 'Ortho', desc: 'Sejajarkan X/Y dengan node tetangga sebelum/sesudah atau kunci arah geser H/V' },
    { id: 's4_nodeAlign', num: 4, title: 'Snap Garis Lurus Antar-Node Global', tag: 'Align Node', desc: 'Sejajarkan sumbu X atau Y dengan simpul lain di seluruh objek' },
    { id: 's5_nodePoint', num: 5, title: 'Snap Magnetik Titik-ke-Titik Simpul', tag: 'Point-to-Point', desc: 'Tempelkan node tepat ke koordinat simpul objek lain tanpa celah' },
    { id: 's6_segMid', num: 6, title: 'Snap Titik Tengah Segmen (Midpoint)', tag: 'Midpoint', desc: 'Kunci ke titik tengah (t=0.5) segmen garis/kurva terdekat' },
    { id: 's7_pathEdge', num: 7, title: 'Snap Proyeksi Tepi Garis / Kurva', tag: 'Path Edge', desc: 'Tempelkan node tepat di sepanjang lintasan kurva/garis terdekat' },
    { id: 's8_angle', num: 8, title: 'Snap Sudut Istimewa 15°/45°/90°', tag: 'Polar Angle', desc: 'Kunci sudut tarik handle Bézier & geser ke kelipatan 15°/45°' },
    { id: 's9_handleTangent', num: 9, title: 'Snap Tangen & Panjang Simetris Handle', tag: 'Tangent G²', desc: 'Kunci arah handle segaris tangen & samakan panjang handle masuk/keluar' },
    { id: 's10_canvasEdge', num: 10, title: 'Snap Tepi & Margin Kanvas Dokumen', tag: 'Batas Kanvas', desc: 'Kunci tepi objek/node ke batas luar (0, W, H) & margin 5% kanvas' },
    { id: 's11_canvasCenter', num: 11, title: 'Snap Sumbu Tengah & Pusat Kanvas', tag: 'Pusat Kanvas', desc: 'Kunci pusat objek/node ke sumbu tengah X=W/2 dan Y=H/2' },
    { id: 's12_objBbox', num: 12, title: 'Snap Bounding Box & Pusat Antar-Objek', tag: 'Smart Guides', desc: 'Sejajarkan tepi kiri/kanan/atas/bawah & pusat antar-objek SVG' },
  ];

  const enabledSnapCount = Object.values(snapConfig).filter(Boolean).length;

  const toggleSnapKey = key => {
    setSnapConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllSnaps = val => {
    const next = {};
    for (const s of SNAP_SCENARIOS) next[s.id] = val;
    setSnapConfig(next);
    flash(val ? 'Seluruh 12 fungsi Snapping diaktifkan' : 'Seluruh fungsi Snapping dinonaktifkan');
  };

  const applySnapPreset = preset => {
    if (preset === 'all') {
      setAllSnaps(true);
      setSnapMasterOn(true);
    } else if (preset === 'node') {
      setSnapMasterOn(true);
      setSnapConfig({
        s1_grid: false, s2_pixel: true, s3_ortho: true, s4_nodeAlign: true,
        s5_nodePoint: true, s6_segMid: true, s7_pathEdge: true, s8_angle: true,
        s9_handleTangent: true, s10_canvasEdge: true, s11_canvasCenter: false, s12_objBbox: false
      });
      flash('Preset Snapping Geometri Node & Kurva diaktifkan');
    } else if (preset === 'object') {
      setSnapMasterOn(true);
      setSnapConfig({
        s1_grid: true, s2_pixel: true, s3_ortho: true, s4_nodeAlign: false,
        s5_nodePoint: false, s6_segMid: false, s7_pathEdge: false, s8_angle: true,
        s9_handleTangent: false, s10_canvasEdge: true, s11_canvasCenter: true, s12_objBbox: true
      });
      flash('Preset Snapping Tata Letak & Pindah Objek SVG diaktifkan');
    }
  };

  /* Dapatkan daftar indeks kontur yang ikut berpindah saat memilih/menggeser suatu objek SVG */
  const getMoveTargetLoopIndices = (primaryIdx = activeLoopIdx, scope = moveObjScope) => {
    const loops = edLoopsRef.current;
    const primaryLp = loops[primaryIdx];
    if (!primaryLp) return [];
    if (scope === 'contour') return [primaryIdx];
    if (scope === 'region') {
      const indices = [];
      for (let i = 0; i < loops.length; i++) {
        if (!loops[i].hidden && (loops[i].rIdx === primaryLp.rIdx || loops[i].label === primaryLp.label)) {
          indices.push(i);
        }
      }
      return indices.length ? indices : [primaryIdx];
    }
    /* scope === 'object': Kontur utama beserta seluruh lubang (holes) & twin kontur milik komponen tersebut */
    const outSet = new Set([primaryIdx]);
    const compKeysMap = topoMeta && topoMeta.compKeysByLoop;
    const outerByHoleMap = topoMeta && topoMeta.outerKeyByHole;
    const holeKeysMap = topoMeta && topoMeta.holeKeysByOuter;

    let rootKey = primaryLp.id;
    if (outerByHoleMap && outerByHoleMap.has(rootKey)) {
      rootKey = outerByHoleMap.get(rootKey);
    }
    const targetKeySet = new Set([primaryLp.id, rootKey]);
    if (compKeysMap && compKeysMap.has(primaryLp.id)) {
      for (const k of compKeysMap.get(primaryLp.id)) targetKeySet.add(k);
    }
    if (compKeysMap && compKeysMap.has(rootKey)) {
      for (const k of compKeysMap.get(rootKey)) targetKeySet.add(k);
    }
    if (holeKeysMap && holeKeysMap.has(rootKey)) {
      for (const k of holeKeysMap.get(rootKey)) targetKeySet.add(k);
    }

    for (let i = 0; i < loops.length; i++) {
      const lp = loops[i];
      if (!lp || lp.hidden) continue;
      if (targetKeySet.has(lp.id) || (lp.twinKeys && lp.twinKeys.some(tk => targetKeySet.has(tk)))) {
        outSet.add(i);
      }
    }

    const pCache = ndEnsureLoopCache(primaryLp);
    const pW = pCache.maxX - pCache.minX, pH = pCache.maxY - pCache.minY;
    if (pW < W * 0.75 || pH < H * 0.75) {
      for (let i = 0; i < loops.length; i++) {
        if (outSet.has(i)) continue;
        const lp = loops[i];
        if (!lp || lp.hidden) continue;
        const c = ndEnsureLoopCache(lp);
        /* Gabungkan kontur lubang dalam region sama atau kontur twin berhimpit sempurna */
        if (lp.rIdx === primaryLp.rIdx && lp.signedArea > 0) {
          if (c.minX >= pCache.minX - 4 && c.maxX <= pCache.maxX + 4 && c.minY >= pCache.minY - 4 && c.maxY <= pCache.maxY + 4) {
            outSet.add(i);
          }
        } else if (Math.abs(c.minX - pCache.minX) <= 1.5 && Math.abs(c.maxX - pCache.maxX) <= 1.5 &&
                   Math.abs(c.minY - pCache.minY) <= 1.5 && Math.abs(c.maxY - pCache.maxY) <= 1.5) {
          outSet.add(i);
        }
      }
    }
    return Array.from(outSet);
  };

  /* Hitung Bounding Box gabungan (minX, minY, maxX, maxY, cx, cy, w, h) dari satu atau beberapa kontur objek */
  const getLoopsCombinedBbox = (loopIndices, customLoops = null) => {
    const loops = customLoops || edLoopsRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const idx of loopIndices) {
      const lp = loops[idx];
      if (!lp || !lp.nodes || !lp.nodes.length) continue;
      for (const nd of lp.nodes) {
        if (nd.x < minX) minX = nd.x;
        if (nd.x > maxX) maxX = nd.x;
        if (nd.y < minY) minY = nd.y;
        if (nd.y > maxY) maxY = nd.y;
      }
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0, w: 0, h: 0 };
    return {
      minX, minY, maxX, maxY,
      cx: (minX + maxX) * 0.5,
      cy: (minY + maxY) * 0.5,
      w: Math.max(0, maxX - minX),
      h: Math.max(0, maxY - minY)
    };
  };

  /* Hit-test objek SVG pada koordinat dokumen (docX, docY) — prioritaskan objek terkecil/teratas */
  const hitTestSvgObject = (docX, docY, z, allowSegFallback = true) => {
    const loops = edLoopsRef.current;
    const hidSet = new Set(sess.hiddenLabels || []);
    if (!hitCtxRef.current && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      hitCtxRef.current = c.getContext('2d');
    }
    const hCtx = hitCtxRef.current;
    const candidates = [];
    for (let i = 0; i < loops.length; i++) {
      const lp = loops[i];
      if (!lp || lp.hidden || hidSet.has(lp.label)) continue;
      const cache = ndEnsureLoopCache(lp);
      if (docX < cache.minX || docX > cache.maxX || docY < cache.minY || docY > cache.maxY) continue;
      const area = Math.abs(lp.area || lp.signedArea || ((cache.maxX - cache.minX) * (cache.maxY - cache.minY))) || 1;
      candidates.push({ idx: i, cache, area });
    }
    /* Urutkan dari luas terkecil ke terbesar agar objek detail di atas terpilih lebih dulu daripada latar belakang */
    candidates.sort((a, b) => a.area - b.area);
    if (hCtx) {
      hCtx.setTransform(1, 0, 0, 1, 0, 0);
      for (const cand of candidates) {
        if (cand.cache.fillP2d && hCtx.isPointInPath(cand.cache.fillP2d, docX, docY, 'evenodd')) {
          let chosenIdx = cand.idx;
          const clp = loops[chosenIdx];
          if (moveObjScope === 'object' && clp && clp.signedArea > 0 && topoMeta && topoMeta.outerKeyByHole) {
            const pKey = topoMeta.outerKeyByHole.get(clp.id);
            if (pKey) {
              const pIdx = loops.findIndex(l => l && !l.hidden && l.id === pKey);
              if (pIdx >= 0) chosenIdx = pIdx;
            }
          }
          return { type: 'object', loopIdx: chosenIdx };
        }
      }
    }
    if (!allowSegFallback) return null;
    /* Fallback: cek kedekatan ke garis tepi kontur jika klik tepat di garis objek tipis */
    const segHit = hitTestCanvas(docX, docY, z, true);
    if (segHit && segHit.loopIdx != null) {
      return { type: 'object', loopIdx: segHit.loopIdx };
    }
    return null;
  };

  /* Hapus objek SVG yang sedang dipilih (dipanggil hanya via shortcut keyboard Delete / Backspace) */
  const deleteSelectedObject = (targetPrimaryIdx = activeLoopIdx) => {
    const loops = edLoopsRef.current;
    if (!loops.length || targetPrimaryIdx < 0 || targetPrimaryIdx >= loops.length) return;
    const targetIndices = getMoveTargetLoopIndices(targetPrimaryIdx, moveObjScope);
    if (!targetIndices.length) return;
    snapshot(null);
    const delSet = new Set(targetIndices);
    const nextLoops = loops.filter((_, idx) => !delSet.has(idx));
    edLoopsRef.current = nextLoops;
    sceneVerRef.current++;
    const nextAct = nextLoops.length ? Math.max(0, Math.min(targetPrimaryIdx, nextLoops.length - 1)) : 0;
    setEdLoops(nextLoops);
    setActiveLoopIdx(nextAct);
    setSelNodes([]);
    setLineFirstNode(null);
    flash(targetIndices.length > 1
      ? `Objek SVG beserta ${targetIndices.length - 1} sub-kontur dihapus (Ctrl+Z untuk Undo)`
      : 'Objek SVG dihapus (Ctrl+Z untuk Undo)');
  };

  /* Geser objek SVG aktif dengan delta (dx, dy) secara langsung */
  const translateActiveObjectBy = (dx, dy, msg = null) => {
    if (!dx && !dy) return;
    const targetIndices = getMoveTargetLoopIndices(activeLoopIdx, moveObjScope);
    if (!targetIndices.length) return;
    snapshot(null);
    const tSet = new Set(targetIndices);
    const nextLoops = edLoopsRef.current.map((lp, idx) => {
      if (!tSet.has(idx)) return lp;
      const prevOff = lp.gradOffset || [0, 0];
      return {
        ...lp,
        dirty: true,
        _cache: null,
        gradOffset: [prevOff[0] + dx, prevOff[1] + dy],
        nodes: lp.nodes.map(nd => ({
          ...nd,
          x: nd.x + dx,
          y: nd.y + dy,
          inX: (nd.inX ?? nd.x) + dx,
          inY: (nd.inY ?? nd.y) + dy,
          outX: (nd.outX ?? nd.x) + dx,
          outY: (nd.outY ?? nd.y) + dy,
        }))
      };
    });
    edLoopsRef.current = nextLoops;
    sceneVerRef.current++;
    setEdLoops(nextLoops);
    if (msg) flash(msg);
  };

  /* =====================================================================
     ENGINE SMART SNAPPING 100% ALA FIGMA (GARIS MERAH #F24822 DI TENGAH OBJEK,
     TANDA SILANG × ANCHOR, & INDIKATOR JARAK / EQUAL SPACING)
     ===================================================================== */
  const FIGMA_RED = '#f24822';

  /* Evaluator Snapping untuk Geser Node (12 Skenario Berbasis Smart Guides Figma) */
  const evaluateNodeSnap = (rawX, rawY, startX, startY, loopIdx, movingIndices, z) => {
    if (!snapMasterOn) return { x: rawX, y: rawY, guides: [], label: '' };
    const tolDoc = Math.max(0.5, snapTolPx / Math.max(0.15, z));
    const loops = edLoopsRef.current;
    const actLp = loops[loopIdx];
    const movingSet = new Set(movingIndices || []);
    let x = rawX, y = rawY;
    let lockedX = false, lockedY = false;
    const guides = [];
    const labels = [];

    /* Hitung titik pusat objek aktif agar garis merah snapping selalu melewati tengah objek */
    const actCache = actLp ? ndEnsureLoopCache(actLp) : null;
    const objCx = actCache ? actCache.cx : W * 0.5;
    const objCy = actCache ? actCache.cy : H * 0.5;

    /* Skenario #5: Snap Magnetik Titik-ke-Titik Simpul (Point-to-Point Node) */
    if (snapConfig.s5_nodePoint) {
      let bestD = tolDoc, bestPt = null;
      for (let li = 0; li < loops.length; li++) {
        const lp = loops[li];
        if (!lp || lp.hidden) continue;
        const c = ndEnsureLoopCache(lp);
        if (rawX < c.minX - tolDoc || rawX > c.maxX + tolDoc || rawY < c.minY - tolDoc || rawY > c.maxY + tolDoc) continue;
        for (let ni = 0; ni < lp.nodes.length; ni++) {
          if (li === loopIdx && movingSet.has(ni)) continue;
          const nd = lp.nodes[ni];
          const d = Math.hypot(rawX - nd.x, rawY - nd.y);
          if (d < bestD) { bestD = d; bestPt = { x: nd.x, y: nd.y }; }
        }
      }
      if (bestPt) {
        x = bestPt.x; y = bestPt.y; lockedX = true; lockedY = true;
        guides.push({ type: 'v', x, y1: Math.min(y, objCy) - 18, y2: Math.max(y, objCy) + 18, color: FIGMA_RED, ticks: [[x, y], [x, objCy]] });
        guides.push({ type: 'h', y, x1: Math.min(x, objCx) - 18, x2: Math.max(x, objCx) + 18, color: FIGMA_RED, ticks: [[x, y], [objCx, y]] });
        labels.push('#5 Titik Simpul');
      }
    }

    /* Skenario #6: Snap Titik Tengah Segmen & Titik Tengah Objek Aktif (Midpoint & Object Center) */
    if ((!lockedX || !lockedY) && snapConfig.s6_segMid) {
      if (actCache) {
        if (!lockedX && Math.abs(x - objCx) < tolDoc) {
          x = objCx; lockedX = true;
          guides.push({ type: 'v', x: objCx, y1: actCache.minY, y2: actCache.maxY, color: FIGMA_RED, ticks: [[objCx, objCy], [objCx, y]] });
          labels.push('#6 Tengah Objek X');
        }
        if (!lockedY && Math.abs(y - objCy) < tolDoc) {
          y = objCy; lockedY = true;
          guides.push({ type: 'h', y: objCy, x1: actCache.minX, x2: actCache.maxX, color: FIGMA_RED, ticks: [[objCx, objCy], [x, objCy]] });
          labels.push('#6 Tengah Objek Y');
        }
      }
      if (!lockedX && !lockedY) {
        let bestD = tolDoc, bestMid = null;
        for (let li = 0; li < loops.length; li++) {
          const lp = loops[li];
          if (!lp || lp.hidden) continue;
          const c = ndEnsureLoopCache(lp);
          if (rawX < c.minX - tolDoc || rawX > c.maxX + tolDoc || rawY < c.minY - tolDoc || rawY > c.maxY + tolDoc) continue;
          const m = lp.nodes.length;
          for (let ni = 0; ni < m; ni++) {
            const nj = (ni + 1) % m;
            if (li === loopIdx && (movingSet.has(ni) || movingSet.has(nj))) continue;
            const a = lp.nodes[ni], b = lp.nodes[nj];
            const isLine = !!((a.outLine && b.inLine) || (Math.hypot((a.outX ?? a.x) - a.x, (a.outY ?? a.y) - a.y) < 0.08 && Math.hypot((b.inX ?? b.x) - b.x, (b.inY ?? b.y) - b.y) < 0.08));
            const mid = isLine
              ? [(a.x + b.x) * 0.5, (a.y + b.y) * 0.5]
              : ndEvalCubic([a.x, a.y], [a.outX ?? a.x, a.outY ?? a.y], [b.inX ?? b.x, b.inY ?? b.y], [b.x, b.y], 0.5);
            const d = Math.hypot(rawX - mid[0], rawY - mid[1]);
            if (d < bestD) { bestD = d; bestMid = { x: mid[0], y: mid[1], ax: a.x, ay: a.y, bx: b.x, by: b.y }; }
          }
        }
        if (bestMid) {
          x = bestMid.x; y = bestMid.y; lockedX = true; lockedY = true;
          guides.push({ type: 'line', x1: bestMid.ax, y1: bestMid.ay, x2: bestMid.bx, y2: bestMid.by, color: FIGMA_RED, ticks: [[x, y], [bestMid.ax, bestMid.ay], [bestMid.bx, bestMid.by]] });
          labels.push('#6 Midpoint Segmen');
        }
      }
    }

    /* Skenario #7: Snap Proyeksi Garis / Kurva Terdekat (Nearest Path Edge) */
    if (!lockedX && !lockedY && snapConfig.s7_pathEdge) {
      let bestD = tolDoc * 0.85, bestEdge = null;
      for (let li = 0; li < loops.length; li++) {
        if (li === loopIdx) continue;
        const lp = loops[li];
        if (!lp || lp.hidden) continue;
        const c = ndEnsureLoopCache(lp);
        if (rawX < c.minX - tolDoc || rawX > c.maxX + tolDoc || rawY < c.minY - tolDoc || rawY > c.maxY + tolDoc) continue;
        const m = lp.nodes.length;
        for (let ni = 0; ni < m; ni++) {
          const nj = (ni + 1) % m;
          const a = lp.nodes[ni], b = lp.nodes[nj];
          const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
          if (l2 < 1e-4) continue;
          const t = VMT.clamp(((rawX - a.x) * vx + (rawY - a.y) * vy) / l2, 0.1, 0.9);
          const px = a.x + vx * t, py = a.y + vy * t;
          const d = Math.hypot(rawX - px, rawY - py);
          if (d < bestD) { bestD = d; bestEdge = { x: px, y: py, cx: c.cx, cy: c.cy }; }
        }
      }
      if (bestEdge) {
        x = bestEdge.x; y = bestEdge.y; lockedX = true; lockedY = true;
        guides.push({ type: 'line', x1: x, y1: y, x2: bestEdge.cx, y2: bestEdge.cy, color: FIGMA_RED, ticks: [[x, y], [bestEdge.cx, bestEdge.cy]] });
        labels.push('#7 Tepi Kurva');
      }
    }

    /* Skenario #3: Snap Sumbu Sejajar Node Tetangga (Ortho 0°/90° terhadap prev/next node) */
    if (snapConfig.s3_ortho && actLp && movingIndices && movingIndices.length >= 1) {
      const m = actLp.nodes.length;
      const idx0 = movingIndices[0];
      const prevIdx = (idx0 - 1 + m) % m;
      const nextIdx = (idx0 + 1) % m;
      const neighbors = [];
      if (!movingSet.has(prevIdx) && actLp.nodes[prevIdx]) neighbors.push(actLp.nodes[prevIdx]);
      if (!movingSet.has(nextIdx) && actLp.nodes[nextIdx]) neighbors.push(actLp.nodes[nextIdx]);
      for (const nb of neighbors) {
        if (!lockedX && Math.abs(x - nb.x) < tolDoc) {
          x = nb.x; lockedX = true;
          guides.push({ type: 'v', x: nb.x, y1: Math.min(y, nb.y, objCy) - 14, y2: Math.max(y, nb.y, objCy) + 14, color: FIGMA_RED, ticks: [[x, y], [nb.x, nb.y]] });
          labels.push('#3 Ortho Vertikal');
        }
        if (!lockedY && Math.abs(y - nb.y) < tolDoc) {
          y = nb.y; lockedY = true;
          guides.push({ type: 'h', y: nb.y, x1: Math.min(x, nb.x, objCx) - 14, x2: Math.max(x, nb.x, objCx) + 14, color: FIGMA_RED, ticks: [[x, y], [nb.x, nb.y]] });
          labels.push('#3 Ortho Horizontal');
        }
      }
    }

    /* Skenario #4: Snap Penyelarasan Sumbu Antar-Node Global (All-Nodes X/Y Align) */
    if ((!lockedX || !lockedY) && snapConfig.s4_nodeAlign) {
      let bestDx = tolDoc, refNx = null;
      let bestDy = tolDoc, refNy = null;
      for (let li = 0; li < loops.length; li++) {
        const lp = loops[li];
        if (!lp || lp.hidden) continue;
        const c = ndEnsureLoopCache(lp);
        const xIn = !lockedX && x >= c.minX - bestDx && x <= c.maxX + bestDx;
        const yIn = !lockedY && y >= c.minY - bestDy && y <= c.maxY + bestDy;
        if (!xIn && !yIn) continue;
        for (let ni = 0; ni < lp.nodes.length; ni++) {
          if (li === loopIdx && movingSet.has(ni)) continue;
          const nd = lp.nodes[ni];
          if (xIn && Math.abs(x - nd.x) < bestDx) { bestDx = Math.abs(x - nd.x); refNx = nd; }
          if (yIn && Math.abs(y - nd.y) < bestDy) { bestDy = Math.abs(y - nd.y); refNy = nd; }
        }
      }
      if (!lockedX && refNx) {
        x = refNx.x; lockedX = true;
        guides.push({ type: 'v', x: refNx.x, y1: Math.min(y, refNx.y, objCy) - 12, y2: Math.max(y, refNx.y, objCy) + 12, color: FIGMA_RED, ticks: [[x, y], [refNx.x, refNx.y]] });
        labels.push('#4 Sejajar Node X');
      }
      if (!lockedY && refNy) {
        y = refNy.y; lockedY = true;
        guides.push({ type: 'h', y: refNy.y, x1: Math.min(x, refNy.x, objCx) - 12, x2: Math.max(x, refNy.x, objCx) + 12, color: FIGMA_RED, ticks: [[x, y], [refNy.x, refNy.y]] });
        labels.push('#4 Sejajar Node Y');
      }
    }

    /* Skenario #11: Snap Pusat & Sumbu Tengah Kanvas (X = W/2, Y = H/2) */
    if ((!lockedX || !lockedY) && snapConfig.s11_canvasCenter) {
      if (!lockedX && Math.abs(x - W * 0.5) < tolDoc) {
        x = W * 0.5; lockedX = true;
        guides.push({ type: 'v', x: W * 0.5, y1: 0, y2: H, color: FIGMA_RED, ticks: [[W * 0.5, y], [W * 0.5, H * 0.5]] });
        labels.push('#11 Tengah Kanvas X');
      }
      if (!lockedY && Math.abs(y - H * 0.5) < tolDoc) {
        y = H * 0.5; lockedY = true;
        guides.push({ type: 'h', y: H * 0.5, x1: 0, x2: W, color: FIGMA_RED, ticks: [[x, H * 0.5], [W * 0.5, H * 0.5]] });
        labels.push('#11 Tengah Kanvas Y');
      }
    }

    /* Skenario #10: Snap Tepi & Margin Kanvas Dokumen (0, W, H, Margin 5%) */
    if ((!lockedX || !lockedY) && snapConfig.s10_canvasEdge) {
      const mx = W * 0.05, my = H * 0.05;
      const xBounds = [0, mx, W - mx, W];
      const yBounds = [0, my, H - my, H];
      if (!lockedX) {
        for (const bx of xBounds) {
          if (Math.abs(x - bx) < tolDoc) {
            x = bx; lockedX = true;
            guides.push({ type: 'v', x: bx, y1: 0, y2: H, color: FIGMA_RED, ticks: [[bx, y]] });
            labels.push('#10 Tepi Kanvas X');
            break;
          }
        }
      }
      if (!lockedY) {
        for (const by of yBounds) {
          if (Math.abs(y - by) < tolDoc) {
            y = by; lockedY = true;
            guides.push({ type: 'h', y: by, x1: 0, x2: W, color: FIGMA_RED, ticks: [[x, by]] });
            labels.push('#10 Tepi Kanvas Y');
            break;
          }
        }
      }
    }

    /* Skenario #12: Snap terhadap Titik Tengah & Bounding Box Objek SVG Lain */
    if ((!lockedX || !lockedY) && snapConfig.s12_objBbox) {
      for (let li = 0; li < loops.length; li++) {
        if (li === loopIdx) continue;
        const lp = loops[li];
        if (!lp || lp.hidden) continue;
        const c = ndEnsureLoopCache(lp);
        const xTargets = [c.cx, c.minX + 8, c.maxX - 8];
        const yTargets = [c.cy, c.minY + 8, c.maxY - 8];
        if (!lockedX) {
          for (const tx of xTargets) {
            if (Math.abs(x - tx) < tolDoc * 0.85) {
              x = tx; lockedX = true;
              guides.push({ type: 'v', x: tx, y1: Math.min(y, c.cy), y2: Math.max(y, c.cy), color: FIGMA_RED, ticks: [[tx, y], [tx, c.cy]] });
              labels.push('#12 Pusat/BBox Objek X');
              break;
            }
          }
        }
        if (!lockedY) {
          for (const ty of yTargets) {
            if (Math.abs(y - ty) < tolDoc * 0.85) {
              y = ty; lockedY = true;
              guides.push({ type: 'h', y: ty, x1: Math.min(x, c.cx), x2: Math.max(x, c.cx), color: FIGMA_RED, ticks: [[x, ty], [c.cx, ty]] });
              labels.push('#12 Pusat/BBox Objek Y');
              break;
            }
          }
        }
        if (lockedX && lockedY) break;
      }
    }

    /* Skenario #8: Snap Sudut Istimewa 15°/45°/90° dari posisi awal geser */
    if (!lockedX && !lockedY && snapConfig.s8_angle && startX != null && startY != null) {
      const vx = x - startX, vy = y - startY;
      const dist = Math.hypot(vx, vy);
      if (dist > 4 / z) {
        const ang = Math.atan2(vy, vx);
        const step = Math.PI / 12; /* 15 derajat */
        const snappedAng = Math.round(ang / step) * step;
        if (Math.abs(ang - snappedAng) < 0.065) {
          x = startX + Math.cos(snappedAng) * dist;
          y = startY + Math.sin(snappedAng) * dist;
          const deg = ((Math.round((snappedAng * 180) / Math.PI) % 360) + 360) % 360;
          guides.push({ type: 'line', x1: startX, y1: startY, x2: x, y2: y, color: FIGMA_RED, ticks: [[startX, startY], [x, y]] });
          labels.push(`#8 Sudut ${deg}°`);
        }
      }
    }

    /* Skenario #1: Snap Kisi Kanvas Reguler (Grid Snap) */
    if (snapConfig.s1_grid && snapGridSize >= 2) {
      const gx = Math.round(x / snapGridSize) * snapGridSize;
      const gy = Math.round(y / snapGridSize) * snapGridSize;
      if (!lockedX && Math.abs(x - gx) < tolDoc * 0.75) {
        x = gx; lockedX = true;
        guides.push({ type: 'v', x: gx, y1: Math.min(y, objCy) - snapGridSize, y2: Math.max(y, objCy) + snapGridSize, color: FIGMA_RED, ticks: [[gx, y]] });
        if (!labels.includes('#1 Grid')) labels.push('#1 Grid');
      }
      if (!lockedY && Math.abs(y - gy) < tolDoc * 0.75) {
        y = gy; lockedY = true;
        guides.push({ type: 'h', y: gy, x1: Math.min(x, objCx) - snapGridSize, x2: Math.max(x, objCx) + snapGridSize, color: FIGMA_RED, ticks: [[x, gy]] });
        if (!labels.includes('#1 Grid')) labels.push('#1 Grid');
      }
    }

    /* Skenario #2: Snap Piksel & Setengah Piksel Presisi */
    if (snapConfig.s2_pixel) {
      x = Math.round(x * 2) / 2;
      y = Math.round(y * 2) / 2;
      if (!labels.length) labels.push('#2 Piksel (0.5px)');
    }

    return { x, y, guides, label: labels.slice(0, 2).join(' · ') };
  };

  /* Evaluator Snapping untuk Tarik Handle Bézier (Skenario #8 Sudut 15°/45°, #9 Tangen & Panjang Simetris, #1 Grid, #2 Piksel) */
  const evaluateHandleSnap = (rawX, rawY, nd, prevNd, nextNd, isOut, z) => {
    if (!snapMasterOn) return { x: rawX, y: rawY, guides: [], label: '' };
    const tolDoc = Math.max(0.5, snapTolPx / Math.max(0.15, z));
    let x = rawX, y = rawY;
    const guides = [];
    const labels = [];
    const vx = x - nd.x, vy = y - nd.y;
    let dist = Math.hypot(vx, vy);
    let ang = Math.atan2(vy, vx);

    /* Skenario #9: Snap Tangen Segaris (Collinear dengan segmen tetangga) & Panjang Simetris (L_out == L_in) */
    if (snapConfig.s9_handleTangent && dist > 1) {
      const oppX = isOut ? ((nd.inX ?? nd.x) - nd.x) : ((nd.outX ?? nd.x) - nd.x);
      const oppY = isOut ? ((nd.inY ?? nd.y) - nd.y) : ((nd.outY ?? nd.y) - nd.y);
      const oppLen = Math.hypot(oppX, oppY);
      if (oppLen > 1 && Math.abs(dist - oppLen) < tolDoc) {
        dist = oppLen;
        labels.push(`#9 Panjang Simetris (${Math.round(dist)}px)`);
      }
      const refNb = isOut ? prevNd : nextNd;
      if (refNb) {
        const chordAng = Math.atan2(nd.y - refNb.y, nd.x - refNb.x);
        const diff = Math.atan2(Math.sin(ang - chordAng), Math.cos(ang - chordAng));
        if (Math.abs(diff) < 0.08) {
          ang = chordAng;
          guides.push({ type: 'line', x1: refNb.x, y1: refNb.y, x2: nd.x + Math.cos(ang) * dist, y2: nd.y + Math.sin(ang) * dist, color: FIGMA_RED, ticks: [[refNb.x, refNb.y], [nd.x, nd.y]] });
          labels.push('#9 Tangen Collinear');
        }
      }
    }

    /* Skenario #8: Snap Sudut Istimewa 15°/45°/90° untuk Handle */
    if (snapConfig.s8_angle && dist > 1) {
      const step = Math.PI / 12; /* 15 derajat */
      const snappedAng = Math.round(ang / step) * step;
      if (Math.abs(ang - snappedAng) < 0.075) {
        ang = snappedAng;
        const deg = ((Math.round((snappedAng * 180) / Math.PI) % 360) + 360) % 360;
        labels.push(`#8 Sudut Handle ${deg}°`);
      }
    }

    x = nd.x + Math.cos(ang) * dist;
    y = nd.y + Math.sin(ang) * dist;
    if (labels.length) {
      guides.push({ type: 'line', x1: nd.x, y1: nd.y, x2: x, y2: y, color: FIGMA_RED, ticks: [[nd.x, nd.y], [x, y]] });
    }

    /* Skenario #2: Snap Piksel Presisi */
    if (snapConfig.s2_pixel) {
      x = Math.round(x * 2) / 2;
      y = Math.round(y * 2) / 2;
    }
    return { x, y, guides, label: labels.slice(0, 2).join(' · ') };
  };

  /* Evaluator Snapping 100% Ala Figma untuk Memindahkan Objek SVG:
     - Seluruh garis merah snapping (#f24822) melewati & berjangkar di TENGAH OBJEK (cx, cy) seperti di Figma
     - Menampilkan tanda silang × merah pada titik pusat objek & target snap
     - Menampilkan garis ukur jarak (distance pill badge) di tengah objek saat berdekatan atau memiliki jarak sama (Equal Spacing) */
  const evaluateObjectSnap = (rawDx, rawDy, baseBbox, movingLoopIndices, z, precomputedOtherBoxes = null) => {
    if (!snapMasterOn) return { dx: rawDx, dy: rawDy, guides: [], label: '' };
    const tolDoc = Math.max(0.5, snapTolPx / Math.max(0.15, z));
    let dx = rawDx, dy = rawDy;
    let lockedX = false, lockedY = false;
    const guides = [];
    const labels = [];

    /* Skenario #3: Ortho Drag (Kunci pergeseran lurus Horizontal ΔY=0 atau Vertikal ΔX=0 melewati tengah objek) */
    if (snapConfig.s3_ortho && Math.hypot(dx, dy) > tolDoc * 1.4) {
      if (Math.abs(dx) < tolDoc * 0.7) {
        dx = 0; lockedX = true;
        const cyNow = baseBbox.cy + dy;
        guides.push({
          type: 'v', x: baseBbox.cx,
          y1: Math.min(baseBbox.cy, cyNow) - baseBbox.h * 0.5,
          y2: Math.max(baseBbox.cy, cyNow) + baseBbox.h * 0.5,
          color: FIGMA_RED,
          ticks: [[baseBbox.cx, baseBbox.cy], [baseBbox.cx, cyNow]]
        });
        labels.push('#3 Ortho Vertikal');
      } else if (Math.abs(dy) < tolDoc * 0.7) {
        dy = 0; lockedY = true;
        const cxNow = baseBbox.cx + dx;
        guides.push({
          type: 'h', y: baseBbox.cy,
          x1: Math.min(baseBbox.cx, cxNow) - baseBbox.w * 0.5,
          x2: Math.max(baseBbox.cx, cxNow) + baseBbox.w * 0.5,
          color: FIGMA_RED,
          ticks: [[baseBbox.cx, baseBbox.cy], [cxNow, baseBbox.cy]]
        });
        labels.push('#3 Ortho Horizontal');
      }
    }

    /* Skenario #11: Snap Pusat & Sumbu Tengah Kanvas (Garis merah melewati tepat tengah objek cx/cy & tengah kanvas) */
    if (snapConfig.s11_canvasCenter) {
      const curCx = baseBbox.cx + dx;
      const curCy = baseBbox.cy + dy;
      if (!lockedX && Math.abs(curCx - W * 0.5) < tolDoc) {
        dx += (W * 0.5 - curCx); lockedX = true;
        const finalCy = baseBbox.cy + dy;
        guides.push({
          type: 'v', x: W * 0.5, y1: 0, y2: H,
          color: FIGMA_RED,
          ticks: [[W * 0.5, finalCy], [W * 0.5, H * 0.5]]
        });
        labels.push('#11 Pusat Kanvas X');
      }
      if (!lockedY && Math.abs(curCy - H * 0.5) < tolDoc) {
        dy += (H * 0.5 - curCy); lockedY = true;
        const finalCx = baseBbox.cx + dx;
        guides.push({
          type: 'h', y: H * 0.5, x1: 0, x2: W,
          color: FIGMA_RED,
          ticks: [[finalCx, H * 0.5], [W * 0.5, H * 0.5]]
        });
        labels.push('#11 Pusat Kanvas Y');
      }
    }

    /* Gunakan daftar bounding box objek non-moving yang telah di-precompute saat drag dimulai */
    let otherBoxes = precomputedOtherBoxes;
    if (!otherBoxes && snapConfig.s12_objBbox) {
      const movingSet = new Set(movingLoopIndices || []);
      const loops = edLoopsRef.current;
      const hidSet = new Set(sess.hiddenLabels || []);
      otherBoxes = [];
      for (let li = 0; li < loops.length; li++) {
        if (movingSet.has(li)) continue;
        const lp = loops[li];
        if (!lp || lp.hidden || hidSet.has(lp.label)) continue;
        const c = ndEnsureLoopCache(lp);
        const oMinX = c.minX + 8, oMaxX = c.maxX - 8, oCx = c.cx;
        const oMinY = c.minY + 8, oMaxY = c.maxY - 8, oCy = c.cy;
        if (oMaxX <= oMinX || oMaxY <= oMinY) continue;
        otherBoxes.push({ li, minX: oMinX, maxX: oMaxX, cx: oCx, minY: oMinY, maxY: oMaxY, cy: oCy, w: oMaxX - oMinX, h: oMaxY - oMinY });
      }
    }

    /* Skenario #12: Figma Smart Guides Antar-Objek (Prioritaskan Garis Merah di Tengah Objek / Center-to-Center & Equal Spacing) */
    if (snapConfig.s12_objBbox && otherBoxes.length > 0) {
      let bestDx = tolDoc, bestSnapX = null;
      let bestDy = tolDoc, bestSnapY = null;

      const curMinX = baseBbox.minX + dx, curMaxX = baseBbox.maxX + dx, curCx = baseBbox.cx + dx;
      const curMinY = baseBbox.minY + dy, curMaxY = baseBbox.maxY + dy, curCy = baseBbox.cy + dy;

      /* Titik uji X dan Y: Utamakan titik TENGAH objek (curCx, curCy) dengan bobot prioritas seperti Figma */
      const myXPoints = [
        { val: curCx, isCenter: true },
        { val: curMinX, isCenter: false },
        { val: curMaxX, isCenter: false }
      ];
      const myYPoints = [
        { val: curCy, isCenter: true },
        { val: curMinY, isCenter: false },
        { val: curMaxY, isCenter: false }
      ];

      for (const ob of otherBoxes) {
        const otherXPoints = [
          { val: ob.cx, isCenter: true },
          { val: ob.minX, isCenter: false },
          { val: ob.maxX, isCenter: false }
        ];
        const otherYPoints = [
          { val: ob.cy, isCenter: true },
          { val: ob.minY, isCenter: false },
          { val: ob.maxY, isCenter: false }
        ];

        if (!lockedX) {
          for (const mp of myXPoints) {
            for (const op of otherXPoints) {
              const dist = Math.abs(mp.val - op.val);
              /* Beri sedikit ưu-prioritas bila menyelaraskan titik tengah objek */
              const effDist = (mp.isCenter && op.isCenter) ? dist * 0.85 : dist;
              if (effDist < bestDx) {
                bestDx = effDist;
                bestSnapX = { delta: op.val - mp.val, ob, isCenterSnap: mp.isCenter || op.isCenter, snapX: op.val };
              }
            }
          }
        }

        if (!lockedY) {
          for (const mp of myYPoints) {
            for (const op of otherYPoints) {
              const dist = Math.abs(mp.val - op.val);
              const effDist = (mp.isCenter && op.isCenter) ? dist * 0.85 : dist;
              if (effDist < bestDy) {
                bestDy = effDist;
                bestSnapY = { delta: op.val - mp.val, ob, isCenterSnap: mp.isCenter || op.isCenter, snapY: op.val };
              }
            }
          }
        }
      }

      if (!lockedX && bestSnapX) {
        dx += bestSnapX.delta;
        lockedX = true;
        const finalCx = baseBbox.cx + dx;
        const finalCy = baseBbox.cy + dy;
        const ob = bestSnapX.ob;
        /* Tempatkan garis merah vertikal melewati tengah objek yang sedang dipindah menuju pusat objek referensi */
        const lineX = bestSnapX.isCenterSnap ? bestSnapX.snapX : finalCx;
        guides.push({
          type: 'v',
          x: lineX,
          y1: Math.min(finalCy, ob.cy),
          y2: Math.max(finalCy, ob.cy),
          color: FIGMA_RED,
          ticks: [[lineX, finalCy], [lineX, ob.cy]]
        });
        if (!bestSnapX.isCenterSnap) {
          guides.push({
            type: 'v',
            x: bestSnapX.snapX,
            y1: Math.min(baseBbox.minY + dy, ob.minY),
            y2: Math.max(baseBbox.maxY + dy, ob.maxY),
            color: FIGMA_RED,
            ticks: [[bestSnapX.snapX, finalCy], [bestSnapX.snapX, ob.cy]]
          });
        }
        labels.push('#12 Figma Smart Guide X');
      }

      if (!lockedY && bestSnapY) {
        dy += bestSnapY.delta;
        lockedY = true;
        const finalCx = baseBbox.cx + dx;
        const finalCy = baseBbox.cy + dy;
        const ob = bestSnapY.ob;
        /* Tempatkan garis merah horizontal melewati tengah objek yang sedang dipindah menuju pusat objek referensi */
        const lineY = bestSnapY.isCenterSnap ? bestSnapY.snapY : finalCy;
        guides.push({
          type: 'h',
          y: lineY,
          x1: Math.min(finalCx, ob.cx),
          x2: Math.max(finalCx, ob.cx),
          color: FIGMA_RED,
          ticks: [[finalCx, lineY], [ob.cx, lineY]]
        });
        if (!bestSnapY.isCenterSnap) {
          guides.push({
            type: 'h',
            y: bestSnapY.snapY,
            x1: Math.min(baseBbox.minX + dx, ob.minX),
            x2: Math.max(baseBbox.maxX + dx, ob.maxX),
            color: FIGMA_RED,
            ticks: [[finalCx, bestSnapY.snapY], [ob.cx, bestSnapY.snapY]]
          });
        }
        labels.push('#12 Figma Smart Guide Y');
      }

      /* Indikator Jarak Tengah Objek (Figma Distance Pill di Tengah Objek) ke objek tetangga terdekat */
      const fMinX = baseBbox.minX + dx, fMaxX = baseBbox.maxX + dx, fCx = baseBbox.cx + dx;
      const fMinY = baseBbox.minY + dy, fMaxY = baseBbox.maxY + dy, fCy = baseBbox.cy + dy;
      let nearestH = null, minHGap = Infinity;
      let nearestV = null, minVGap = Infinity;

      for (const ob of otherBoxes) {
        const yOverlap = Math.min(fMaxY, ob.maxY) - Math.max(fMinY, ob.minY);
        if (yOverlap > -20) {
          if (ob.minX >= fMaxX && (ob.minX - fMaxX) < minHGap && (ob.minX - fMaxX) > 1 && (ob.minX - fMaxX) < W * 0.45) {
            minHGap = ob.minX - fMaxX;
            nearestH = { x1: fMaxX, x2: ob.minX, y: fCy, dist: Math.round(minHGap) };
          } else if (fMinX >= ob.maxX && (fMinX - ob.maxX) < minHGap && (fMinX - ob.maxX) > 1 && (fMinX - ob.maxX) < W * 0.45) {
            minHGap = fMinX - ob.maxX;
            nearestH = { x1: ob.maxX, x2: fMinX, y: fCy, dist: Math.round(minHGap) };
          }
        }
        const xOverlap = Math.min(fMaxX, ob.maxX) - Math.max(fMinX, ob.minX);
        if (xOverlap > -20) {
          if (ob.minY >= fMaxY && (ob.minY - fMaxY) < minVGap && (ob.minY - fMaxY) > 1 && (ob.minY - fMaxY) < H * 0.45) {
            minVGap = ob.minY - fMaxY;
            nearestV = { y1: fMaxY, y2: ob.minY, x: fCx, dist: Math.round(minVGap) };
          } else if (fMinY >= ob.maxY && (fMinY - ob.maxY) < minVGap && (fMinY - ob.maxY) > 1 && (fMinY - ob.maxY) < H * 0.45) {
            minVGap = fMinY - ob.maxY;
            nearestV = { y1: ob.maxY, y2: fMinY, x: fCx, dist: Math.round(minVGap) };
          }
        }
      }
      if (nearestH && (lockedX || lockedY || minHGap < 120)) {
        guides.push({ type: 'distH', x1: nearestH.x1, x2: nearestH.x2, y: fCy, dist: nearestH.dist, color: FIGMA_RED });
      }
      if (nearestV && (lockedX || lockedY || minVGap < 120)) {
        guides.push({ type: 'distV', y1: nearestV.y1, y2: nearestV.y2, x: fCx, dist: nearestV.dist, color: FIGMA_RED });
      }
    }

    /* Skenario #10: Snap Tepi & Margin Kanvas Dokumen (Garis merah + jarak dari tengah objek ke tepi kanvas) */
    if (snapConfig.s10_canvasEdge) {
      const mx = W * 0.05, my = H * 0.05;
      const xTargets = [0, mx, W - mx, W];
      const yTargets = [0, my, H - my, H];
      if (!lockedX) {
        for (const tx of xTargets) {
          if (Math.abs((baseBbox.minX + dx) - tx) < tolDoc) {
            dx = tx - baseBbox.minX; lockedX = true;
            const fCy = baseBbox.cy + dy, fCx = baseBbox.cx + dx;
            guides.push({ type: 'v', x: tx, y1: 0, y2: H, color: FIGMA_RED, ticks: [[tx, fCy], [fCx, fCy]] });
            guides.push({ type: 'h', y: fCy, x1: tx, x2: fCx, color: FIGMA_RED, ticks: [[fCx, fCy]] });
            labels.push('#10 Tepi Kiri Kanvas'); break;
          }
          if (Math.abs((baseBbox.maxX + dx) - tx) < tolDoc) {
            dx = tx - baseBbox.maxX; lockedX = true;
            const fCy = baseBbox.cy + dy, fCx = baseBbox.cx + dx;
            guides.push({ type: 'v', x: tx, y1: 0, y2: H, color: FIGMA_RED, ticks: [[tx, fCy], [fCx, fCy]] });
            guides.push({ type: 'h', y: fCy, x1: fCx, x2: tx, color: FIGMA_RED, ticks: [[fCx, fCy]] });
            labels.push('#10 Tepi Kanan Kanvas'); break;
          }
        }
      }
      if (!lockedY) {
        for (const ty of yTargets) {
          if (Math.abs((baseBbox.minY + dy) - ty) < tolDoc) {
            dy = ty - baseBbox.minY; lockedY = true;
            const fCy = baseBbox.cy + dy, fCx = baseBbox.cx + dx;
            guides.push({ type: 'h', y: ty, x1: 0, x2: W, color: FIGMA_RED, ticks: [[fCx, ty], [fCx, fCy]] });
            guides.push({ type: 'v', x: fCx, y1: ty, y2: fCy, color: FIGMA_RED, ticks: [[fCx, fCy]] });
            labels.push('#10 Tepi Atas Kanvas'); break;
          }
          if (Math.abs((baseBbox.maxY + dy) - ty) < tolDoc) {
            dy = ty - baseBbox.maxY; lockedY = true;
            const fCy = baseBbox.cy + dy, fCx = baseBbox.cx + dx;
            guides.push({ type: 'h', y: ty, x1: 0, x2: W, color: FIGMA_RED, ticks: [[fCx, ty], [fCx, fCy]] });
            guides.push({ type: 'v', x: fCx, y1: fCy, y2: ty, color: FIGMA_RED, ticks: [[fCx, fCy]] });
            labels.push('#10 Tepi Bawah Kanvas'); break;
          }
        }
      }
    }

    /* Skenario #1: Snap Kisi Kanvas Reguler (Garis merah ditempatkan tepat di tengah objek cx/cy) */
    if (snapConfig.s1_grid && snapGridSize >= 2) {
      const curCx = baseBbox.cx + dx, curCy = baseBbox.cy + dy;
      const targetCx = Math.round(curCx / snapGridSize) * snapGridSize;
      const targetCy = Math.round(curCy / snapGridSize) * snapGridSize;
      if (!lockedX && Math.abs(curCx - targetCx) < tolDoc * 0.7) {
        dx = targetCx - baseBbox.cx; lockedX = true;
        const fCy = baseBbox.cy + dy;
        guides.push({ type: 'v', x: targetCx, y1: fCy - baseBbox.h * 0.65, y2: fCy + baseBbox.h * 0.65, color: FIGMA_RED, ticks: [[targetCx, fCy]] });
        labels.push('#1 Grid Tengah X');
      }
      if (!lockedY && Math.abs(curCy - targetCy) < tolDoc * 0.7) {
        dy = targetCy - baseBbox.cy; lockedY = true;
        const fCx = baseBbox.cx + dx;
        guides.push({ type: 'h', y: targetCy, x1: fCx - baseBbox.w * 0.65, x2: fCx + baseBbox.w * 0.65, color: FIGMA_RED, ticks: [[fCx, targetCy]] });
        labels.push('#1 Grid Tengah Y');
      }
    }

    /* Skenario #2: Snap Piksel Presisi */
    if (snapConfig.s2_pixel) {
      dx = Math.round(dx * 2) / 2;
      dy = Math.round(dy * 2) / 2;
      if (!labels.length) labels.push('#2 Piksel');
    }

    return { dx, dy, guides, label: labels.slice(0, 2).join(' · ') };
  };

  /* Keyboard shortcuts + Spacebar Pan + Arrow Pan + Delete Node / Delete Object */
  useEffect(() => {
    const kd = e => {
      const t = e.target;
      if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
        }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const stepPx = e.shiftKey ? 120 : 48;
        if (e.key === 'ArrowLeft') panByStep(stepPx, 0);
        else if (e.key === 'ArrowRight') panByStep(-stepPx, 0);
        else if (e.key === 'ArrowUp') panByStep(0, stepPx);
        else if (e.key === 'ArrowDown') panByStep(0, -stepPx);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selNodes.length > 0) {
          deleteSelectedNodes();
        } else {
          deleteSelectedObject();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 'h') setTool(prev => prev === 'pan' ? 'select' : 'pan');
      else if (k === 'a') setTool('add');
      else if (k === 'd') setTool('delete');
      else if (k === 'l') setTool('line');
      else if (k === 'r') setTool('radius');
      else if (k === 's') setTool('sharp');
      else if (k === 'c') copyRadiusFromNode();
      else if (k === 'p') pasteRadiusToNodes();
    };
    const ku = e => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        if (wrapRef.current) wrapRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [activeLoopIdx, selNodes, copiedRadius, radiusVal, tool, moveObjScope]);

  /* Hit-test cepat dengan Bounding-Box Culling O(1) & Skip Segmen saat tidak diperlukan */
  const hitTestCanvas = (docX, docY, z, includeSegments = true) => {
    const loops = edLoopsRef.current;
    const hitTol = 11 / z;
    const handleTol = 10 / z;

    /* 1. Cek handle Bézier & widget radius pada kontur aktif terlebih dahulu */
    const actLp = loops[activeLoopIdx];
    if (actLp && !actLp.hidden && (tool === 'select' || tool === 'radius')) {
      const cache = ndEnsureLoopCache(actLp);
      const m = actLp.nodes.length;
      const checkIndices = !showHandlesSel ? [] : (showAllHandles ? actLp.nodes.map((_, idx) => idx) : selNodes);
      for (const i of checkIndices) {
        const nd = actLp.nodes[i];
        if (!nd) continue;
        const fl = cache.fillets[i];
        if (fl) {
          if (Math.hypot(docX - fl.handleCenter[0], docY - fl.handleCenter[1]) <= handleTol * 1.15) {
            return { type: 'radiusWidget', loopIdx: activeLoopIdx, nodeIdx: i, fillet: fl };
          }
        }
        if (tool === 'select' && !(nd.radius > 0.15)) {
          const prev = actLp.nodes[(i - 1 + m) % m];
          const next = actLp.nodes[(i + 1) % m];
          const effInX = nd.inLine ? (nd.x + (prev.x - nd.x) * 0.28) : (nd.inX ?? nd.x);
          const effInY = nd.inLine ? (nd.y + (prev.y - nd.y) * 0.28) : (nd.inY ?? nd.y);
          const effOutX = nd.outLine ? (nd.x + (next.x - nd.x) * 0.28) : (nd.outX ?? nd.x);
          const effOutY = nd.outLine ? (nd.y + (next.y - nd.y) * 0.28) : (nd.outY ?? nd.y);
          if (Math.hypot(docX - effOutX, docY - effOutY) <= handleTol) {
            return { type: 'handleOut', loopIdx: activeLoopIdx, nodeIdx: i, effX: effOutX, effY: effOutY };
          }
          if (Math.hypot(docX - effInX, docY - effInY) <= handleTol) {
            return { type: 'handleIn', loopIdx: activeLoopIdx, nodeIdx: i, effX: effInX, effY: effInY };
          }
        }
      }
    }

    /* 2. Cek titik node di seluruh kontur dengan BBox rejection (prioritaskan kontur aktif) */
    let bestNode = null, bestDist = hitTol;
    const checkLoopNodes = (lIdx) => {
      const lp = loops[lIdx];
      if (!lp || lp.hidden) return;
      if (lIdx === activeLoopIdx ? !showNodesSel : !showNodesAll) return;
      const cache = ndEnsureLoopCache(lp);
      if (docX < cache.minX - hitTol || docX > cache.maxX + hitTol || docY < cache.minY - hitTol || docY > cache.maxY + hitTol) return;
      const nodes = lp.nodes;
      const drawPts = cache.drawPts;
      for (let i = 0, m = nodes.length; i < m; i++) {
        const nd = nodes[i];
        const dxA = docX - nd.x, dyA = docY - nd.y;
        const dxM = docX - drawPts[i * 2], dyM = docY - drawPts[i * 2 + 1];
        if (Math.abs(dxA) > bestDist && Math.abs(dxM) > bestDist) continue;
        if (Math.abs(dyA) > bestDist && Math.abs(dyM) > bestDist) continue;
        const dMin = Math.min(Math.hypot(dxA, dyA), Math.hypot(dxM, dyM));
        if (dMin <= bestDist) {
          bestDist = dMin;
          bestNode = { type: 'node', loopIdx: lIdx, nodeIdx: i };
        }
      }
    };

    checkLoopNodes(activeLoopIdx);
    if (bestNode) return bestNode;
    for (let lIdx = loops.length - 1; lIdx >= 0; lIdx--) {
      if (lIdx === activeLoopIdx) continue;
      checkLoopNodes(lIdx);
    }
    if (bestNode || !includeSegments) return bestNode;

    /* 3. Cek segmen terdekat dengan BBox rejection per-loop dan per-segmen */
    const segTol = 9 / z;
    let bestSeg = null, bestSegDist = segTol;
    const checkLoopSegs = (lIdx) => {
      const lp = loops[lIdx];
      if (!lp || lp.hidden) return;
      const cache = ndEnsureLoopCache(lp);
      if (docX < cache.minX - segTol || docX > cache.maxX + segTol || docY < cache.minY - segTol || docY > cache.maxY + segTol) return;
      const m = lp.nodes.length;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        const ni = lp.nodes[i], nj = lp.nodes[j];
        const P0x = ni.x, P0y = ni.y, P3x = nj.x, P3y = nj.y;
        const isLine = !!((ni.outLine && nj.inLine) || (Math.hypot((ni.outX ?? P0x) - P0x, (ni.outY ?? P0y) - P0y) < 0.08 && Math.hypot((nj.inX ?? P3x) - P3x, (nj.inY ?? P3y) - P3y) < 0.08));
        if (isLine) {
          const sMinX = Math.min(P0x, P3x) - bestSegDist, sMaxX = Math.max(P0x, P3x) + bestSegDist;
          const sMinY = Math.min(P0y, P3y) - bestSegDist, sMaxY = Math.max(P0y, P3y) + bestSegDist;
          if (docX < sMinX || docX > sMaxX || docY < sMinY || docY > sMaxY) continue;
          const vx = P3x - P0x, vy = P3y - P0y;
          const l2 = vx * vx + vy * vy;
          const t = l2 > 1e-4 ? VMT.clamp(((docX - P0x) * vx + (docY - P0y) * vy) / l2, 0.08, 0.92) : 0.5;
          const px = P0x + vx * t, py = P0y + vy * t;
          const dd = Math.hypot(docX - px, docY - py);
          if (dd < bestSegDist) {
            bestSegDist = dd;
            bestSeg = { type: 'segment', loopIdx: lIdx, fromNode: i, toNode: j, t, pt: [px, py] };
          }
        } else {
          const P1x = ni.outX ?? P0x, P1y = ni.outY ?? P0y;
          const P2x = nj.inX ?? P3x, P2y = nj.inY ?? P3y;
          const sMinX = Math.min(P0x, P1x, P2x, P3x) - bestSegDist, sMaxX = Math.max(P0x, P1x, P2x, P3x) + bestSegDist;
          const sMinY = Math.min(P0y, P1y, P2y, P3y) - bestSegDist, sMaxY = Math.max(P0y, P1y, P2y, P3y) + bestSegDist;
          if (docX < sMinX || docX > sMaxX || docY < sMinY || docY > sMaxY) continue;
          const P0 = [P0x, P0y], P1 = [P1x, P1y], P2 = [P2x, P2y], P3 = [P3x, P3y];
          const steps = 12;
          for (let k = 1; k < steps; k++) {
            const t = k / steps;
            const pt = ndEvalCubic(P0, P1, P2, P3, t);
            const dd = Math.hypot(docX - pt[0], docY - pt[1]);
            if (dd < bestSegDist) {
              bestSegDist = dd;
              bestSeg = { type: 'segment', loopIdx: lIdx, fromNode: i, toNode: j, t, pt };
            }
          }
        }
      }
    };

    checkLoopSegs(activeLoopIdx);
    for (let lIdx = loops.length - 1; lIdx >= 0; lIdx--) {
      if (lIdx === activeLoopIdx) continue;
      checkLoopSegs(lIdx);
    }
    return bestSeg;
  };

  /* Pointer Down / Move / Up (Mendukung Pan langsung di area kosong, Space+Drag, Middle/Right Click Pan, & 2-Finger Touch Pan/Zoom) */
  const onPointerDown = e => {
    if (e.pointerType === 'touch') {
      touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPtsRef.current.size === 2) {
        const pts = Array.from(touchPtsRef.current.values());
        const cx = (pts[0].x + pts[1].x) * 0.5;
        const cy = (pts[0].y + pts[1].y) * 0.5;
        const dist = Math.max(10, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        pinchRef.current = { cx, cy, dist, z: vRef.current.z, tx: vRef.current.tx, ty: vRef.current.ty };
        dragRef.current = { kind: 'pinch' };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
    }

    /* Klik tengah (button 1), klik kanan (button 2), Spacebar, Alt, atau Mode Geser langsung menggeser kanvas */
    if (e.button === 1 || e.button === 2 || tool === 'pan' || spaceDownRef.current || e.altKey) {
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
      if (wrapRef.current) wrapRef.current.style.cursor = 'grabbing';
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    if (e.button !== 0) return;
    const pt = screenToDoc(e.clientX, e.clientY);

    const startMoveObjectDrag = (hitLoopIdx, nextSelNodes = []) => {
      const targetIndices = getMoveTargetLoopIndices(hitLoopIdx, moveObjScope);
      const targetSet = new Set(targetIndices);
      /* Copy-On-Write HANYA untuk kontur yang dipindahkan (O(1) untuk 1.000+ kontur lain) */
      const preDragLoops = cloneLoopsCOW(edLoopsRef.current, targetSet);
      const baseNodesByLoop = {};
      const baseCacheByLoop = {};
      const baseGradOffsetByLoop = {};
      for (const li of targetIndices) {
        const lp = edLoopsRef.current[li];
        if (lp) {
          baseNodesByLoop[li] = lp.nodes;
          baseCacheByLoop[li] = ndEnsureLoopCache(lp);
          baseGradOffsetByLoop[li] = (lp.gradOffset || [0, 0]).slice();
        }
      }
      const baseBbox = getLoopsCombinedBbox(targetIndices);
      setActiveLoopIdx(hitLoopIdx);
      setSelNodes(nextSelNodes);
      dragRef.current = {
        kind: 'moveObject',
        primaryLoopIdx: hitLoopIdx,
        targetLoopIndices: targetIndices,
        startX: pt.x,
        startY: pt.y,
        baseNodesByLoop,
        baseCacheByLoop,
        baseGradOffsetByLoop,
        baseBbox,
        otherBoxes: null,
        preDragLoops,
        prevAct: activeLoopIdx,
        prevSel: selNodes.slice(),
        lastDx: 0,
        lastDy: 0,
        mutated: false
      };
      if (wrapRef.current) wrapRef.current.style.cursor = 'move';
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      scheduleDraw();
    };

    const needSegHit = tool === 'select' || tool === 'add';
    const hit = hitTestCanvas(pt.x, pt.y, pt.z, needSegHit);

    if (tool === 'add') {
      if (hit && hit.type === 'segment') {
        insertNodeOnSegment(hit.loopIdx, hit.fromNode, hit.t);
      } else if (hit && hit.type === 'node') {
        insertNodeOnSegment(hit.loopIdx, hit.nodeIdx, 0.5);
      } else {
        /* Jika klik di area kosong pada mode Add, izinkan langsung menggeser kanvas! */
        dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }
      return;
    }

    if (tool === 'delete') {
      if (hit && hit.type === 'node') {
        setActiveLoopIdx(hit.loopIdx);
        deleteSelectedNodes(hit.loopIdx, [hit.nodeIdx]);
      } else {
        dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }
      return;
    }

    if (tool === 'radius') {
      if (hit && (hit.type === 'node' || hit.type === 'radiusWidget')) {
        const prevAct = activeLoopIdx, prevSel = selNodes.slice();
        const curLp = edLoopsRef.current[hit.loopIdx];
        const preDragLoop = { ...curLp, _cache: null, nodes: curLp.nodes.map(n => ({ ...n })) };
        setActiveLoopIdx(hit.loopIdx);
        setSelNodes([hit.nodeIdx]);
        const curNode = curLp.nodes[hit.nodeIdx];
        const nextR = curNode.radius > 0 ? curNode.radius : Math.max(4, radiusVal);
        let alreadySnap = false;
        if (!(curNode.radius > 0)) {
          applyRadiusToNodes(hit.loopIdx, [hit.nodeIdx], nextR, true);
          alreadySnap = true;
          flash(`Node #${hit.nodeIdx + 1} diubah menjadi Rounded (Radius ${nextR} px)`);
        }
        dragRef.current = {
          kind: 'dragRadius',
          loopIdx: hit.loopIdx,
          nodeIdx: hit.nodeIdx,
          startX: pt.x,
          startY: pt.y,
          startR: nextR,
          preDragLoop,
          prevAct,
          prevSel,
          alreadySnap,
          mutated: false
        };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      } else {
        dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }
      return;
    }

    if (tool === 'sharp') {
      if (hit && hit.type === 'node') {
        setActiveLoopIdx(hit.loopIdx);
        setSelNodes([hit.nodeIdx]);
        makeNodesSharp(hit.loopIdx, [hit.nodeIdx]);
      } else {
        dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }
      return;
    }

    if (tool === 'copyrad') {
      if (hit && hit.type === 'node') {
        setActiveLoopIdx(hit.loopIdx);
        setSelNodes([hit.nodeIdx]);
        copyRadiusFromNode(hit.loopIdx, hit.nodeIdx);
      } else {
        dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }
      return;
    }

    if (tool === 'pasterad') {
      if (hit && hit.type === 'node') {
        setActiveLoopIdx(hit.loopIdx);
        setSelNodes([hit.nodeIdx]);
        pasteRadiusToNodes(hit.loopIdx, [hit.nodeIdx]);
      } else {
        dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }
      return;
    }

    if (tool === 'line') {
      if (hit && hit.type === 'node') {
        if (!lineFirstNode || lineFirstNode.loopIdx !== hit.loopIdx || lineFirstNode.nodeIdx === hit.nodeIdx) {
          setActiveLoopIdx(hit.loopIdx);
          setSelNodes([hit.nodeIdx]);
          setLineFirstNode({ loopIdx: hit.loopIdx, nodeIdx: hit.nodeIdx });
          flash(`Node pertama (#${hit.nodeIdx + 1}) dipilih — sekarang klik Node kedua pada kontur yang sama untuk meluruskan garis`);
        } else {
          const firstIdx = lineFirstNode.nodeIdx;
          const secondIdx = hit.nodeIdx;
          setActiveLoopIdx(hit.loopIdx);
          setSelNodes([firstIdx, secondIdx]);
          straightenTwoNodes(hit.loopIdx, firstIdx, secondIdx);
          setLineFirstNode(null);
        }
      } else {
        dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }
      return;
    }

    /* Mode Default: 'select' (Pilih Node & Edit Bezier Handle) */
    if (hit && hit.type === 'radiusWidget') {
      const curLp = edLoopsRef.current[hit.loopIdx];
      const preDragLoop = { ...curLp, _cache: null, nodes: curLp.nodes.map(n => ({ ...n })) };
      const curNode = curLp.nodes[hit.nodeIdx];
      dragRef.current = {
        kind: 'dragRadius',
        loopIdx: hit.loopIdx,
        nodeIdx: hit.nodeIdx,
        startX: pt.x,
        startY: pt.y,
        startR: curNode.radius || radiusVal,
        preDragLoop,
        prevAct: activeLoopIdx,
        prevSel: selNodes.slice(),
        alreadySnap: false,
        mutated: false
      };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    if (hit && (hit.type === 'handleIn' || hit.type === 'handleOut')) {
      snapshot(hit.loopIdx);
      const lp = edLoopsRef.current[hit.loopIdx];
      const m = lp.nodes.length;
      const nd = lp.nodes[hit.nodeIdx];
      const prev = lp.nodes[(hit.nodeIdx - 1 + m) % m];
      const next = lp.nodes[(hit.nodeIdx + 1) % m];
      if (hit.type === 'handleOut' && nd.outLine) {
        nd.outLine = false;
        nd.outX = hit.effX;
        nd.outY = hit.effY;
        if (next.inLine) {
          next.inLine = false;
          next.inX = next.x + (nd.x - next.x) * 0.28;
          next.inY = next.y + (nd.y - next.y) * 0.28;
        }
      } else if (hit.type === 'handleIn' && nd.inLine) {
        nd.inLine = false;
        nd.inX = hit.effX;
        nd.inY = hit.effY;
        if (prev.outLine) {
          prev.outLine = false;
          prev.outX = prev.x + (nd.x - prev.x) * 0.28;
          prev.outY = prev.y + (nd.y - prev.y) * 0.28;
        }
      }
      lp.dirty = true;
      lp._cache = null;
      sceneVerRef.current++;
      dragRef.current = {
        kind: hit.type,
        loopIdx: hit.loopIdx,
        nodeIdx: hit.nodeIdx,
        mutated: true
      };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    if (hit && hit.type === 'node') {
      const prevAct = activeLoopIdx, prevSel = selNodes.slice();
      const sameLoop = hit.loopIdx === activeLoopIdx;
      let nextSel;
      if (e.shiftKey && sameLoop) {
        nextSel = selNodes.includes(hit.nodeIdx)
          ? selNodes.filter(ix => ix !== hit.nodeIdx)
          : [...selNodes, hit.nodeIdx];
      } else if (sameLoop && selNodes.includes(hit.nodeIdx) && selNodes.length > 1) {
        nextSel = selNodes;
      } else {
        nextSel = [hit.nodeIdx];
      }
      const targetLp = edLoopsRef.current[hit.loopIdx];
      const basePositions = targetLp.nodes.map(n => ({ ...n }));
      const preDragLoop = { ...targetLp, _cache: null, nodes: basePositions };
      setActiveLoopIdx(hit.loopIdx);
      setSelNodes(nextSel);
      const curNode = targetLp.nodes[hit.nodeIdx];
      if (curNode && curNode.radius > 0) setRadiusVal(curNode.radius);
      dragRef.current = {
        kind: 'moveNodes',
        loopIdx: hit.loopIdx,
        indices: nextSel.length ? nextSel : [hit.nodeIdx],
        startX: pt.x,
        startY: pt.y,
        basePositions,
        preDragLoop,
        prevAct,
        prevSel,
        mutated: false
      };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    if (hit && hit.type === 'segment') {
      /* Klik garis tepi kontur objek: pilih objek tersebut dan langsung dukung seret/pindah objek secara real-time */
      startMoveObjectDrag(hit.loopIdx, []);
      return;
    }

    /* Klik pada area isi (fill) objek SVG di kanvas (tanpa menahan Shift):
       Secara otomatis memilih objek SVG tersebut dan memungkinkan pengguna langsung menyeret/memindahkannya! */
    if (!e.shiftKey) {
      const objHit = hitTestSvgObject(pt.x, pt.y, pt.z);
      if (objHit && objHit.loopIdx != null) {
        startMoveObjectDrag(objHit.loopIdx, []);
        return;
      }
    }

    /* Klik di ruang kosong di luar objek:
       - Bila emptyDragMode === 'pan' (default) dan tidak menahan Shift -> langsung geser kanvas (Pan)!
       - Bila menahan Shift atau emptyDragMode === 'marquee' -> tarik kotak seleksi (Marquee) */
    if (emptyDragMode === 'pan' && !e.shiftKey) {
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
      if (wrapRef.current) wrapRef.current.style.cursor = 'grabbing';
    } else {
      if (!e.shiftKey) { setSelNodes([]); setObjPicked(false); }
      dragRef.current = { kind: 'marquee', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, additive: e.shiftKey };
      marqueeRef.current = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
      scheduleDraw();
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };

  const onPointerMove = e => {
    if (e.pointerType === 'touch' && touchPtsRef.current.has(e.pointerId)) {
      touchPtsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPtsRef.current.size === 2 && pinchRef.current) {
        const pts = Array.from(touchPtsRef.current.values());
        const cx = (pts[0].x + pts[1].x) * 0.5;
        const cy = (pts[0].y + pts[1].y) * 0.5;
        const dist = Math.max(10, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const pr = pinchRef.current;
        const wrap = wrapRef.current;
        if (wrap) {
          const r = wrap.getBoundingClientRect();
          const sf = rvSafe(wrap, { t: 64, r: open ? 352 : 0, b: 96, l: 0 });
          const dx = (cx - r.left) - sf.cx;
          const dy = (cy - r.top) - sf.cy;
          const nz = VMT.clamp(pr.z * (dist / pr.dist), 0.1, 60);
          const k = nz / pr.z;
          vRef.current = {
            z: nz,
            tx: dx - (dx - pr.tx) * k + (cx - pr.cx),
            ty: dy - (dy - pr.ty) * k + (cy - pr.cy)
          };
          interRef.current = true;
          scheduleDraw();
        }
        return;
      }
    }

    const dr = dragRef.current;
    if (!dr) {
      /* [PERF-100%] Throttle hover hit-test ke 1x per frame rAF & jangan pernah memicu redraw kanvas kecuali ada pratinjau segmen/garis */
      if (tool === 'pan' || spaceDownRef.current) {
        if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
        return;
      }
      const cx = e.clientX, cy = e.clientY;
      if (rafHoverRef.current) return;
      rafHoverRef.current = requestAnimationFrame(() => {
        rafHoverRef.current = 0;
        if (dragRef.current) return;
        const pt = screenToDoc(cx, cy);
        const needSegHit = tool === 'add';
        const hit = hitTestCanvas(pt.x, pt.y, pt.z, needSegHit);
        const prevH = hoverRef.current;
        const nextH = hit ? { ...hit, docX: pt.x, docY: pt.y } : { type: 'none', docX: pt.x, docY: pt.y };
        hoverRef.current = nextH;
        if (wrapRef.current && !spaceDownRef.current) {
          if (tool === 'pan') wrapRef.current.style.cursor = 'grab';
          else if (nextH.type === 'node' || nextH.type === 'handleIn' || nextH.type === 'handleOut' || nextH.type === 'radiusWidget') wrapRef.current.style.cursor = 'pointer';
          else if (nextH.type === 'segment') wrapRef.current.style.cursor = tool === 'add' ? 'copy' : 'pointer';
          else wrapRef.current.style.cursor = emptyDragMode === 'pan' ? 'grab' : 'default';
        }
        const needRedraw = (tool === 'add' && (nextH.type === 'segment' || (prevH && prevH.type === 'segment'))) ||
                           (tool === 'line' && lineFirstNode);
        if (needRedraw) scheduleDraw();
      });
      return;
    }

    if (dr.kind === 'pan') {
      vRef.current = { ...vRef.current, tx: dr.tx + (e.clientX - dr.sx), ty: dr.ty + (e.clientY - dr.sy) };
      interRef.current = true;
      scheduleDraw();
      return;
    }

    const pt = screenToDoc(e.clientX, e.clientY);

    if (dr.kind === 'marquee') {
      dr.x1 = pt.x;
      dr.y1 = pt.y;
      marqueeRef.current = { x0: dr.x0, y0: dr.y0, x1: dr.x1, y1: dr.y1 };
      scheduleDraw();
      return;
    }

    if (dr.kind === 'moveObject') {
      const rawDx = pt.x - dr.startX;
      const rawDy = pt.y - dr.startY;
      if (!dr.mutated && Math.hypot(rawDx, rawDy) * pt.z < 0.5) return;
      if (!dr.mutated) {
        if (dr.preDragLoops) {
          undoStack.current.push({ loops: dr.preDragLoops, activeLoopIdx: dr.prevAct, selNodes: dr.prevSel });
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current.length = 0;
          dirtyRef.current = true;
          setHistCount({ u: undoStack.current.length, r: 0 });
        }
        if (snapMasterOn && snapConfig.s12_objBbox && !dr.otherBoxes) {
          const movingSet = new Set(dr.targetLoopIndices || []);
          const loops = edLoopsRef.current;
          const hidSet = new Set(sess.hiddenLabels || []);
          const ob = [];
          for (let li = 0; li < loops.length; li++) {
            if (movingSet.has(li)) continue;
            const lp = loops[li];
            if (!lp || lp.hidden || hidSet.has(lp.label)) continue;
            const c = ndEnsureLoopCache(lp);
            const oMinX = c.minX + 8, oMaxX = c.maxX - 8, oCx = c.cx;
            const oMinY = c.minY + 8, oMaxY = c.maxY - 8, oCy = c.cy;
            if (oMaxX <= oMinX || oMaxY <= oMinY) continue;
            ob.push({ li, minX: oMinX, maxX: oMaxX, cx: oCx, minY: oMinY, maxY: oMaxY, cy: oCy, w: oMaxX - oMinX, h: oMaxY - oMinY });
          }
          dr.otherBoxes = ob;
        }
      }
      const snapRes = evaluateObjectSnap(rawDx, rawDy, dr.baseBbox, dr.targetLoopIndices, pt.z, dr.otherBoxes);
      const dx = snapRes.dx, dy = snapRes.dy;
      activeSnapRef.current = { ...snapRes, dx, dy };
      /* [PERF-RIGID-DRAG] Jangan mutasi ribuan node atau merusak lp._cache di setiap frame drag!
         Cukup simpan (lastDx, lastDy) untuk transformasi matriks GPU kanvas O(1) */
      dr.lastDx = dx;
      dr.lastDy = dy;
      dr.mutated = true;
      interRef.current = true;
      drawNow();
      return;
    }

    if (dr.kind === 'moveNodes') {
      const rawDx = pt.x - dr.startX;
      const rawDy = pt.y - dr.startY;
      if (!dr.mutated && Math.hypot(rawDx, rawDy) * pt.z < 0.5) return;
      const lp = edLoopsRef.current[dr.loopIdx];
      if (!lp) return;
      if (!dr.mutated && dr.preDragLoop) {
        pushSnapshotFromPreDrag(dr.preDragLoop, dr.loopIdx, dr.prevAct, dr.prevSel);
      }
      const primaryIdx = dr.indices[0];
      const basePrimary = dr.basePositions[primaryIdx];
      let dx = rawDx, dy = rawDy;
      if (basePrimary) {
        const snapRes = evaluateNodeSnap(basePrimary.x + rawDx, basePrimary.y + rawDy, basePrimary.x, basePrimary.y, dr.loopIdx, dr.indices, pt.z);
        dx = snapRes.x - basePrimary.x;
        dy = snapRes.y - basePrimary.y;
        activeSnapRef.current = snapRes;
              }
      for (const nIdx of dr.indices) {
        const nd = lp.nodes[nIdx];
        const b = dr.basePositions[nIdx];
        if (!nd || !b) continue;
        nd.x = b.x + dx;
        nd.y = b.y + dy;
        nd.inX = (b.inX ?? b.x) + dx;
        nd.inY = (b.inY ?? b.y) + dy;
        nd.outX = (b.outX ?? b.x) + dx;
        nd.outY = (b.outY ?? b.y) + dy;
      }
      lp.dirty = true;
      lp._cache = null;
      sceneVerRef.current++;
      dr.mutated = true;
      interRef.current = true;
      drawNow();
      return;
    }

    if (dr.kind === 'handleOut' || dr.kind === 'handleIn') {
      const isOut = dr.kind === 'handleOut';
      const freeCorner = e.altKey;
      const lp = edLoopsRef.current[dr.loopIdx];
      if (!lp) return;
      const m = lp.nodes.length;
      const nd = lp.nodes[dr.nodeIdx];
      if (!nd) return;
      const prevNd = lp.nodes[(dr.nodeIdx - 1 + m) % m];
      const nextNd = lp.nodes[(dr.nodeIdx + 1) % m];
      const snapH = evaluateHandleSnap(pt.x, pt.y, nd, prevNd, nextNd, isOut, pt.z);
      activeSnapRef.current = snapH;
            const hx = snapH.x, hy = snapH.y;
      nd.radius = 0;
      const vx = hx - nd.x;
      const vy = hy - nd.y;
      const vLen = Math.hypot(vx, vy);
      if (isOut) {
        nd.outX = hx;
        nd.outY = hy;
        nd.outLine = false;
        if (!freeCorner && nd.handleMode !== 'corner' && vLen > 0.2) {
          const oldInLen = nd.handleMode === 'symmetric'
            ? vLen
            : Math.max(4, Math.hypot((nd.inX ?? nd.x) - nd.x, (nd.inY ?? nd.y) - nd.y));
          nd.inX = nd.x - (vx / vLen) * oldInLen;
          nd.inY = nd.y - (vy / vLen) * oldInLen;
          nd.inLine = false;
        }
      } else {
        nd.inX = hx;
        nd.inY = hy;
        nd.inLine = false;
        if (!freeCorner && nd.handleMode !== 'corner' && vLen > 0.2) {
          const oldOutLen = nd.handleMode === 'symmetric'
            ? vLen
            : Math.max(4, Math.hypot((nd.outX ?? nd.x) - nd.x, (nd.outY ?? nd.y) - nd.y));
          nd.outX = nd.x - (vx / vLen) * oldOutLen;
          nd.outY = nd.y - (vy / vLen) * oldOutLen;
          nd.outLine = false;
        }
      }
      if (freeCorner) {
        nd.handleMode = 'corner';
        nd.sharp = true;
      }
      lp.dirty = true;
      lp._cache = null;
      sceneVerRef.current++;
      dr.mutated = true;
      interRef.current = true;
      drawNow();
      return;
    }

    if (dr.kind === 'dragRadius') {
      const lp = edLoopsRef.current[dr.loopIdx];
      if (!lp) return;
      const nd = lp.nodes[dr.nodeIdx];
      if (!nd) return;
      if (!dr.mutated && !dr.alreadySnap && dr.preDragLoop) {
        pushSnapshotFromPreDrag(dr.preDragLoop, dr.loopIdx, dr.prevAct, dr.prevSel);
      }
      const distFromApex = Math.hypot(pt.x - nd.x, pt.y - nd.y);
      const nextR = Math.round(VMT.clamp(distFromApex, 0, 140) * 2) / 2;
      nd.radius = nextR;
      nd.sharp = nextR <= 0.1;
      nd.handleMode = nextR <= 0.1 ? 'corner' : 'smooth';
      lp.dirty = true;
      lp._cache = null;
      sceneVerRef.current++;
      dr.lastR = nextR;
      dr.mutated = true;
      interRef.current = true;
      scheduleDraw();
      return;
    }
  };

  const onPointerUp = e => {
    if (e && e.pointerType === 'touch') {
      touchPtsRef.current.delete(e.pointerId);
      if (touchPtsRef.current.size < 2) pinchRef.current = null;
    }
    const dr = dragRef.current;
    dragRef.current = null;
    if (wrapRef.current && !spaceDownRef.current) {
      wrapRef.current.style.cursor = tool === 'pan' ? 'grab' : '';
    }
    if (!dr) return;

    if (dr.kind === 'pan' || dr.kind === 'pinch') {
      interRef.current = false;
      pz.set(vRef.current);
      scheduleDraw();
      return;
    }

    if (dr.kind === 'marquee') {
      const xMin = Math.min(dr.x0, dr.x1), xMax = Math.max(dr.x0, dr.x1);
      const yMin = Math.min(dr.y0, dr.y1), yMax = Math.max(dr.y0, dr.y1);
      marqueeRef.current = null;
      if (Math.hypot(xMax - xMin, yMax - yMin) > 2) {
        const lp = edLoopsRef.current[activeLoopIdx];
        if (lp) {
          const picked = [];
          lp.nodes.forEach((nd, idx) => {
            if (nd.x >= xMin && nd.x <= xMax && nd.y >= yMin && nd.y <= yMax) picked.push(idx);
          });
          setSelNodes(dr.additive ? Array.from(new Set([...selNodes, ...picked])) : picked);
          if (picked.length === 2) {
            flash('2 node terpilih — klik tombol "Luruskan 2 Node" untuk membuat garis lurus');
          } else if (picked.length > 0) {
            flash(`${picked.length} node terpilih`);
          }
        }
      }
      scheduleDraw();
      return;
    }

    activeSnapRef.current = null;
        if (dr.mutated) {
      interRef.current = false;
      if (dr.kind === 'dragRadius' && dr.lastR != null) setRadiusVal(dr.lastR);
      if (dr.kind === 'moveObject') {
        const dx = dr.lastDx || 0, dy = dr.lastDy || 0;
        const movedSet = new Set(dr.targetLoopIndices || []);
        const nextLoops = edLoopsRef.current.map((lp, idx) => {
          if (!movedSet.has(idx)) return lp;
          const baseNodes = (dr.baseNodesByLoop && dr.baseNodesByLoop[idx]) || lp.nodes;
          const baseGOff = (dr.baseGradOffsetByLoop && dr.baseGradOffsetByLoop[idx]) || lp.gradOffset || [0, 0];
          const baseCache = (dr.baseCacheByLoop && dr.baseCacheByLoop[idx]) || lp._cache;
          const nextNodes = baseNodes.map(b => ({
            ...b,
            x: b.x + dx,
            y: b.y + dy,
            inX: (b.inX ?? b.x) + dx,
            inY: (b.inY ?? b.y) + dy,
            outX: (b.outX ?? b.x) + dx,
            outY: (b.outY ?? b.y) + dy
          }));
          const trCache = ndTranslateLoopCache(baseCache, dx, dy);
          return {
            ...lp,
            dirty: true,
            gradOffset: [baseGOff[0] + dx, baseGOff[1] + dy],
            nodes: nextNodes,
            _cache: trCache,
            _cacheNodesRef: trCache ? nextNodes : null
          };
        });
        edLoopsRef.current = nextLoops;
        sceneVerRef.current++;
        setEdLoops(nextLoops);
      } else {
        const nextLoops = edLoopsRef.current.map((lp, idx) => idx === dr.loopIdx ? { ...lp, dirty: true, _cache: null, nodes: lp.nodes.slice() } : lp);
        edLoopsRef.current = nextLoops;
        sceneVerRef.current++;
        setEdLoops(nextLoops);
      }
      scheduleDraw();
    } else {
      interRef.current = false;
      scheduleDraw();
    }
  };

  const onDoubleClick = e => {
    const pt = screenToDoc(e.clientX, e.clientY);
    const hit = hitTestCanvas(pt.x, pt.y, pt.z, true);
    if (hit && hit.type === 'segment') {
      insertNodeOnSegment(hit.loopIdx, hit.fromNode, hit.t);
    } else if (hit && hit.type === 'node') {
      const lp = edLoopsRef.current[hit.loopIdx];
      const nd = lp && lp.nodes[hit.nodeIdx];
      if (!nd) return;
      if (nd.radius > 0 || !nd.sharp) {
        makeNodesSharp(hit.loopIdx, [hit.nodeIdx]);
      } else {
        const r = Math.max(6, radiusVal || 14);
        applyRadiusToNodes(hit.loopIdx, [hit.nodeIdx], r, true);
        flash(`Node #${hit.nodeIdx + 1} diubah jadi Rounded (Radius ${r} px)`);
      }
    }
  };

  /* =====================================================================
     [PERF-100%] Render Kanvas Interaktif NodeEditor:
     1) DPR stabil (1.75) tanpa resize backing buffer saat transisi pan/idle (bebas hitch & bebas blur)
     2) 4x4 Spatial Chunk Merged Path2D untuk seluruh kontur non-aktif (ribuan stroke -> <=16 batch)
     3) High-DPI Screen-Space Sprite Atlas + World-Locked Occupancy Grid (0 tessellation arc/stroke, 0 node flicker)
     4) Overscan Pan Cache (+320px di 4 sisi): saat digeser (pan), seluruh scene di-blit dalam 1x drawImage (<0.1 ms)
     5) Inactive Layer Cache: saat drag node/handle/radius/marquee, hanya kontur aktif yang digambar ulang (<0.3 ms)
     ===================================================================== */
  const drawNodeCanvas = atUseCallback(() => {
    const cv = cvRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const loops = edLoopsRef.current;
    const liveSpatialCache = getLiveSpatialCache();
    /* [CRISP-VECTOR] Supersampling minimum 2.0x DPR agar kurva & tepi SVG tajam tanpa efek piksel saat di-zoom */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { z, ox, oy, cw, ch } = getTransform();
    if (!cw || !ch) return;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = getCheckerPattern(ctx);
    ctx.fillRect(0, 0, cw, ch);

    const hidSet = new Set(sess.hiddenLabels || []);
    const dr = dragRef.current;
    const effActIdx = (dr && dr.primaryLoopIdx != null) ? dr.primaryLoopIdx : (dr && dr.loopIdx != null ? dr.loopIdx : activeLoopIdx);
    const actLp = loops[effActIdx] || loops[activeLoopIdx];
    const movingLoopIndices = (dr && dr.kind === 'moveObject' && dr.targetLoopIndices && dr.targetLoopIndices.length)
      ? dr.targetLoopIndices
      : [effActIdx];
    const movingIdxSet = new Set(movingLoopIndices);
    const movingKeys = new Set();
    for (const li of movingLoopIndices) {
      const mlp = loops[li];
      if (mlp) {
        movingKeys.add(mlp.id);
        if (mlp.twinKeys) {
          for (const tk of mlp.twinKeys) movingKeys.add(tk);
        }
      }
    }
    const selSet = new Set(selNodes);
    const hoverState = hoverRef.current;
    const mq = marqueeRef.current;
    const isEditingGeom = !!(dr && dr.mutated && (dr.kind === 'moveObject' || dr.kind === 'moveNodes' || dr.kind === 'handleIn' || dr.kind === 'handleOut' || dr.kind === 'dragRadius'));
    const isMovingObjNow = !!(dr && dr.mutated && dr.kind === 'moveObject');
    const objDx = isMovingObjNow ? (dr.lastDx || 0) : 0;
    const objDy = isMovingObjNow ? (dr.lastDy || 0) : 0;
    const isZoomingNow = !!(interRef.current && (!dr || dr.kind === 'pinch') && wheelT.current);
    const denseNodes = totalNodesCount > 600;

    /* Bangun Path2D live secara real-time untuk path SVG yang sedang digeser/diedit */
    const buildLivePathItem = it => {
      if (!isEditingGeom || !movingKeys.size) return it;
      const usesMov = (it.outerKey && movingKeys.has(it.outerKey)) ||
                      (it.holeKeys && it.holeKeys.some(hk => movingKeys.has(hk)));
      if (!usesMov) return it;
      if (isMovingObjNow) {
        let nextFillGrad = it.fillGrad;
        if (it.fillGrad && (objDx || objDy)) {
          nextFillGrad = it.fillGrad.type === 'radial'
            ? { ...it.fillGrad, cx: (it.fillGrad.cx || 0) + objDx, cy: (it.fillGrad.cy || 0) + objDy, ...(it.fillGrad.fx != null ? { fx: it.fillGrad.fx + objDx, fy: (it.fillGrad.fy || 0) + objDy } : {}) }
            : { ...it.fillGrad, x1: (it.fillGrad.x1 || 0) + objDx, y1: (it.fillGrad.y1 || 0) + objDy, x2: (it.fillGrad.x2 || 0) + objDx, y2: (it.fillGrad.y2 || 0) + objDy };
        }
        const outerMov = !!(it.outerKey && movingKeys.has(it.outerKey));
        const allHolesMov = !it.holeKeys || !it.holeKeys.length || it.holeKeys.every(hk => movingKeys.has(hk));
        if (outerMov && allHolesMov && typeof DOMMatrix !== 'undefined') {
          const liveP2d = new Path2D();
          liveP2d.addPath(it.p2d, new DOMMatrix([1, 0, 0, 1, objDx, objDy]));
          return { ...it, p2d: liveP2d, fillGrad: nextFillGrad };
        }
      }
      const { loopByKey, origDByKey } = assembledFillLayers;
      const matMov = (isMovingObjNow && typeof DOMMatrix !== 'undefined' && (objDx || objDy)) ? new DOMMatrix([1, 0, 0, 1, objDx, objDy]) : null;
      const liveP2d = new Path2D();
      let hasSub = false;
      if (it.outerKey) {
        const olp = loopByKey.get(it.outerKey);
        if (olp) {
          const oc = ndEnsureLoopCache(olp);
          if (oc && oc.fillP2d) {
            if (matMov && movingKeys.has(it.outerKey)) liveP2d.addPath(oc.fillP2d, matMov);
            else liveP2d.addPath(oc.fillP2d);
            hasSub = true;
          }
        } else if (origDByKey.has(it.outerKey)) {
          liveP2d.addPath(getCachedPath2D(origDByKey.get(it.outerKey)));
          hasSub = true;
        }
      }
      if (it.holeKeys && it.holeKeys.length) {
        for (const hk of it.holeKeys) {
          const hlp = loopByKey.get(hk);
          if (hlp) {
            const hc = ndEnsureLoopCache(hlp);
            if (hc && hc.fillP2d) {
              if (matMov && movingKeys.has(hk)) liveP2d.addPath(hc.fillP2d, matMov);
              else liveP2d.addPath(hc.fillP2d);
              hasSub = true;
            }
          } else if (origDByKey.has(hk)) {
            liveP2d.addPath(getCachedPath2D(origDByKey.get(hk)));
            hasSub = true;
          }
        }
      }
      if (!hasSub) return it;
      let nextFillGrad = it.fillGrad;
      if (isMovingObjNow && it.fillGrad && (objDx || objDy)) {
        nextFillGrad = it.fillGrad.type === 'radial'
          ? { ...it.fillGrad, cx: (it.fillGrad.cx || 0) + objDx, cy: (it.fillGrad.cy || 0) + objDy, ...(it.fillGrad.fx != null ? { fx: it.fillGrad.fx + objDx, fy: (it.fillGrad.fy || 0) + objDy } : {}) }
          : { ...it.fillGrad, x1: (it.fillGrad.x1 || 0) + objDx, y1: (it.fillGrad.y1 || 0) + objDy, x2: (it.fillGrad.x2 || 0) + objDx, y2: (it.fillGrad.y2 || 0) + objDy };
      }
      return { ...it, p2d: liveP2d, fillGrad: nextFillGrad };
    };

    /* Partisi allPaths khusus saat sedang drag (isEditingGeom === true) agar liveActivePaths HANYA berisi path yang benar-benar bergerak! */
    let liveBelowPaths = assembledFillLayers.allPaths;
    let liveActivePaths = [];
    let liveAbovePaths = [];
    if (isEditingGeom && showFill && assembledFillLayers.allPaths && assembledFillLayers.allPaths.length && movingKeys.size) {
      const allP = assembledFillLayers.allPaths;
      const isMovPath = p => (p.outerKey && movingKeys.has(p.outerKey)) || (p.holeKeys && p.holeKeys.some(hk => movingKeys.has(hk)));
      let lastMov = -1;
      for (let i = 0; i < allP.length; i++) {
        if (isMovPath(allP[i])) lastMov = i;
      }
      if (lastMov !== -1) {
        liveBelowPaths = [];
        for (let i = 0; i < allP.length; i++) {
          if (isMovPath(allP[i])) liveActivePaths.push(allP[i]);
          else if (i < lastMov) liveBelowPaths.push(allP[i]);
          else liveAbovePaths.push(allP[i]);
        }
      }
    }

    /* Helper 1: Gambar layer statis (Bingkai + Ghost + Seluruh Kontur Non-Aktif + Simpul Non-Aktif) pada targetCtx */
    const renderInactiveScene = (tCtx, tOx, tOy, tW, tH, part) => {
      const doLower = part !== 'upper';
      const doUpper = part !== 'lower';
      const padDoc = 14 / z;
      const vMinX = (0 - tOx) / z - padDoc;
      const vMaxX = (tW - tOx) / z + padDoc;
      const vMinY = (0 - tOy) / z - padDoc;
      const vMaxY = (tH - tOy) / z + padDoc;

      tCtx.save();
      tCtx.translate(tOx, tOy);
      tCtx.scale(z, z);

      const maxAntiGapW = 0.75 / Math.max(0.1, z);
      const drawSvgPathItems = items => {
        if (!items || !items.length) return;
        for (let pi = 0, pn = items.length; pi < pn; pi++) {
          const it = items[pi];
          if (it.bb && (it.bb[2] < vMinX || it.bb[0] > vMaxX || it.bb[3] < vMinY || it.bb[1] > vMaxY)) continue;
          tCtx.globalAlpha = it.opacity ?? 1;
          if (it.fill && it.fill !== 'none') {
            fillCanvasPath(tCtx, it);
          }
          if (it.stroke && it.stroke !== 'none' && it.strokeWidth > 0) {
            tCtx.strokeStyle = resolveCanvasPaint(tCtx, it.stroke, it.strokeGrad);
            tCtx.lineWidth = Math.min(it.strokeWidth, maxAntiGapW);
            tCtx.lineJoin = it.lineJoin || 'miter';
            tCtx.lineCap = it.lineCap || 'butt';
            tCtx.stroke(it.p2d);
          }
        }
        tCtx.globalAlpha = 1;
      };

      if (doLower) {
        /* Bingkai kanvas dokumen */
        tCtx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
        tCtx.lineWidth = 1.2 / z;
        tCtx.strokeRect(0, 0, W, H);

        /* Ghost bitmap asli saat mode outline (showFill = false) */
        if (showGhost && !showFill && bmp && ghostOp > 0) {
          tCtx.save();
          tCtx.globalAlpha = ghostOp / 100;
          tCtx.imageSmoothingEnabled = vRef.current.z < 3;
          tCtx.drawImage(bmp, 0, 0, W, H);
          tCtx.restore();
        }

        /* Fill SVG yang berada DI BELAKANG komponen kontur aktif */
        if (showFill) drawSvgPathItems(liveBelowPaths);
      }

      const chunks = liveSpatialCache.chunks;
      if (!doUpper) { tCtx.restore(); return; }

      /* Fill SVG yang berada DI DEPAN komponen kontur aktif */
      if (showFill) drawSvgPathItems(liveAbovePaths);

      /* Ghost bitmap asli saat mode Fill aktif: digambar semi-transparan di atas fill & di bawah garis/simpul agar referensi terlihat jelas */
      if (showGhost && showFill && bmp && ghostOp > 0) {
        tCtx.save();
        tCtx.globalAlpha = ghostOp / 100;
        tCtx.imageSmoothingEnabled = vRef.current.z < 3;
        tCtx.drawImage(bmp, 0, 0, W, H);
        tCtx.restore();
      }

      if (isEditingGeom) {
        /* Saat sedang drag objek/node, gabungkan HANYA kontur & simpul non-moving (kecualikan movingIdxSet!)
           agar tidak ada node bayangan yang tertinggal di posisi lama saat objek digeser! */
        const batchLine = new Path2D(), batchCurve = new Path2D(), batchFillet = new Path2D();
        let anyL = false, anyC = false, anyF = false;
        const sharpList = [], smoothList = [], roundList = [];
        let sharpLen = 0, smoothLen = 0, roundLen = 0;
        for (let li = 0, nl = loops.length; li < nl; li++) {
          if (movingIdxSet.has(li)) continue;
          const lp = loops[li];
          if (!lp || lp.hidden || hidSet.has(lp.label)) continue;
          const c = ndEnsureLoopCache(lp);
          if (c.maxX < vMinX || c.minX > vMaxX || c.maxY < vMinY || c.minY > vMaxY) continue;
          if (c.hasLine) { batchLine.addPath(c.lineP2d); anyL = true; }
          if (c.hasCurve) { batchCurve.addPath(c.curveP2d); anyC = true; }
          if (c.hasFillet) { batchFillet.addPath(c.filletP2d); anyF = true; }
          if (showNodesAll) {
            if (c.sharpPts.length) { sharpList.push(c.sharpPts); sharpLen += c.sharpPts.length; }
            if (c.smoothPts.length) { smoothList.push(c.smoothPts); smoothLen += c.smoothPts.length; }
            if (c.roundPts.length) { roundList.push(c.roundPts); roundLen += c.roundPts.length; }
          }
        }
        tCtx.lineWidth = 1.2 / z;
        if (anyL) { tCtx.strokeStyle = '#34d399'; tCtx.stroke(batchLine); }
        if (anyC) { tCtx.strokeStyle = '#818cf8'; tCtx.stroke(batchCurve); }
        if (anyF) { tCtx.strokeStyle = '#f472b6'; tCtx.stroke(batchFillet); }
        tCtx.restore();
        if (showNodesAll) {
          const occObj = denseNodes ? createWorldOccGrid(vMinX, vMaxX, vMinY, vMaxY, z, 4.5) : null;
          for (let i = 0; i < sharpList.length; i++) {
            drawScreenPinSpritesBatch(tCtx, sharpList[i], 'sharp', 3.1, 1.2, 1, tOx, tOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occObj);
          }
          for (let i = 0; i < smoothList.length; i++) {
            drawScreenPinSpritesBatch(tCtx, smoothList[i], 'smooth', 3.0, 1.2, 2, tOx, tOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occObj);
          }
          for (let i = 0; i < roundList.length; i++) {
            drawScreenPinSpritesBatch(tCtx, roundList[i], 'round', 3.1, 1.2, 4, tOx, tOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, null);
          }
        }
      } else {
        /* Gambar seluruh kontur menggunakan 4x4 Spatial Chunks dengan warna stroke solid */
        tCtx.lineWidth = 1.2 / z;
        tCtx.strokeStyle = '#34d399';
        for (let ci = 0; ci < chunks.length; ci++) {
          const ck = chunks[ci];
          if (!ck.hasLine || ck.maxX < vMinX || ck.minX > vMaxX || ck.maxY < vMinY || ck.minY > vMaxY) continue;
          tCtx.stroke(ck.lineP2d);
        }
        tCtx.strokeStyle = '#818cf8';
        for (let ci = 0; ci < chunks.length; ci++) {
          const ck = chunks[ci];
          if (!ck.hasCurve || ck.maxX < vMinX || ck.minX > vMaxX || ck.maxY < vMinY || ck.minY > vMaxY) continue;
          tCtx.stroke(ck.curveP2d);
        }
        tCtx.strokeStyle = '#f472b6';
        for (let ci = 0; ci < chunks.length; ci++) {
          const ck = chunks[ci];
          if (!ck.hasFillet || ck.maxX < vMinX || ck.minX > vMaxX || ck.maxY < vMinY || ck.minY > vMaxY) continue;
          tCtx.stroke(ck.filletP2d);
        }
        tCtx.restore();

        /* Gambar simpul per-chunk yang masuk viewport + World-Locked Occupancy Grid adaptif */
        if (showNodesAll) {
          const occCellPx = totalNodesCount > 4000 ? 6.5 : totalNodesCount > 1500 ? 5.0 : 4.2;
          const occObj = denseNodes ? createWorldOccGrid(vMinX, vMaxX, vMinY, vMaxY, z, occCellPx) : null;
          for (let ci = 0; ci < chunks.length; ci++) {
            const ck = chunks[ci];
            if (ck.maxX < vMinX || ck.minX > vMaxX || ck.maxY < vMinY || ck.minY > vMaxY) continue;
            if (ck.sharpPts.length) drawScreenPinSpritesBatch(tCtx, ck.sharpPts, 'sharp', 3.1, 1.2, 1, tOx, tOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occObj);
            if (ck.smoothPts.length) drawScreenPinSpritesBatch(tCtx, ck.smoothPts, 'smooth', 3.0, 1.2, 2, tOx, tOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occObj);
            if (ck.roundPts.length) drawScreenPinSpritesBatch(tCtx, ck.roundPts, 'round', 3.1, 1.2, 4, tOx, tOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, null);
          }
        }
      }

      /* [VIS-CTRL] Handle Bézier untuk SEMUA objek non-aktif (opsional, di-batch per warna agar tetap ringan) */
      if (showHandlesAllObj) {
        tCtx.save();
        tCtx.translate(tOx, tOy);
        tCtx.scale(z, z);
        const hrA = 3.3 / z;
        tCtx.setLineDash([]);
        tCtx.lineWidth = 1.1 / z;
        const inLines = new Path2D(), outLines = new Path2D(), inDots = new Path2D(), outDots = new Path2D();
        let any = false;
        for (let li = 0; li < loops.length; li++) {
          if (li === activeLoopIdx || movingIdxSet.has(li)) continue;
          const lp = loops[li];
          if (!lp || lp.hidden || hidSet.has(lp.label)) continue;
          const c = ndEnsureLoopCache(lp);
          if (c.maxX < vMinX || c.minX > vMaxX || c.maxY < vMinY || c.minY > vMaxY) continue;
          const nodes = lp.nodes, m = nodes.length;
          for (let i = 0; i < m; i++) {
            const nd = nodes[i];
            if (nd.x < vMinX || nd.x > vMaxX || nd.y < vMinY || nd.y > vMaxY) continue;
            if (c.fillets && c.fillets[i]) continue;
            const prev = nodes[(i - 1 + m) % m], next = nodes[(i + 1) % m];
            const iX = nd.inLine ? (nd.x + (prev.x - nd.x) * 0.28) : (nd.inX ?? nd.x);
            const iY = nd.inLine ? (nd.y + (prev.y - nd.y) * 0.28) : (nd.inY ?? nd.y);
            const oX = nd.outLine ? (nd.x + (next.x - nd.x) * 0.28) : (nd.outX ?? nd.x);
            const oY = nd.outLine ? (nd.y + (next.y - nd.y) * 0.28) : (nd.outY ?? nd.y);
            if (Math.abs(iX - nd.x) + Math.abs(iY - nd.y) > 1e-6) {
              inLines.moveTo(nd.x, nd.y); inLines.lineTo(iX, iY);
              inDots.moveTo(iX + hrA, iY); inDots.arc(iX, iY, hrA, 0, Math.PI * 2); any = true;
            }
            if (Math.abs(oX - nd.x) + Math.abs(oY - nd.y) > 1e-6) {
              outLines.moveTo(nd.x, nd.y); outLines.lineTo(oX, oY);
              outDots.moveTo(oX + hrA, oY); outDots.arc(oX, oY, hrA, 0, Math.PI * 2); any = true;
            }
          }
        }
        if (any) {
          tCtx.strokeStyle = '#06b6d4'; tCtx.stroke(inLines);
          tCtx.strokeStyle = '#a855f7'; tCtx.stroke(outLines);
          tCtx.fillStyle = '#06b6d4'; tCtx.fill(inDots);
          tCtx.fillStyle = '#a855f7'; tCtx.fill(outDots);
        }
        tCtx.restore();
      }
    };

    /* Helper 1b: Fill komponen SVG aktif pada posisi Z yang tepat (real-time 60fps saat geser objek maupun edit node) */
    const renderActiveFill = (tCtx, tOx, tOy, tW, tH) => {
      if (!showFill || !liveActivePaths.length) return;
      tCtx.save();
      tCtx.translate(tOx, tOy);
      tCtx.scale(z, z);

      for (let pi = 0, pn = liveActivePaths.length; pi < pn; pi++) {
        const it = buildLivePathItem(liveActivePaths[pi]);
        tCtx.globalAlpha = it.opacity ?? 1;
        if (it.fill && it.fill !== 'none') {
          fillCanvasPath(tCtx, it);
        }
        if (it.stroke && it.stroke !== 'none' && it.strokeWidth > 0) {
          tCtx.strokeStyle = resolveCanvasPaint(tCtx, it.stroke, it.strokeGrad);
          tCtx.lineWidth = it.strokeWidth;
          tCtx.lineJoin = it.lineJoin || 'round';
          tCtx.lineCap = it.lineCap || 'round';
          tCtx.stroke(it.p2d);
        }
      }
      tCtx.globalAlpha = 1;
      tCtx.restore();
    };

    /* Helper 1c: Susun base scene (tanpa active contour/handles agar panOverscanCache tidak pernah batal saat klik node/objek) */
    const renderBaseScene = (tCtx, tOx, tOy, tW, tH) => {
      renderInactiveScene(tCtx, tOx, tOy, tW, tH, 'lower');
      renderInactiveScene(tCtx, tOx, tOy, tW, tH, 'upper');
    };

    /* Helper 2: Gambar Kontur Aktif + Simpul Aktif + Handle Bézier + Node Terpilih pada targetCtx */
    const renderActiveContourAndHandles = (tCtx, tOx, tOy, tW, tH) => {
      if (!actLp || actLp.hidden || hidSet.has(actLp.label)) return;
      const effOx = tOx + objDx * z;
      const effOy = tOy + objDy * z;
      const padDoc = 18 / z;
      const vMinX = (0 - effOx) / z - padDoc;
      const vMaxX = (tW - effOx) / z + padDoc;
      const vMinY = (0 - effOy) / z - padDoc;
      const vMaxY = (tH - effOy) / z + padDoc;
      const cache = ndEnsureLoopCache(actLp);

      tCtx.save();
      tCtx.translate(effOx, effOy);
      tCtx.scale(z, z);

      for (const mLi of movingLoopIndices) {
        const mLp = loops[mLi];
        if (!mLp || mLp.hidden || hidSet.has(mLp.label)) continue;
        const mCache = ndEnsureLoopCache(mLp);
        if (mCache.maxX < vMinX || mCache.minX > vMaxX || mCache.maxY < vMinY || mCache.minY > vMaxY) continue;
        tCtx.lineWidth = 2.1 / z;
        if (mCache.hasLine) {
          tCtx.strokeStyle = '#10b981';
          tCtx.stroke(mCache.lineP2d);
        }
        if (mCache.hasCurve) {
          tCtx.strokeStyle = '#4f46e5';
          tCtx.stroke(mCache.curveP2d);
        }
        if (mCache.hasFillet) {
          tCtx.strokeStyle = '#ec4899';
          tCtx.stroke(mCache.filletP2d);
        }
      }

      /* Garis bantu lurus (dashed) bila 2 node dipilih */
      if (selNodes.length === 2) {
        const nA = actLp.nodes[selNodes[0]];
        const nB = actLp.nodes[selNodes[1]];
        if (nA && nB) {
          tCtx.save();
          tCtx.setLineDash([6 / z, 4 / z]);
          tCtx.strokeStyle = '#f59e0b';
          tCtx.lineWidth = 2 / z;
          tCtx.beginPath();
          tCtx.moveTo(nA.x, nA.y);
          tCtx.lineTo(nB.x, nB.y);
          tCtx.stroke();
          tCtx.restore();
        }
      }
      tCtx.restore();

      /* Simpul pada SELURUH kontur yang ikut bergerak (movingLoopIndices) agar semua node ikut pindah bersama objek! */
      if (showNodesSel || (isEditingGeom && showNodesAll)) {
        for (const mLi of movingLoopIndices) {
          const mLp = loops[mLi];
          if (!mLp || mLp.hidden || hidSet.has(mLp.label)) continue;
          const mCache = ndEnsureLoopCache(mLp);
          if (mCache.maxX < vMinX || mCache.minX > vMaxX || mCache.maxY < vMinY || mCache.minY > vMaxY) continue;
          const isPrimary = mLi === effActIdx;
          if (isPrimary ? !showNodesSel : !showNodesAll) continue;
          const rPin = isPrimary ? 4.4 : 3.5;
          drawScreenPinSpritesBatch(tCtx, mCache.sharpPts, 'sharp', rPin, 1.3, 1, effOx, effOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, null);
          drawScreenPinSpritesBatch(tCtx, mCache.smoothPts, 'smooth', rPin, 1.3, 2, effOx, effOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, null);
          drawScreenPinSpritesBatch(tCtx, mCache.roundPts, 'round', rPin, 1.3, 4, effOx, effOy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, null);
        }
      }

      /* Handle Bézier & Node Terpilih pada Kontur Aktif */
      tCtx.save();
      tCtx.translate(effOx, effOy);
      tCtx.scale(z, z);
      const m = actLp.nodes.length;
      const handleIndices = !showHandlesSel ? [] : (showAllHandles ? actLp.nodes.map((_, idx) => idx) : selNodes);

      for (const i of handleIndices) {
        const nd = actLp.nodes[i];
        if (!nd) continue;
        if (nd.x < vMinX - 40 / z || nd.x > vMaxX + 40 / z || nd.y < vMinY - 40 / z || nd.y > vMaxY + 40 / z) continue;
        const fl = cache.fillets[i];
        if (fl) {
          tCtx.save();
          tCtx.setLineDash([3 / z, 3 / z]);
          tCtx.strokeStyle = 'rgba(236, 72, 153, 0.75)';
          tCtx.lineWidth = 1.2 / z;
          tCtx.beginPath();
          tCtx.moveTo(fl.tIn[0], fl.tIn[1]);
          tCtx.lineTo(nd.x, nd.y);
          tCtx.lineTo(fl.tOut[0], fl.tOut[1]);
          tCtx.stroke();
          tCtx.restore();

          tCtx.fillStyle = '#ec4899';
          tCtx.strokeStyle = '#ffffff';
          tCtx.lineWidth = 1.5 / z;
          tCtx.beginPath();
          tCtx.arc(fl.handleCenter[0], fl.handleCenter[1], 4.6 / z, 0, Math.PI * 2);
          tCtx.fill();
          tCtx.stroke();
          continue;
        }

        const prev = actLp.nodes[(i - 1 + m) % m];
        const next = actLp.nodes[(i + 1) % m];
        const effInX = nd.inLine ? (nd.x + (prev.x - nd.x) * 0.28) : (nd.inX ?? nd.x);
        const effInY = nd.inLine ? (nd.y + (prev.y - nd.y) * 0.28) : (nd.inY ?? nd.y);
        const effOutX = nd.outLine ? (nd.x + (next.x - nd.x) * 0.28) : (nd.outX ?? nd.x);
        const effOutY = nd.outLine ? (nd.y + (next.y - nd.y) * 0.28) : (nd.outY ?? nd.y);

        tCtx.save();
        if (nd.inLine) tCtx.setLineDash([3 / z, 3 / z]);
        tCtx.strokeStyle = '#06b6d4';
        tCtx.lineWidth = 1.4 / z;
        tCtx.beginPath();
        tCtx.moveTo(nd.x, nd.y);
        tCtx.lineTo(effInX, effInY);
        tCtx.stroke();
        tCtx.restore();

        tCtx.save();
        if (nd.outLine) tCtx.setLineDash([3 / z, 3 / z]);
        tCtx.strokeStyle = '#a855f7';
        tCtx.lineWidth = 1.4 / z;
        tCtx.beginPath();
        tCtx.moveTo(nd.x, nd.y);
        tCtx.lineTo(effOutX, effOutY);
        tCtx.stroke();
        tCtx.restore();

        const hr = 4.2 / z;
        tCtx.fillStyle = nd.inLine ? '#ffffff' : '#06b6d4';
        tCtx.strokeStyle = '#06b6d4';
        tCtx.lineWidth = 1.6 / z;
        tCtx.beginPath();
        tCtx.arc(effInX, effInY, hr, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.stroke();

        tCtx.fillStyle = nd.outLine ? '#ffffff' : '#a855f7';
        tCtx.strokeStyle = '#a855f7';
        tCtx.lineWidth = 1.6 / z;
        tCtx.beginPath();
        tCtx.arc(effOutX, effOutY, hr, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.stroke();
      }

      /* Gambar Node Terpilih & Label Radius di atas layer lain */
      const specialIndices = new Set(showNodesSel ? selNodes : []);
      if (showNodesSel && lineFirstNode && lineFirstNode.loopIdx === activeLoopIdx) specialIndices.add(lineFirstNode.nodeIdx);
      for (const i of specialIndices) {
        const nd = actLp.nodes[i];
        if (!nd) continue;
        const isSel = selSet.has(i);
        const isLineFirst = lineFirstNode && lineFirstNode.loopIdx === activeLoopIdx && lineFirstNode.nodeIdx === i;
        const drawX = cache.drawPts[i * 2];
        const drawY = cache.drawPts[i * 2 + 1];
        const nr = 6.2 / z;

        tCtx.save();
        tCtx.lineWidth = 2.2 / z;
        tCtx.strokeStyle = '#1e1b4b';
        if (nd.radius > 0.15) {
          tCtx.fillStyle = '#db2777';
          tCtx.beginPath();
          tCtx.arc(drawX, drawY, nr, 0, Math.PI * 2);
          tCtx.fill();
          tCtx.stroke();
        } else if (nd.sharp) {
          tCtx.fillStyle = '#ea580c';
          tCtx.beginPath();
          tCtx.rect(drawX - nr, drawY - nr, nr * 2, nr * 2);
          tCtx.fill();
          tCtx.stroke();
        } else {
          tCtx.fillStyle = '#0284c7';
          tCtx.beginPath();
          tCtx.arc(drawX, drawY, nr, 0, Math.PI * 2);
          tCtx.fill();
          tCtx.stroke();
        }

        tCtx.strokeStyle = isLineFirst ? '#10b981' : '#4f46e5';
        tCtx.lineWidth = 1.8 / z;
        tCtx.beginPath();
        tCtx.arc(drawX, drawY, nr + 3.2 / z, 0, Math.PI * 2);
        tCtx.stroke();

        if (nd.radius > 0.15 && (isSel || vRef.current.z >= 1.2)) {
          tCtx.font = `700 ${Math.round(10.5 / z)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          const lbl = `R=${Math.round(nd.radius * 10) / 10}`;
          tCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          const tw = tCtx.measureText(lbl).width;
          tCtx.fillRect(drawX + 7 / z, drawY - 8 / z, tw + 6 / z, 14 / z);
          tCtx.fillStyle = '#fbcfe8';
          tCtx.fillText(lbl, drawX + 10 / z, drawY + 2 / z);
        }
        tCtx.restore();
      }
      tCtx.restore();
    };

    /* Helper 3: Overlay dinamis ringan (Smart Snap Guides 12 Skenario, garis karet Line, preview Add, Marquee) */
    const renderDynamicOverlay = () => {
      const snapState = activeSnapRef.current;
      if (!mq && !(snapState && snapState.guides && snapState.guides.length) && !(tool === 'line' && lineFirstNode) && !(tool === 'add' && hoverState && hoverState.type === 'segment')) return;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(z, z);

      /* Garis Bantu Merah & Indikator Visual Snapping 100% Ala Figma (#f24822) */
      if (snapState && snapState.guides && snapState.guides.length) {
        ctx.save();
        const drawFigmaCross = (tx, ty) => {
          const cs = 3.6 / z;
          ctx.beginPath();
          ctx.moveTo(tx - cs, ty - cs); ctx.lineTo(tx + cs, ty + cs);
          ctx.moveTo(tx + cs, ty - cs); ctx.lineTo(tx - cs, ty + cs);
          ctx.stroke();
        };
        for (const g of snapState.guides) {
          const col = g.color || '#f24822';
          ctx.strokeStyle = col;
          ctx.fillStyle = col;
          ctx.lineWidth = 1.25 / z;
          ctx.setLineDash([]);
          if (g.type === 'v') {
            ctx.beginPath();
            ctx.moveTo(g.x, g.y1 ?? 0);
            ctx.lineTo(g.x, g.y2 ?? H);
            ctx.stroke();
          } else if (g.type === 'h') {
            ctx.beginPath();
            ctx.moveTo(g.x1 ?? 0, g.y);
            ctx.lineTo(g.x2 ?? W, g.y);
            ctx.stroke();
          } else if (g.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(g.x1, g.y1);
            ctx.lineTo(g.x2, g.y2);
            ctx.stroke();
          } else if (g.type === 'distH') {
            const cap = 4.2 / z;
            ctx.beginPath();
            ctx.moveTo(g.x1, g.y); ctx.lineTo(g.x2, g.y);
            ctx.moveTo(g.x1, g.y - cap); ctx.lineTo(g.x1, g.y + cap);
            ctx.moveTo(g.x2, g.y - cap); ctx.lineTo(g.x2, g.y + cap);
            ctx.stroke();
            if (g.dist != null) {
              const txt = String(g.dist);
              ctx.font = `700 ${Math.max(8, Math.round(10 / z))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
              const tw = ctx.measureText(txt).width;
              const pw = tw + 8 / z, ph = 15 / z;
              const mx = (g.x1 + g.x2) * 0.5 - pw * 0.5;
              const my = g.y - ph - 3 / z;
              ctx.fillStyle = col;
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(mx, my, pw, ph, 3.5 / z);
              else ctx.rect(mx, my, pw, ph);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.fillText(txt, mx + 4 / z, my + ph * 0.74);
            }
          } else if (g.type === 'distV') {
            const cap = 4.2 / z;
            ctx.beginPath();
            ctx.moveTo(g.x, g.y1); ctx.lineTo(g.x, g.y2);
            ctx.moveTo(g.x - cap, g.y1); ctx.lineTo(g.x + cap, g.y1);
            ctx.moveTo(g.x - cap, g.y2); ctx.lineTo(g.x + cap, g.y2);
            ctx.stroke();
            if (g.dist != null) {
              const txt = String(g.dist);
              ctx.font = `700 ${Math.max(8, Math.round(10 / z))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
              const tw = ctx.measureText(txt).width;
              const pw = tw + 8 / z, ph = 15 / z;
              const mx = g.x + 4 / z;
              const my = (g.y1 + g.y2) * 0.5 - ph * 0.5;
              ctx.fillStyle = col;
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(mx, my, pw, ph, 3.5 / z);
              else ctx.rect(mx, my, pw, ph);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.fillText(txt, mx + 4 / z, my + ph * 0.74);
            }
          } else if (g.type === 'point') {
            drawFigmaCross(g.x, g.y);
          }
          if (g.ticks && g.ticks.length) {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.4 / z;
            for (const [tx, ty] of g.ticks) {
              drawFigmaCross(tx, ty);
            }
          }
        }
        ctx.restore();
      }

      if (tool === 'line' && lineFirstNode && loops[lineFirstNode.loopIdx]) {
        const n1 = loops[lineFirstNode.loopIdx].nodes[lineFirstNode.nodeIdx];
        if (n1 && hoverState) {
          ctx.save();
          ctx.setLineDash([6 / z, 4 / z]);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.2 / z;
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(hoverState.docX, hoverState.docY);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (tool === 'add' && hoverState && hoverState.type === 'segment' && hoverState.pt) {
        const [px, py] = hoverState.pt;
        ctx.save();
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / z;
        ctx.beginPath();
        ctx.arc(px, py, 6 / z, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (mq) {
        ctx.save();
        ctx.fillStyle = 'rgba(79, 70, 229, 0.12)';
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 1.5 / z;
        ctx.setLineDash([4 / z, 3 / z]);
        const mx = Math.min(mq.x0, mq.x1), my = Math.min(mq.y0, mq.y1);
        const mw = Math.abs(mq.x1 - mq.x0), mh = Math.abs(mq.y1 - mq.y0);
        ctx.fillRect(mx, my, mw, mh);
        ctx.strokeRect(mx, my, mw, mh);
        ctx.restore();
      }

      ctx.restore();
    };

    /* JALUR A: Sedang memindahkan objek SVG (moveObject) atau mengedit geometri kontur aktif (moveNodes / handle / radius)
       -> Blit layer kontur non-aktif dari inactiveLayerCacheRef (0.05 ms) + gambar ulang objek/kontur aktif secara REAL-TIME 60fps! */
    if (isEditingGeom) {
      const inactKey = [
        bw, bh, dpr, z.toFixed(5), ox.toFixed(2), oy.toFixed(2),
        movingLoopIndices.join(','), showFill ? 1 : 0, showGhost && bmp ? ghostOp : 0,
        showNodesAll ? 1 : 0, showHandlesAllObj ? 1 : 0,
        (sess.hiddenLabels || []).join(','), W, H
      ].join('|');
      let ic = inactiveLayerCacheRef.current;
      if (!ic.cv || !ic.cv2 || ic.key !== inactKey) {
        const offLo = ic.cv || document.createElement('canvas');
        const offUp = ic.cv2 || document.createElement('canvas');
        for (const off of [offLo, offUp]) {
          if (off.width !== bw || off.height !== bh) { off.width = bw; off.height = bh; }
        }
        const loCtx = offLo.getContext('2d');
        loCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        loCtx.clearRect(0, 0, cw, ch);
        renderInactiveScene(loCtx, ox, oy, cw, ch, 'lower');
        const upCtx = offUp.getContext('2d');
        upCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        upCtx.clearRect(0, 0, cw, ch);
        renderInactiveScene(upCtx, ox, oy, cw, ch, 'upper');
        ic = { cv: offLo, cv2: offUp, key: inactKey };
        inactiveLayerCacheRef.current = ic;
      }
      ctx.drawImage(ic.cv, 0, 0, cw, ch);
      renderActiveFill(ctx, ox, oy, cw, ch);
      ctx.drawImage(ic.cv2, 0, 0, cw, ch);
      renderActiveContourAndHandles(ctx, ox, oy, cw, ch);
      renderDynamicOverlay();
      return;
    }

    /* JALUR B: Sedang Zooming aktif dengan roda mouse / pinch -> render langsung ke viewport (tanpa margin overscan) */
    if (isZoomingNow) {
      renderBaseScene(ctx, ox, oy, cw, ch);
      renderActiveContourAndHandles(ctx, ox, oy, cw, ch);
      renderDynamicOverlay();
      return;
    }

    /* JALUR C: Panning (Geser Kanvas) & Tampilan Statis/Hover/Pilih Objek/Node -> gunakan Overscan Pan Cache (+160px di 4 sisi)
       tanpa bergantung pada activeLoopIdx/selNodes sehingga memilih objek/node 100% O(1) (<0.15 ms)! */
    const PAD = 160;
    const panKey = [
      sceneVerRef.current,
      showFill ? 1 : 0, showGhost && bmp ? ghostOp : 0,
      showNodesAll ? 1 : 0, showHandlesAllObj ? 1 : 0,
      (sess.hiddenLabels || []).join(','),
      W, H
    ].join('|');

    let pc = panOverscanCacheRef.current;
    const withinOverscan = pc.cv &&
      pc.key === panKey &&
      pc.cw === cw &&
      pc.ch === ch &&
      pc.dpr === dpr &&
      Math.abs(pc.z - z) < 1e-6 &&
      Math.abs(ox - pc.ox) <= PAD &&
      Math.abs(oy - pc.oy) <= PAD;

    if (!withinOverscan) {
      const ow = cw + PAD * 2, oh = ch + PAD * 2;
      const obw = Math.round(ow * dpr), obh = Math.round(oh * dpr);
      const snapOx = Math.round(ox * dpr) / dpr;
      const snapOy = Math.round(oy * dpr) / dpr;
      const off = pc.cv || document.createElement('canvas');
      if (off.width !== obw || off.height !== obh) { off.width = obw; off.height = obh; }
      const oCtx = off.getContext('2d');
      oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      oCtx.clearRect(0, 0, ow, oh);
      renderBaseScene(oCtx, snapOx + PAD, snapOy + PAD, ow, oh);
      pc = { cv: off, key: panKey, ox: snapOx, oy: snapOy, z, dpr, cw, ch };
      panOverscanCacheRef.current = pc;
    }

    const dxDev = Math.round(((ox - pc.ox) - PAD) * dpr);
    const dyDev = Math.round(((oy - pc.oy) - PAD) * dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pc.cv, dxDev, dyDev);
    ctx.restore();
    renderActiveContourAndHandles(ctx, ox, oy, cw, ch);
    renderDynamicOverlay();
  }, [edLoops, inactiveSpatialCache, assembledFillLayers, activeLoopIdx, selNodes, tool, moveObjScope, snapMasterOn, snapConfig, snapGridSize, snapTolPx, lineFirstNode, showAllHandles, showNodesAll, showHandlesAllObj, showNodesSel, showHandlesSel, showGhost, ghostOp, showFill, bmp, v, rszTick, open, W, H, totalNodesCount]);

  drawRef.current = drawNodeCanvas;
  useEffect(() => { drawNodeCanvas(); }, [drawNodeCanvas]);

  const commitAndExit = targetCallback => {
    if (!dirtyRef.current) {
      onApply(sess.regs, false, targetCallback);
      return;
    }
    const nextRegs = ndBuildRegsFromEdLoops(sess.regs, edLoopsRef.current, topoMeta);
    onApply(nextRegs, true, targetCallback);
  };

  const actLoop = edLoops[activeLoopIdx] || null;
  const primaryNode = (actLoop && selNodes.length >= 1) ? actLoop.nodes[selNodes[0]] : null;
  const primaryRadius = (actLoop && selNodes.length >= 1) ? ndEstimateNodeRadius(actLoop.nodes, selNodes[0]) : 0;

  const NODE_TOOLS = [
    ['select', 'Pilih & Edit Vector (V)', 'vector', 'atNodeTool_select'],
    ['pan', 'Geser Kanvas / Pan (H)', 'expand', 'atSegTool_pan'],
    ['add', 'Add Node / Tambah (A)', 'plus', 'atNodeTool_add'],
    ['delete', 'Delete Node / Hapus (D)', 'trash', 'atNodeTool_delete'],
    ['line', 'Garis Lurus 2 Node (L)', 'lineSeg', 'atNodeTool_line'],
    ['radius', 'Radius: Tajam→Rounded (R)', 'radiusCorner', 'atNodeTool_radius'],
    ['sharp', 'Ubah Rounded→Tajam (S)', 'sharpCorner', 'atNodeTool_sharp'],
    ['copyrad', 'Copy Radius Node (C)', 'copy', 'atNodeTool_copyrad'],
    ['pasterad', 'Paste Radius Node (P)', 'paste', 'atNodeTool_pasterad'],
  ];

  const topActions = (<><button type="button" className="rv-btn" disabled={!histCount.u} onClick={undo}>Undo {histCount.u}</button><button type="button" className="rv-btn" disabled={!histCount.r} onClick={redo}>Redo {histCount.r}</button><button type="button" className="rv-btn" onClick={revertAll}>Revert</button><button type="button" className="rv-btn" onClick={onCancel}>Batal</button><button type="button" className="rv-exp rv-sg-apply" onClick={() => commitAndExit(null)}><Ico n="check" size={14} /> Terapkan Vector</button></>);

  return ReactDOM.createPortal((<div className="rv-root rv-node-root"><div className={'rv-stage' + (open ? ' side-open' : '')}><div className="rv-node-canvas"><div ref={wrapRef} className="rv-node-wrap" style={{
        cursor: tool === 'pan' ? 'grab' : tool === 'add' ? 'copy' : tool === 'delete' || tool === 'sharp' || tool === 'radius' ? 'pointer' : emptyDragMode === 'pan' ? 'grab' : 'crosshair'
      }} onContextMenu={e => e.preventDefault()} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={onDoubleClick}><canvas ref={cvRef} className="at-cmp-cv" /></div></div><div className="rv-zoom rv-glass" style={{
      borderRadius: 18,
      padding: 5,
      gap: 3
    }}><button type="button" className={'rv-ibtn' + (tool === 'pan' ? ' on' : '')} style={tool === 'pan' ? {
        background: 'var(--acc)',
        color: '#fff'
      } : undefined} title="Alat Geser Kanvas (H / Space / Seret Area Kosong)" aria-label="Alat Geser Kanvas" onClick={() => setTool(t => t === 'pan' ? 'select' : 'pan')}><Ico n="expand" size={15} /></button><button type="button" className="rv-ibtn" data-tip="atCmpZoomIn" onClick={() => pz.zoomAt(0, 0, vRef.current.z * 1.25, vRef.current)} aria-label="Perbesar"><Ico n="zoomIn" size={15} /></button><span ref={zoomLblRef} className="at-zoomv">{Math.round(v.z * 100)}%</span><button type="button" className="rv-ibtn" data-tip="atCmpZoomOut" onClick={() => pz.zoomAt(0, 0, vRef.current.z / 1.25, vRef.current)} aria-label="Perkecil"><Ico n="zoomOut" size={15} /></button><button type="button" className="rv-ibtn" data-tip="atCmpZoomFit" onClick={pz.reset} aria-label="Pas layar"><Ico n="fit" size={15} /></button></div><RvSide open={sideOpen} onToggle={() => setSideOpen(o => !o)} icon="vector" title="Vector Editor" sub={edLoops.length + ' kontur · ' + totalNodesCount.toLocaleString('id-ID') + ' total node'}><div className="rv-sgp"><div className="rv-sg-acts">{topActions}</div><div className="space-y-3">{colorTarget && <div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><Ico n="palette" size={14} /> Warna, Gradien & Transparansi Objek</span><span className="nd-badge" style={{
                maxWidth: '52%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{colorTarget.isGrad ? colorTarget.curGrad.type === 'radial' ? 'Radial Grad' : 'Linear Grad' : 'Objek #' + (colorTarget.idx + 1)}</span></div><div className="text-[10.5px] mut mb-2 leading-relaxed">Klik kotak warna untuk mengatur <b>Solid</b>, <b>Linear Gradient</b>, <b>Radial Gradient</b>, dan <b>Transparansi ({Math.round((colorTarget.curOpacity ?? 1) * 100)}%)</b> pada objek terpilih.</div><div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}><M3ColorInput key={colorTarget.idx} origValue={colorTarget.origColor} value={colorTarget.curColor} grad={colorTarget.curGrad} opacity={colorTarget.curOpacity} label={colorTarget.isGrad ? colorTarget.curGrad.type === 'radial' ? 'RADIAL GRADIENT' : 'LINEAR GRADIENT' : 'WARNA OBJEK'} detectedPool={job && job.detectedPool && job.detectedPool.length ? job.detectedPool : sess && sess.palette ? sess.palette.map(p => p.hex) : []} onChange={nh => setObjColor(colorTarget.idx, colorTarget.origColor, nh)} onGradChange={(newG, midHx) => setObjGrad(colorTarget.idx, colorTarget.origColor, newG, midHx)} onOpacityChange={op => setObjOpacity(colorTarget.idx, op)} onCommit={() => {
                colorSnapRef.current = false;
              }} onReset={colorTarget.hasOv ? () => resetObjColors(colorTarget.idx) : null} /></div><div className="mt-2.5 flex items-center gap-2 flex-wrap"><button type="button" className="btn sec" style={{
                padding: '5px 10px',
                fontSize: 11.5
              }} disabled={!colorTarget.hasOv} onClick={() => resetObjColors(colorTarget.idx)}><Ico n="reset" size={12} /> Reset Warna</button><button type="button" className="btn sec" style={{
                padding: '5px 10px',
                fontSize: 11.5
              }} onClick={() => setObjPicked(false)}><Ico n="x" size={12} /> Lepas Pilihan</button></div></div>}<div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><Ico n="eye" size={14} /> Tampilan Node & Handle</span><span className="nd-badge">{showNodesAll && showNodesSel && showHandlesAllObj && showHandlesSel ? 'Semua Tampil' : !showNodesAll && !showNodesSel && !showHandlesAllObj && !showHandlesSel ? 'Semua Tersembunyi' : 'Kustom'}</span></div><div className="flex items-center gap-2 flex-wrap"><button type="button" className="btn sec" style={{
                padding: '5px 10px',
                fontSize: 11.5
              }} onClick={() => {
                setShowNodesAll(true);
                setShowNodesSel(true);
                setShowHandlesAllObj(true);
                setShowHandlesSel(true);
                setShowAllHandles(true);
              }}><Ico n="eye" size={12} /> Tampilkan Semua</button><button type="button" className="btn sec" style={{
                padding: '5px 10px',
                fontSize: 11.5
              }} onClick={() => {
                setShowNodesAll(false);
                setShowNodesSel(false);
                setShowHandlesAllObj(false);
                setShowHandlesSel(false);
                setShowAllHandles(false);
              }}><Ico n="x" size={12} /> Sembunyikan Semua</button></div><div className="mt-2.5 pt-2.5" style={{
              borderTop: '1px solid var(--line)'
            }}><div className="text-[11px] font-semibold mut mb-1.5">Objek Lain (Non-Terpilih)</div><div className="flex items-center gap-2 flex-wrap"><button type="button" aria-pressed={showNodesAll} className={'rv-btn' + (showNodesAll ? ' on' : '')} onClick={() => setShowNodesAll(x => !x)}><Ico n="node" size={13} /> Node {showNodesAll ? 'Tampil' : 'Sembunyi'}</button><button type="button" aria-pressed={showHandlesAllObj} className={'rv-btn' + (showHandlesAllObj ? ' on' : '')} onClick={() => setShowHandlesAllObj(x => !x)}><Ico n="curve" size={13} /> Handle {showHandlesAllObj ? 'Tampil' : 'Sembunyi'}</button></div></div><div className="mt-2.5 pt-2.5" style={{
              borderTop: '1px solid var(--line)'
            }}><div className="text-[11px] font-semibold mut mb-1.5">Hanya Objek Terpilih</div><div className="flex items-center gap-2 flex-wrap"><button type="button" aria-pressed={showNodesSel} className={'rv-btn' + (showNodesSel ? ' on' : '')} onClick={() => setShowNodesSel(x => !x)}><Ico n="node" size={13} /> Node {showNodesSel ? 'Tampil' : 'Sembunyi'}</button><button type="button" aria-pressed={showHandlesSel} className={'rv-btn' + (showHandlesSel ? ' on' : '')} onClick={() => setShowHandlesSel(x => !x)}><Ico n="curve" size={13} /> Handle {showHandlesSel ? 'Tampil' : 'Sembunyi'}</button></div><div className="text-[10.5px] mut mt-1.5 leading-relaxed">Klik sebuah objek di kanvas untuk memilihnya. Node/handle yang disembunyikan juga tidak bisa diklik sampai ditampilkan kembali.</div></div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5"><Ico n="vector" size={14} /> Alat Vector Editor</span><span className="nd-badge">{selNodes.length ? selNodes.length + ' Node Dipilih' : 'Interaksi Langsung'}</span></div><div className="nd-tool-grid grid grid-cols-2 gap-2.5">{NODE_TOOLS.map(([id, label, ic, tipKey]) => <button key={id} type="button" data-tip={tipKey} className={'nd-tbtn flex flex-wrap items-center gap-2' + (tool === id ? ' on' : '')} onClick={() => {
                setTool(id);
                if (id !== 'line') setLineFirstNode(null);
              }}><Ico n={ic} size={15} /><span className="flex-1 min-w-0 break-words leading-tight">{label}</span></button>)}</div><div className="mt-2.5 pt-2.5" style={{
              borderTop: '1px solid var(--line)'
            }}><div className="text-[11px] font-semibold mut mb-1.5">Saat Menyeret Area Kosong Kanvas:</div><Seg o={[['pan', 'Langsung Geser (Pan)'], ['marquee', 'Kotak Seleksi Node']]} v={emptyDragMode} on={val => setEmptyDragMode(val)} /><div className="text-[10.5px] mut mt-1.5 leading-relaxed">Klik & seret objek untuk memindahkan objek, klik & seret node untuk mengedit simpul, atau tarik handle untuk melengkungkan kurva secara langsung.</div></div><div className="mt-2 flex items-center gap-2 flex-wrap"><button type="button" className={'rv-btn' + (showAllHandles ? ' on' : '')} onClick={() => setShowAllHandles(s => !s)}><Ico n="curve" size={13} /> {showAllHandles ? 'Semua Handle Aktif' : 'Tampilkan Semua Handle'}</button></div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between gap-2 flex-wrap"><span className="flex items-center gap-1.5"><Ico n="grid" size={14} /> 12 Fungsi Snapping Multi-Skenario</span><span className="nd-badge">{snapMasterOn ? `${enabledSnapCount}/12 Aktif` : 'Nonaktif'}</span></div><div className="flex items-center justify-between gap-2 mb-2.5 p-2 rounded-xl" style={{
              background: 'var(--sub)',
              border: '1px solid var(--line)'
            }}><span className="text-[11.5px] font-semibold">Aktifkan Master Snapping Magnetik</span><AtToggle on={snapMasterOn} act={v => {
                setSnapMasterOn(v);
                flash(v ? 'Sistem 12 Snapping diaktifkan' : 'Sistem Snapping dinonaktifkan');
              }} label="Master Snapping" /></div><div className="flex flex-wrap items-center gap-1.5 mb-2.5"><button type="button" className="rv-btn text-[11px] flex-1 justify-center" onClick={() => applySnapPreset('all')}>Semua (12/12)</button><button type="button" className="rv-btn text-[11px] flex-1 justify-center" onClick={() => applySnapPreset('node')}>Preset Node</button><button type="button" className="rv-btn text-[11px] flex-1 justify-center" onClick={() => applySnapPreset('object')}>Preset Objek</button><button type="button" className="rv-btn text-[11px] justify-center" onClick={() => setAllSnaps(false)}>Reset</button></div><div className="space-y-2.5 mb-3"><div><div className="flex items-center justify-between text-[11px] mb-1"><span className="mut font-semibold">Jarak Magnetik Snap (Toleransi):</span><span className="font-bold font-mono">{snapTolPx} px</span></div><div className="flex items-center gap-2"><Slider min={2} max={24} step={1} value={snapTolPx} on={setSnapTolPx} style={{
                    flex: 1
                  }} /><AtNum v={snapTolPx} min={2} max={24} step={1} on={setSnapTolPx} /></div></div><div><div className="flex items-center justify-between text-[11px] mb-1"><span className="mut font-semibold">Ukuran Kisi Grid (Skenario #1):</span><span className="font-bold font-mono">{snapGridSize} px</span></div><div className="flex items-center gap-2"><Slider min={4} max={64} step={2} value={snapGridSize} on={setSnapGridSize} style={{
                    flex: 1
                  }} /><AtNum v={snapGridSize} min={4} max={64} step={2} on={setSnapGridSize} /></div></div></div><div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1" style={{
              scrollbarWidth: 'thin'
            }}>{SNAP_SCENARIOS.map(sc => {
                const isOn = !!snapConfig[sc.id];
                return <div key={sc.id} role="checkbox" tabIndex={0} aria-checked={isOn} onClick={() => toggleSnapKey(sc.id)} onKeyDown={e => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggleSnapKey(sc.id);
                  }
                }} className={'m3-snap-item' + (isOn ? ' on' : ' opacity-75')}><span className="m3-chk-target" aria-hidden="true" style={{
                    marginTop: 1
                  }}><span className="m3-chk-halo" /><span className="at-chk-box"><svg className="at-chk-svg" width="12" height="12" viewBox="0 0 18 18" fill="none"><path d="M4.2 9.3L7.5 12.6L13.8 5.5" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" /></svg></span></span><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5 flex-wrap"><span className="text-[11.5px] font-bold">{sc.num}. {sc.title}</span><span className="nd-badge" style={{
                        padding: '1px 6px',
                        fontSize: '9.5px'
                      }}>{sc.tag}</span></div><div className="text-[10.5px] mut leading-snug mt-0.5">{sc.desc}</div></div></div>;
              })}</div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5"><Ico n="curve" size={14} /> Edit Bezier Handle & Simpul</span>{primaryNode && <span className="text-[11px] mut font-mono">({Math.round(primaryNode.x)}, {Math.round(primaryNode.y)})</span>}</div><div className="flex flex-wrap items-center gap-3 mb-3"><button type="button" className="btn sec flex-1 min-w-[125px] flex flex-wrap items-center justify-center gap-1.5 text-xs text-center whitespace-normal h-auto py-2.5 px-3" onClick={addNodeFromSelection}><Ico n="plus" size={13} /> <span>Add Node (Sisipkan)</span></button><button type="button" className="btn sec flex-1 min-w-[125px] flex flex-wrap items-center justify-center gap-1.5 text-xs text-center whitespace-normal h-auto py-2.5 px-3" disabled={!selNodes.length} onClick={() => deleteSelectedNodes()}><Ico n="trash" size={13} /> <span>Delete Node ({selNodes.length})</span></button></div><div className="text-[11px] font-semibold mut mb-1">Kontinuitas Handle Bézier:</div><Seg o={[['smooth', 'Smooth G¹'], ['symmetric', 'Simetris G²'], ['corner', 'Bebas C⁰']]} v={primaryNode && primaryNode.handleMode || 'smooth'} on={setSelectedHandleMode} /><div className="mt-2"><button type="button" className="btn sec w-full text-xs justify-center" disabled={!selNodes.length} onClick={pullOutBezierHandles}><Ico n="wand" size={13} /> Munculkan / Tarik Handle Kurva Bézier</button></div><div className="text-[10.5px] mut mt-1.5 leading-relaxed">Tarik bulatan biru (handle masuk) atau ungu (handle keluar) di kanvas untuk membengkokkan kurva. Tahan <kbd className="kbd">Alt</kbd> saat menarik handle untuk mematahkan sudut secara independen.</div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5"><Ico n="lineSeg" size={14} /> Garis Lurus (Luruskan 2 Node)</span><span className="nd-badge">{selNodes.length === 2 ? '2 Node Siap' : 'Pilih 2 Node'}</span></div><div className="text-[11px] mut mb-2 leading-relaxed">Pilih 2 node (<kbd className="kbd">Shift</kbd>+klik pada 2 node, atau gunakan alat <b>Garis Lurus 2 Node</b>) untuk membuat garis lurus presisi di antara keduanya:</div><AtCheck wrap={true} checked={removeMidOnLine} onChange={setRemoveMidOnLine}>Hapus/lebur node perantara di antara 2 node yang diluruskan</AtCheck><div className="mt-2.5 flex flex-wrap gap-2"><button type="button" className="btn pri w-full flex flex-wrap items-center justify-center gap-1.5 text-xs text-center whitespace-normal h-auto py-2.5 px-3.5" disabled={selNodes.length !== 2} onClick={() => straightenTwoNodes()}><Ico n="lineSeg" size={13} /> <span>Luruskan 2 Node yang Dipilih Sekarang</span></button><div className="w-full flex flex-wrap items-center gap-2"><button type="button" className="btn sec flex-1 min-w-[120px] flex flex-wrap items-center justify-center gap-1.5 text-xs text-center whitespace-normal h-auto py-2.5 px-3" disabled={selNodes.length !== 2} onClick={() => straightenTwoNodes(activeLoopIdx, selNodes[0], selNodes[1], 'h')}><span>Lurus Horizontal (Y)</span></button><button type="button" className="btn sec flex-1 min-w-[120px] flex flex-wrap items-center justify-center gap-1.5 text-xs text-center whitespace-normal h-auto py-2.5 px-3" disabled={selNodes.length !== 2} onClick={() => straightenTwoNodes(activeLoopIdx, selNodes[0], selNodes[1], 'v')}><span>Lurus Vertikal (X)</span></button></div></div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5"><Ico n="radiusCorner" size={14} /> Fitur Radius & Copy/Paste Radius</span><span className="font-mono text-[11px] font-bold" style={{
                color: '#ec4899'
              }}>{primaryNode ? `Node: ${primaryRadius} px` : `${radiusVal} px`}</span></div><div className="flex items-center justify-between text-[11px] mb-1"><span className="mut font-semibold">Radius Bulatan Sudut:</span><span className="font-bold">{radiusVal} px</span></div><div className="flex items-center gap-2 mb-2.5"><Slider min={0} max={120} step={0.5} value={radiusVal} on={val => {
                setRadiusVal(val);
                if (selNodes.length) applyRadiusToNodes(activeLoopIdx, selNodes, val, false);
              }} style={{
                flex: 1
              }} /><AtNum v={radiusVal} min={0} max={120} step={0.5} on={val => {
                setRadiusVal(val);
                if (selNodes.length) applyRadiusToNodes(activeLoopIdx, selNodes, val, false);
              }} /></div><div className="flex flex-wrap items-center gap-2 mb-2"><button type="button" className="btn pri flex-1 min-w-[120px] flex flex-wrap items-center justify-center gap-1.5 text-xs text-center whitespace-normal h-auto py-2 px-3" disabled={!selNodes.length} onClick={() => {
                const r = Math.max(2, radiusVal || 14);
                applyRadiusToNodes(activeLoopIdx, selNodes, r, true);
                flash(`Node diubah dari tajam menjadi Rounded (Radius ${r} px)`);
              }}><Ico n="radiusCorner" size={13} /> <span>Tajam → Rounded</span></button><button type="button" className="btn sec flex-1 min-w-[120px] flex flex-wrap items-center justify-center gap-1.5 text-xs text-center whitespace-normal h-auto py-2 px-3" disabled={!selNodes.length} onClick={() => makeNodesSharp()}><Ico n="sharpCorner" size={13} /> <span>Rounded → Tajam</span></button></div><div className="pt-2 mt-2" style={{
              borderTop: '1px solid var(--line)'
            }}><div className="flex items-center justify-between text-[11px] mb-1.5"><span className="mut font-semibold">Copy & Paste Radius Antar-Node:</span><span className="nd-badge">Tersalin: {copiedRadius} px</span></div><div className="grid grid-cols-2 gap-1.5"><button type="button" className="btn sec text-xs justify-center" disabled={!selNodes.length} onClick={() => copyRadiusFromNode()}><Ico n="copy" size={13} /> Copy Radius</button><button type="button" className="btn sec text-xs justify-center" disabled={!selNodes.length} onClick={() => pasteRadiusToNodes()}><Ico n="paste" size={13} /> Paste Radius ({copiedRadius}px)</button></div></div></div><div className="card" style={{
            padding: 14
          }}><div className="text-xs font-bold mb-2 flex items-center gap-1.5"><Ico n="eye" size={14} /> Tampilan & Bayangan Gambar Asli</div><div className="space-y-2"><AtCheck wrap={true} checked={showFill} onChange={setShowFill}>Tampilkan isi warna vektor (Fill)</AtCheck><AtCheck wrap={true} checked={showGhost} onChange={setShowGhost}>Tampilkan bayangan gambar bitmap asli</AtCheck>{showGhost && <div className="flex items-center gap-2"><span className="text-[11px] mut">Opasitas Asli:</span><Slider min={5} max={90} value={ghostOp} on={setGhostOp} style={{
                  flex: 1
                }} /><span className="at-val">{ghostOp}%</span></div>}</div></div></div></div></RvSide></div><div className="rv-top"><div className="rv-tabs rv-glass" role="tablist"><button type="button" role="tab" aria-selected={false} data-tip="atRtTabProcess" className="rv-tab" onClick={() => commitAndExit(onSwitchToTrace)}><Ico n="layers" size={14} /><span>Alur 7 tahap</span></button>{onSwitchToSegEdit && <button type="button" role="tab" aria-selected={false} className="rv-tab" title="Edit segmen" onClick={() => commitAndExit(onSwitchToSegEdit)}><Ico n="brush" size={14} /><span>Edit segmen</span></button>}<button type="button" role="tab" aria-selected={true} data-tip="atRtTabNodeEdit" className="rv-tab on"><Ico n="vector" size={14} /><span>Vector Editor</span></button><button type="button" role="tab" aria-selected={false} data-tip="atRtTabCompare" className="rv-tab" onClick={() => commitAndExit(onSwitchToCompare)}><Ico n="eye" size={14} /><span>Bandingkan</span></button></div>{!open ? <div className="rv-acts rv-glass">{topActions}</div> : <div className="rv-acts rv-glass"><button type="button" className="rv-exp" onClick={() => commitAndExit(null)}><Ico n="check" size={14} /> Terapkan</button><button type="button" className="rv-ibtn" onClick={onCancel} aria-label="Kembali"><Ico n="x" size={16} /></button></div>}</div></div>), document.body);
};

export { NodeEditor };
