import React, { useState, useRef, useEffect } from 'react';
import { rvUseWide, RvPortal, RvSide } from './CanvasRenderUtils.jsx';
import { useHwConfig, fmtRamShort } from './HwSettingsPanel.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { atEnsureOrigWork, atGetResLabel, atResetWork, atLoad, AT_PRESETS, AT_PIPES, AtToggle, atDownload } from './TraceSharedUI.jsx';
import { BrandLogo, Ico, pickFiles, Select } from './CommonControls.jsx';
import { CompareView } from './CompareView.jsx';
import { Seg } from './ColorPicker.jsx';
import { AtDetectedPalette } from './PaletteComponents.jsx';
import { BasicWizard } from './BasicWizard.jsx';
import { AdvWizard } from './AdvWizard.jsx';
import { ProgressSteps } from './RealTimeTraceStudio.jsx';
import { ReviewScreen } from './ReviewScreen.jsx';
import { SegEditor } from './SegEditor.jsx';
import { NodeEditor } from './NodeEditor.jsx';

/* =====================================================================
   AutoTrace — Komponen Utama
   ===================================================================== */
const AutoTrace = ({ flash, onOpenGeneralSettings, hwModalOpenExternal, setHwModalOpenExternal }) => {
  const [screen, setScreen] = useState('drop');
  const [hwModalOpenInternal, setHwModalOpenInternal] = useState(false);
  const hwModalOpen = hwModalOpenExternal !== undefined ? hwModalOpenExternal : hwModalOpenInternal;
  const setHwModalOpen = setHwModalOpenExternal || setHwModalOpenInternal;
  const [revInitTab, setRevInitTab] = useState(null);
  const [pipeSideOpen, setPipeSideOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000);
  const pipeWide = rvUseWide(1000);
  const [pipe, setPipe] = useState('auto');
  const [wizBackTo, setWizBackTo] = useState('drop');
  const [resMode, setResMode] = useState('original');
  const [profileMode, setProfileMode] = useState('auto');
  const [closedLoopOn, setClosedLoopOn] = useState(true);
  const [showProfiler8, setShowProfiler8] = useState(false);
  const [colorQuick, setColorQuick] = useState('auto');
  const [maxColorEnabled, setMaxColorEnabled] = useState(false);
  const [maxColors, setMaxColors] = useState(16);
  const [gradientMode, setGradientMode] = useState('auto');
  const [job, setJob] = useState(null);
  const [prog, setProg] = useState({ stage: 'classify', frac: 0, detail: '' });
  const [sess, setSess] = useState(null);
  const [cfgUsed, setCfgUsed] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchPresetIdx, setBatchPresetIdx] = useState(-1);
  const [hwCfg] = useHwConfig();

  /* [PATCH] Referensi untuk fitur Tempel Gambar (Ctrl+V) & pembatalan hasil vektorisasi yang usang */
  const onFilesRef = useRef(null);
  const batchBusyRef = useRef(false);
  const pasteBusyRef = useRef(false);
  const pasteImgRef = useRef(null);
  const runTokenRef = useRef(0);
  const runPromiseRef = useRef(null);
  batchBusyRef.current = batchBusy;

  const makeJob = async (file, preferredRes) => {
    const { img, w, h } = await VMT.loadImage(file);
    const url = URL.createObjectURL(file);
    const maxOrig = Math.min(2048, Math.max(w, h));
    const maxHigh = Math.min(1440, Math.max(360, Math.round(Math.max(w, h) * 0.75)));
    const maxMed = Math.min(960, Math.max(240, Math.round(Math.max(w, h) * 0.625)));
    const maxLow = Math.min(480, Math.max(160, Math.round(Math.max(w, h) * 0.5)));

    const lowWork = VMT.makeWork({ img, w, h }, maxLow);
    const lowBackup = lowWork.data.data.slice();

    /* Lazy work buffers: tunda alokasi kanvas resolusi besar sampai benar-benar dibutuhkan oleh Wizard */
    const origK = Math.min(1, maxOrig / Math.max(w, h));
    const origW = Math.max(16, Math.round(w * origK));
    const origH = Math.max(16, Math.round(h * origK));
    const origWork = { w: origW, h: origH, scale: 1 / origK, k: origK, data: lowWork.data, origAlpha: lowWork.origAlpha, _materialized: false };
    const origBackup = lowBackup;

    const highK = Math.min(1, maxHigh / Math.max(w, h));
    const highW = Math.max(16, Math.round(w * highK));
    const highH = Math.max(16, Math.round(h * highK));
    const highWork = { w: highW, h: highH, scale: 1 / highK, k: highK, data: lowWork.data, origAlpha: lowWork.origAlpha, _materialized: false };
    const highBackup = lowBackup;

    const medK = Math.min(1, maxMed / Math.max(w, h));
    const medW = Math.max(16, Math.round(w * medK));
    const medH = Math.max(16, Math.round(h * medK));
    const medWork = { w: medW, h: medH, scale: 1 / medK, k: medK, data: lowWork.data, origAlpha: lowWork.origAlpha, _materialized: false };
    const medBackup = lowBackup;
    await new Promise(r => requestAnimationFrame(r));

    const alpha = VMT.analyzeAlpha(lowWork.data);
    const cls = VMT.classifyStage(lowWork, alpha, w, h);
    const adaptiveProfile = VMT.buildAdaptiveTraceProfile(cls, w, h, 'auto');
    await new Promise(r => requestAnimationFrame(r));

    const tempWork = {
      data: new ImageData(new Uint8ClampedArray(lowBackup), lowWork.w, lowWork.h),
      w: lowWork.w,
      h: lowWork.h,
      _plateauAnalysis: lowWork._plateauAnalysis,
      _plateauCacheKey: lowWork._plateauCacheKey
    };
    const mask = VMT.flattenAlpha(tempWork, 'keep', '#ffffff');
    const edgeField = VMT.buildEdgeField(tempWork, mask);
    const autoPalRes = VMT.findPalette(tempWork, mask, {
      colorMode: 'auto',
      sensitivity: adaptiveProfile.params.sensitivity || 'medium',
      layerDifference: adaptiveProfile.params.layerDifference,
      adaptiveKMax: adaptiveProfile.params.targetKMax,
      imageType: cls.type
    }, edgeField);
    await new Promise(r => requestAnimationFrame(r));
    const rawAutoPaletteObjs = autoPalRes.palette;
    const cons = VMT.consolidateGradientPalette(tempWork, mask, rawAutoPaletteObjs, edgeField, cls, {
      gradientMode,
      maxColorEnabled,
      maxColors
    });
    const autoPalette = cons.hexes;
    const autoPaletteItems = cons.items;
    const twoPalette = rawAutoPaletteObjs.length >= 2
      ? [rawAutoPaletteObjs[0].hex.toLowerCase(), rawAutoPaletteObjs[1].hex.toLowerCase()]
      : VMT.findPalette(tempWork, mask, { colorMode: 'two', imageType: cls.type }, edgeField).palette.map(c => c.hex.toLowerCase());
    const detectedPool = VMT.detectImageColorPool(tempWork, mask, edgeField, 24);

    const rec = VMT.analyzeRecommendations(w, h, alpha, cls, autoPalette, detectedPool);
    const chosenRes = preferredRes || rec.recRes.id || 'original';
    const activeWork = chosenRes === 'low' ? lowWork : chosenRes === 'medium' ? medWork : chosenRes === 'high' ? highWork : origWork;
    const activeOrig = chosenRes === 'low' ? lowBackup : chosenRes === 'medium' ? medBackup : chosenRes === 'high' ? highBackup : origBackup;

    return {
      file, img, w, h,
      name: (file.name || 'gambar').replace(/\.[^.]+$/, ''),
      url,
      work: activeWork,
      workOrig: activeOrig,
      origWork, origBackup, maxOrig,
      highWork, highBackup, maxHigh,
      medWork, medBackup, maxMed,
      lowWork, lowBackup, maxLow,
      previewWork: tempWork,
      previewEdge: edgeField,
      mask,
      alpha, cls,
      adaptiveProfile,
      rawAutoPaletteObjs,
      hasSmoothGradient: !!(autoPalRes.hasSmoothGradient || cls.surfaceMode === 'gradient' || cls.surfaceMode === 'mixed' || cls.gradientContinuity >= 0.14),
      autoPalette,
      autoPaletteItems,
      userPalette: null,
      userPaletteItems: null,
      twoPalette,
      detectedPool,
      rec
    };
  };

  /* [PATCH] Sunting palet dominan & stop gradient di halaman pipeline */
  const setUserPalette = pal => setJob(j => {
    if (!j) return j;
    if (!pal || !pal.length) return { ...j, userPalette: null, userPaletteItems: null };
    const curItems = j.userPaletteItems || j.autoPaletteItems || [];
    const nextItems = pal.map((hx, idx) => {
      const prev = curItems[idx];
      const [r, g, b] = VMT.rgbOf(hx);
      return prev ? { ...prev, r, g, b, hex: hx.toLowerCase() } : { r, g, b, hex: hx.toLowerCase(), isGradient: false, grad: null };
    });
    return { ...j, userPalette: pal.map(h => h.toLowerCase()), userPaletteItems: nextItems };
  });

  const handleJobGradChange = (idx, newGrad, midHex) => {
    setJob(j => {
      if (!j) return j;
      const baseCols = (j.userPalette || j.autoPalette || []).slice();
      const baseItems = (j.userPaletteItems || j.autoPaletteItems || []).map(it => ({ ...it }));
      const hx = (midHex || (newGrad && newGrad.base) || baseCols[idx] || '#000000').toLowerCase();
      baseCols[idx] = hx;
      const [r, g, b] = VMT.rgbOf(hx);
      if (!newGrad || !newGrad.stops || newGrad.stops.length < 2) {
        baseItems[idx] = { ...(baseItems[idx] || {}), r, g, b, hex: hx, isGradient: false, grad: null, userGrad: null };
      } else {
        const ug = { ...newGrad, base: hx, userCreated: true, stops: newGrad.stops.map(s => ({ ...s })) };
        baseItems[idx] = { ...(baseItems[idx] || {}), r, g, b, hex: hx, isGradient: true, grad: ug, userGrad: ug };
      }
      return { ...j, userPalette: baseCols, userPaletteItems: baseItems };
    });
  };

  const handleJobOpacityChange = (idx, nextOp) => {
    setJob(j => {
      if (!j) return j;
      const baseCols = (j.userPalette || j.autoPalette || []).slice();
      const baseItems = (j.userPaletteItems || j.autoPaletteItems || []).map(it => ({ ...it }));
      const clOp = VMT.clamp(nextOp == null ? 1 : +nextOp, 0, 1);
      baseItems[idx] = { ...(baseItems[idx] || {}), opacity: clOp, grad: baseItems[idx]?.grad ? { ...baseItems[idx].grad, opacity: clOp } : null };
      return { ...j, userPalette: baseCols, userPaletteItems: baseItems };
    });
  };

  const applyMaxColorAndGradMode = (nextMaxOn, nextMaxVal, nextGradMode) => {
    const cleanVal = VMT.clamp(nextMaxVal || maxColors || 16, 2, 64);
    setMaxColorEnabled(nextMaxOn);
    setMaxColors(cleanVal);
    setGradientMode(nextGradMode);
    if (job && job.previewWork && job.rawAutoPaletteObjs) {
      const cons = VMT.consolidateGradientPalette(job.previewWork, job.mask, job.rawAutoPaletteObjs, job.previewEdge, job.cls, {
        gradientMode: nextGradMode,
        maxColorEnabled: nextMaxOn,
        maxColors: cleanVal
      });
      let nextUserPal = job.userPalette;
      let nextUserItems = job.userPaletteItems;
      if (nextMaxOn && nextUserPal && nextUserPal.length > cleanVal) {
        nextUserPal = nextUserPal.slice(0, cleanVal);
        nextUserItems = nextUserItems ? nextUserItems.slice(0, cleanVal) : null;
      }
      setJob(j => j ? {
        ...j,
        autoPalette: cons.hexes,
        autoPaletteItems: cons.items,
        userPalette: nextUserPal,
        userPaletteItems: nextUserItems
      } : j);
    }
    if (sess) {
      const updatedSess = VMT.applySessionPaletteAndGradientSettings(sess, {
        maxColorEnabled: nextMaxOn,
        maxColors: cleanVal,
        gradientMode: nextGradMode,
        stackMode: (cfgUsed && cfgUsed.stackMode) || 'stack',
        stroke: cfgUsed ? cfgUsed.stroke !== false : true
      });
      setSess(updatedSess);
    }
  };

  const switchResMode = mode => {
    setResMode(mode);
    if (!job) return;
    if (mode !== 'low') atEnsureOrigWork(job, mode);
    const nextWork = mode === 'low' ? job.lowWork : mode === 'medium' ? job.medWork : mode === 'high' ? job.highWork : job.origWork;
    const nextBackup = mode === 'low' ? job.lowBackup : mode === 'medium' ? job.medBackup : mode === 'high' ? job.highBackup : job.origBackup;
    if (nextWork && nextWork.data && nextBackup) nextWork.data.data.set(nextBackup);
    setJob({ ...job, work: nextWork, workOrig: nextBackup });
    flash(`${atGetResLabel(mode)} (${nextWork.w}×${nextWork.h} px)`);
  };

  const switchProfileMode = mode => {
    setProfileMode(mode);
    if (!job) return;
    const nextAdp = VMT.buildAdaptiveTraceProfile(job.cls, job.w, job.h, mode);
    setJob({ ...job, adaptiveProfile: nextAdp });
    flash(mode === 'auto'
      ? `Profil Adaptif Otomatis: ${nextAdp.shortTitle} (ΔE=${nextAdp.keyParams.layerDifference}, Speckle=${nextAdp.keyParams.filterSpeckle}px)`
      : `Profil Dikunci ke ${nextAdp.shortTitle} (ΔE=${nextAdp.keyParams.layerDifference}, Speckle=${nextAdp.keyParams.filterSpeckle}px)`);
  };

  const onFiles = async files => {
    const imgs = [...(files || [])].filter(f => (f.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name || ''));
    if (!imgs.length) { flash('Pilih file gambar (PNG/JPG/WebP/GIF/BMP)'); return; }
    try {
      if (imgs.length > 1) {
        setQueue(imgs.map(f => ({ file: f, name: f.name, status: 'antre', result: null })));
        setScreen('batch');
        flash(imgs.length + ' gambar ditambahkan ke antrean Batch');
        return;
      }
      flash('Menganalisis karakteristik citra & warna…');
      const j = await makeJob(imgs[0]);
      /* Bersihkan ObjectURL gambar sebelumnya agar tidak bocor di memori browser */
      if (job && job.url) {
        try { URL.revokeObjectURL(job.url); } catch (e) {}
      }
      setJob(j);
      setSess(null);
      setProfileMode('auto');
      setPipe(j.rec.recPipe.id);
      setResMode(j.rec.recRes.id);
      setColorQuick(j.rec.recColor.id);
      setScreen('drop');
      flash(`Rekomendasi: ${j.rec.recPipe.title} · ${j.rec.recRes.title}`);
    } catch (e) {
      console.error(e);
      flash('Gagal memuat gambar');
    }
  };

  onFilesRef.current = onFiles;

  /* [PATCH] Tempel Gambar (Ctrl+V) — global: dari Home, Pipeline, Wizard, Proses Tracing, maupun Review */
  useEffect(() => {
    const isImg = f => !!f && ((f.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name || ''));
    const pickImage = dt => {
      if (!dt) return null;
      for (const f of (dt.files || [])) if (isImg(f)) return f;
      for (const it of (dt.items || [])) {
        if (it.kind === 'file' && (it.type || '').startsWith('image/')) { const f = it.getAsFile(); if (f) return f; }
      }
      return null;
    };
    const doPaste = async f => {
      if (batchBusyRef.current) { flash('Batch sedang diproses — tempel gambar ditunda'); return; }
      if (pasteBusyRef.current) { flash('Gambar sebelumnya masih dianalisis…'); return; }
      pasteBusyRef.current = true;
      try {
        runTokenRef.current++; /* Hasil vektorisasi/trace ulang yang masih berjalan dibuang, tidak menimpa gambar baru */
        VMT.setTraceCtrl({ skipToEnd: true }); /* Percepat proses lama agar cepat selesai di latar belakang */
        const ext = ((f.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png';
        const d = new Date(), p2 = n => String(n).padStart(2, '0');
        const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
        const named = new File([f], 'tempel-' + stamp + '.' + ext, { type: f.type || 'image/png' });
        await onFilesRef.current([named]);
      } finally {
        pasteBusyRef.current = false;
      }
    };
    pasteImgRef.current = doPaste;
    const onPaste = async e => {
      const f = pickImage(e.clipboardData);
      if (!f) return; /* Clipboard berisi teks/lainnya: biarkan perilaku bawaan browser */
      e.preventDefault();
      await doPaste(f);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  /* Tombol Tempel Gambar (klik) — membaca clipboard lewat Clipboard API; Ctrl+V tetap jalan lewat event paste */
  const pasteFromButton = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) { flash('Browser belum mendukung tombol tempel — gunakan Ctrl+V'); return; }
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = (it.types || []).find(t => t.startsWith('image/'));
        if (type) {
          const blob = await it.getType(type);
          await pasteImgRef.current(new File([blob], 'tempel.' + (type.split('/')[1] || 'png'), { type }));
          return;
        }
      }
      flash('Tidak ada gambar di clipboard');
    } catch (e) {
      console.error(e);
      flash('Izin clipboard ditolak — gunakan Ctrl+V');
    }
  };

  const runVectorize = async (mcfg, j) => {
    const J = j || job;
    if (!J) return;
    atResetWork(J);
    const effResMode = (mcfg && mcfg.resMode) ? mcfg.resMode : resMode;
    const maxDim = effResMode === 'low' ? J.maxLow : effResMode === 'medium' ? J.maxMed : effResMode === 'high' ? J.maxHigh : J.maxOrig;
    const targetWork = effResMode === 'low' ? J.lowWork : effResMode === 'medium' ? J.medWork : effResMode === 'high' ? J.highWork : J.origWork;
    const resLabel = atGetResLabel(effResMode);
    const finalCfg = {
      maxColorEnabled,
      maxColors,
      gradientMode,
      ...mcfg,
      maxDim,
      resMode: effResMode
    };

    const prevRun = runPromiseRef.current; /* Jika proses lama (dibatalkan oleh tempel gambar) belum selesai, tunggu dulu */
    const myToken = ++runTokenRef.current;
    setScreen('working');
    setProg({ stage: 'classify', frac: 0.01, detail: `Memulai vektorisasi (${resLabel} ${targetWork.w}×${targetWork.h} px)…`, viz: null });
    const work = (async () => {
      if (prevRun) { try { await prevRun; } catch (e) {} }
      if (myToken !== runTokenRef.current) return;
      try {
        const res = await VMT.vectorize({ img: J.img, w: J.w, h: J.h }, finalCfg, (stage, frac, detail, viz) => { if (myToken === runTokenRef.current) setProg({ stage, frac, detail, viz }); });
        if (myToken !== runTokenRef.current) return;
        res.stats.resModeLabel = resLabel;
        setCfgUsed(finalCfg);
        setSess(res);
        setScreen('review');
        flash(`Vektorisasi selesai dalam ${(res.stats.ms / 1000).toFixed(1)} detik`);
      } catch (e) {
        if (myToken !== runTokenRef.current) return;
        console.error(e);
        flash('Vektorisasi gagal: ' + (e.message || e));
        setScreen('drop');
      }
    })();
    runPromiseRef.current = work;
    await work;
    if (runPromiseRef.current === work) runPromiseRef.current = null;
  };

  const autoCfg = () => {
    const adp = (job && job.adaptiveProfile) || VMT.buildAdaptiveTraceProfile(job ? job.cls : {}, job ? job.w : 800, job ? job.h : 800, profileMode);
    const p = adp.params;
    return {
      adaptiveProfileMode: profileMode,
      closedLoop: closedLoopOn,
      imageType: 'auto',
      quality: 'auto',
      transparency: 'keep',
      colorMode: (job.userPalette && job.userPalette.length) ? 'custom' : (colorQuick === 'custom' ? 'auto' : colorQuick),
      paletteColors: (job.userPalette && job.userPalette.length) ? job.userPalette : (colorQuick === 'two' ? job.twoPalette : undefined),
      paletteItems: (job.userPalette && job.userPalette.length) ? (job.userPaletteItems || job.autoPaletteItems) : undefined,
      maxColorEnabled,
      maxColors,
      gradientMode,
      sensitivity: p.sensitivity || 'medium',
      layerDifference: p.layerDifference,
      minPixels: p.minPixels,
      complexity: p.complexity,
      smoothMethod: p.smoothMethod,
      smoothness: p.smoothness,
      nodeDensity: p.nodeDensity,
      cornerMode: p.cornerMode,
      cornerAngle: p.cornerAngle,
      lineStraighten: p.lineStraighten,
      axisSnap: p.axisSnap,
      axisSnapDeg: p.axisSnapDeg,
      despeckleJitter: p.despeckleJitter,
      apexSharpness: p.apexSharpness,
      cornerRoundness: p.cornerRoundness,
      lineCurveSensitivity: p.lineCurveSensitivity,
      protectStemCaps: p.protectStemCaps,
      autoProfileParams: true,
      stroke: true,
      stackMode: 'stack',
      resMode,
    };
  };

  const startSelectedPipeline = (chosenPipe = pipe) => {
    if (!job) return;
    setPipe(chosenPipe);
    if (chosenPipe === 'auto') {
      runVectorize(autoCfg(), job);
    } else {
      setWizBackTo('drop');
      setScreen('wizard');
    }
  };

  const runBatch = async () => {
    if (!queue.length || batchBusy) return;
    setBatchBusy(true);
    const savedPresets = atLoad(AT_PRESETS, []);
    const chosenPreset = batchPresetIdx >= 0 && savedPresets[batchPresetIdx] ? savedPresets[batchPresetIdx].cfg : null;
    const q = [...queue];
    for (let i = 0; i < q.length; i++) {
      q[i] = { ...q[i], status: 'proses' };
      setQueue([...q]);
      try {
        const J = await makeJob(q[i].file, resMode);
        const bp = J.adaptiveProfile.params;
        const base = { adaptiveProfileMode: 'auto', imageType: 'auto', quality: 'auto', transparency: 'keep', colorMode: 'auto', sensitivity: bp.sensitivity || 'medium', layerDifference: bp.layerDifference, minPixels: bp.minPixels, complexity: bp.complexity, smoothMethod: bp.smoothMethod, smoothness: bp.smoothness, nodeDensity: bp.nodeDensity, cornerMode: bp.cornerMode, cornerAngle: bp.cornerAngle, lineStraighten: bp.lineStraighten, axisSnap: bp.axisSnap, axisSnapDeg: bp.axisSnapDeg, despeckleJitter: bp.despeckleJitter, apexSharpness: bp.apexSharpness, cornerRoundness: bp.cornerRoundness, lineCurveSensitivity: bp.lineCurveSensitivity, protectStemCaps: bp.protectStemCaps, stroke: true, stackMode: 'stack', maxDim: resMode === 'low' ? J.maxLow : resMode === 'medium' ? J.maxMed : resMode === 'high' ? J.maxHigh : J.maxOrig };
        const cfg = chosenPreset ? { ...base, ...chosenPreset } : base;
        const res = await VMT.vectorize({ img: J.img, w: J.w, h: J.h }, cfg, () => {});
        q[i] = { ...q[i], status: 'selesai', result: res, job: J };
      } catch (e) {
        q[i] = { ...q[i], status: 'gagal' };
      }
      setQueue([...q]);
    }
    setBatchBusy(false);
    flash('Pemrosesan batch selesai');
  };

  const applyNodeEdit = (nextRegs, dirty, afterCb) => {
    if (dirty && sess && nextRegs) {
      const hiddenLabels = sess.hiddenLabels || [];
      const stackMode = sess.stackMode || (cfgUsed && cfgUsed.stackMode) || 'stack';
      const strokeOn = sess.stroke != null ? sess.stroke : (cfgUsed ? cfgUsed.stroke !== false : true);
      const bgOpt = (cfgUsed && (cfgUsed.transparency === 'white' || cfgUsed.transparency === 'custom'))
        ? (cfgUsed.transparency === 'custom' ? (cfgUsed.customColor || '#ffffff') : '#ffffff')
        : 'none';
      const svg = VMT.assembleSVG(nextRegs, sess.W, sess.H, {
        stackMode,
        stroke: strokeOn,
        bg: bgOpt,
        safetyBg: hiddenLabels.length === 0 && !(sess.stats && sess.stats.alpha && sess.stats.alpha.hasAlpha),
        hiddenLabels,
      });
      let nextTraceHistory = sess.traceHistory;
      if (nextTraceHistory) {
        const bzViz = [];
        const smViz = [];
        const usePal = sess.palette || [];
        for (const rg of nextRegs) {
          if (!rg || rg.hidden) continue;
          const col = (usePal[rg.label] && usePal[rg.label].hex) || rg.color || '#6366f1';
          for (const lp of (rg.loops || [])) {
            if (!lp || lp._coveredHole) continue;
            const segs = lp.segs || [];
            if (!segs.length) continue;
            const dStr = lp.d || VMT.segsToD(segs, true);
            let p2d = null;
            try { p2d = new Path2D(dStr); } catch (e) {}
            const absA = Math.abs(lp.area || 0);
            const sharpPts = [], smoothPts = [];
            for (const sg of segs) {
              if (sg.startSharp) sharpPts.push(sg.P0);
              else smoothPts.push(sg.P0);
            }
            smViz.push({ label: rg.label, color: col, pts: lp.pts || [], rawPts: lp.pts || [], sharpPts, smoothPts, area: absA });
            bzViz.push({ label: rg.label, color: col, segs, d: dStr, p2d, area: absA });
          }
        }
        smViz.sort((a, b) => b.area - a.area);
        bzViz.sort((a, b) => b.area - a.area);
        const drawingSegs = [];
        for (let li = 0; li < bzViz.length; li++) {
          const bl = bzViz[li];
          for (let si = 0; si < bl.segs.length; si++) {
            drawingSegs.push({
              seg: bl.segs[si],
              color: bl.color,
              loopIdx: li,
              segIdxInLoop: si,
              isFirstInLoop: si === 0,
              isLastInLoop: si === bl.segs.length - 1,
              loopP2d: bl.p2d
            });
          }
        }
        nextTraceHistory = {
          ...nextTraceHistory,
          svg,
          regs: nextRegs,
          smoothedLoops: smViz,
          bezierLoops: bzViz,
          drawingSegs
        };
      }
      setSess({
        ...sess,
        origRegs: sess.origRegs || sess.regs,
        svg,
        regs: nextRegs,
        traceHistory: nextTraceHistory
      });
      flash('Perubahan Vector Editor berhasil diterapkan ke vektor SVG');
    }
    if (typeof afterCb === 'function') {
      afterCb();
    } else {
      setScreen('review');
    }
  };

  const applySegEdit = async (dirty, pixelsDirty = true, afterCb = null) => {
    if (typeof pixelsDirty === 'function') {
      afterCb = pixelsDirty;
      pixelsDirty = true;
    }
    if (!dirty) {
      if (typeof afterCb === 'function') afterCb();
      else setScreen('review');
      return;
    }
    /* Jika hanya warna/gradien/transparansi palet yang diubah (tanpa melukis ulang piksel labels),
       perbarui SVG secara instan (<5ms) tanpa perlu menelusuri ulang ribuan kontur! */
    if (!pixelsDirty && sess && sess.regs && sess.palette) {
      const hiddenLabels = sess.hiddenLabels || [];
      const stackMode = sess.stackMode || (cfgUsed && cfgUsed.stackMode) || 'stack';
      const strokeOn = sess.stroke != null ? sess.stroke : (cfgUsed ? cfgUsed.stroke !== false : true);
      const nextRegs = sess.regs.map(rg => {
        const pCol = sess.palette[rg.label];
        if (!pCol) return rg;
        const ug = (!pCol.userSolid && pCol.grad && pCol.grad.stops && pCol.grad.stops.length >= 2)
          ? { ...pCol.grad, _userCreated: true, userCreated: true, stops: pCol.grad.stops.map(s => ({ ...s })) }
          : null;
        return {
          ...rg,
          color: pCol.hex || rg.color,
          opacity: pCol.opacity != null ? pCol.opacity : (rg.opacity ?? 1),
          grad: ug ? VMT.resolveGradCoordsForBbox(ug, null, sess.W, sess.H) : null,
          loops: (rg.loops || []).map(lp => ({
            ...lp,
            opacity: pCol.opacity != null ? pCol.opacity : (lp.opacity ?? 1),
            grad: ug ? { ...ug } : null
          }))
        };
      });
      const svg = VMT.assembleSVG(nextRegs, sess.W, sess.H, {
        stackMode,
        stroke: strokeOn,
        bg: 'none',
        safetyBg: hiddenLabels.length === 0 && !(sess.stats && sess.stats.alpha && sess.stats.alpha.hasAlpha),
        hiddenLabels,
      });
      if (sess.traceHistory) {
        sess.traceHistory.svg = svg;
        sess.traceHistory.regs = nextRegs;
        sess.traceHistory.palette = sess.palette;
      }
      setSess({ ...sess, svg, regs: nextRegs });
      if (typeof afterCb === 'function') afterCb();
      else setScreen('review');
      flash('Perubahan warna, gradien & transparansi diterapkan');
      return;
    }
    const tok = runTokenRef.current;
    setScreen('working');
    setProg({ stage: 'trace', frac: 0.56, detail: 'Menelusuri ulang batas dari segmentasi manual…', viz: sess && sess.traceHistory });
    try {
      const res = await VMT.retraceFromLabels(sess, cfgUsed, (stage, frac, detail, viz) => { if (tok === runTokenRef.current) setProg({ stage, frac, detail, viz }); });
      if (tok !== runTokenRef.current) return;
      setSess(res);
      if (typeof afterCb === 'function') afterCb();
      else setScreen('review');
      flash('Trace ulang selesai');
    } catch (e) {
      if (tok !== runTokenRef.current) return;
      flash('Gagal trace ulang');
      setScreen('review');
    }
  };

  return (<div className="at-root"><div className="at-head" style={{
    alignItems: 'center'
  }}><div className="flex items-center"><BrandLogo height={36} /></div><div className="flex items-center gap-2 flex-wrap"><button type="button" data-tip="atHwSettings" className="at-hw-btn" onClick={() => setHwModalOpen(true)}><Ico n="settings" size={15} /><span>Pengaturan</span><span className="at-hw-pill"><i />{hwCfg.multiThread ? hwCfg.cpuCores + ' Core' : '1 Core'} · {fmtRamShort(hwCfg.ramMb)}{hwCfg.useGpu ? ' · VGA' : ''}</span></button>{(job || screen !== 'drop') && screen !== 'working' && <>{screen === 'drop' && sess && job && <button type="button" data-tip="atReturnReview" className="btn pri" onClick={() => setScreen('review')}><Ico n="layers" size={13} /> Kembali ke Perakitan SVG</button>}{screen !== 'drop' && job && <button type="button" data-tip="atBackSetup" className="btn sec" onClick={() => setScreen('drop')}><Ico n="sliders" size={13} /> Pipeline</button>}<button type="button" data-tip="atUploadNew" className="btn sec" onClick={() => pickFiles('image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp', onFiles)}><Ico n="upload" size={13} /> Upload Gambar Baru</button></>}</div></div>{screen === 'drop' && <RvPortal cls="rv-pipe-root"><div className={'rv-stage' + (job && pipeSideOpen && pipeWide ? ' side-open' : '')}>{job ? <CompareView key={job.url} imgUrl={job.url} svg={null} regs={[]} hiddenLabels={[]} W={job.w} H={job.h} initialMode="bitmap" bitmapOnly={true} floating={true} onToggleBgLabel={() => {}} pad={{
        t: 64,
        r: pipeSideOpen && pipeWide ? 388 : 0,
        b: 14,
        l: 0
      }} /> : <><div className="rv-empty-bg chk" /><div className="rv-empty"><div className="card at-dropwrap"><div role="button" tabIndex={0} data-tip="atDropzone" className={'at-drop' + (dragOver ? ' drag' : '')} onClick={() => pickFiles('image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp', onFiles)} onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pickFiles('image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp', onFiles);
              }
            }} onDragOver={e => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }} onDragLeave={() => setDragOver(false)} onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              onFiles(e.dataTransfer.files);
            }}><span className="at-drop-ic"><Ico n="upload" size={26} /></span><div className="at-drop-t">Unggah Gambar untuk Memulai Auto Trace</div><div className="mut text-[12px] max-w-md leading-relaxed">Seret & letakkan file gambar ke area ini, atau klik untuk memilih dari perangkat Anda. Sistem akan otomatis menganalisis kualitas, mendeteksi palet warna, dan merekomendasikan pipeline terbaik.</div><div className="flex flex-wrap justify-center gap-1.5 mt-1">{['PNG', 'JPG / JPEG', 'WebP', 'GIF', 'BMP', 'Multi-File (Batch)'].map(fmt => <span key={fmt} className="abt-tag" style={{
                  marginLeft: 0
                }}>{fmt}</span>)}</div></div></div></div></>}{job && <RvSide open={pipeSideOpen} onToggle={() => setPipeSideOpen(o => !o)} icon="sliders" title="Pengaturan & Pipeline" sub={job.name + ' · ' + job.w + '×' + job.h + ' px'}><div className="rv-pipe"><div className="space-y-3"><div className="card" style={{
              padding: 18
            }}><div className="at-card-t"><span>Pipeline</span><span className="at-rec-badge solid">★ Direkomendasikan: {job.rec.recPipe.title}</span></div><div className="pp-list" role="radiogroup" aria-label="Pipeline">{AT_PIPES.map(p => {
                  const isRec = job.rec.recPipe.id === p.id;
                  const isOn = pipe === p.id;
                  return <div key={p.id} role="radio" aria-checked={isOn} tabIndex={0} data-tip={'atPipe_' + p.id} className={'pp-item' + (isOn ? ' on' : '') + (isRec ? ' rec' : '')} onClick={() => setPipe(p.id)} onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPipe(p.id);
                    }
                  }}><span className="pp-ic"><Ico n={p.icon} size={15} /></span><span className="pp-tx"><span className="pp-t">{p.t}{isRec && <i className="pp-star" title="Direkomendasikan">★</i>}</span><span className="pp-s">{p.steps}</span></span><button type="button" data-tip={'atPipeStart_' + p.id} className="pp-go" onClick={e => {
                      e.stopPropagation();
                      startSelectedPipeline(p.id);
                    }}>{p.id === 'auto' ? 'Mulai' : 'Buka'}<Ico n={p.id === 'auto' ? 'bolt' : 'sliders'} size={12} /></button></div>;
                })}</div><div className={'at-collapse' + (pipe === 'auto' ? ' open' : '')}><div className="at-collapse-in"><div className="mt-3 pt-3 flex items-center justify-between gap-3 flex-wrap" style={{
                    borderTop: '1px solid var(--line)'
                  }}><div><div className="text-xs font-semibold">Mode Warna Cepat (Fully Automatic)</div><div className="text-[11px] mut">Rekomendasi gambar: <b>{job.rec.recColor.title}</b> — {job.rec.recColor.reason}</div>{job.userPalette && <div className="text-[11px]" style={{
                        color: 'var(--acc)'
                      }}>Palet kustom aktif — Mode Warna Cepat dinonaktifkan sementara</div>}</div><Seg tip="atQuickColor" tips={{
                      two: 'atQuickColor_two',
                      auto: 'atQuickColor_auto',
                      unlimited: 'atQuickColor_unlimited'
                    }} o={[['two', 'Two Colors'], ['auto', 'Automatic'], ['unlimited', 'Unlimited']]} v={job.userPalette ? '' : colorQuick === 'custom' ? 'auto' : colorQuick} on={m => {
                      if (job.userPalette) {
                        setUserPalette(null);
                        flash('Palet kustom dilepas — Mode Warna Cepat dipakai');
                      }
                      setColorQuick(m);
                    }} /></div></div></div></div><div className="card" style={{
              padding: 18
            }}><div className="at-card-t"><span>Resolusi</span><span className="at-rec-badge">★ Rekomendasi: {job.rec.recRes.title}</span></div><div className="at-res-grid"><button type="button" data-tip="atResOrig" className={'at-res-card' + (resMode === 'original' ? ' on' : '')} onClick={() => switchResMode('original')}><span className="at-res-ic"><Ico n="expand" size={18} /></span><div style={{
                    flex: 1,
                    minWidth: 0
                  }}><div className="flex items-center justify-between gap-2 flex-wrap"><span className="text-[13px] font-bold">Resolusi Asli (Original)</span>{job.rec.recRes.id === 'original' && <span className="at-rec-badge">★ Direkomendasikan</span>}</div><div className="text-[11.5px] mut mt-1 leading-relaxed">Tracing dengan detail piksel asli untuk ketajaman sudut C⁰ dan presisi sub-piksel maksimal.</div><span className="at-res-dim">{job.origWork.w} × {job.origWork.h} px (100% Detail)</span></div><span className={'at-radio' + (resMode === 'original' ? ' on' : '')}>{resMode === 'original' && <Ico n="check" size={12} />}</span></button><button type="button" data-tip="atResHigh" className={'at-res-card' + (resMode === 'high' ? ' on' : '')} onClick={() => switchResMode('high')}><span className="at-res-ic"><Ico n="sparkle" size={18} /></span><div style={{
                    flex: 1,
                    minWidth: 0
                  }}><div className="flex items-center justify-between gap-2 flex-wrap"><span className="text-[13px] font-bold">Resolusi Tinggi (High)</span>{job.rec.recRes.id === 'high' && <span className="at-rec-badge">★ Direkomendasikan</span>}</div><div className="text-[11.5px] mut mt-1 leading-relaxed">Presisi tepi & sudut tetap tajam dengan beban memori lebih ringan serta komputasi MRF lebih cepat.</div><span className="at-res-dim">{job.highWork.w} × {job.highWork.h} px (~75% Detail Tinggi)</span></div><span className={'at-radio' + (resMode === 'high' ? ' on' : '')}>{resMode === 'high' && <Ico n="check" size={12} />}</span></button><button type="button" data-tip="atResMed" className={'at-res-card' + (resMode === 'medium' ? ' on' : '')} onClick={() => switchResMode('medium')}><span className="at-res-ic"><Ico n="layers" size={18} /></span><div style={{
                    flex: 1,
                    minWidth: 0
                  }}><div className="flex items-center justify-between gap-2 flex-wrap"><span className="text-[13px] font-bold">Resolusi Sedang (Medium)</span>{job.rec.recRes.id === 'medium' && <span className="at-rec-badge">★ Direkomendasikan</span>}</div><div className="text-[11.5px] mut mt-1 leading-relaxed">Keseimbangan optimal antara kecepatan vektorisasi, kehalusan kurva Bézier, dan akurasi bentuk.</div><span className="at-res-dim">{job.medWork.w} × {job.medWork.h} px (~62% Seimbang)</span></div><span className={'at-radio' + (resMode === 'medium' ? ' on' : '')}>{resMode === 'medium' && <Ico n="check" size={12} />}</span></button><button type="button" data-tip="atResLow" className={'at-res-card' + (resMode === 'low' ? ' on' : '')} onClick={() => switchResMode('low')}><span className="at-res-ic"><Ico n="bolt" size={18} /></span><div style={{
                    flex: 1,
                    minWidth: 0
                  }}><div className="flex items-center justify-between gap-2 flex-wrap"><span className="text-[13px] font-bold">Resolusi Rendah (Low / Fast)</span>{job.rec.recRes.id === 'low' && <span className="at-rec-badge">★ Direkomendasikan</span>}</div><div className="text-[11.5px] mut mt-1 leading-relaxed">Tracing lebih cepat dengan penyederhanaan bentuk otomatis & peredaman derau/noise kompresi.</div><span className="at-res-dim">{job.lowWork.w} × {job.lowWork.h} px (Cepat & Halus)</span></div><span className={'at-radio' + (resMode === 'low' ? ' on' : '')}>{resMode === 'low' && <Ico n="check" size={12} />}</span></button></div><div className="text-[11px] mut mt-2">{job.rec.recRes.reason}</div></div><details className="rv-fold"><summary><Ico n="detect" size={13} />Analisis gambar & palet<small>{(job.userPalette || job.autoPalette).length} warna · {job.cls.label}</small></summary><div className="card at-dropwrap"><div className="at-job"><div className="at-job-img-wrap chk"><img src={job.url} className="at-job-img" alt="Input" /></div><div className="at-job-info"><div className="at-job-name"><span>{job.name}</span><span className="mut text-xs font-normal">· {job.w}×{job.h} px</span><span className="at-rec-badge">{job.cls.label}</span></div><div className="at-kv"><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="sliders" size={12} /></span>Profil Berbobot & Keyakinan</span><span><b>{job.adaptiveProfile ? job.adaptiveProfile.shortTitle : job.cls.label}</b> (Keyakinan <b>{Math.round((job.cls.confidence || 0.85) * 100)}%</b>) · Kualitas <b>{job.cls.qlabel}</b>{job.alpha.hasAlpha ? ' · Alpha (' + Math.round(job.alpha.transparentFrac * 100) + '%)' : ' · Opaque'}</span></div><div className="at-kv" data-tip="atAdpTwoAxis"><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="layers" size={12} /></span>Struktur 2-Sumbu (Keluarga × Permukaan)</span><span><b>{job.cls.colorFamilyCount || 1} Keluarga Warna</b> (Koherensi CIELCh {Math.round((job.cls.familyColorProfile && job.cls.familyColorProfile.familyCoherence || 0.5) * 100)}%) × Permukaan <b>{(job.cls.surfaceMode || 'flat').toUpperCase()}</b> · <span className="at-rec-badge">{job.cls.colorStructureMode || 'MIXED'}</span></span></div><div className="at-kv"><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="detect" size={12} /></span>Warna Efektif & Kuantil CIEDE2000</span><span><b>{job.cls.effectiveColors || job.autoPalette.length} warna efektif</b> ({job.cls.dominantClusterCount || '-'} dom / {job.cls.minorClusterCount || 0} minor) · ΔE00 Q25=<b>{job.cls.de00Quantiles && job.cls.de00Quantiles.q25 || '-'}</b> · Q50=<b>{job.cls.de00Quantiles && job.cls.de00Quantiles.q50 || job.cls.meanNearestDeltaE00 || '-'}</b></span></div><div className="at-kv"><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="zoomIn" size={12} /></span>Detail Nyata vs Noise & Gradasi</span><span>Detail nyata: <b>{Math.round((job.cls.meaningfulDetailDensity ?? job.cls.microDetailDensity ?? 0) * 100)}%</b> · Noise: <b>{Math.round((job.cls.noise || 0) * 100)}%</b> · Gradasi L*a*b*: <b>{Math.round((job.cls.gradientContinuity || 0) * 100)}%</b></span></div><div className="at-kv" style={{
                      alignItems: 'flex-start'
                    }}><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="palette" size={12} /></span>Warna dominan terdeteksi ({(job.userPalette || job.autoPalette).length})</span><AtDetectedPalette colors={job.userPalette || job.autoPalette} items={job.userPalette ? job.userPaletteItems || job.autoPaletteItems : job.autoPaletteItems} edited={!!job.userPalette} job={job} flash={flash} onChange={setUserPalette} onGradChange={handleJobGradChange} onOpacityChange={handleJobOpacityChange} onReset={() => {
                        setUserPalette(null);
                        flash('Palet dikembalikan ke warna terdeteksi otomatis');
                      }} maxColorEnabled={maxColorEnabled} maxColors={maxColors} onMaxColorChange={(en, val) => {
                        applyMaxColorAndGradMode(en, val, gradientMode);
                        flash(en ? `Max Color aktif: maksimal ${val} warna/palet` : 'Max Color dinonaktifkan');
                      }} /></div><div className="at-kv" style={{
                      alignItems: 'center'
                    }}><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="sparkle" size={12} /></span><span>Gradient Mode</span><span className="at-rec-badge" style={{
                          padding: '1px 7px',
                          fontSize: '9.5px'
                        }}>{gradientMode === 'off' ? 'Flat Solid (Nonaktif)' : gradientMode === 'on' || job.hasSmoothGradient ? `Aktif · ${(job.autoPaletteItems || []).filter(it => it && it.grad).length || 1} Palet Gradient` : 'Otomatis (Flat)'}</span></span><div className="flex items-center gap-2 flex-wrap justify-end"><Seg o={[['auto', 'Otomatis'], ['on', 'Aktif'], ['off', 'Nonaktif']]} v={gradientMode} on={gm => {
                          applyMaxColorAndGradMode(maxColorEnabled, maxColors, gm);
                          flash(gm === 'auto' ? 'Gradient Mode: Otomatis (konsolidasi palet gradient & fitting SVG otomatis)' : gm === 'on' ? 'Gradient Mode: Aktif (paksa konsolidasi palet gradient Linear/Radial)' : 'Gradient Mode: Nonaktif (tampilkan & trace sebagai warna flat solid)');
                        }} /></div></div><div className="at-rec-banner mt-2"><span className="at-rec-banner-ic"><Ico n="sparkle" size={18} /></span><div style={{
                        flex: 1,
                        minWidth: 0
                      }}><div className="flex items-center justify-between gap-2 flex-wrap"><div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-bold">Rekomendasi Sistem: <span style={{
                                color: 'var(--acc)'
                              }}>{job.rec.recPipe.title}</span></span><span className="at-rec-badge solid">★ {job.rec.recRes.title}</span><span className="at-rec-badge">Warna: {job.rec.recColor.title}</span></div>{sess && <button type="button" data-tip="atReturnReview" className="btn pri" style={{
                            padding: '6px 12px',
                            fontSize: 11.5
                          }} onClick={() => setScreen('review')}><Ico n="layers" size={13} /> Buka Perakitan SVG →</button>}</div><div className="text-[11.5px] mut mt-1 leading-relaxed">{job.rec.recPipe.reason}</div></div></div></div></div></div></details>{job.adaptiveProfile && <details className="rv-fold"><summary><Ico n="sliders" size={13} />Parameter adaptif<small>{job.adaptiveProfile.shortTitle}</small></summary><div className="card" style={{
                padding: 0
              }} data-tip="atAdpProfileCard"><div className="at-card-t" style={{
                  marginBottom: 6
                }}><span className="flex items-center gap-2.5" style={{
                    flex: '1 1 220px',
                    minWidth: 0,
                    whiteSpace: 'normal'
                  }}><span className="at-prof-ic" style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: 'linear-gradient(135deg, var(--acc), #9333ea)',
                      color: '#fff',
                      flex: 'none'
                    }}><Ico n="sliders" size={15} /></span><span style={{
                      whiteSpace: 'normal',
                      minWidth: 0,
                      overflowWrap: 'break-word',
                      lineHeight: 1.35
                    }}>Sistem Adaptive Parameter Profile (Image Profiler 8-Tahap)</span></span><span className="at-rec-badge solid"><Ico n="sparkle" size={11} /> Terdeteksi: {job.adaptiveProfile.shortTitle}</span></div><div className="text-[11.5px] mut leading-relaxed">Parameter setiap tahap dihitung secara dinamis dari karakter gambar input (<b>{job.cls.effectiveColors} warna efektif CIE-Lab</b>, <b>ΔE terdekat rata-rata {job.cls.meanNearestDeltaE}</b>, kepadatan detail mikro <b>{Math.round((job.cls.microDetailDensity || 0) * 100)}%</b>, dan skala resolusi <b>{job.adaptiveProfile.resBucketLabel}</b>) — mencegah <i>color islands</i>, halo, sudut palsu, maupun hilangnya detail kecil.</div><div className="at-prof-cards">{[['auto', 'Otomatis (Adaptif)', `Ikuti deteksi Image Profiler (${job.adaptiveProfile && job.adaptiveProfile.code || 'Auto'})`, 'atAdpMode_auto', 'sparkle'], ['flat', 'Profil A — Flat / Logo', 'Ikon, logo & tipografi: sudut C⁰ tegas, garis lurus & node minimal', 'atAdpMode_flat', 'shapes'], ['illustration', 'Profil B — Ilustrasi', 'Ilustrasi berwarna: jaga detail organik, jahitan & kurva G¹ halus', 'atAdpMode_illustration', 'brush'], ['photo', 'Profil C — Foto / Lukisan', 'Gradasi kompleks: pengelompokan tonal koheren & bilateral kuat', 'atAdpMode_photo', 'camera']].map(([id, t, d, tipKey, icName]) => {
                    const isOn = profileMode === id;
                    const isDetected = id !== 'auto' && job.cls.profileId === id;
                    return <button key={id} type="button" data-tip={tipKey} className={'at-prof-card' + (isOn ? ' on' : '')} onClick={() => switchProfileMode(id)}><div className="at-prof-card-top"><span className="at-prof-ic"><Ico n={icName} size={16} /></span>{isDetected ? <span className="at-rec-badge" style={{
                          padding: '2px 7px',
                          fontSize: '9.5px'
                        }}>★ Cocok</span> : isOn ? <span className="at-radio on" style={{
                          width: 18,
                          height: 18
                        }}><Ico n="check" size={11} /></span> : null}</div><div className="at-prof-card-t"><span>{t}</span></div><div className="at-prof-card-d">{d}</div></button>;
                  })}</div><div className="at-adp-grid"><div className="at-adp-box" data-tip="atAdpParamBox"><div className="at-adp-top"><span className="at-adp-ic"><Ico n="palette" size={13} /></span><span className="at-adp-k">1. layer_difference (ΔE / ΔE00)</span></div><span className="at-adp-v">ΔE {job.adaptiveProfile.keyParams.layerDifference} <span className="text-[11px] font-normal mut">(ΔE00≈{job.adaptiveProfile.keyParams.layerDifference00} · K≤{job.adaptiveProfile.keyParams.targetKMax})</span></span><span className="at-adp-d">Terpisah: noiseSuppression (+) vs gradientPreservation (−)</span></div><div className="at-adp-box" data-tip="atAdpParamBox"><div className="at-adp-top"><span className="at-adp-ic"><Ico n="grid" size={13} /></span><span className="at-adp-k">2. filter_speckle (minPx)</span></div><span className="at-adp-v">{job.adaptiveProfile.keyParams.filterSpeckle} px <span className="text-[11px] font-normal mut">(Cplx {job.adaptiveProfile.params.complexity})</span></span><span className="at-adp-d">Bukti batas lokal, kontras ΔE00, koneksi stroke & pola berulang</span></div><div className="at-adp-box" data-tip="atAdpParamBox"><div className="at-adp-top"><span className="at-adp-ic"><Ico n="flow" size={13} /></span><span className="at-adp-k">3. smoothing_strength (λ)</span></div><span className="at-adp-v">{job.adaptiveProfile.keyParams.smoothingStrength}/100 <span className="text-[11px] font-normal mut">(λ={job.adaptiveProfile.keyParams.smoothingLambda})</span></span><span className="at-adp-d">Adaptif per-kontur · Sudut {job.adaptiveProfile.params.cornerAngle}° · Lurus {job.adaptiveProfile.params.lineStraighten}%</span></div><div className="at-adp-box" data-tip="atAdpParamBox"><div className="at-adp-top"><span className="at-adp-ic"><Ico n="wand" size={13} /></span><span className="at-adp-k">4. bezier_tolerance (ε)</span></div><span className="at-adp-v">{job.adaptiveProfile.keyParams.bezierTolerance} px <span className="text-[11px] font-normal mut">(Dens {job.adaptiveProfile.keyParams.nodeDensity})</span></span><span className="at-adp-d">Terkalibrasi bersama smoothness & kelengkungan lokal</span></div></div>{job.adaptiveProfile.adaptiveAttributes && <div className="mt-3 pt-3" style={{
                  borderTop: '1px solid var(--line)'
                }} data-tip="atAdpWeights"><div className="flex items-center justify-between gap-2 flex-wrap mb-1"><span className="text-[11.5px] font-bold flex items-center gap-1.5"><Ico n="sliders" size={13} /><span>Profil Berbobot (A:{Math.round((job.adaptiveProfile.profileWeights?.flat || 0) * 100)}% · B:{Math.round((job.adaptiveProfile.profileWeights?.illustration || 0) * 100)}% · C:{Math.round((job.adaptiveProfile.profileWeights?.photo || 0) * 100)}%) & 6 Atribut Independen</span></span><button type="button" className="btn sec" style={{
                      padding: '4px 10px',
                      fontSize: 11
                    }} onClick={() => setShowProfiler8(!showProfiler8)}><Ico n="chip" size={12} /> {showProfiler8 ? 'Sembunyikan 8-Tahap Image Profiler' : 'Detail 8-Tahap Image Profiler'}</button></div><div className="at-attr-grid">{[['geometryPriority', 'Prioritas Geometri & Sudut', 'shapes'], ['detailProtection', 'Proteksi Detail Nyata', 'scan'], ['noiseSuppression', 'Penekanan Derau (Noise)', 'wind'], ['gradientPreservation', 'Preservasi Gradasi & Shade', 'palette'], ['alphaSensitivity', 'Sensitivitas Tepi Alpha', 'eye'], ['topologyProtection', 'Proteksi Topologi & Simpang', 'nodes']].map(([k, label, icn]) => {
                      const val = Math.round((job.adaptiveProfile.adaptiveAttributes[k] || 0) * 100);
                      return <div key={k} className="at-attr-item"><div className="at-attr-hdr"><span className="at-attr-ic"><Ico n={icn} size={13} /></span><span className="at-attr-l">{label}</span></div><div className="at-attr-row"><div className="at-attr-bar"><div style={{
                              width: val + '%'
                            }} /></div><span className="at-attr-v">{val}%</span></div></div>;
                    })}</div></div>}{showProfiler8 && job.adaptiveProfile.profiler8Stages && <div className="at-8stage-grid fade">{job.adaptiveProfile.profiler8Stages.map((st, idx) => <div key={idx} className="at-8stage-box"><div className="at-8stage-t">{st.stage}</div><div className="at-8stage-v">{st.val}</div><div className="at-8stage-d">{st.desc}</div></div>)}</div>}<div className="at-cl-banner" data-tip="atAdpClosedLoop"><div style={{
                    flex: 1,
                    minWidth: 220
                  }}><div className="text-xs font-bold flex items-center gap-1.5"><Ico n="check" size={14} /><span>Closed-Loop Auto-Calibration (Evaluasi Round-Trip & Boundary IoU)</span></div><div className="text-[11px] mut mt-0.5">Mengevaluasi fungsi skor objektif <b>J = w<sub>c</sub>E<sub>color</sub> + w<sub>b</sub>E<sub>boundary</sub> + w<sub>t</sub>E<sub>topology</sub> + w<sub>d</sub>E<sub>detail</sub> + w<sub>s</sub>E<sub>complexity</sub></b> dan menguji kandidat parameter terbatas secara otomatis bila terdeteksi potensi kehilangan detail/batas.</div></div><div className="flex items-center gap-2"><span className="text-xs font-semibold">{closedLoopOn ? 'Aktif' : 'Nonaktif'}</span><AtToggle tip="atAdpClosedLoop" on={closedLoopOn} act={v => {
                      setClosedLoopOn(v);
                      flash(v ? 'Closed-Loop Calibration diaktifkan' : 'Closed-Loop Calibration dinonaktifkan');
                    }} label="Closed-Loop Auto-Calibration" /></div></div></div></details>}</div></div></RvSide>}</div><div className="rv-top"><div className="rv-acts rv-glass">{sess && job && <button type="button" data-tip="atReturnReview" className="rv-exp" onClick={() => setScreen('review')}><Ico n="layers" size={14} /> Perakitan SVG</button>}<button type="button" className="rv-ibtn" data-tip="atUploadNew" onClick={() => pickFiles('image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp', onFiles)} aria-label="Upload gambar baru"><Ico n="upload" size={16} /></button><button type="button" className="rv-ibtn" data-tip="atHwSettings" onClick={() => setHwModalOpen(true)} aria-label="Pengaturan"><Ico n="settings" size={16} /></button></div></div></RvPortal>}{screen === 'wizard' && job && pipe === 'basic' && <BasicWizard job={job} resMode={resMode} flash={flash} onVectorize={mcfg => runVectorize(mcfg)} onBack={() => setScreen('drop')} />}{screen === 'wizard' && job && pipe === 'adv' && <AdvWizard job={job} resMode={resMode} flash={flash} onBack={() => setScreen(wizBackTo === 'review' && sess ? 'review' : 'drop')} onDone={(s, acfg2) => {
    setCfgUsed({
      ...acfg2,
      resMode
    });
    setSess(s);
    setScreen('review');
  }} />}{screen === 'working' && <div className="at-workwrap"><ProgressSteps prog={prog} job={job} maxColorEnabled={maxColorEnabled} maxColors={maxColors} gradientMode={gradientMode} /></div>}{screen === 'review' && sess && job && <div className="at-view"><ReviewScreen onPasteImage={pasteFromButton} sess={sess} onUpdateSess={setSess} job={job} fileName={job.name} cfgUsed={cfgUsed} dxfMode={cfgUsed && cfgUsed.dxfMode} onSyncJobPalette={pal => setUserPalette(pal)} onRetracePalette={newHexes => {
      setUserPalette(newHexes);
      const nextCfg = {
        ...(cfgUsed || autoCfg()),
        colorMode: 'custom',
        paletteColors: newHexes,
        maxColorEnabled,
        maxColors,
        gradientMode
      };
      runVectorize(nextCfg, job);
    }} maxColorEnabled={maxColorEnabled} maxColors={maxColors} onMaxColorChange={(en, val) => {
      applyMaxColorAndGradMode(en, val, gradientMode);
      flash(en ? `Max Color diterapkan: maksimal ${val} warna/palet` : 'Max Color dinonaktifkan');
    }} gradientMode={gradientMode} onGradientModeChange={gm => {
      applyMaxColorAndGradMode(maxColorEnabled, maxColors, gm);
      flash(gm === 'auto' ? 'Gradient Mode: Otomatis diterapkan ke hasil SVG & palet' : gm === 'on' ? 'Gradient Mode: Aktif diterapkan ke hasil SVG & palet' : 'Gradient Mode: Nonaktif (warna flat solid) diterapkan ke hasil SVG & palet');
    }} initialTab={revInitTab} onTabChange={setRevInitTab} onRetry={() => setScreen(pipe === 'auto' ? 'drop' : 'wizard')} onSegEdit={() => setScreen('segedit')} onNodeEdit={() => setScreen('nodeedit')} onUploadNew={() => pickFiles('image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp', onFiles)} onOpenSettings={() => setHwModalOpen(true)} onOpenAdvWizard={() => {
      setPipe('adv');
      setWizBackTo('review');
      setScreen('wizard');
    }} flash={flash} /></div>}{screen === 'segedit' && sess && <div className="at-view"><div className="at-head"><div className="at-card-t">Perbaiki Segmentasi Piksel Secara Manual</div></div><SegEditor sess={sess} job={job} imgUrl={job && job.url} imgElem={job && job.img} onApply={applySegEdit} onCancel={() => setScreen('review')} onSwitchToTrace={() => {
      setRevInitTab('trace');
      setScreen('review');
    }} onSwitchToNodeEdit={() => setScreen('nodeedit')} onSwitchToCompare={() => {
      setRevInitTab('compare');
      setScreen('review');
    }} flash={flash} /></div>}{screen === 'nodeedit' && sess && <div className="at-view"><NodeEditor sess={sess} job={job} fileName={job && job.name} cfgUsed={cfgUsed} onApply={applyNodeEdit} onCancel={() => setScreen('review')} onSwitchToSegEdit={() => setScreen('segedit')} onSwitchToTrace={() => {
      setRevInitTab('trace');
      setScreen('review');
    }} onSwitchToCompare={() => {
      setRevInitTab('compare');
      setScreen('review');
    }} flash={flash} /></div>}{screen === 'batch' && <div className="at-view"><div className="card at-batch"><div className="flex items-center justify-between flex-wrap gap-3"><div className="at-card-t" style={{
          marginBottom: 0
        }}>Antrean Batch — Multi-File Processing</div><div className="flex items-center gap-3 flex-wrap"><div className="flex items-center gap-2 text-xs"><span className="mut">Resolusi:</span><Seg tips={{
              original: 'atResOrig',
              high: 'atResHigh',
              medium: 'atResMed',
              low: 'atResLow'
            }} o={[['original', 'Asli'], ['high', 'Tinggi'], ['medium', 'Sedang'], ['low', 'Rendah']]} v={resMode} on={setResMode} /></div>{(() => {
            const ps = atLoad(AT_PRESETS, []);
            const opts = [['-1', 'Otomatis Penuh (Default)'], ...ps.map((p, idx) => [String(idx), p.name])];
            return ps.length > 0 && <div className="flex items-center gap-2 text-xs" style={{
              minWidth: 210
            }}><span className="mut">Preset:</span><div style={{
                flex: 1
              }}><Select tip="atPresetLoad" value={String(batchPresetIdx)} on={v => setBatchPresetIdx(+v)} options={opts} /></div></div>;
          })()}</div></div><div className="at-batch-list">{queue.map((q, i) => <div key={i} className="at-batch-row"><span className="at-batch-name">{q.name}</span><span className={'at-batch-st ' + q.status}>{{
              antre: 'Antre',
              proses: 'Memproses…',
              selesai: 'Selesai (' + (q.result && q.result.stats.ms / 1000 || 0).toFixed(1) + 's)',
              gagal: 'Gagal'
            }[q.status]}</span>{q.status === 'selesai' && <><button type="button" data-tip="atExpSvg" className="btn sec" style={{
              padding: '5px 10px',
              fontSize: 11.5
            }} onClick={() => atDownload(q.name.replace(/\.[^.]+$/, '') + '.svg', q.result.svg, 'image/svg+xml')}>SVG</button><button type="button" data-tip="atExpDxf" className="btn sec" style={{
              padding: '5px 10px',
              fontSize: 11.5
            }} onClick={() => atDownload(q.name.replace(/\.[^.]+$/, '') + '.dxf', VMT.exportDXF(q.result.regs, q.result.W, q.result.H, 'spline'), 'application/dxf')}>DXF</button></>}</div>)}</div><div className="flex gap-2 mt-3"><button type="button" data-tip="atBtnRunTrace" className="btn pri" disabled={batchBusy || !queue.some(q => q.status === 'antre')} onClick={runBatch}><Ico n="play" size={14} /> {batchBusy ? 'Memproses Batch…' : 'Proses Semua'}</button><button type="button" data-tip="atBtnBack" className="btn sec" onClick={() => setScreen('drop')}>Kembali</button></div></div></div>}</div>);
};

export { AutoTrace };
