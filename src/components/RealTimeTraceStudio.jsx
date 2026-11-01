import React, { useState, useEffect, useRef, useMemo as atUseMemo, useCallback as atUseCallback } from 'react';
import ReactDOM from 'react-dom';
import { VMT } from '../engine/VmtEngine.jsx';
import { useHwConfig } from './HwSettingsPanel.jsx';
import { atUsePanZoom, AtCheck, AtViewToggle } from './TraceSharedUI.jsx';
import { rvUseResizeTick, rvUseWide, parseSvgForCanvas, rvSafe, getCheckerPattern, createWorldOccGrid, drawScreenPinSpritesBatch, buildVectorBitmapCache, fillCanvasPath, resolveCanvasPaint, drawColorHighlightVeil, drawHighlightHud, RvSide, rvUseBodyFlag } from './CanvasRenderUtils.jsx';
import { Ico, Slider } from './CommonControls.jsx';
import { Seg } from './ColorPicker.jsx';
import { AtDetectedPalette } from './PaletteComponents.jsx';

/* =====================================================================
   REAL-TIME TRACING STUDIO & DIAGNOSTIK 7-TAHAP ("Seperti Sedang Menggambar")
   Memvisualisasikan proses dari awal gambar di-scanning, ekstraksi palet,
   QuadTree & MRF Potts, penelusuran graf planar, penguncian sudut C0/G1,
   penggambaran kurva Bézier dengan pena vektor secara live, hingga pewarnaan SVG.
   ===================================================================== */
const RT_STAGE_ICONS = { classify: 'scan', palette: 'palette', segment: 'grid', trace: 'node', smooth: 'shapes', fit: 'curve', assemble: 'layers' };
const RT_STAGES = [
  {
    id: 'classify', idx: 0, f0: 0.00, f1: 0.14,
    short: 'Scanning & Tepi',
    title: '1/7 · Pemindaian Laser, Filter Bilateral & Gradien Tepi Scharr 2D',
    desc: 'Sinar pemindai memetakan intensitas gradien tepi Scharr 2D, meredam noise JPEG dengan filter Bilateral 5×5, dan mendeteksi transparansi alpha.',
    legend: [['#38bdf8', 'Gradien Tepi Halus (Anti-Aliased)'], ['#f59e0b', 'Gradien Kontras Tinggi / Sudut'], ['#10b981', 'Sinar Laser Pemindai']],
    symptoms: [
      'Garis tepi objek utama tampak putus-putus atau terlalu redup pada pindaian neon.',
      'Area latar belakang penuh bintik terang akibat artefak kompresi JPEG / derau.',
      'Muncul cincin putih/abu-abu di sekeliling objek transparan (efek halo alpha).'
    ],
    fixes: [
      'Jika banyak bintik noise di latar, ubah Kualitas Input ke Rendah di Basic/Advanced Wizard.',
      'Jika ada cincin halo di tepi objek transparan, pilih Ratakan ke Putih/Kustom pada tahap Transparansi.'
    ]
  },
  {
    id: 'palette', idx: 1, f0: 0.14, f1: 0.28,
    short: 'Palet CIE-Lab',
    title: '2/7 · Kuantisasi Warna Perseptual CIE-Lab & Eliminasi Klaster Halo',
    desc: 'Memetakan piksel ke ruang warna CIE-Lab menggunakan K-Means++ dan kriteria BIC, lalu memangkas warna semu di perbatasan anti-aliasing.',
    legend: [['#818cf8', 'Gelombang Kuantisasi CIE-Lab'], ['#ffffff', 'Titik Sampel Centroid Warna'], ['#10b981', 'Palet Bersih Bebas-Halo']],
    symptoms: [
      'Dua bagian objek yang warnanya mirip melebur menjadi satu warna yang sama.',
      'Warna detail kecil (seperti aksen logo atau mata) tidak masuk ke dalam daftar palet di bawah.',
      'Muncul warna bayangan/transisi yang tidak diinginkan di antara dua warna utama.'
    ],
    fixes: [
      'Jika ada warna yang hilang/tergabung, pilih mode Unlimited Colors atau tambahkan warna di Custom Colors.',
      'Jika gambar hanya siluet/stempel 2 warna tapi muncul warna ekstra, pilih mode Two Colors.'
    ]
  },
  {
    id: 'segment', idx: 2, f0: 0.28, f1: 0.54,
    short: 'QuadTree & MRF',
    title: '3/7 · Dekomposisi QuadTree, Optimasi MRF Potts & Pembersihan Serpihan',
    desc: 'Membagi gambar menjadi kisi QuadTree adaptif, menghaluskan wilayah piksel dengan Markov Random Field (MRF Potts), dan menyapu serpihan (sliver).',
    legend: [['#10b981', 'Kisi Sub-Blok QuadTree'], ['#f59e0b', 'Piksel Derau/Halo yang Dibersihkan MRF'], ['#0f172a', 'Batas Wilayah Warna']],
    symptoms: [
      'Detail kecil yang penting (seperti titik huruf i, garis tipis, atau tekstur kecil) ikut berkedip oranye dan melebur ke warna latar.',
      'Masih ada pulau-pulau bintik warna liar yang belum tergabung ke wilayah utama.'
    ],
    fixes: [
      'Klik tombol "Edit Piksel di Editor Segmen" untuk melukis atau memulihkan bagian piksel secara manual.',
      'Di Advanced Wizard, turunkan Minimum Pixels (untuk menjaga detail kecil) atau naikkan Complexity.'
    ]
  },
  {
    id: 'trace', idx: 3, f0: 0.54, f1: 0.67,
    short: 'Graf Planar',
    title: '4/7 · Penelusuran Graf Planar & Dekonvolusi Sub-Piksel Pantai',
    desc: 'Menelusuri rantai batas poligon tertutup (half-edge), mengunci titik temu ≥3 warna (T-junction), dan menggeser koordinat ke presisi sub-piksel.',
    legend: [['#38bdf8', 'Kontur Graf Planar Sub-Piksel'], ['#a855f7', 'Pin Titik Temu T/X-Junction (◆)'], ['#f43f5e', 'Ujung Pena Pelacak Kontur']],
    symptoms: [
      'Dua objek yang berdekatan tampak menyambung (bridging) menjadi satu kontur.',
      'Garis tipis terputus di tengah jalan karena lebarnya kurang dari 1 piksel pada resolusi kerja.'
    ],
    fixes: [
      'Gunakan Resolusi Asli (Original) di halaman awal agar celah sempit tidak menyatu.',
      'Gunakan alat Pencil di Editor Segmentasi untuk memisahkan dua area yang menyambung.'
    ]
  },
  {
    id: 'smooth', idx: 4, f0: 0.67, f1: 0.78,
    short: 'Sudut & Smooth',
    title: '5/7 · Penghalusan Elastika CG & Diskriminator Sudut Tajam C⁰ vs Halus G¹',
    desc: 'Meluruhkan tangga piksel (staircase) menjadi kurva elastika mulus sambil mengunci Sudut Tajam C⁰ (kotak oranye) dan Simpul Halus G¹ (bulat biru).',
    legend: [['#f59e0b', 'Sudut Tajam C⁰ (Kotak Oranye)'], ['#06b6d4', 'Sudut Lengkung Halus G¹ (Bulat Biru)'], ['rgba(244,63,94,0.6)', 'Garis Putus Merah = Tangga Piksel Asli']],
    symptoms: [
      'Sudut yang seharusnya runcing/siku (seperti huruf A, V, W, E, L) berubah menjadi bulat karena tidak ditandai Kotak Oranye C⁰.',
      'Lengkungan yang seharusnya mulus (seperti huruf O, C, S, lingkaran) malah patah/bersegi karena muncul Kotak Oranye C⁰ palsu.'
    ],
    fixes: [
      'Buka Advanced Wizard → Tab Smoothing: pilih preset Tipografi A–Z atau Logo Geometris.',
      'Atur Ambang Sudut Tajam (°), Rekonstruksi Puncak Lancip (Apex), atau Preservasi Sudut Membulat (G¹).'
    ]
  },
  {
    id: 'fit', idx: 5, f0: 0.78, f1: 0.93,
    short: 'Gambar Bézier',
    title: '6/7 · Menggambar Kurva Bézier Kubik Real-Time (Gauss-Newton & MDL)',
    desc: 'Pena vektor menggambar setiap segmen Garis Lurus (L) dan Kurva Bézier Kubik (C) secara real-time lengkap dengan tangkai kendali singgung (handle).',
    legend: [['#6366f1', 'Goresan Kurva Bézier Kubik (C)'], ['#10b981', 'Segmen Garis Lurus Presisi (L)'], ['#ec4899', 'Tangkai Kemudi Handle Bézier (P1/P2)']],
    symptoms: [
      'Batang atau tepi yang seharusnya lurus sempurna tampak sedikit melengkung (digambar ungu sebagai kurva C, bukan hijau L).',
      'Jumlah titik simpul (node) terlalu rapat/banyak, atau kurva sedikit meleset dari bayangan gambar asli.'
    ],
    fixes: [
      'Aktifkan Bayangan Asli (25%/50%) di atas kanvas untuk mengecek posisi garis terhadap gambar asli.',
      'Di Advanced Smoothing, naikkan Pelurusan Garis Bengkok & Kunci Sumbu 0°/90°, atau sesuaikan Node Density.'
    ]
  },
  {
    id: 'assemble', idx: 6, f0: 0.93, f1: 1.00,
    short: 'Perakitan SVG',
    title: '7/7 · Pewarnaan Lapis demi Lapis & Perakitan Topologi SVG Akhir',
    desc: 'Mewarnai setiap wilayah vektor dari lapisan latar belakang ke detail depan (Cake-Stack / Cut-Out) dengan aturan evenodd dan stroke anti-celah.',
    legend: [['#10b981', 'Lapisan Vektor yang Sedang Diwarnai'], ['#4f46e5', 'Kontur Vektor Tersinkronisasi'], ['#ffffff', 'Hasil Akhir Vektor SVG']],
    symptoms: [
      'Bagian lubang dalam objek (seperti lubang huruf O, A, B, D) tertutup warna atau latar belakang masih ikut tampil.',
      'Terlihat celah rambut tipis di perbatasan antara dua warna yang bersebelahan.'
    ],
    fixes: [
      'Gunakan tombol "Hapus Latar (Make Background)" atau klik kotak warna di panel kanan untuk mentransparankan latar.',
      'Pastikan opsi "Stroke anti-celah" aktif atau ganti susunan bentuk antara Stack / Cut-out / Grouped.'
    ]
  }
];

/* Subdivisi De Casteljau untuk menggambar sebagian segmen kurva Bézier kubik [0 .. t] secara eksak */
function subdivideCubicViz(P0, P1, P2, P3, t) {
  const u = 1 - t;
  const Q0 = P0;
  const Q1 = [u * P0[0] + t * P1[0], u * P0[1] + t * P1[1]];
  const M  = [u * P1[0] + t * P2[0], u * P1[1] + t * P2[1]];
  const R2 = [u * P2[0] + t * P3[0], u * P2[1] + t * P3[1]];
  const Q2 = [u * Q1[0] + t * M[0],  u * Q1[1] + t * M[1]];
  const R1 = [u * M[0]  + t * R2[0], u * M[1]  + t * R2[1]];
  const Q3 = [u * Q2[0] + t * R1[0], u * Q2[1] + t * R1[1]];
  return { Q0, Q1, Q2, Q3, R1, R2 };
}

/* Menggambar ikon Ujung Pena Vektor / Stylus Ilustrator pada koordinat layar (sx, sy) */
function drawStylusPenNib(ctx, sx, sy, accentColor = '#6366f1', labelText = '') {
  ctx.save();
  ctx.translate(sx, sy);

  /* Lingkaran pendaran tinta di ujung pena */
  ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2); ctx.fill();

  /* Badan pena miring -45 derajat ala pena kaligrafi/vektor */
  ctx.save();
  ctx.rotate(-Math.PI / 4);
  /* Nib logam emas/perak */
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(13, -5.5);
  ctx.lineTo(18, -3.5);
  ctx.lineTo(18, 3.5);
  ctx.lineTo(13, 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  /* Belahan tengah & lubang pena (breather hole) */
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.beginPath(); ctx.arc(10.5, 0, 1.8, 0, Math.PI * 2); ctx.fill();

  /* Batang pena (barrel) */
  ctx.fillStyle = accentColor;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(17, -4.8, 22, 9.6, 3) : ctx.rect(17, -4.8, 22, 9.6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (labelText) {
    ctx.font = '600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    const tw = ctx.measureText(labelText).width;
    const bx = 16, by = -28;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, tw + 12, 20, 6);
    else ctx.rect(bx, by, tw + 12, 20);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, bx + 6, by + 10);
  }
  ctx.restore();
}

const useTraceControlState = () => {
  const [ctrl, setCtrl] = useState(() => VMT.getTraceCtrl());
  useEffect(() => VMT.subscribeTraceCtrl(setCtrl), []);
  return [ctrl, VMT.setTraceCtrl];
};

/* [PATCH] Cache Path2D kontur statis agar tidak membangun ulang ribuan lineTo setiap frame (geometri & hasil gambar identik) */
const _rtPathCache = new WeakMap();
const rtLoopPath = pts => {
  const n = pts.length, a = pts[0], b = pts[n - 1];
  const hit = _rtPathCache.get(pts);
  if (hit && hit.n === n && hit.a0 === a[0] && hit.a1 === a[1] && hit.b0 === b[0] && hit.b1 === b[1]) return hit.p;
  const p = new Path2D();
  p.moveTo(a[0], a[1]);
  for (let k = 1; k < n; k++) p.lineTo(pts[k][0], pts[k][1]);
  p.closePath();
  _rtPathCache.set(pts, { n, a0: a[0], a1: a[1], b0: b[0], b1: b[1], p });
  return p;
};

/* Pre-cache pin & Path2D untuk RealTimeTraceStudio agar pan/zoom pada ribuan node berjalan 60fps murni */
const _rtPinsWeakCache = new WeakMap();
function buildRtPinsCache(viz) {
  if (!viz) return { sharpPts: new Float32Array(0), smoothPts: new Float32Array(0), juncPts: new Float32Array(0), totalPins: 0 };
  const cacheKeyObj = viz.rawLoops || viz;
  const hit = _rtPinsWeakCache.get(cacheKeyObj);
  if (hit) return hit;
  const sharpArr = [];
  const smoothArr = [];
  const juncArr = [];
  const bLoops = viz.bezierLoops || [];
  for (const bl of bLoops) {
    for (const sg of (bl.segs || [])) {
      if (sg.startSharp) sharpArr.push(sg.P0[0], sg.P0[1]);
      else smoothArr.push(sg.P0[0], sg.P0[1]);
    }
  }
  const rLoops = viz.rawLoops || [];
  for (const lp of rLoops) {
    for (const jp of (lp.juncPts || [])) {
      juncArr.push(jp[0], jp[1]);
    }
  }
  const res = {
    sharpPts: new Float32Array(sharpArr),
    smoothPts: new Float32Array(smoothArr),
    juncPts: new Float32Array(juncArr),
    totalPins: (sharpArr.length + smoothArr.length) / 2
  };
  try { _rtPinsWeakCache.set(cacheKeyObj, res); } catch (e) {}
  return res;
}

const RealTimeTraceStudio = ({
  prog, job, sess, isFinished, onSwitchToCompare, onSegEdit, onRetry, onOpenAdvWizard,
  onPaletteChange, onPaletteGradChange, onPaletteOpacityChange, onPaletteReset, paletteEdited, hiddenLabels, onToggleNone,
  pendingPal, onPaletteRetrace, onPaletteDiscard,
  maxColorEnabled, maxColors, onMaxColorChange, gradientMode, onGradientModeChange,
  fileName, dxfMode, flash, hlLabel: hlProp, onHlChange
}) => {
  const [hw] = useHwConfig();
  const [hlLocal, setHlLocal] = useState(null); /* [HL-COLOR] state lokal bila tidak dikendalikan induk */
  const [traceCtrl, setTraceCtrl] = useTraceControlState();

  /* State pemutaran ulang (replay) & scrubbing manual */
  const [manualFrac, setManualFrac] = useState(null);
  const [replayMode, setReplayMode] = useState(null); /* null | { type: 'all' | 'stage', f0, f1, startTs, durMs } */
  const [displayFrac, setDisplayFrac] = useState(() => isFinished ? 1 : (prog && prog.frac) || 0.01);
  const [ghostOp, setGhostOp] = useState(25);
  const [showPins, setShowPins] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [bmpImg, setBmpImg] = useState(null);

  const [v, pz] = atUsePanZoom();
  const interRef = useRef(false), rafDrawRef = useRef(0), wheelT = useRef(0), drawRef = useRef(null);
  const zoomLblRef = useRef(null);
  const vRef = useRef(v); if (!interRef.current) vRef.current = v;
  /* [PERF] Pan/zoom real-time menggunakan ref + requestAnimationFrame tanpa memicu re-render React di setiap gerakan mouse */
  const scheduleDraw = () => {
    if (rafDrawRef.current) return;
    rafDrawRef.current = requestAnimationFrame(() => {
      rafDrawRef.current = 0;
      if (zoomLblRef.current) zoomLblRef.current.textContent = Math.round(vRef.current.z * 100) + '%';
      if (drawRef.current) drawRef.current();
    });
  };
  const wrapRef = useRef(null), cvRef = useRef(null), dragRef = useRef(null);
  const rszTick = rvUseResizeTick(wrapRef);
  const wideScr = rvUseWide(1000);
  const [sideOpen, setSideOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000);
  const rvPad = { t: isFinished ? 64 : 14, r: (sideOpen && wideScr) ? 352 : 0, b: 156, l: 0 };
  const padRef = useRef(rvPad); padRef.current = rvPad;
  const padKey = rvPad.t + ',' + rvPad.r + ',' + rvPad.b;

  const viz = atUseMemo(() => {
    if (prog && prog.viz) return prog.viz;
    if (sess) return VMT.buildTraceHistoryFromSession(sess, job);
    return null;
  }, [prog && prog.viz, sess, job]);

  const W = (viz && viz.W) || (sess && sess.W) || (job && job.w) || 800;
  const H = (viz && viz.H) || (sess && sess.H) || (job && job.h) || 600;

  const finalVecPaths = atUseMemo(() => {
    const svgStr = (viz && viz.svg) || (sess && sess.svg) || '';
    return parseSvgForCanvas(svgStr);
  }, [viz && viz.svg, sess && sess.svg]);

  const vecBmpCache = null;
  const rtPinsCache = atUseMemo(() => buildRtPinsCache(viz), [viz]);

  const hl = hlProp !== undefined ? hlProp : hlLocal;
  const hlHex = hl != null && viz && viz.palette && viz.palette[hl] ? viz.palette[hl].hex : null;
  const selectHl = i => {
    const nxt = hl === i ? null : i;
    setHlLocal(nxt);
    if (onHlChange) onHlChange(nxt);
    if (nxt != null && isFinished) { setReplayMode(null); setManualFrac(1); } /* lompat ke tahap Perakitan SVG agar sorotan langsung terlihat */
  };

  useEffect(() => {
    if (!job || !job.url) return;
    let on = true;
    const im = new Image();
    im.onload = () => { if (on) setBmpImg(im); };
    im.src = job.url;
    return () => { on = false; };
  }, [job && job.url]);

  /* Wheel Zoom pada kanvas real-time (tanpa re-render React setiap tick) */
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
      interRef.current = true;
      scheduleDraw();
      clearTimeout(wheelT.current);
      wheelT.current = setTimeout(() => { wheelT.current = 0; interRef.current = false; pz.set(vRef.current); }, 140);
    };
    el.addEventListener('wheel', wh, { passive: false });
    return () => el.removeEventListener('wheel', wh);
  }, []);

  /* Loop animasi 60fps untuk interpolasi live tracing & replay */
  const targetLiveFrac = isFinished ? 1 : ((prog && prog.frac) || 0.01);
  const targetLiveRef = useRef(targetLiveFrac);
  targetLiveRef.current = targetLiveFrac;
  const displayRef = useRef(displayFrac);
  const velRef = useRef(0);

  useEffect(() => {
    let raf = 0, last = 0;
    const SMOOTH_TIME = 0.16;
    const setDF = val => { displayRef.current = val; setDisplayFrac(val); };
    const stepAnim = now => {
      const dt = last ? Math.min(64, Math.max(0, now - last)) : 16.7;
      last = now;
      if (replayMode) {
        velRef.current = 0;
        const sp = Math.max(0.25, traceCtrl.speed >= 8 ? 2 : (traceCtrl.speed || 1));
        const t = (now - replayMode.startTs) / (replayMode.durMs / sp);
        if (t >= 1) {
          setDF(replayMode.f1);
          setManualFrac(replayMode.f1);
          setReplayMode(null);
        } else {
          setDF(replayMode.f0 + (replayMode.f1 - replayMode.f0) * t);
          raf = requestAnimationFrame(stepAnim);
        }
        return;
      }
      if (manualFrac !== null) {
        velRef.current = 0;
        setDF(manualFrac);
        return;
      }
      const tgt = targetLiveRef.current;
      const prev = displayRef.current;
      const diff = tgt - prev;
      let next;
      if (diff < -0.04) { next = tgt; velRef.current = 0; }
      else if (Math.abs(diff) < 0.0004 && Math.abs(velRef.current) < 0.01) { next = tgt; velRef.current = 0; }
      else {
        const dts = dt / 1000, om = 2 / SMOOTH_TIME, x = om * dts;
        const ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const change = prev - tgt;
        const temp = (velRef.current + om * change) * dts;
        velRef.current = (velRef.current - om * temp) * ex;
        next = tgt + (change + temp) * ex;
        if ((tgt - prev > 0) === (next > tgt)) { next = tgt; velRef.current = 0; }
      }
      if (next !== prev) setDF(next);
      if (Math.abs(next - tgt) > 1e-5) raf = requestAnimationFrame(stepAnim);
    };
    if (replayMode || manualFrac !== null || Math.abs(targetLiveRef.current - displayRef.current) > 1e-5) {
      raf = requestAnimationFrame(stepAnim);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [replayMode, manualFrac, isFinished, targetLiveFrac, traceCtrl.speed]);

  /* Tentukan tahap aktif berdasarkan displayFrac */
  const activeStage = atUseMemo(() => {
    const f = VMT.clamp(displayFrac, 0, 1);
    for (let i = RT_STAGES.length - 1; i >= 0; i--) {
      if (f >= RT_STAGES[i].f0 - 1e-4) return RT_STAGES[i];
    }
    return RT_STAGES[0];
  }, [displayFrac]);

  const stageLocalFrac = VMT.clamp(
    (displayFrac - activeStage.f0) / Math.max(1e-5, activeStage.f1 - activeStage.f0),
    0, 1
  );

  /* Fungsi mulai Replay seluruh proses (0% -> 100%) atau 1 tahap saja */
  const startReplayAll = () => {
    setManualFrac(null);
    setTraceCtrl({ paused: false });
    setReplayMode({ type: 'all', f0: 0.005, f1: 1.0, startTs: performance.now(), durMs: 7600 });
  };

  const selectAndReplayStage = stObj => {
    if (!isFinished && targetLiveFrac < stObj.f0) {
      flash && flash('Tahap ini sedang menunggu giliran proses…');
      return;
    }
    if (!isFinished) {
      setTraceCtrl({ paused: true });
    }
    setManualFrac(null);
    const dur = stObj.id === 'fit' ? 3600 : stObj.id === 'segment' ? 2800 : 2300;
    setReplayMode({ type: 'stage', stageId: stObj.id, f0: stObj.f0 + 0.001, f1: stObj.f1, startTs: performance.now(), durMs: dur });
  };

  /* Render Kanvas Real-Time Tracing 60fps (Batching + Viewport Culling + Overscan Pan Cache + Sprite Atlas) */
  const rtPanCacheRef = useRef({
    canvas: null, bw: 0, bh: 0, cw: 0, ch: 0, dpr: 0, z: 0, baseOx: 0, baseOy: 0,
    pathsRef: null, pinsRef: null, showPins: false, hlHex: null, padKey: ''
  });

  /* Sinar "busy" CSS dibatasi hanya di area gambar (artboard), bukan seluruh kanvas */
  const rtBusyElRef = useRef(null);
  const rtBusyRectRef = useRef(null);
  const applyRtBusyRect = (el) => {
    const r = rtBusyRectRef.current;
    if (!el || !r) return;
    el.style.inset = 'auto';
    el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
    el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
  };
  const rtBusyRefCb = atUseCallback((el) => { rtBusyElRef.current = el; applyRtBusyRect(el); }, []);

  const drawCanvas = atUseCallback(() => {
    const cv = cvRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const vCur = vRef.current;
    /* [CRISP-VECTOR] Supersampling minimum 2.0x DPR agar tepi kurva SVG 100% tajam tanpa efek piksel saat di-zoom */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (!cw || !ch) return;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    ctx.fillStyle = getCheckerPattern(ctx);
    ctx.fillRect(0, 0, cw, ch);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.16)';
      ctx.lineWidth = 1;
      const gs = 24;
      ctx.beginPath();
      for (let x = 0; x < cw; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
      for (let y = 0; y < ch; y += gs) { ctx.moveTo(0, y); ctx.lineTo(cw, y); }
      ctx.stroke();
    }

    const sf = rvSafe(wrap, padRef.current);
    const fit = Math.min(sf.aw / W, sf.ah / H) * 0.92;
    const z = fit * vCur.z;
    const ox = sf.cx + vCur.tx - (W * z) / 2;
    const oy = sf.cy + vCur.ty - (H * z) / 2;
    const toScreen = (px, py) => [ox + px * z, oy + py * z];
    rtBusyRectRef.current = { x: ox, y: oy, w: W * z, h: H * z };
    applyRtBusyRect(rtBusyElRef.current);

    const padDoc = 10 / z;
    const vMinX = (0 - ox) / z - padDoc;
    const vMaxX = (cw - ox) / z + padDoc;
    const vMinY = (0 - oy) / z - padDoc;
    const vMaxY = (ch - oy) / z + padDoc;

    /* Helper: Batch-draw kumpulan titik C0 (kotak) & G1 (lingkaran) menggunakan Sprite Atlas + World-Locked Occupancy Grid */
    const drawBatchedPinsTo = (targetCtx, targetDpr, tOx, tOy, tMinX, tMaxX, tMinY, tMaxY, sharpFlat, smoothFlat, rPinCss, strokeWCss) => {
      const totalPts = ((sharpFlat ? sharpFlat.length : 0) + (smoothFlat ? smoothFlat.length : 0)) >> 1;
      if (!totalPts) return;
      const occGrid = totalPts > 400 ? createWorldOccGrid(tMinX, tMaxX, tMinY, tMaxY, z, 3.5) : null;
      targetCtx.save();
      targetCtx.setTransform(targetDpr, 0, 0, targetDpr, 0, 0);
      if (sharpFlat && sharpFlat.length) {
        drawScreenPinSpritesBatch(targetCtx, sharpFlat, 'sharp', rPinCss, strokeWCss, 1, tOx, tOy, z, targetDpr, tMinX, tMaxX, tMinY, tMaxY, occGrid);
      }
      if (smoothFlat && smoothFlat.length) {
        drawScreenPinSpritesBatch(targetCtx, smoothFlat, 'smooth', rPinCss * 0.95, strokeWCss, 2, tOx, tOy, z, targetDpr, tMinX, tMaxX, tMinY, tMaxY, occGrid);
      }
      targetCtx.restore();
    };
    const drawBatchedPins = (sharpFlat, smoothFlat, rPinDoc, strokeWDoc) => {
      drawBatchedPinsTo(ctx, dpr, ox, oy, vMinX, vMaxX, vMinY, vMaxY, sharpFlat, smoothFlat, rPinDoc * z, strokeWDoc * z);
    };

    /* Bingkai artboard dokumen */
    ctx.save();
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(ox, oy, W * z, H * z);

    ctx.beginPath();
    ctx.rect(ox, oy, W * z, H * z);
    ctx.clip();

    const baseImg = (viz && viz.origCanvas) || bmpImg;
    const stId = activeStage.id;
    const lf = stageLocalFrac;
    let hlCount = null;

    /* ---- VISUALISASI TAHAP 1: LASER SCANNING & GRADIEN SCHARR 2D ---- */
    if (stId === 'classify') {
      if (baseImg) {
        ctx.imageSmoothingEnabled = vCur.z < 3;
        ctx.drawImage(baseImg, ox, oy, W * z, H * z);
      }
      const scanY = lf * H;
      const screenScanY = oy + scanY * z;
      if (viz && viz.edgeScanCanvas && scanY > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, W * z, scanY * z);
        ctx.clip();
        ctx.imageSmoothingEnabled = vCur.z < 3;
        ctx.drawImage(viz.edgeScanCanvas, ox, oy, W * z, H * z);
        ctx.restore();
      }
      const beamH = Math.max(18, 36 * Math.min(1.5, vCur.z));
      const grad = ctx.createLinearGradient(0, screenScanY - beamH, 0, screenScanY + 4);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.75, 'rgba(56, 189, 248, 0.28)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(ox, screenScanY - beamH, W * z, beamH + 4);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ox, screenScanY);
      ctx.lineTo(ox + W * z, screenScanY);
      ctx.stroke();
    }

    /* ---- VISUALISASI TAHAP 2: KUANTISASI PALET CIE-LAB & SAMPEL CENTROID ---- */
    else if (stId === 'palette') {
      const bgSrc = (viz && viz.edgeScanCanvas) || baseImg;
      if (bgSrc) {
        ctx.imageSmoothingEnabled = vCur.z < 3;
        ctx.drawImage(bgSrc, ox, oy, W * z, H * z);
      }
      const sweepX = lf * W;
      if (viz && viz.quantCanvas && sweepX > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, sweepX * z, H * z);
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(viz.quantCanvas, ox, oy, W * z, H * z);
        ctx.restore();
      }
      const sx = ox + sweepX * z;
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(sx, oy);
      ctx.lineTo(sx, oy + H * z);
      ctx.stroke();

      const probes = (viz && viz.paletteProbes) || [];
      const visCount = Math.max(1, Math.ceil(lf * probes.length));
      for (let i = 0; i < Math.min(probes.length, visCount); i++) {
        const pr = probes[i];
        const [px, py] = toScreen(pr.x, pr.y);
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.fillStyle = pr.hex;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        const txt = `${pr.hex.toUpperCase()} (${pr.pct}%)`;
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
        ctx.fillRect(px + 11, py - 9, tw + 8, 17);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(txt, px + 15, py + 3);
        ctx.restore();
      }
    }

    /* ---- VISUALISASI TAHAP 3: PARTISI QUADTREE & EVOLUSI MRF POTTS ---- */
    else if (stId === 'segment') {
      if (lf < 0.40) {
        const subF = lf / 0.40;
        const qBg = (viz && viz.quantCanvas) || baseImg;
        if (qBg) {
          ctx.globalAlpha = 0.72;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(qBg, ox, oy, W * z, H * z);
          ctx.globalAlpha = 1;
        }
        const blocks = (viz && viz.quadBlocks) || [];
        const bCount = Math.ceil(subF * blocks.length);
        const sc = (viz && viz.scale) || 1;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < bCount; i++) {
          const b = blocks[i];
          ctx.rect(ox + b[0] * sc * z, oy + b[1] * sc * z, b[2] * sc * z, b[3] * sc * z);
        }
        ctx.stroke();
      } else {
        const mrfF = (lf - 0.40) / 0.60;
        const qtCv = (viz && viz.qtCanvas) || (viz && viz.quantCanvas) || baseImg;
        const finCv = (viz && viz.segFinalCanvas) || qtCv;
        if (qtCv) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(qtCv, ox, oy, W * z, H * z);
        }
        const waveY = mrfF * H;
        if (finCv && waveY > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(ox, oy, W * z, waveY * z);
          ctx.clip();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(finCv, ox, oy, W * z, H * z);
          if (viz && viz.segDiffCanvas && showPins) {
            ctx.globalAlpha = 0.85;
            ctx.drawImage(viz.segDiffCanvas, ox, oy, W * z, H * z);
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
        const sy = oy + waveY * z;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(ox, sy);
        ctx.lineTo(ox + W * z, sy);
        ctx.stroke();
      }
    }

    /* ---- VISUALISASI TAHAP 4: GRAF PLANAR & DEKONVOLUSI SUB-PIKSEL ---- */
    else if (stId === 'trace') {
      const segBg = (viz && viz.segFinalCanvas) || baseImg;
      if (segBg) {
        ctx.globalAlpha = Math.max(0.24, ghostOp / 100);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(segBg, ox, oy, W * z, H * z);
        ctx.globalAlpha = 1;
      }
      const rLoops = (viz && viz.rawLoops) || [];
      if (rLoops.length) {
        const lFloat = lf * rLoops.length;
        const curL = Math.min(rLoops.length - 1, Math.floor(lFloat));
        const subL = lFloat - curL;
        let tipPt = null;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(z, z);

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.35 / z;
        for (let i = 0; i <= curL; i++) {
          const lp = rLoops[i];
          const pts = lp.pts;
          if (!pts || pts.length < 2) continue;
          const isCur = i === curL && lf < 0.995;
          if (!isCur && typeof Path2D !== 'undefined') {
            ctx.stroke(rtLoopPath(pts));
          } else {
            const maxV = isCur ? Math.max(2, Math.ceil(subL * pts.length)) : pts.length;
            ctx.strokeStyle = isCur ? '#38bdf8' : '#06b6d4';
            ctx.lineWidth = (isCur ? 2.2 : 1.35) / z;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let k = 1; k < maxV; k++) ctx.lineTo(pts[k][0], pts[k][1]);
            if (!isCur) ctx.closePath();
            ctx.stroke();
            if (isCur) tipPt = pts[maxV - 1];
          }
        }

        /* Batch seluruh pin berlian ungu pada titik temu T/X-Junction menggunakan Sprite Atlas */
        if (showPins) {
          const jFlat = [];
          for (let i = 0; i <= curL; i++) {
            const jPts = rLoops[i].juncPts;
            if (!jPts) continue;
            for (let k = 0; k < jPts.length; k++) {
              const jp = jPts[k];
              if (jp[0] < vMinX || jp[0] > vMaxX || jp[1] < vMinY || jp[1] > vMaxY) continue;
              jFlat.push(jp[0], jp[1]);
            }
          }
          if (jFlat.length) {
            const occJ = jFlat.length > 800 ? createWorldOccGrid(vMinX, vMaxX, vMinY, vMaxY, z, 3.5) : null;
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawScreenPinSpritesBatch(ctx, jFlat, 'junc', 3.2, 1.0, 1, ox, oy, z, dpr, vMinX, vMaxX, vMinY, vMaxY, occJ);
            ctx.restore();
          }
        }
        ctx.restore();

        if (tipPt) {
          const [sx, sy] = toScreen(tipPt[0], tipPt[1]);
          drawStylusPenNib(ctx, sx, sy, '#06b6d4', `KONTUR #${curL + 1}/${rLoops.length}`);
        }
      }
    }

    /* ---- VISUALISASI TAHAP 5: PENGHALUSAN ELASTIKA & PIN SUDUT C0 / G1 ---- */
    else if (stId === 'smooth') {
      if (baseImg && ghostOp > 0) {
        ctx.globalAlpha = ghostOp / 100;
        ctx.imageSmoothingEnabled = vCur.z < 3;
        ctx.drawImage(baseImg, ox, oy, W * z, H * z);
        ctx.globalAlpha = 1;
      }
      const sLoops = (viz && viz.smoothedLoops) || [];
      if (sLoops.length) {
        const lFloat = lf * sLoops.length;
        const curL = Math.min(sLoops.length - 1, Math.floor(lFloat));
        const subL = lFloat - curL;
        let tipPt = null;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(z, z);

        ctx.strokeStyle = 'rgba(244, 63, 94, 0.38)';
        ctx.lineWidth = 1.1 / z;
        ctx.setLineDash([2.5 / z, 2.5 / z]);
        for (let i = 0; i < sLoops.length; i++) {
          const rpts = sLoops[i].rawPts;
          if (!rpts || rpts.length < 2) continue;
          if (typeof Path2D !== 'undefined') ctx.stroke(rtLoopPath(rpts));
        }
        ctx.setLineDash([]);

        const sharpBatch = [];
        const smoothBatch = [];
        for (let i = 0; i <= curL; i++) {
          const sl = sLoops[i];
          const pts = sl.pts;
          if (!pts || pts.length < 2) continue;
          const isCur = i === curL && lf < 0.995;
          const maxV = isCur ? Math.max(2, Math.ceil(subL * pts.length)) : pts.length;

          ctx.strokeStyle = isCur ? '#38bdf8' : '#818cf8';
          ctx.lineWidth = (isCur ? 2.3 : 1.65) / z;
          if (!isCur && typeof Path2D !== 'undefined') {
            ctx.stroke(rtLoopPath(pts));
          } else {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let k = 1; k < maxV; k++) ctx.lineTo(pts[k][0], pts[k][1]);
            if (!isCur) ctx.closePath();
            ctx.stroke();
          }
          if (isCur) tipPt = pts[maxV - 1];

          if (showPins) {
            if (sl.sharpPts) for (const sp of sl.sharpPts) sharpBatch.push(sp[0], sp[1]);
            if (sl.smoothPts) for (const mp of sl.smoothPts) smoothBatch.push(mp[0], mp[1]);
          }
        }
        if (showPins && (sharpBatch.length || smoothBatch.length)) {
          drawBatchedPins(sharpBatch, smoothBatch, 3.1 / z, 1.1 / z);
        }
        ctx.restore();

        if (tipPt) {
          const [sx, sy] = toScreen(tipPt[0], tipPt[1]);
          drawStylusPenNib(ctx, sx, sy, '#818cf8', `SMOOTH #${curL + 1}/${sLoops.length}`);
        }
      }
    }

    /* ---- VISUALISASI TAHAP 6: MENGGAMBAR KURVA BÉZIER KUBIK ("SEPERTI SEDANG MENGGAMBAR") ---- */
    else if (stId === 'fit') {
      if (baseImg && ghostOp > 0) {
        ctx.globalAlpha = ghostOp / 100;
        ctx.imageSmoothingEnabled = vCur.z < 3;
        ctx.drawImage(baseImg, ox, oy, W * z, H * z);
        ctx.globalAlpha = 1;
      }
      const dSegs = (viz && viz.drawingSegs) || [];
      const bLoops = (viz && viz.bezierLoops) || [];
      if (dSegs.length) {
        const sFloat = lf * dSegs.length;
        const curIdx = Math.min(dSegs.length - 1, Math.floor(sFloat));
        const tSub = lf >= 0.998 ? 1 : (sFloat - curIdx);
        const curItem = dSegs[curIdx];
        const curLoopIdx = curItem ? curItem.loopIdx : 0;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(z, z);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = 1 / z;
        ctx.setLineDash([3 / z, 3 / z]);
        for (let li = curLoopIdx; li < bLoops.length; li++) {
          if (bLoops[li].p2d) ctx.stroke(bLoops[li].p2d);
        }
        ctx.setLineDash([]);

        for (let li = 0; li < curLoopIdx; li++) {
          const bl = bLoops[li];
          if (bl.p2d) {
            ctx.globalAlpha = 0.24;
            ctx.fillStyle = bl.color;
            ctx.fill(bl.p2d, 'evenodd');
            ctx.globalAlpha = 1;
          }
        }

        /* Batch seluruh segmen lurus & segmen kurva yang sudah selesai dalam 2 draw call */
        ctx.lineWidth = 1.65 / z;
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        let anyLine = false;
        for (let i = 0; i < curIdx; i++) {
          const sg = dSegs[i].seg;
          if (sg.isLine) {
            ctx.moveTo(sg.P0[0], sg.P0[1]);
            ctx.lineTo(sg.P3[0], sg.P3[1]);
            anyLine = true;
          }
        }
        if (anyLine) ctx.stroke();

        ctx.strokeStyle = '#6366f1';
        ctx.beginPath();
        let anyCurve = false;
        for (let i = 0; i < curIdx; i++) {
          const sg = dSegs[i].seg;
          if (!sg.isLine) {
            ctx.moveTo(sg.P0[0], sg.P0[1]);
            ctx.bezierCurveTo(sg.P1[0], sg.P1[1], sg.P2[0], sg.P2[1], sg.P3[0], sg.P3[1]);
            anyCurve = true;
          }
        }
        if (anyCurve) ctx.stroke();

        if (showPins && curIdx > 0) {
          const sharpB = [], smoothB = [];
          for (let i = 0; i < curIdx; i++) {
            const sg = dSegs[i].seg;
            if (sg.startSharp) sharpB.push(sg.P0[0], sg.P0[1]);
            else smoothB.push(sg.P0[0], sg.P0[1]);
          }
          drawBatchedPins(sharpB, smoothB, 2.4 / z, 0.9 / z);
        }

        let penTip = null;
        if (curItem) {
          const sg = curItem.seg;
          const sub = subdivideCubicViz(sg.P0, sg.P1, sg.P2, sg.P3, VMT.clamp(tSub, 0.02, 1));
          penTip = sub.Q3;

          ctx.strokeStyle = sg.isLine ? '#34d399' : '#38bdf8';
          ctx.lineWidth = 2.8 / z;
          ctx.beginPath();
          ctx.moveTo(sub.Q0[0], sub.Q0[1]);
          if (sg.isLine) ctx.lineTo(sub.Q3[0], sub.Q3[1]);
          else ctx.bezierCurveTo(sub.Q1[0], sub.Q1[1], sub.Q2[0], sub.Q2[1], sub.Q3[0], sub.Q3[1]);
          ctx.stroke();

          if (!sg.isLine && showPins) {
            const hr = 3.0 / z;
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 1.2 / z;
            ctx.beginPath(); ctx.moveTo(sub.Q0[0], sub.Q0[1]); ctx.lineTo(sub.Q1[0], sub.Q1[1]); ctx.stroke();
            ctx.fillStyle = '#06b6d4';
            ctx.beginPath(); ctx.arc(sub.Q1[0], sub.Q1[1], hr, 0, Math.PI * 2); ctx.fill();

            ctx.strokeStyle = '#ec4899';
            ctx.beginPath(); ctx.moveTo(sub.Q3[0], sub.Q3[1]); ctx.lineTo(sub.Q2[0], sub.Q2[1]); ctx.stroke();
            ctx.fillStyle = '#ec4899';
            ctx.beginPath(); ctx.arc(sub.Q2[0], sub.Q2[1], hr, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();

        if (penTip && lf < 0.998) {
          const [sx, sy] = toScreen(penTip[0], penTip[1]);
          const kind = curItem && curItem.seg.isLine ? 'GARIS LURUS (L)' : 'KURVA BÉZIER (C)';
          drawStylusPenNib(ctx, sx, sy, curItem && curItem.seg.isLine ? '#10b981' : '#6366f1', `${kind} · ${curIdx + 1}/${dSegs.length}`);
        }
      }
    }

    /* ---- VISUALISASI TAHAP 7: PERAKITAN & PEWARNAAN LAPIS DEMI LAPIS SVG ---- */
    else {
      if (baseImg && ghostOp > 0 && lf < 0.98) {
        ctx.globalAlpha = (ghostOp / 100) * 0.5;
        ctx.imageSmoothingEnabled = vCur.z < 3;
        ctx.drawImage(baseImg, ox, oy, W * z, H * z);
        ctx.globalAlpha = 1;
      }

      const isZoomingNow = wheelT.current !== 0;
      const canUseOverscanAssemble = lf >= 0.99 && !isZoomingNow && finalVecPaths.length > 0;

      if (canUseOverscanAssemble) {
        const PAN_MARGIN = 320;
        const pc = rtPanCacheRef.current;
        const pCw = cw + PAN_MARGIN * 2;
        const pCh = ch + PAN_MARGIN * 2;
        const pBw = Math.round(pCw * dpr);
        const pBh = Math.round(pCh * dpr);
        const dxScreen = ox - pc.baseOx;
        const dyScreen = oy - pc.baseOy;
        const geomMoved =
          !pc.canvas ||
          pc.bw !== pBw ||
          pc.bh !== pBh ||
          pc.dpr !== dpr ||
          Math.abs(pc.z - z) > 1e-6 ||
          pc.padKey !== padKey ||
          Math.abs(dxScreen) > PAN_MARGIN - 24 ||
          Math.abs(dyScreen) > PAN_MARGIN - 24;
        const needRebuild =
          geomMoved ||
          pc.pathsRef !== finalVecPaths ||
          pc.pinsRef !== rtPinsCache ||
          pc.showPins !== showPins;

        if (needRebuild) {
          if (!pc.canvas) pc.canvas = document.createElement('canvas');
          if (pc.canvas.width !== pBw || pc.canvas.height !== pBh) {
            pc.canvas.width = pBw;
            pc.canvas.height = pBh;
          }
          const baseOxUse = geomMoved ? (Math.round(ox * dpr) / dpr) : pc.baseOx;
          const baseOyUse = geomMoved ? (Math.round(oy * dpr) / dpr) : pc.baseOy;
          const pOx = baseOxUse + PAN_MARGIN;
          const pOy = baseOyUse + PAN_MARGIN;
          const pMinX = (0 - pOx) / z - padDoc;
          const pMaxX = (pCw - pOx) / z + padDoc;
          const pMinY = (0 - pOy) / z - padDoc;
          const pMaxY = (pCh - pOy) / z + padDoc;

          const pCtx = pc.canvas.getContext('2d');
          pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          pCtx.clearRect(0, 0, pCw, pCh);

          const sharedVecBmp = vCur.z <= 2.25 ? buildVectorBitmapCache(finalVecPaths, W, H) : null;
          if (sharedVecBmp) {
            pCtx.save();
            pCtx.imageSmoothingEnabled = true;
            pCtx.drawImage(sharedVecBmp, pOx + (sharedVecBmp._bx || 0) * z, pOy + (sharedVecBmp._by || 0) * z, (sharedVecBmp._bw || W) * z, (sharedVecBmp._bh || H) * z);
            pCtx.restore();
          } else {
            pCtx.save();
            pCtx.translate(pOx, pOy);
            pCtx.scale(z, z);
            const maxAntiGapW = 0.75 / Math.max(0.1, z);
            for (let i = 0, n = finalVecPaths.length; i < n; i++) {
              const it = finalVecPaths[i];
              if (it.bb && (it.bb[2] < pMinX || it.bb[0] > pMaxX || it.bb[3] < pMinY || it.bb[1] > pMaxY)) continue;
              pCtx.globalAlpha = it.opacity ?? 1;
              if (it.fill && it.fill !== 'none') fillCanvasPath(pCtx, it);
              if (it.stroke && it.stroke !== 'none' && it.strokeWidth > 0) {
                pCtx.strokeStyle = resolveCanvasPaint(pCtx, it.stroke, it.strokeGrad);
                pCtx.lineWidth = Math.min(it.strokeWidth, maxAntiGapW);
                pCtx.lineJoin = it.lineJoin || 'miter';
                pCtx.lineCap = it.lineCap || 'butt';
                pCtx.stroke(it.p2d);
              }
            }
            pCtx.globalAlpha = 1;
            pCtx.restore();
          }

          /* [PERF-COLOR-FIX] Cache layer pin simpul secara terpisah (pc.pinCanvas) karena posisi simpul TIDAK berubah saat ganti warna! */
          if (showPins && rtPinsCache.totalPins > 0) {
            const needPinRebuild =
              geomMoved ||
              !pc.pinCanvas ||
              pc.pinCanvas.width !== pBw ||
              pc.pinCanvas.height !== pBh ||
              pc.pinsCachedRef !== rtPinsCache;
            if (needPinRebuild) {
              if (!pc.pinCanvas) pc.pinCanvas = document.createElement('canvas');
              if (pc.pinCanvas.width !== pBw || pc.pinCanvas.height !== pBh) {
                pc.pinCanvas.width = pBw;
                pc.pinCanvas.height = pBh;
              }
              const pinCtx = pc.pinCanvas.getContext('2d');
              pinCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
              pinCtx.clearRect(0, 0, pCw, pCh);
              drawBatchedPinsTo(pinCtx, dpr, pOx, pOy, pMinX, pMaxX, pMinY, pMaxY, rtPinsCache.sharpPts, rtPinsCache.smoothPts, 2.5, 0.9);
              pc.pinsCachedRef = rtPinsCache;
            }
            pCtx.save();
            pCtx.setTransform(1, 0, 0, 1, 0, 0);
            pCtx.drawImage(pc.pinCanvas, 0, 0);
            pCtx.restore();
          }

          pc.bw = pBw; pc.bh = pBh; pc.cw = pCw; pc.ch = pCh;
          pc.dpr = dpr; pc.z = z; pc.baseOx = baseOxUse; pc.baseOy = baseOyUse;
          pc.pathsRef = finalVecPaths; pc.pinsRef = rtPinsCache;
          pc.showPins = showPins; pc.padKey = padKey;
        }
        const dxDev = Math.round(((ox - pc.baseOx) - PAN_MARGIN) * dpr);
        const dyDev = Math.round(((oy - pc.baseOy) - PAN_MARGIN) * dpr);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pc.canvas, dxDev, dyDev);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(z, z);

        const bLoops = (viz && viz.bezierLoops) || [];
        if (lf < 0.99 && bLoops.length) {
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
          ctx.lineWidth = 1.1 / z;
          for (const bl of bLoops) if (bl.p2d) ctx.stroke(bl.p2d);
        }

        if (finalVecPaths.length) {
          const pFloat = lf * finalVecPaths.length;
          const maxP = Math.min(finalVecPaths.length, Math.ceil(pFloat));
          const maxAntiGapW = 0.75 / Math.max(0.1, z);
          for (let i = 0; i < maxP; i++) {
            const it = finalVecPaths[i];
            const isNewest = i === maxP - 1 && lf < 0.99;
            ctx.globalAlpha = isNewest ? 0.88 : (it.opacity ?? 1);
            if (it.fill && it.fill !== 'none') {
              fillCanvasPath(ctx, it);
            }
            if (it.stroke && it.stroke !== 'none' && it.strokeWidth > 0) {
              ctx.strokeStyle = resolveCanvasPaint(ctx, it.stroke, it.strokeGrad);
              ctx.lineWidth = Math.min(it.strokeWidth, maxAntiGapW);
              ctx.lineJoin = it.lineJoin || 'round';
              ctx.lineCap = it.lineCap || 'round';
              ctx.stroke(it.p2d);
            }
            if (isNewest) {
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 2.2 / z;
              ctx.stroke(it.p2d);
            }
          }
          ctx.globalAlpha = 1;
        }

        if (showPins && lf >= 0.98 && rtPinsCache.totalPins > 0) {
          drawBatchedPins(rtPinsCache.sharpPts, rtPinsCache.smoothPts, 2.5 / z, 0.9 / z);
        }
        ctx.restore();
      }

      if (hlHex && finalVecPaths.length && (isFinished || lf >= 0.98)) {
        hlCount = drawColorHighlightVeil(ctx, finalVecPaths, hlHex, cw, ch, ox, oy, z, dpr);
      }
    }

    ctx.restore();

    if (hlHex && stId === 'assemble' && (isFinished || lf >= 0.98)) drawHighlightHud(ctx, hlHex, hlCount, 16, padRef.current.t + 8);
  }, [viz, bmpImg, activeStage, stageLocalFrac, displayFrac, v, W, H, ghostOp, showPins, showGrid, finalVecPaths, vecBmpCache, rtPinsCache, isFinished, replayMode, hlHex, rszTick, padKey]);

  drawRef.current = drawCanvas;
  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  const onDown = e => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, tx: vRef.current.tx, ty: vRef.current.ty };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onMove = e => {
    const dr = dragRef.current; if (!dr) return;
    vRef.current = { ...vRef.current, tx: dr.tx + (e.clientX - dr.sx), ty: dr.ty + (e.clientY - dr.sy) };
    interRef.current = true;
    scheduleDraw();
  };
  const onUp = () => {
    dragRef.current = null;
    if (interRef.current) {
      clearTimeout(wheelT.current);
      wheelT.current = 0;
      interRef.current = false;
      pz.set(vRef.current);
    }
  };

  /* Ringkasan metrik aktual untuk tahap yang sedang dipilih */
  const stStats = (viz && viz.stats) || (sess && sess.stats) || {};
  const stCls = (viz && viz.cls) || (sess && sess.cls) || (job && job.cls) || {};
  const stageMetrics = atUseMemo(() => {
    const id = activeStage.id;
    if (id === 'classify') {
      return [
        ['Klasifikasi Citra', stCls.label || '-'],
        ['Kualitas & Derau', (stCls.qlabel || '-') + (stCls.entropy ? ` · Entropi ${stCls.entropy} bit` : '')],
        ['Rasio Tepi Halus / Tajam', stCls.blendFrac != null ? `${Math.round(stCls.blendFrac * 100)}% blend / ${Math.round(stCls.sharpFrac * 100)}% tajam` : '-'],
        ['Resolusi Pemindaian', stStats.workSize || `${(viz && viz.w) || W}×${(viz && viz.h) || H} px`]
      ];
    }
    if (id === 'palette') {
      const pCount = (viz && viz.palette && viz.palette.length) || (stStats.palette && stStats.palette.count) || 0;
      return [
        ['Jumlah Warna Bersih', `${pCount} klaster warna CIE-Lab`],
        ['Metode Seleksi', (stStats.palette && stStats.palette.auto) ? 'Otomatis (Kriteria BIC + Anti-Halo)' : 'Terkunci / Kustom'],
        ['Sampel Dominan', ((viz && viz.paletteProbes) || []).slice(0, 3).map(p => `${p.hex.toUpperCase()} (${p.pct}%)`).join(' · ') || '-']
      ];
    }
    if (id === 'segment') {
      return [
        ['Sub-Blok QuadTree', `${((viz && viz.quadBlocks && viz.quadBlocks.length) || 0).toLocaleString('id-ID')} blok adaptif`],
        ['Penalti Energi MRF (β)', stStats.beta != null ? `β = ${stStats.beta}` : '-'],
        ['Piksel Tepi/Derau Dibersihkan', `${((viz && viz.cleanedPixels) || stStats.cleanedPixels || 0).toLocaleString('id-ID')} piksel`],
        ['Ambang Spekula Minimum', `${stStats.minPixels || 5} piksel`]
      ];
    }
    if (id === 'trace') {
      const rLoops = (viz && viz.rawLoops) || [];
      const jCount = rLoops.reduce((a, l) => a + ((l.juncPts && l.juncPts.length) || 0), 0);
      return [
        ['Loop Kontur Planar', `${stStats.loops || rLoops.length} poligon tertutup`],
        ['Verteks Sub-Piksel', `${(stStats.vertices || 0).toLocaleString('id-ID')} titik`],
        ['Titik Temu T/X-Junction', `${jCount} simpul pengunci anti-celah`]
      ];
    }
    if (id === 'smooth') {
      return [
        ['Sudut Tajam C⁰ (Kotak Oranye)', `${stStats.sharpCorners ?? '-'} sudut lancip/siku`],
        ['Simpul Halus G¹ (Bulat Biru)', `${stStats.smoothCorners ?? '-'} titik lengkung ekstremum`],
        ['Bobot Elastika (λ)', stStats.smoothLambda != null ? `λ = ${stStats.smoothLambda}` : 'Hybrid Taubin + CG']
      ];
    }
    if (id === 'fit') {
      return [
        ['Total Segmen Vektor', `${stStats.bezierSegs ?? ((viz && viz.drawingSegs && viz.drawingSegs.length) || '-')} segmen`],
        ['Segmen Garis Lurus (L)', `${stStats.straightSegs ?? '-'} segmen hijau`],
        ['Segmen Kurva Bézier (C)', `${stStats.curveSegs ?? '-'} kurva kubik ungu`],
        ['Toleransi Fitting (ε)', stStats.fitTol != null ? `${stStats.fitTol} px` : '-']
      ];
    }
    return [
      ['Total Region Berwarna', `${stStats.regions ?? ((viz && viz.regs && viz.regs.length) || '-')} layer SVG`],
      ['Total Segmen Kurva', `${stStats.bezierSegs ?? '-'} segmen bebas-celah`],
      ['Durasi Komputasi', stStats.ms != null ? `${(stStats.ms / 1000).toFixed(1)} detik` : 'Sedang merakit…']
    ];
  }, [activeStage.id, viz, stStats, stCls, W, H]);

  const pctTotal = Math.round(displayFrac * 100);
  const badgeCls = traceCtrl.paused ? ' paused' : (isFinished && !replayMode) ? ' done' : '';
  const badgeTxt = replayMode ? 'Replay' : !isFinished ? (traceCtrl.paused ? 'Dijeda' : 'Live') : 'Selesai';
  const subLine = (!isFinished && prog && prog.detail) ? prog.detail : `Tahap ${activeStage.idx + 1} dari 7 · ${pctTotal}%`;

  return (<div className={'rv-stage' + (sideOpen && wideScr ? ' side-open' : '')}><div ref={wrapRef} className="at-rt-cv-wrap rv-canvas" onContextMenu={e => e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><canvas ref={cvRef} className="at-cmp-cv" />{!isFinished && !replayMode && !traceCtrl.paused && viz && viz.busy && <div className="at-rt-busy" ref={rtBusyRefCb} aria-hidden="true"><i /></div>}</div><div className="rv-zoom rv-glass"><button type="button" className="rv-ibtn" data-tip="atCmpZoomIn" onClick={() => pz.zoomAt(0, 0, vRef.current.z * 1.25, vRef.current)} aria-label="Perbesar"><Ico n="zoomIn" size={15} /></button><span ref={zoomLblRef} className="at-zoomv">{Math.round(v.z * 100)}%</span><button type="button" className="rv-ibtn" data-tip="atCmpZoomOut" onClick={() => pz.zoomAt(0, 0, vRef.current.z / 1.25, vRef.current)} aria-label="Perkecil"><Ico n="zoomOut" size={15} /></button><button type="button" className="rv-ibtn" data-tip="atCmpZoomFit" onClick={pz.reset} aria-label="Pas layar"><Ico n="fit" size={15} /></button></div><div className="rv-dock-wrap"><div className="rv-dock rv-glass"><div className="rv-dock-top"><span className={'at-rt-live-badge' + badgeCls}><i />{badgeTxt}</span><div className="rv-dock-title"><b>{activeStage.short}</b><span>{subLine}</span></div><div className="rv-dock-ctl">{!isFinished ? <button type="button" data-tip="atRtPause" className={'rv-btn' + (traceCtrl.paused ? ' pri' : '')} onClick={() => setTraceCtrl(c => ({
            paused: !c.paused
          }))}><Ico n={traceCtrl.paused ? 'play' : 'auto'} size={13} />{traceCtrl.paused ? 'Lanjutkan' : 'Jeda'}</button> : <><button type="button" data-tip="atRtReplayAll" className={'rv-btn' + (replayMode && replayMode.type === 'all' ? ' pri' : '')} onClick={() => replayMode ? setReplayMode(null) : startReplayAll()}><Ico n="play" size={13} />{replayMode && replayMode.type === 'all' ? 'Hentikan' : 'Putar ulang'}</button><button type="button" data-tip="atRtReplayStage" className="rv-btn" onClick={() => selectAndReplayStage(activeStage)}><Ico n="refresh" size={13} /> Tahap {activeStage.idx + 1}</button></>}<Seg tip="atRtSpeed" o={[['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ...(!isFinished ? [['8', 'Instan']] : [])]} v={String(traceCtrl.speed || 1)} on={val => setTraceCtrl({
            speed: parseFloat(val),
            skipToEnd: parseFloat(val) >= 8
          })} />{!isFinished && <AtCheck tip="atRtHold" checked={traceCtrl.holdOnComplete !== false} onChange={val => setTraceCtrl({
            holdOnComplete: val
          })}>Tahan di tab ini</AtCheck>}</div></div><div className="rv-steps">{RT_STAGES.map(st => {
          const isCur = activeStage.id === st.id;
          const isDone = displayFrac >= st.f1 - 0.002;
          const pct = VMT.clamp((displayFrac - st.f0) / (st.f1 - st.f0) * 100, 0, 100);
          return <button key={st.id} type="button" data-tip="atRtStageCard" onClick={() => selectAndReplayStage(st)} className={'rv-step' + (isCur ? ' cur' : '') + (isDone && !isCur ? ' done' : '')}><span className="rv-step-n">{isDone && !isCur ? <Ico n="check" size={10} /> : st.idx + 1}</span><span className="rv-step-t">{{
                classify: 'Scan',
                palette: 'Palette',
                segment: 'Segment',
                trace: 'Graph',
                smooth: 'Corners',
                fit: 'Bézier',
                assemble: 'Assemble'
              }[st.id] || st.short}</span><i style={{
              width: pct + '%'
            }} /></button>;
        })}</div><div className="rv-scrub"><Slider tip="atRtScrubber" min={0} max={100} step={0.5} value={+(displayFrac * 100).toFixed(1)} on={val => {
          setReplayMode(null);
          if (!isFinished) setTraceCtrl({
            paused: true
          });
          setManualFrac(val / 100);
        }} style={{
          flex: 1,
          minWidth: 120
        }} /><span className="rv-pct">{pctTotal}%</span>{manualFrac !== null && !isFinished && <button type="button" className="rv-btn" onClick={() => {
          setManualFrac(null);
          setTraceCtrl({
            paused: false
          });
        }}>Ikuti live</button>}</div></div></div><RvSide open={sideOpen} onToggle={() => setSideOpen(o => !o)} cls="rv-side-rt" icon={RT_STAGE_ICONS[activeStage.id] || 'detect'} title={'Tahap ' + (activeStage.idx + 1) + ' · ' + activeStage.short} sub="Diagnostik & telemetri"><div className="rv-desc">{activeStage.desc}</div><div className="rv-sec">Tampilan kanvas</div><div className="rv-opts"><Seg tip="atRtGhost" o={[['0', 'Tanpa bayangan'], ['25', '25%'], ['55', '55%']]} v={String(ghostOp)} on={val => setGhostOp(+val)} /><div className="rv-chks"><AtViewToggle tip="atRtPins" icon="nodes" checked={showPins} onChange={setShowPins}>Simpul & handle</AtViewToggle><AtViewToggle icon="grid" checked={showGrid} onChange={setShowGrid}>Kisi</AtViewToggle></div></div><div className="at-stat-pills">{activeStage.legend.map(([col, lb], i) => <span key={i} className="at-stat-pill"><i style={{
          background: col,
          borderRadius: lb.includes('Bulat') ? '50%' : '2px'
        }} /><span>{lb}</span></span>)}</div><div className="rv-sec">Metrik tahap ini</div><div>{stageMetrics.map(([k, val]) => <div key={k} className="at-kv"><span className="mut">{k}</span><span className="font-semibold">{val}</span></div>)}</div><div className="mt-3">{viz && viz.palette && viz.palette.length > 0 && <div className="mb-3"><div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1.5"><span className="text-[11px] mut font-semibold flex items-center gap-1.5"><span className="at-kv-ic"><Ico n="palette" size={12} /></span><span>Warna dominan terdeteksi ({(pendingPal || viz.palette).length})</span></span>{isFinished && onPaletteChange && <span className="text-[10px] mut" style={{
            minWidth: 0,
            overflowWrap: 'anywhere'
          }}>Klik warna = sorot objek · klik ganda = ubah</span>}</div>{isFinished && onPaletteChange ? <div style={{
          display: 'flex',
          justifyContent: 'flex-start'
        }}><AtDetectedPalette colors={pendingPal || viz.palette.map(c => c.hex.toLowerCase())} items={pendingPal ? null : viz.palette} edited={!!paletteEdited} job={job} flash={flash} selected={pendingPal ? null : hl} onSelect={pendingPal ? undefined : selectHl} hidden={pendingPal ? new Set() : hiddenLabels ? new Set(hiddenLabels) : undefined} onToggleNone={pendingPal ? undefined : onToggleNone} onChange={onPaletteChange} onGradChange={onPaletteGradChange} onOpacityChange={onPaletteOpacityChange} onReset={onPaletteReset} pending={!!pendingPal} onRetrace={onPaletteRetrace} onDiscard={onPaletteDiscard} maxColorEnabled={maxColorEnabled} maxColors={maxColors} onMaxColorChange={onMaxColorChange} /></div> : <div className="at-swrow">{viz.palette.map((c, i) => {
            const gCss = c.grad ? VMT.gradToCss(c.grad) : null;
            const bgStyle = gCss || c.hex;
            const wSw = gCss ? 34 : 20;
            const ttl = gCss ? `${c.grad.type === 'radial' ? 'Radial' : 'Linear'} Gradient (${c.grad.stops.map(s => s.color.toUpperCase()).join(' → ')})` : c.hex.toUpperCase();
            return isFinished ? <button key={i} type="button" className={'at-sw' + (hl === i ? ' hl-on' : '')} aria-pressed={hl === i} title={ttl + ' · klik untuk menyorot objek ini di kanvas'} onClick={() => selectHl(i)} style={{
              width: wSw,
              height: 20,
              borderRadius: gCss ? 99 : 6,
              background: bgStyle,
              cursor: 'pointer'
            }} /> : <span key={i} className="at-sw" title={ttl} style={{
              width: wSw,
              height: 20,
              borderRadius: gCss ? 99 : 6,
              background: bgStyle,
              cursor: 'default'
            }} />;
          })}</div>}{onGradientModeChange && <div className="at-kv mt-2 pt-2" style={{
          borderTop: '1px solid var(--line)'
        }}><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="sparkle" size={12} /></span><span>Gradient Mode</span></span><div className="rv-gm"><Seg o={[['auto', 'Otomatis'], ['on', 'Aktif'], ['off', 'Nonaktif']]} v={gradientMode || 'auto'} on={onGradientModeChange} /></div></div>}</div>}</div><details className="rv-fold"><summary><Ico n="alert" size={13} /> Kemungkinan masalah <small>{activeStage.symptoms.length}</small></summary><div className="at-rt-diag-list">{activeStage.symptoms.map((sym, i) => <div key={i} className="at-rt-diag-item"><Ico n="alertDot" size={13} /><span>{sym}</span></div>)}</div></details><details className="rv-fold"><summary><Ico n="wand" size={13} /> Solusi <small>{activeStage.fixes.length}</small></summary><div className="at-rt-diag-list">{activeStage.fixes.map((fx, i) => <div key={i} className="at-rt-diag-item fix"><Ico n="checkCircle" size={13} /><span>{fx}</span></div>)}</div></details>{isFinished && <div className="rv-acts-b">{onOpenAdvWizard && <button type="button" className="rv-btn" onClick={onOpenAdvWizard}><Ico n="sliders" size={13} /> Advanced wizard</button>}</div>}</RvSide></div>);
};

const ProgressSteps = ({ prog, job, maxColorEnabled, maxColors, gradientMode }) => {
  rvUseBodyFlag();
  return ReactDOM.createPortal((<div className="rv-root nobar"><RealTimeTraceStudio prog={prog} job={job} sess={null} isFinished={false} maxColorEnabled={maxColorEnabled} maxColors={maxColors} gradientMode={gradientMode} /></div>), document.body);
};

export { RealTimeTraceStudio, ProgressSteps };
