import React, { useState, useRef, useEffect } from 'react';
import { rvUseWide, RvPortal, RvSide } from './CanvasRenderUtils.jsx';
import { atLoad, AT_PRESETS, atSave, AT_LS, atResetWork, atGetResLabel, AT_ALPHA_OPTS, AtOptCard, AtRow, AT_COLOR_MODES, AtNum, AtEmpty, AtToggle, AtTextBox } from './TraceSharedUI.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { ColorField, Seg } from './ColorPicker.jsx';
import { Slider, Ico } from './CommonControls.jsx';
import { PaletteEdit } from './PaletteComponents.jsx';
import { SegEditor } from './SegEditor.jsx';
import { ExportActions } from './ReviewScreen.jsx';
import { SegPreviewCompare } from './SegPreviewCompare.jsx';
import { CompareView } from './CompareView.jsx';

/* =====================================================================
   ADVANCED WIZARD — 6 Tahap Mendalam (Dengan Perbandingan Segmentasi + Zoom,
   Editor Segmen + Perbandingan Asli, dan Advanced Smoothing & Corner A-Z)
   ===================================================================== */
const ADV_STEPS = ['Transparansi', 'Palet', 'Segmentasi', 'Editor Segmen', 'Smoothing', 'Ekspor'];
const ADV_SMOOTH_PRESETS = [
  {
    id: 'typo',
    t: 'Tipografi A–Z',
    d: 'Tajam C⁰ (A,V,W,M,N,Z) & Halus G¹ (B,C,D,G,O,P,R,S,U) + luruskan batang',
    patch: {
      smoothMethod: 'hybrid', smoothness: 64, lineStraighten: 82, axisSnap: true, axisSnapDeg: 3.0,
      despeckleJitter: 65, extremumAlign: true, detectCorners: true, cornerMode: 'typo',
      cornerAngle: 46, lineCurveSensitivity: 80, apexSharpness: 85, cornerRoundness: 70,
      protectStemCaps: true, nodeDensity: 46
    }
  },
  {
    id: 'geo',
    t: 'Logo Geometris',
    d: 'Garis ekstra lurus, kunci sumbu 0°/90°/45° kuat, dan puncak lancip tegas',
    patch: {
      smoothMethod: 'hybrid', smoothness: 58, lineStraighten: 92, axisSnap: true, axisSnapDeg: 4.0,
      despeckleJitter: 70, extremumAlign: true, detectCorners: true, cornerMode: 'sharp',
      cornerAngle: 42, lineCurveSensitivity: 85, apexSharpness: 92, cornerRoundness: 50,
      protectStemCaps: true, nodeDensity: 40
    }
  },
  {
    id: 'illus',
    t: 'Ilustrasi Halus',
    d: 'Kurva organik mulus G¹, minim sudut patah, cocok untuk karakter & seni',
    patch: {
      smoothMethod: 'cg', smoothness: 78, lineStraighten: 45, axisSnap: false, axisSnapDeg: 2.0,
      despeckleJitter: 60, extremumAlign: true, detectCorners: true, cornerMode: 'organic',
      cornerAngle: 58, lineCurveSensitivity: 55, apexSharpness: 55, cornerRoundness: 85,
      protectStemCaps: false, nodeDensity: 48
    }
  },
  {
    id: 'lineart',
    t: 'Line Art & Teknis',
    d: 'Reduksi gerigi tangga piksel tinggi & proteksi ujung garis tipis',
    patch: {
      smoothMethod: 'taubin', smoothness: 70, lineStraighten: 86, axisSnap: true, axisSnapDeg: 2.5,
      despeckleJitter: 82, extremumAlign: true, detectCorners: true, cornerMode: 'typo',
      cornerAngle: 44, lineCurveSensitivity: 78, apexSharpness: 88, cornerRoundness: 65,
      protectStemCaps: true, nodeDensity: 50
    }
  }
];

const AdvWizard = ({ job, resMode, flash, onDone, onBack }) => {
  const [step, setStep] = useState(0);
  const [sideOpen, setSideOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000);
  const wide = rvUseWide(1000);
  const [dir, setDir] = useState('fwd');
  const [maxStep, setMaxStep] = useState(0);
  const [activeSmPreset, setActiveSmPreset] = useState('typo');
  const wizRef = useRef(null);
  const rec = job.rec || {};
  const adpP = (job.adaptiveProfile && job.adaptiveProfile.params) || {};
  const [cfg, setCfg] = useState(() => {
    return {
      transparency: 'keep', customColor: '#ffffff',
      colorMode: (job.userPalette && job.userPalette.length) ? 'custom' : ((rec.recColor && rec.recColor.id) || 'auto'),
      palMode: 'flexible',
      targetColors: (job.autoPalette && job.autoPalette.length) || adpP.targetKMax || 14,
      sensitivity: adpP.sensitivity || 'medium',
      layerDifference: adpP.layerDifference ?? 6.8,
      customColors: ((job.userPalette && job.userPalette.length) ? job.userPalette : (job.autoPalette || [])).slice(),
      complexity: adpP.complexity ?? 62, minPixels: adpP.minPixels ?? 4,
      smoothness: adpP.smoothness ?? 65,
      smoothMethod: adpP.smoothMethod || 'hybrid',
      lineStraighten: adpP.lineStraighten ?? 58,
      axisSnap: adpP.axisSnap ?? true,
      axisSnapDeg: adpP.axisSnapDeg ?? 2.4,
      despeckleJitter: adpP.despeckleJitter ?? 74,
      extremumAlign: adpP.extremumAlign ?? true,
      detectCorners: true,
      cornerMode: adpP.cornerMode || 'typo',
      cornerAngle: adpP.cornerAngle ?? 44,
      lineCurveSensitivity: adpP.lineCurveSensitivity ?? 76,
      apexSharpness: adpP.apexSharpness ?? 82,
      cornerRoundness: adpP.cornerRoundness ?? 70,
      protectStemCaps: adpP.protectStemCaps ?? true,
      aa: true,
      nodeDensity: adpP.nodeDensity ?? 60,
      autoUpdate: true,
      stackMode: 'stack', stroke: true, dxfMode: 'spline',
    };
  });
  const [seg, setSeg] = useState(null);
  const [segBusy, setSegBusy] = useState(false);
  const [loops, setLoops] = useState(null);
  const [vec, setVec] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [presets, setPresets] = useState(() => atLoad(AT_PRESETS, []));
  const [pname, setPname] = useState('');
  const refitT = useRef(null);
  const set = p => setCfg(c => ({ ...c, ...p }));
  useEffect(() => { atSave(AT_LS, { ...atLoad(AT_LS, {}), adv: cfg }); }, [cfg]);

  const goToStep = nextStep => {
    setDir(nextStep >= step ? 'fwd' : 'bwd');
    setStep(nextStep);
    setMaxStep(m => Math.max(m, nextStep));
    requestAnimationFrame(() => {
      const rootEl = wizRef.current && wizRef.current.closest('.at-root');
      if (rootEl) rootEl.scrollTo({ top: Math.max(0, wizRef.current.offsetTop - 12), behavior: 'auto' });
    });
  };

  const computePalette = async () => {
    atResetWork(job);
    const mask = VMT.flattenAlpha(job.work, cfg.transparency, cfg.customColor);
    job.work.rawRgba = new Uint8ClampedArray(job.work.data.data);
    if (job.cls.type !== 'aliased' && !adpP.skipBilateral) {
      const sigSp = adpP.sigmaSpatial || 1.45;
      const sigCol = adpP.sigmaColor || (job.cls.quality === 'low' ? 30 : job.cls.quality === 'medium' ? 20 : 14);
      const hw = VMT.getHwConfig();
      const usedGpu = (hw.useGpu && hw.gpuPipeline !== 'off' && VMT.GpuAccelerator && VMT.GpuAccelerator.gpuBilateralPreFilter)
        ? VMT.GpuAccelerator.gpuBilateralPreFilter(job.work, mask, sigSp, sigCol, { radius: adpP.bilateralRadius, wedgeGuardThr: adpP.wedgeGuardThr })
        : false;
      if (!usedGpu) {
        await VMT.bilateralPreFilter(job.work, mask, sigSp, sigCol, null, { radius: adpP.bilateralRadius, wedgeGuardThr: adpP.wedgeGuardThr, skipIfClean: adpP.skipBilateral });
      }
    }
    const edgeField = VMT.buildEdgeField(job.work, mask);
    const mode = cfg.colorMode || 'auto';
    const pr = VMT.findPalette(job.work, mask, {
      colorMode: mode === 'custom' && cfg.customColors.length ? 'custom' : mode,
      paletteColors: mode === 'custom' && cfg.customColors.length ? cfg.customColors : undefined,
      fixedK: mode !== 'two' && mode !== 'custom' && cfg.palMode === 'fixed',
      targetColors: mode === 'two' ? 2 : (cfg.palMode === 'fixed' ? cfg.targetColors : (mode === 'unlimited' ? (job.cls.type === 'photo' ? 32 : 24) : (adpP.targetKMax || (job.cls.type === 'photo' ? 24 : 18)))),
      sensitivity: mode === 'unlimited' ? 'high' : cfg.sensitivity,
      layerDifference: cfg.layerDifference != null ? cfg.layerDifference : adpP.layerDifference,
      imageType: job.cls.type,
    }, edgeField);
    return { palette: pr.palette, mask, auto: pr.auto, edgeField };
  };

  const runSegmentation = async () => {
    setSegBusy(true);
    try {
      const { palette, mask, edgeField } = await computePalette();
      const { w, h } = job.work;
      const rawBeachWork = { data: { data: new Uint8ClampedArray(job.work.rawRgba || job.work.data.data), width: w, height: h }, rawRgba: job.work.rawRgba || job.work.data.data, w, h, origAlpha: job.work.origAlpha };
      const q = adpP.qtVarThr || ({ high: 160, medium: 320, low: 620 }[job.cls.quality] || 320);
      let labels = VMT.quadtreeInit(job.work, mask, palette, job.cls.type === 'aliased' ? q * 0.35 : q, edgeField, null, rawBeachWork);
      const segCtx = labels._segCtx || job.work._segCtx;
      rawBeachWork._segCtx = segCtx;
      const noiseBeta = { high: 1250, medium: 2100, low: 3600 }[job.cls.quality] || 2100;
      const beta = noiseBeta * (adpP.mrfBetaScale || 1.0) * (1.28 - cfg.complexity / 100 * 0.85) * (job.cls.type === 'aliased' ? 0.45 : 1);
      const mrfIters = adpP.mrfIters || (job.cls.type === 'photo' ? 14 : 18);
      labels = VMT.segmentMRF(job.work, mask, labels, palette, { beta, maxIter: mrfIters, totalIters: mrfIters, topology: true, rawWork: rawBeachWork, edgeField, segCtx });
      VMT.localNeighborhoodEdgeSnap(rawBeachWork, mask, labels, palette, edgeField, adpP.snapPasses || 4, segCtx);
      VMT.runSegmentationCleanup(labels, w, h, rawBeachWork, palette, mask, segCtx, cfg.minPixels);
      setSeg({ labels, palette, w, h, mask, beta: Math.round(beta), scale: job.work.scale, W: job.w, H: job.h, cls: job.cls, edgeField, workData: job.work.data, rawRgba: rawBeachWork.rawRgba, stats: {} });
      setLoops(null); setVec(null);
      flash('Segmentasi MRF selesai: ' + palette.length + ' warna');
    } finally { setSegBusy(false); }
  };

  /* Auto-jalankan segmentasi saat pertama kali masuk ke Tab Segmentasi (step 2) agar preview langsung tampil */
  useEffect(() => {
    if (step === 2 && !seg && !segBusy) {
      runSegmentation();
    }
  }, [step]);

  const runTraceBounds = async (overrideCfg) => {
    if (!seg) return false;
    const activeCfg = overrideCfg || cfg;
    setSegBusy(true);
    try {
      const tr = VMT.traceBoundaries(
        seg.labels, seg.w, seg.h,
        { data: seg.workData, rawRgba: job.workOrig, origAlpha: job.work.origAlpha },
        seg.palette,
        { aa: activeCfg.aa !== false }
      );
      const raw = tr.loops.map(lp => ({
        label: lp.label,
        rawPts: lp.pts.map(p => [p[0], p[1]]),
        vkeys: lp.vkeys,
        juncFlags: lp.juncFlags,
        isTrueCircle: !!lp.isTrueCircle,
        circleFit: lp.circleFit || null,
        area: lp.area
      }));
      setLoops(raw);
      await refit(raw, activeCfg);
      flash('Boundary tracing & fitting cerdas selesai');
      return true;
    } catch (err) {
      console.error(err);
      flash('Gagal melakukan trace batas');
      return false;
    } finally {
      setSegBusy(false);
    }
  };

  /* Auto-jalankan trace batas saat masuk ke Tab Smoothing (step 4) jika seg sudah ada tetapi loops belum di-trace */
  useEffect(() => {
    if (step === 4 && seg && !loops && !segBusy) {
      runTraceBounds();
    }
  }, [step, seg]);

  const refit = async (rloops, overrideCfg) => {
    const rl = rloops || loops;
    const activeCfg = overrideCfg || cfg;
    if (!rl || !seg) return;
    const sessLike = { loops: rl, palette: seg.palette, labels: seg.labels, workData: seg.workData, rawRgba: seg.rawRgba || job.workOrig, scale: seg.scale, W: seg.W, H: seg.H };
    const r = await VMT.refitFromSession(sessLike, activeCfg);
    setVec({
      svg: r.svg,
      regs: r.regs,
      stats: {
        bezierSegs: r.segs,
        loops: rl.length,
        regions: r.regs.length,
        ms: r.ms,
        sharpCorners: r.sharpCorners ?? 0,
        smoothCorners: r.smoothCorners ?? 0,
        straightSegs: r.straightSegs ?? 0,
        curveSegs: r.curveSegs ?? 0
      }
    });
  };

  useEffect(() => {
    if ((step !== 4 && step !== 5) || !loops || !cfg.autoUpdate) return;
    clearTimeout(refitT.current);
    refitT.current = setTimeout(() => refit(), 220);
    return () => clearTimeout(refitT.current);
  }, [
    cfg.smoothness, cfg.smoothMethod, cfg.lineStraighten, cfg.axisSnap, cfg.axisSnapDeg,
    cfg.despeckleJitter, cfg.extremumAlign, cfg.detectCorners, cfg.cornerMode,
    cfg.cornerAngle, cfg.lineCurveSensitivity, cfg.apexSharpness, cfg.cornerRoundness,
    cfg.protectStemCaps, cfg.aa, cfg.nodeDensity, cfg.stackMode, cfg.stroke, step
  ]);

  /* Eyedropper dengan dukungan Ctrl+Click Bilinear Blending */
  const [picking, setPicking] = useState(false);
  const pickColor = e => {
    if (!picking) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = document.createElement('canvas'); cx.width = job.work.w; cx.height = job.work.h;
    cx.getContext('2d').drawImage(job.img, 0, 0, job.work.w, job.work.h);
    const px = VMT.clamp(Math.floor((e.clientX - r.left) / r.width * job.work.w), 0, job.work.w - 1);
    const py = VMT.clamp(Math.floor((e.clientY - r.top) / r.height * job.work.h), 0, job.work.h - 1);
    const d = cx.getContext('2d').getImageData(Math.max(0, px - 1), Math.max(0, py - 1), 3, 3).data;
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    for (let i = 0; i < d.length; i += 4) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; cnt++; }
    let hx = VMT.hexOf(sr / cnt, sg / cnt, sb / cnt).toLowerCase();
    if (e.ctrlKey && cfg.customColors.length) {
      const last = VMT.rgbOf(cfg.customColors[cfg.customColors.length - 1]);
      hx = VMT.hexOf((last[0] + sr / cnt) * 0.5, (last[1] + sg / cnt) * 0.5, (last[2] + sb / cnt) * 0.5).toLowerCase();
      const next = cfg.customColors.slice(0, -1).concat([hx]);
      set({ colorMode: 'custom', customColors: next });
      flash('Warna dibaurkan (Ctrl-blend): ' + hx.toUpperCase());
    } else {
      if (!cfg.customColors.includes(hx)) set({ colorMode: 'custom', customColors: [...cfg.customColors, hx] });
      flash('Warna ' + hx.toUpperCase() + ' ditambahkan');
    }
    setPicking(false);
  };

  const savePreset = () => {
    const nm = pname.trim() || ('Preset ' + (presets.length + 1));
    const np = [...presets, { name: nm, cfg: { ...cfg } }];
    setPresets(np); atSave(AT_PRESETS, np); setPname(''); flash('Preset "' + nm + '" disimpan');
  };

  const finishSess = () => {
    if (!vec || !seg) return null;
    return {
      svg: vec.svg, regs: vec.regs, palette: seg.palette, labels: seg.labels, loops,
      w: seg.w, h: seg.h, W: seg.W, H: seg.H, scale: seg.scale, cls: seg.cls,
      stats: { ...vec.stats, workSize: seg.w + '×' + seg.h, origSize: job.w + '×' + job.h, resModeLabel: atGetResLabel(resMode), palette: { count: seg.palette.length, auto: cfg.colorMode !== 'custom' } },
      workData: seg.workData, mask: seg.mask, hiddenLabels: [],
    };
  };

  const navNext = async () => {
    if (segBusy) return;
    if (step === 1 && cfg.colorMode === 'custom' && !cfg.customColors.length) {
      flash('Tambahkan minimal 1 warna pada palet kustom');
      return;
    }
    if (step === 2 && !seg) {
      await runSegmentation();
      goToStep(3);
      return;
    }
    if (step === 4) {
      if (!loops || !vec) {
        const ok = await runTraceBounds();
        if (ok) goToStep(5);
        return;
      }
      goToStep(5);
      return;
    }
    if (step === 5) {
      const s = finishSess();
      if (s) onDone(s, cfg);
      return;
    }
    goToStep(step + 1);
  };

  const stepAnimCls = dir === 'fwd' ? 'at-step-fwd' : 'at-step-bwd';

  const bodyEl = (<div ref={wizRef} className={'rv-aw rv-aw-' + step}>{step === 0 && <div key="aw-0" className={stepAnimCls}><div className="at-card-t">1 · Kontrol Transparansi & Kompensasi Halo</div>{job.alpha.hasAlpha ? <div className="at-note">Alpha terdeteksi ({Math.round(job.alpha.transparentFrac * 100)}% transparan{job.alpha.binary ? ', biner' : ', gradasi'}). Pilih kompensasi halo:</div> : <div className="at-note">Tidak ada alpha channel — gambar opaque penuh.</div>}<div className="at-optlist">{AT_ALPHA_OPTS.map(o => <AtOptCard key={o.id} tip={'atAlpha_' + o.id} on={cfg.transparency === o.id} t={o.t} d={o.d} rec={o.id === (rec.recAlpha || 'keep')} onClick={() => set({
        transparency: o.id
      })} />)}</div><div className={'at-collapse' + (cfg.transparency === 'custom' ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atAlphaColor" t="Warna latar" d="C_flat = \u03B1\xB7C_fg + (1\u2212\u03B1)\xB7C_bg; tepi halo di-defringe"><ColorField tip="atAlphaColor" value={cfg.customColor} on={v => set({
            customColor: v
          })} /><span className="font-mono text-xs font-semibold">{cfg.customColor.toUpperCase()}</span></AtRow></div></div></div>}{step === 1 && <div key="aw-1" className={stepAnimCls}><div className="at-card-t"><span>2 · Mode Warna, Generator Palet & Komparator Kuantisasi</span>{rec.recColor && <span className="at-rec-badge solid">★ Rekomendasi: {rec.recColor.title}</span>}</div><div className="at-optlist mb-3">{AT_COLOR_MODES.map(m => <AtOptCard key={m.id} tip={'atColMode_' + m.id} on={cfg.colorMode === m.id} t={m.t} d={m.d} rec={rec.recColor && rec.recColor.id === m.id} recLabel="Direkomendasikan" onClick={() => {
        if (m.id === 'two') set({
          colorMode: 'two',
          customColors: job.twoPalette || job.autoPalette.slice(0, 2)
        });else if (m.id === 'auto') set({
          colorMode: 'auto',
          palMode: 'flexible',
          customColors: (job.autoPalette || []).slice()
        });else if (m.id === 'unlimited') set({
          colorMode: 'unlimited',
          palMode: 'flexible',
          sensitivity: 'high'
        });else set({
          colorMode: 'custom'
        });
      }} />)}</div><div className={'at-collapse' + (cfg.colorMode !== 'two' ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atAdvPalMode" t="Mode alokasi klaster" d="Fixed: jumlah warna presisi via stepper \xB7 Flexible: BIC otomatis di ruang CIE-Lab"><Seg tip="atAdvPalMode" o={[['fixed', 'Fixed'], ['flexible', 'Flexible']]} v={cfg.palMode} on={v => set({
            palMode: v
          })} /></AtRow><div className={'at-collapse' + (cfg.palMode === 'fixed' ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atAdvTargetK" t="Jumlah warna target (K)" d="K-Means++ dengan K eksak"><AtNum tip="atAdvTargetK" v={cfg.targetColors} min={2} max={40} on={v => set({
                targetColors: v
              })} /></AtRow></div></div><AtRow tip="atAdvSens" t="Sensitivitas warna" d="Low: palet ringkas \xB7 High: menangkap nuansa halus (\u03B3 BIC)"><Seg tip="atAdvSens" o={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} v={cfg.sensitivity} on={v => set({
            sensitivity: v
          })} /></AtRow><AtRow tip="atAdpParamBox" t={`Toleransi Layer Difference Adaptif (ΔE CIE-Lab · Rekomendasi: ${adpP.layerDifference ?? 4.8})`} d="Ambang penggabungan warna mirip di ruang CIE-Lab (detail mikro dilindungi otomatis dengan ambang 0.58\xD7 lebih ketat)"><div className="flex items-center gap-2"><Slider min={2.5} max={9.0} step={0.1} value={cfg.layerDifference ?? adpP.layerDifference ?? 4.8} on={v => set({
              layerDifference: v
            })} style={{
              width: 150
            }} /><span className="at-val">ΔE {(cfg.layerDifference ?? adpP.layerDifference ?? 4.8).toFixed(1)}</span></div></AtRow></div></div><AtRow tip="atAdvPipette" t="Pipet warna (Eyedropper)" d="Klik gambar untuk memungut sampel (tahan Ctrl saat klik untuk membaurkan dengan warna terakhir)"><button type="button" data-tip="atAdvPipette" className={'btn sec' + (picking ? ' on' : '')} onClick={() => setPicking(!picking)}><Ico n="pipette" size={14} /> {picking ? 'Klik pada gambar…' : 'Pipet warna'}</button></AtRow>{picking && <img src={job.url} onClick={pickColor} className="at-pickimg" style={{
      cursor: 'crosshair'
    }} alt="Pipet warna" />}<div className="at-card-t mt-3"><span>Daftar Palet Warna {cfg.colorMode === 'custom' ? '(Mode Custom Aktif)' : '(Klik + Tambah Warna Gambar untuk mengunci ke Custom Colors)'}</span></div><PaletteEdit job={job} flash={flash} colors={cfg.customColors} onChange={p => set({
      colorMode: 'custom',
      customColors: p
    })} allowEmpty={true} /><div className="flex gap-2 mt-3 flex-wrap"><button type="button" data-tip="atAdvComparator" className="btn sec" onClick={async () => {
        flash('Menghitung pratinjau kuantisasi CIE-Lab…');
        const {
          palette,
          mask
        } = await computePalette();
        const {
            w,
            h
          } = job.work,
          d = job.work.data.data;
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const cx = cv.getContext('2d'),
          im = cx.createImageData(w, h);
        for (let p = 0; p < w * h; p++) {
          if (mask[p]) continue;
          const o = p * 4;
          let bi = 0,
            bd = Infinity;
          for (let k = 0; k < palette.length; k++) {
            const c = palette[k];
            const dd = VMT.cdist2(d[o], d[o + 1], d[o + 2], c.r, c.g, c.b);
            if (dd < bd) {
              bd = dd;
              bi = k;
            }
          }
          const c = palette[bi];
          im.data[o] = c.r;
          im.data[o + 1] = c.g;
          im.data[o + 2] = c.b;
          im.data[o + 3] = 255;
        }
        cx.putImageData(im, 0, 0);
        setCmp({
          url: cv.toDataURL(),
          n: palette.length,
          colors: palette.map(c => c.hex)
        });
      }}><Ico n="eye" size={14} /> Bandingkan (Palette Comparator)</button>{cmp && <button type="button" className="btn sec" onClick={() => {
        set({
          colorMode: 'custom',
          customColors: cmp.colors
        });
        flash('Disalin ke palet kustom');
      }}>Gunakan {cmp.n} warna hasil komparasi</button>}</div></div>}{step === 2 && <div key="aw-2" className={stepAnimCls}><div className="at-card-t"><span>3 · Tuning Segmentasi MRF & Perbandingan Gambar Asli</span>{seg && <span className="at-rec-badge">β = {seg.beta} · {seg.palette.length} Warna · {seg.w}×{seg.h} px</span>}</div><div className="at-adv-split"><div className="at-adv-pane"><div className="at-adv-sec-hdr"><span className="flex items-center gap-2"><Ico n="eye" size={14} /> Pratinjau Segmentasi vs Gambar Asli (Zoom & Pan)</span>{seg && <span className="text-[11px] mut">{seg.w}×{seg.h} px</span>}</div>{seg ? null : <AtEmpty icon="layers" t={segBusy ? 'Menjalankan Segmentasi MRF…' : 'Belum ada pratinjau segmentasi'} d="Klik tombol Jalankan Segmentasi di sebelah kanan untuk memproses partisi QuadTree & optimasi MRF Potts." />}</div><div className="at-adv-pane space-y-3"><div className="at-adv-sec-hdr"><span className="flex items-center gap-2"><Ico n="sliders" size={14} /> Parameter Segmentasi Diskrit MRF</span></div><AtRow tip="atAdvComplexity" t="Complexity (Fidelitas Detail)" d="Rasio fidelitas vs jumlah segmen (\u03B2 MRF). Geser kanan = lebih banyak detail"><div className="flex items-center gap-2"><Slider tip="atAdvComplexity" min={0} max={100} value={cfg.complexity} on={v => set({
              complexity: v
            })} style={{
              width: 170
            }} /><span className="at-val">{cfg.complexity}</span></div></AtRow><AtRow tip="atAdvMinPx" t="Minimum number of pixels" d="Segmen pulau di bawah luas piksel ini dilebur otomatis ke tetangga (anti salt-and-pepper noise)"><AtNum tip="atAdvMinPx" v={cfg.minPixels} min={1} max={5000} on={v => set({
            minPixels: v
          })} /></AtRow><div className="flex flex-wrap gap-2 pt-2"><button type="button" data-tip="atAdvRunSeg" className="btn pri flex-1" disabled={segBusy} onClick={runSegmentation}><Ico n="play" size={14} /> {segBusy ? 'Memproses MRF…' : seg ? 'Jalankan Ulang Segmentasi' : 'Jalankan Segmentasi'}</button>{seg && <button type="button" className="btn sec" onClick={() => goToStep(3)}><Ico n="brush" size={14} /> Buka Editor Segmen</button>}</div>{seg && <div className="at-note"><div><b>Status Segmentasi:</b> {seg.palette.length} klaster warna aktif · penalti regularisasi Potts β = <b>{seg.beta}</b>.</div><div className="mt-1">Gunakan panel di sebelah kiri untuk membandingkan batas segmen dengan <b>Gambar Asli</b> (mode Split, Samping, atau Overlay) beserta <b>Zoom</b> sebelum lanjut ke Editor Segmen atau Smoothing.</div></div>}</div></div></div>}{step === 3 && (seg ? <SegEditor sess={seg} job={job} imgUrl={job.url} imgElem={job.img} onApply={dirty => {
    setSeg({
      ...seg
    });
    setLoops(null);
    setVec(null);
    goToStep(4);
    if (dirty) flash('Segmentasi diperbarui');
  }} onCancel={() => goToStep(2)} flash={flash} /> : <AtEmpty icon="brush" t="Belum ada hasil segmentasi" d="Kembali ke tahap Segmentasi dan jalankan dulu."><button type="button" className="btn sec" onClick={() => goToStep(2)}>Ke tahap Segmentasi</button></AtEmpty>)}{step === 4 && <div key="aw-4" className={stepAnimCls}><div className="at-card-t"><span>5 · Advanced Path Smoothing, Deteksi Sudut Cerdas (Tipografi A–Z) & Pratinjau Zoom</span>{vec && <span className="at-rec-badge solid">{vec.stats.bezierSegs} Segmen · {vec.stats.sharpCorners || 0} Sudut C⁰ · {vec.stats.smoothCorners || 0} Sudut G¹</span>}</div><div className="at-adv-split"><div className="at-adv-pane"><div className="at-adv-sec-hdr"><span className="flex items-center gap-2"><Ico n="eye" size={14} /> Pratinjau Vektor vs Gambar Asli + Inspeksi Simpul (Zoom & Pan)</span><button type="button" data-tip="atAdvRunTrace" className="btn sec" style={{
            padding: '5px 10px',
            fontSize: 11.5
          }} disabled={segBusy || !seg} onClick={() => runTraceBounds()}><Ico n="refresh" size={12} /> {segBusy ? 'Memproses…' : 'Trace Ulang Batas'}</button></div>{vec ? <div><div className="at-stat-pills"><span className="at-stat-pill"><i style={{
                background: '#f59e0b'
              }} />Sharp Corner C⁰: <b>{vec.stats.sharpCorners || 0}</b></span><span className="at-stat-pill"><i style={{
                background: '#06b6d4',
                borderRadius: '50%'
              }} />Smooth Corner G¹: <b>{vec.stats.smoothCorners || 0}</b></span><span className="at-stat-pill"><i style={{
                background: '#10b981'
              }} />Garis Lurus (L): <b>{vec.stats.straightSegs || 0}</b></span><span className="at-stat-pill"><i style={{
                background: '#4f46e5'
              }} />Kurva Bézier (C): <b>{vec.stats.curveSegs || 0}</b></span><span className="at-stat-pill">Durasi: <b>{(vec.stats.ms / 1000).toFixed(2)} dtk</b></span></div></div> : <AtEmpty icon="sparkle" t={segBusy ? 'Mengekstraksi Kontur & Fitting Kurva…' : 'Batas region belum di-trace'} d="Klik tombol di bawah untuk mengekstraksi graf planar, menjalankan dekonvolusi sub-piksel pantai, dan mengaktifkan pratinjau interaktif beserta fungsi zoom."><button type="button" data-tip="atAdvRunTrace" className="btn pri" disabled={segBusy || !seg} onClick={() => runTraceBounds()}><Ico n="play" size={14} /> {segBusy ? 'Memproses…' : 'Trace Batas & Fitting Bézier'}</button></AtEmpty>}</div><div className="space-y-3"><div className="at-adv-pane"><div className="at-adv-sec-hdr"><span className="flex items-center gap-2"><Ico n="sparkle" size={14} /> Preset Cerdas Pemulihan Pasca-Tracing</span></div><div className="at-PresetGrid">{ADV_SMOOTH_PRESETS.map(pr => <button key={pr.id} type="button" data-tip={pr.id === 'typo' ? 'atAdvPresetTypo' : pr.id === 'geo' ? 'atAdvPresetGeo' : pr.id === 'illus' ? 'atAdvPresetIllus' : 'atAdvPresetLine'} className={'at-PresetBtn' + (activeSmPreset === pr.id ? ' on' : '')} onClick={() => {
              setActiveSmPreset(pr.id);
              const nextCfg = {
                ...cfg,
                ...pr.patch
              };
              setCfg(nextCfg);
              if (!cfg.autoUpdate && loops) refit(loops, nextCfg);
              flash('Preset "' + pr.t + '" diterapkan');
            }}><span className="at-PresetBtn-t"><Ico n="wand" size={12} /> {pr.t}</span><span className="at-PresetBtn-d">{pr.d}</span></button>)}</div></div><div className="at-adv-pane"><div className="at-adv-sec-hdr"><span className="flex items-center gap-2"><Ico n="sliders" size={14} /> Advanced Smoothing & Koreksi Garis Bengkok</span></div><AtRow tip="atAdvSmoothMethod" t="Algoritma Smoothing" d="Hybrid menggabungkan Taubin \u03BB|\u03BC (anti-kerut) & Elastika Polak-Ribi\xE8re CG"><Seg tip="atAdvSmoothMethod" o={[['hybrid', 'Hybrid (Taubin+CG)'], ['taubin', 'Taubin λ|μ'], ['cg', 'Elastika CG']]} v={cfg.smoothMethod || 'hybrid'} on={v => set({
              smoothMethod: v
            })} /></AtRow><AtRow tip="atAdvSmooth" t="Smoothness (Kekuatan Penghalusan)" d="Bobot penalti kelengkungan \u03BB dalam E = E_data + \u03BB\xB7E_bending"><div className="flex items-center gap-2"><Slider tip="atAdvSmooth" min={0} max={100} value={cfg.smoothness} on={v => set({
                smoothness: v
              })} style={{
                width: 155
              }} /><span className="at-val">{cfg.smoothness}</span></div></AtRow><AtRow tip="atAdvLineStraighten" t="Pelurusan Garis Bengkok (Straighten Bent Lines)" d="Koreksi otomatis garis lurus yang melengkung/bergelombang & bersihkan kurva-S palsu"><div className="flex items-center gap-2"><Slider tip="atAdvLineStraighten" min={0} max={100} value={cfg.lineStraighten ?? 76} on={v => set({
                lineStraighten: v
              })} style={{
                width: 155
              }} /><span className="at-val">{cfg.lineStraighten ?? 76}</span></div></AtRow><AtRow tip="atAdvAxisSnap" t="Kunci Sumbu Vertikal / Horizontal / 45\xB0" d="Ratakan batang huruf (I, H, T, E, F, L, M, N, D, B, P, R) yang sedikit miring ke sumbu presisi"><AtToggle tip="atAdvAxisSnap" on={cfg.axisSnap !== false} act={v => set({
              axisSnap: v
            })} label="Kunci Sumbu" /></AtRow><div className={'at-collapse' + (cfg.axisSnap !== false ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atAdvAxisSnapDeg" t="Toleransi Kunci Sumbu (\xB0)" d="Batas kemiringan garis terhadap 0\xB0/90\xB0/\xB145\xB0 yang langsung disejajarkan"><div className="flex items-center gap-2"><Slider tip="atAdvAxisSnapDeg" min={0.5} max={8} step={0.5} value={cfg.axisSnapDeg ?? 2.8} on={v => set({
                    axisSnapDeg: v
                  })} style={{
                    width: 140
                  }} /><span className="at-val">{cfg.axisSnapDeg ?? 2.8}°</span></div></AtRow></div></div><AtRow tip="atAdvDespeckle" t="Reduksi Gerigi Piksel (Staircase Despeckle)" d="Hilangkan efek anak-tangga 1px pada kaki miring huruf A, V, W, X, Y, Z"><div className="flex items-center gap-2"><Slider tip="atAdvDespeckle" min={0} max={100} value={cfg.despeckleJitter ?? 60} on={v => set({
                despeckleJitter: v
              })} style={{
                width: 155
              }} /><span className="at-val">{cfg.despeckleJitter ?? 60}</span></div></AtRow><AtRow tip="atAdvExtremum" t="Penyejajaran Puncak Kurva (Cardinal Extrema)" d="Kunci garis singgung 0\xB0/90\xB0 di puncak busur huruf O, C, G, S, U, B, D, P, R"><AtToggle tip="atAdvExtremum" on={cfg.extremumAlign !== false} act={v => set({
              extremumAlign: v
            })} label="Cardinal Extrema" /></AtRow></div><div className="at-adv-pane"><div className="at-adv-sec-hdr"><span className="flex items-center gap-2"><Ico n="detect" size={14} /> Advanced Corner Detection (Huruf A–Z Sharp C⁰ & Smooth G¹)</span><AtToggle tip="atAdvCorners" on={cfg.detectCorners} act={v => set({
              detectCorners: v
            })} label="Deteksi sudut" /></div><div className={'at-collapse' + (cfg.detectCorners ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atAdvCornerMode" t="Mode Diskriminator Sudut" d="Hybrid A\u2013Z mengenali sudut lancip, sudut siku garis-kurva, dan busur membulat sekaligus"><Seg tip="atAdvCornerMode" o={[['typo', 'Hybrid A–Z'], ['sharp', 'Tajam Presisi'], ['organic', 'Halus Organik']]} v={cfg.cornerMode || 'typo'} on={v => set({
                  cornerMode: v
                })} /></AtRow><AtRow tip="atAdvCornerAng" t="Ambang Sudut Tajam (\xB0)" d="Batas minimal perubahan arah (derajat) untuk mengunci sudut tajam C\u2070"><AtNum tip="atAdvCornerAng" v={cfg.cornerAngle} min={15} max={120} on={v => set({
                  cornerAngle: v
                })} /></AtRow><AtRow tip="atAdvLineCurveSens" t="Kepekaan Garis-ke-Kurva (Huruf D, P, R, B, G, U, J)" d="Memisahkan sudut siku tajam D/P/B/R (C\u2070) dari sambungan tangensial mulus U/J (G\xB9)"><div className="flex items-center gap-2"><Slider tip="atAdvLineCurveSens" min={0} max={100} value={cfg.lineCurveSensitivity ?? 76} on={v => set({
                    lineCurveSensitivity: v
                  })} style={{
                    width: 155
                  }} /><span className="at-val">{cfg.lineCurveSensitivity ?? 76}</span></div></AtRow><AtRow tip="atAdvApexSharp" t="Rekonstruksi Puncak Lancip (Apex Ray-Intersection)" d="Memulihkan ujung lancip huruf A, V, W, M, N, Z yang tumpul akibat anti-aliasing"><div className="flex items-center gap-2"><Slider tip="atAdvApexSharp" min={0} max={100} value={cfg.apexSharpness ?? 80} on={v => set({
                    apexSharpness: v
                  })} style={{
                    width: 155
                  }} /><span className="at-val">{cfg.apexSharpness ?? 80}</span></div></AtRow><AtRow tip="atAdvCornerRound" t="Preservasi Sudut Membulat (Smooth Corner G\xB9)" d="Menjaga lengkungan busur K\xE5sa tetap mulus G\xB9 tanpa patah menjadi poligon"><div className="flex items-center gap-2"><Slider tip="atAdvCornerRound" min={0} max={100} value={cfg.cornerRoundness ?? 68} on={v => set({
                    cornerRoundness: v
                  })} style={{
                    width: 155
                  }} /><span className="at-val">{cfg.cornerRoundness ?? 68}</span></div></AtRow><AtRow tip="atAdvStemCap" t="Proteksi Ujung Batang Huruf (Stem Cap & Serif Guard)" d="Mencegah 2 sudut 90\xB0 pada ujung batang huruf I, H, T, E, F, L, N melebur jadi bulat"><AtToggle tip="atAdvStemCap" on={cfg.protectStemCaps !== false} act={v => set({
                  protectStemCaps: v
                })} label="Proteksi Ujung Batang" /></AtRow></div></div><div className="mt-2 pt-2" style={{
            borderTop: '1px solid var(--line)'
          }}><AtRow tip="atAdvAA" t="Anti-aliasing Sub-Pixel Engine" d="Dekonvolusi sub-piksel fraksional pantai (Beach Inversion)"><AtToggle tip="atAdvAA" on={cfg.aa} act={v => {
                const next = {
                  ...cfg,
                  aa: v
                };
                setCfg(next);
                runTraceBounds(next);
              }} label="Anti-aliasing engine" /></AtRow><AtRow tip="atAdvNodeDens" t="Kerapatan Simpul (Number of Nodes)" d="Toleransi galat fitting B\xE9zier (MDL threshold): rendah = hemat node & ekstra mulus"><div className="flex items-center gap-2"><Slider tip="atAdvNodeDens" min={0} max={100} value={cfg.nodeDensity} on={v => set({
                  nodeDensity: v
                })} style={{
                  width: 155
                }} /><span className="at-val">{cfg.nodeDensity}</span></div></AtRow><AtRow tip="atAdvAutoUpd" t="Auto-update Pratinjau Real-Time" d="Hitung ulang kurva secara otomatis saat slider digeser"><AtToggle tip="atAdvAutoUpd" on={cfg.autoUpdate} act={v => set({
                autoUpdate: v
              })} label="Auto-update" /></AtRow>{!cfg.autoUpdate && <button type="button" className="btn pri w-full mt-2" onClick={() => refit()}><Ico n="refresh" size={14} /> Terapkan Parameter Sekarang</button>}</div></div></div></div></div>}{step === 5 && <div key="aw-5" className={stepAnimCls}><div className="at-card-t">6 · Penataan Topologi & Ekspor Multi-Format</div><div className="at-card-t2">Penataan bentuk (Shape Arrangement Mode)</div><div className="at-optlist"><AtOptCard tip="atStack_stack" on={cfg.stackMode === 'stack'} t="Stack shapes on top of each other (Cake-Stack)" d="Tumpuk lapis demi lapis dari bentuk terluas di bawah hingga detail di atas" onClick={() => set({
        stackMode: 'stack'
      })} /><AtOptCard tip="atStack_cutout" on={cfg.stackMode === 'cutout'} t="Place shapes in cut-outs in shapes below (Mosaic)" d="Bentuk di bawah dilubangi sehingga ubin vektor tidak saling tumpang-tindih" onClick={() => set({
        stackMode: 'cutout'
      })} /><AtOptCard tip="atStack_grouped" on={cfg.stackMode === 'grouped'} t="Place shapes in cut-outs and group by color" d="Mosaik berlubang yang dikelompokkan menurut layer warna (<g>)" onClick={() => set({
        stackMode: 'grouped'
      })} /></div><AtRow tip="atStrokeToggle" t="Shape stroking" d="Goresan luar sewarna fill untuk mencegah celah render anti-aliasing"><AtToggle tip="atStrokeToggle" on={cfg.stroke} act={v => set({
        stroke: v
      })} label="Stroke" /></AtRow><div className="at-card-t2">Mode DXF (CAD / CNC / Plotter)</div><Seg tip="atDxfMode" o={[['spline', 'Lines + Spline (AcDbSpline)'], ['lines-few', 'Lines Only (Sedikit)'], ['lines-more', 'Lines Only (Rapat)']]} v={cfg.dxfMode} on={v => set({
      dxfMode: v
    })} /><div className="at-card-t2">Simpan & Panggil Preset Parameter</div><div className="flex gap-2 items-center flex-wrap"><AtTextBox tip="atPresetBox" value={pname} onChange={setPname} placeholder="Ketik nama preset\u2026" onEnter={savePreset} /><button type="button" data-tip="atPresetSave" className="btn sec" onClick={savePreset}>Simpan Preset</button></div><div className="ved-pills mt-2">{['Tipografi A-Z', 'Logo Tajam', 'Ilustrasi Halus', 'Foto Detail', 'Plotter CAD'].map(tag => <button key={tag} type="button" data-tip="atPresetBox" className={'ved-pill' + (pname === tag ? ' on' : '')} onClick={() => setPname(tag)}>+ {tag}</button>)}</div>{presets.length > 0 && <div className="at-presets">{presets.map((p, i) => <div key={i} className="at-preset"><span>{p.name}</span><button type="button" data-tip="atPresetLoad" className="btn sec" style={{
          padding: '5px 10px',
          fontSize: 11.5
        }} onClick={() => {
          setCfg(c => ({
            ...c,
            ...p.cfg
          }));
          flash('Preset "' + p.name + '" dimuat');
        }}>Muat</button><button type="button" data-tip="atPresetDel" className="btn sec" style={{
          padding: '5px 10px',
          fontSize: 11.5
        }} onClick={() => {
          const np = presets.filter((_, j) => j !== i);
          setPresets(np);
          atSave(AT_PRESETS, np);
        }}><Ico n="trash" size={12} /></button></div>)}</div>}{(() => {
      const s = finishSess();
      return s ? <div className="mt-3"><div className="mt-2"><ExportActions sess={s} fileName={job.name} dxfMode={cfg.dxfMode} flash={flash} /></div></div> : <div className="at-note">Selesaikan tahap Smoothing dulu.</div>;
    })()}</div>}</div>);
  const finS = step === 5 ? finishSess() : null;
  const cvUrl = step === 1 && cmp ? cmp.url : job.url;
  const vecS = (step === 4 && vec && seg) ? { svg: vec.svg, regs: vec.regs, W: seg.W, H: seg.H } : (finS ? { svg: finS.svg, regs: finS.regs, W: finS.W, H: finS.H } : null);
  const open = sideOpen && wide;
  const nav = step !== 3 && (<div className="rv-acts-b"><button type="button" data-tip="atBtnBack" className="rv-btn" disabled={segBusy} onClick={() => step === 0 ? onBack() : goToStep(step - 1)}>Kembali</button><button type="button" data-tip="atBtnNext" className="rv-btn pri" disabled={segBusy} onClick={navNext}>{segBusy ? 'Memproses…' : step === 5 ? <><Ico n="check" size={14} /> Selesai & Tinjau Penuh</> : 'Lanjut'}</button></div>);
  if (step === 3 && seg) return bodyEl;
  return (<RvPortal cls="rv-wiz-root"><div className={'rv-stage' + (step !== 3 && open ? ' side-open' : '')}>{step === 3 ? <div className="rv-wiz-full rv-glass">{bodyEl}</div> : <>{step === 2 && seg ? <div className="rv-wiz-seg rv-glass"><SegPreviewCompare seg={seg} imgUrl={job.url} /></div> : vecS ? <CompareView key={'v' + step} imgUrl={job.url} svg={vecS.svg} regs={vecS.regs} hiddenLabels={[]} W={vecS.W} H={vecS.H} initialMode="split" floating={true} pad={{
        t: 64,
        r: open ? 416 : 0,
        b: 108,
        l: 0
      }} /> : <CompareView key={cvUrl} imgUrl={cvUrl} svg={null} regs={[]} hiddenLabels={[]} W={job.w} H={job.h} initialMode="bitmap" bitmapOnly={true} floating={true} onToggleBgLabel={() => {}} pad={{
        t: 64,
        r: open ? 416 : 0,
        b: 14,
        l: 0
      }} />}<RvSide open={sideOpen} onToggle={() => setSideOpen(o => !o)} icon="sliders" title={ADV_STEPS[step]} sub={'Advanced Wizard · langkah ' + (step + 1) + ' dari ' + ADV_STEPS.length}>{bodyEl}{nav}</RvSide></>}</div><div className="rv-top"><div className="rv-tabs rv-glass" role="tablist">{ADV_STEPS.map((t, i) => <button key={i} type="button" role="tab" aria-selected={step === i} disabled={i > maxStep || segBusy} className={'rv-tab' + (step === i ? ' on' : '')} onClick={() => goToStep(i)}><b>{i + 1}</b><span>{t}</span></button>)}</div><div className="rv-acts rv-glass"><button type="button" className="rv-ibtn" data-tip="atBackSetup" onClick={onBack} aria-label="Kembali ke Pipeline"><Ico n="sliders" size={16} /></button></div></div></RvPortal>);
};

export { AdvWizard };
