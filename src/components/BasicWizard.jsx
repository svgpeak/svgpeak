import React, { useState, useRef, useEffect } from 'react';
import { rvUseWide, RvPortal, RvSide } from './CanvasRenderUtils.jsx';
import { atLoad, AT_LS, atSave, AT_TYPE_OPTS, AtOptCard, AT_ALPHA_OPTS, AtRow, AT_COLOR_MODES } from './TraceSharedUI.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { ColorField, Seg } from './ColorPicker.jsx';
import { Slider, Ico } from './CommonControls.jsx';
import { PaletteEdit } from './PaletteComponents.jsx';
import { CompareView } from './CompareView.jsx';

/* =====================================================================
   BASIC WIZARD — 5 Langkah Terpandu (Dengan 4 Pilihan Mode Warna + Rekomendasi)
   ===================================================================== */
const BASIC_STEPS = ['Tipe Gambar', 'Transparansi', 'Kualitas', 'Mode Warna', 'Palet'];
const BasicWizard = ({ job, resMode, flash, onVectorize, onBack }) => {
  const [step, setStep] = useState(0);
  const [sideOpen, setSideOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000);
  const wide = rvUseWide(1000);
  const [dir, setDir] = useState('fwd');
  const [maxStep, setMaxStep] = useState(0);
  const wizRef = useRef(null);
  const rec = job.rec || {};
  const [cfg, setCfg] = useState(() => {
    const saved = atLoad(AT_LS, {}).basic;
    return {
      imageType: 'auto',
      transparency: 'keep',
      customColor: '#ffffff',
      quality: 'auto',
      detail: rec.recDetail || 'medium',
      smoothness: (saved && saved.smoothness) ?? 68,
      colorMode: (job.userPalette && job.userPalette.length) ? 'custom' : ((rec.recColor && rec.recColor.id) || (saved && saved.colorMode) || 'auto'),
      palette: ((job.userPalette && job.userPalette.length) ? job.userPalette : (job.autoPalette || [])).slice(),
    };
  });
  const [palSug, setPalSug] = useState(() => (job.autoPalette || []).slice());
  const set = p => setCfg(c => ({ ...c, ...p }));
  useEffect(() => { atSave(AT_LS, { ...atLoad(AT_LS, {}), basic: cfg }); }, [cfg]);

  /* Sinkronkan mode warna rekomendasi ketika berganti gambar baru */
  useEffect(() => {
    if (job && job.rec && job.rec.recColor) {
      const mId = job.rec.recColor.id;
      const hasUserPal = !!(job.userPalette && job.userPalette.length);
      setCfg(c => ({
        ...c,
        colorMode: hasUserPal ? 'custom' : mId,
        detail: job.rec.recDetail || c.detail,
        palette: hasUserPal ? job.userPalette.slice() : (mId === 'two' ? (job.twoPalette || (job.autoPalette || []).slice(0, 2)) : (job.autoPalette || []).slice())
      }));
    }
  }, [job && job.url]);

  const goToStep = nextStep => {
    setDir(nextStep >= step ? 'fwd' : 'bwd');
    setStep(nextStep);
    setMaxStep(m => Math.max(m, nextStep));
    /* Scroll halus kembali ke bagian atas wizard agar pengguna langsung melihat awal step */
    requestAnimationFrame(() => {
      const rootEl = wizRef.current && wizRef.current.closest('.at-root');
      if (rootEl) rootEl.scrollTo({ top: Math.max(0, wizRef.current.offsetTop - 12), behavior: 'auto' });
    });
  };

  useEffect(() => {
    if (step !== 4) return;
    let on = true;
    (async () => {
      const wTarget = job.lowWork || job.work;
      if (job.lowBackup && wTarget.data) wTarget.data.data.set(job.lowBackup);
      const mask = VMT.flattenAlpha(wTarget, cfg.transparency, cfg.customColor);
      const effType = cfg.imageType === 'auto' ? job.cls.type : cfg.imageType;
      const adpP = (job.adaptiveProfile && job.adaptiveProfile.params) || {};
      const pr = VMT.findPalette(wTarget, mask, {
        colorMode: cfg.colorMode === 'two' ? 'two' : cfg.colorMode === 'unlimited' ? 'unlimited' : 'auto',
        sensitivity: cfg.colorMode === 'unlimited' ? 'high' : (adpP.sensitivity || 'medium'),
        layerDifference: adpP.layerDifference,
        adaptiveKMax: adpP.targetKMax,
        imageType: effType,
        targetColors: cfg.colorMode === 'two' ? 2 : cfg.colorMode === 'unlimited' ? (effType === 'photo' ? 30 : 22) : (adpP.targetKMax || (effType === 'photo' ? 18 : 12)),
      }, job.previewEdge);
      if (on) {
        const hexes = pr.palette.map(c => c.hex);
        setPalSug(hexes);
        if (!cfg.palette.length || cfg.colorMode !== 'custom') set({ palette: hexes });
      }
    })();
    return () => { on = false; };
  }, [step, cfg.colorMode, cfg.imageType, cfg.transparency, cfg.customColor]);

  const canNext = () => {
    if (step === 4 && cfg.colorMode === 'custom' && !cfg.palette.length) return false;
    return true;
  };
  const go = () => {
    if (step < 4) { goToStep(step + 1); return; }
    const effType = cfg.imageType === 'auto' ? job.cls.type : cfg.imageType;
    const mc = {
      imageType: cfg.imageType,
      quality: cfg.quality,
      transparency: cfg.transparency,
      customColor: cfg.customColor,
      colorMode: cfg.colorMode,
      paletteColors: (cfg.colorMode === 'custom' || cfg.colorMode === 'two') && cfg.palette && cfg.palette.length ? cfg.palette : undefined,
      targetColors: cfg.colorMode === 'two' ? 2 : effType === 'photo' ? { rendah: 10, medium: 20, tinggi: 32 }[cfg.detail] : undefined,
      sensitivity: cfg.colorMode === 'unlimited' ? 'high' : 'medium',
      complexity: effType === 'photo' ? { rendah: 32, medium: 56, tinggi: 80 }[cfg.detail] : 48,
      smoothness: cfg.smoothness ?? 68,
      nodeDensity: cfg.detail === 'rendah' ? 36 : cfg.detail === 'tinggi' ? 58 : 45,
      stroke: true,
      stackMode: 'stack',
      resMode,
    };
    onVectorize(mc);
  };

  const stepAnimCls = dir === 'fwd' ? 'at-step-fwd' : 'at-step-bwd';

  const bodyEl = (<div ref={wizRef} className={'rv-aw rv-bw rv-aw-b' + step}>{step === 0 && <div key="bw-0" className={stepAnimCls}><div className="at-card-t"><span>Jenis gambar apa ini?</span><span className="at-rec-badge">Deteksi: {job.cls.label}</span></div><div className="at-optlist">{AT_TYPE_OPTS.map(o => <AtOptCard key={o.id} tip={'atType_' + o.id} on={cfg.imageType === o.id} t={o.t} d={o.d} rec={o.id === rec.recType || o.id === 'auto' && !rec.recType} recLabel={o.id === rec.recType ? 'Cocok dengan gambar' : 'Direkomendasikan'} onClick={() => set({
        imageType: o.id
      })} />)}</div><div className="at-note">Terdeteksi otomatis: <b>{job.cls.label}</b> · kualitas <b>{job.cls.qlabel}</b> · entropi <b>{job.cls.entropy} bit</b> · resolusi kerja <b>{job.work.w}×{job.work.h} px</b></div></div>}{step === 1 && <div key="bw-1" className={stepAnimCls}><div className="at-card-t">Bagaimana menangani transparansi?</div>{job.alpha.hasAlpha ? <div className="at-note">Terdeteksi alpha channel ({Math.round(job.alpha.transparentFrac * 100)}% transparan{job.alpha.binary ? ', biner tegas' : ', gradasi halus'})</div> : <div className="at-note">Tidak ada alpha channel berarti — gambar dianggap opaque penuh.</div>}<div className="at-optlist">{AT_ALPHA_OPTS.map(o => <AtOptCard key={o.id} tip={'atAlpha_' + o.id} on={cfg.transparency === o.id} t={o.t} d={o.d} rec={o.id === (rec.recAlpha || 'keep')} onClick={() => set({
        transparency: o.id
      })} />)}</div><div className={'at-collapse' + (cfg.transparency === 'custom' ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atAlphaColor" t="Warna latar flattening" d="C_flat = \u03B1\xB7C_fg + (1\u2212\u03B1)\xB7C_bg"><ColorField tip="atAlphaColor" value={cfg.customColor} on={v => set({
            customColor: v
          })} /><span className="font-mono text-xs font-semibold">{cfg.customColor.toUpperCase()}</span></AtRow></div></div></div>}{step === 2 && <div key="bw-2" className={stepAnimCls}><div className="at-card-t"><span>Kualitas, level detail & kehalusan kurva</span><span className="at-rec-badge">Kualitas terdeteksi: {job.cls.qlabel}</span></div><AtRow tip="atQualSeg" t="Kualitas input" d="Menentukan bobot penapisan bilateral, smoothness MRF (\u03B2), dan ambang QuadTree"><Seg tip="atQualSeg" o={[['auto', 'Otomatis'], ['high', 'Tinggi'], ['medium', 'Sedang'], ['low', 'Rendah']]} v={cfg.quality} on={v => set({
        quality: v
      })} /></AtRow><AtRow tip="atDetailSeg" t="Level detail" d={'Target kompleksitas segmen (Rekomendasi: ' + {
      rendah: 'Rendah',
      medium: 'Sedang',
      tinggi: 'Tinggi'
    }[rec.recDetail || 'medium'] + ')'}><Seg tip="atDetailSeg" o={[['rendah', 'Rendah'], ['medium', 'Sedang'], ['tinggi', 'Tinggi']]} v={cfg.detail} on={v => set({
        detail: v
      })} /></AtRow><AtRow tip="atBasicSmooth" t="Kehalusan kurva & sudut halus" d="Kekuatan filter Taubin + G\xB9 B\xE9zier fitting (mencegah garis kasar & menjaga ujung bulat tetap smooth)"><div className="flex items-center gap-2"><Slider tip="atBasicSmooth" min={20} max={95} value={cfg.smoothness ?? 68} on={v => set({
          smoothness: v
        })} style={{
          width: 190
        }} /><span className="at-val">{cfg.smoothness ?? 68}</span></div></AtRow></div>}{step === 3 && <div key="bw-3" className={stepAnimCls}><div className="at-card-t"><span>Mode warna output</span>{rec.recColor && <span className="at-rec-badge solid">★ Rekomendasi: {rec.recColor.title}</span>}</div>{rec.recColor && <div className="at-rec-banner mb-3"><span className="at-rec-banner-ic"><Ico n="palette" size={18} /></span><div style={{
        flex: 1,
        minWidth: 0
      }}><div className="text-xs font-bold">Rekomendasi Mode Warna: <span style={{
            color: 'var(--acc)'
          }}>{rec.recColor.title}</span></div><div className="text-[11.5px] mut mt-0.5 leading-relaxed">{rec.recColor.reason}</div></div></div>}<div className="at-optlist">{AT_COLOR_MODES.map(m => <AtOptCard key={m.id} tip={'atColMode_' + m.id} on={cfg.colorMode === m.id} t={m.t} d={m.d} rec={rec.recColor && rec.recColor.id === m.id} recLabel="Direkomendasikan untuk gambar ini" onClick={() => {
        const nextPal = m.id === 'two' ? job.twoPalette || (job.autoPalette || []).slice(0, 2) : (job.autoPalette || []).slice();
        set({
          colorMode: m.id,
          palette: nextPal
        });
        setPalSug(null);
      }} />)}</div></div>}{step === 4 && <div key="bw-4" className={stepAnimCls}><div className="at-card-t"><span>Tinjau & sesuaikan palet warna ({{
          two: 'Two Colors',
          auto: 'Automatic Colors',
          custom: 'Custom Colors',
          unlimited: 'Unlimited Colors'
        }[cfg.colorMode] || 'Auto'})</span><span className="at-rec-badge">{(cfg.palette.length ? cfg.palette : palSug || []).length} warna</span></div>{!palSug ? <div className="at-note">Menghitung palet CIE-Lab…</div> : <><PaletteEdit job={job} flash={flash} colors={cfg.palette.length ? cfg.palette : palSug} onChange={p => set({
        colorMode: 'custom',
        palette: p
      })} /><div className="at-note mt-2">Klik bulatan warna untuk mengubah warna, klik <b>+ Tambah Warna Gambar</b> untuk mendeteksi & menambahkan warna berikutnya dari gambar secara otomatis, atau gabungkan warna yang mirip.</div></>}</div>}</div>);
  const open = sideOpen && wide;
  const nav = (<div className="rv-acts-b"><button type="button" className="rv-btn" data-tip="atBtnBack" onClick={() => step === 0 ? onBack() : goToStep(step - 1)}>Kembali</button><button type="button" className="rv-btn pri" data-tip={step === 4 ? 'atBtnRunTrace' : 'atBtnNext'} disabled={!canNext()} onClick={go}>{step === 4 ? <><Ico n="wand" size={14} /> Mulai Vektorisasi</> : 'Lanjut'}</button></div>);
  return (<RvPortal cls="rv-wiz-root"><div className={'rv-stage' + (open ? ' side-open' : '')}><CompareView key={job.url} imgUrl={job.url} svg={null} regs={[]} hiddenLabels={[]} W={job.w} H={job.h} initialMode="bitmap" bitmapOnly={true} floating={true} onToggleBgLabel={() => {}} pad={{
      t: 64,
      r: open ? 416 : 0,
      b: 14,
      l: 0
    }} /><RvSide open={sideOpen} onToggle={() => setSideOpen(o => !o)} icon="wand" title={BASIC_STEPS[step]} sub={'Basic Wizard · langkah ' + (step + 1) + ' dari ' + BASIC_STEPS.length}>{bodyEl}{nav}</RvSide></div><div className="rv-top"><div className="rv-tabs rv-glass" role="tablist">{BASIC_STEPS.map((t, i) => <button key={i} type="button" role="tab" aria-selected={step === i} disabled={i > maxStep} className={'rv-tab' + (step === i ? ' on' : '')} onClick={() => goToStep(i)}><b>{i + 1}</b><span>{t}</span></button>)}</div><div className="rv-acts rv-glass"><button type="button" className="rv-ibtn" data-tip="atBackSetup" onClick={onBack} aria-label="Kembali ke Pipeline"><Ico n="sliders" size={16} /></button></div></div></RvPortal>);
};

export { BasicWizard };
