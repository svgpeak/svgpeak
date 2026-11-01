import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { fmtRamShort } from './HwSettingsPanel.jsx';
import { Ico } from './CommonControls.jsx';
import { AtDetectedPalette } from './PaletteComponents.jsx';
import { Seg } from './ColorPicker.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { atDownload, atCopy, AtCheck } from './TraceSharedUI.jsx';
import { VE } from '../engine/VectorEngine.jsx';
import { rvUseWide, rvUseBodyFlag, RvSide } from './CanvasRenderUtils.jsx';
import { RealTimeTraceStudio } from './RealTimeTraceStudio.jsx';
import { CompareView } from './CompareView.jsx';

/* ---------- Panel Statistik & Interactive Make Background ---------- */
const ResultStats = ({
  sess, job, flash, hiddenLabels, onToggleLabel, onPaletteChange, onPaletteGradChange, onPaletteOpacityChange, onPaletteReset,
  paletteEdited, hlLabel, onHlChange, pendingPal, onPaletteRetrace, onPaletteDiscard,
  maxColorEnabled, maxColors, onMaxColorChange, gradientMode, onGradientModeChange
}) => {
  const s = sess.stats || {}, cls = sess.cls || {}, hwStat = s.hw || {};
  const hid = new Set(hiddenLabels || []);
  const adp = s.adaptiveProfile;
  const gradPalCount = sess.palette ? sess.palette.filter(c => c.grad && c.grad.stops && c.grad.stops.length >= 2).length : 0;
  const rows = [
    ['Profil Adaptif & Keyakinan', adp ? `${adp.shortTitle} (${Math.round((adp.confidence || 0.85) * 100)}%)` : (cls.label || '-')],
    ['Klasifikasi 2-Sumbu', `${cls.colorFamilyCount || 1} Keluarga Warna × ${(cls.surfaceMode || 'flat').toUpperCase()} (${cls.colorStructureMode || 'MIXED'})`],
    ['Warna Efektif → Palet', `${cls.effectiveColors || '-'} efektif → ${sess.palette.length} layer (${gradPalCount} gradient)`],
    ['Parameter Inti Adaptif', `ΔE=${s.layerDifference ?? (adp && adp.keyParams.layerDifference) ?? 5.6} · Speckle=${s.minPixels ?? 5}px · ε=${s.fitTol ?? 0.2}px`],
    ...(s.calibration ? [
      ['Skor Closed-Loop (1−J)', `${s.calibration.finalQuality}% (J=${s.calibration.finalJ})${s.calibration.refined ? ' · Dioptimalkan' : ' · Optimal'}`],
      ['Boundary IoU & ΔE00 Render', `IoU ${(s.calibration.boundaryIoU * 100).toFixed(1)}% · ΔE00=${s.calibration.meanDE00} · Detail ${(s.calibration.detailRecall * 100).toFixed(0)}%`]
    ] : []),
    ['Resolusi tracing', (s.workSize || '-') + (s.resModeLabel ? ' (' + s.resModeLabel + ')' : '')],
    ['Dimensi asli', s.origSize || (sess.W + '×' + sess.H)],
    ['Region aktif', (sess.regs.length - hid.size) + ' / ' + (s.regions ?? sess.regs.length)],
    ['Loop batas', s.loops ?? '-'],
    ['Segmen Bézier', s.bezierSegs ?? '-'],
    ['Sudut C⁰ / Halus G¹', (s.sharpCorners != null ? `${s.sharpCorners} C⁰ · ${s.smoothCorners || 0} G¹` : '-')],
    ['Engine & Thread', hwStat.coresUsed ? `${hwStat.multiThread ? 'Multi-Thread (' + hwStat.coresUsed + ' Core)' : 'Single-Thread (1 Core)'}${hwStat.gpuUsed ? ' + VGA' : ''}` : '-'],
    ['Puncak / Kuota RAM', hwStat.ramAllocatedMb ? `${hwStat.peakRamMb || 6.4} MB / ${fmtRamShort(hwStat.ramAllocatedMb)}` : '-'],
    ['Durasi komputasi', s.ms != null ? (s.ms / 1000).toFixed(1) + ' dtk' : '-'],
  ];
  return (<div className="card at-stats"><div className="at-card-t">Ringkasan Hasil & Palet</div>{rows.map(([k, v]) => <div key={k} className="at-kv"><span className="mut">{k}</span><span>{v}</span></div>)}{onPaletteChange && <div className="at-kv" style={{
    alignItems: 'flex-start',
    paddingTop: 10
  }}><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="palette" size={12} /></span>Warna dominan ({(pendingPal || sess.palette).length})</span><AtDetectedPalette colors={pendingPal || sess.palette.map(c => c.hex.toLowerCase())} items={pendingPal ? null : sess.palette} edited={!!paletteEdited} job={job} flash={flash} selected={pendingPal ? null : onHlChange ? hlLabel : undefined} hidden={pendingPal ? new Set() : hid} onToggleNone={pendingPal ? undefined : onToggleLabel} onSelect={onHlChange ? i => {
      if (!pendingPal) onHlChange(hlLabel === i ? null : i);
    } : undefined} onChange={onPaletteChange} onGradChange={onPaletteGradChange} onOpacityChange={onPaletteOpacityChange} onReset={onPaletteReset} pending={!!pendingPal} onRetrace={onPaletteRetrace} onDiscard={onPaletteDiscard} maxColorEnabled={maxColorEnabled} maxColors={maxColors} onMaxColorChange={onMaxColorChange} /></div>}{onGradientModeChange && <div className="at-kv" style={{
    alignItems: 'center',
    paddingTop: 8
  }}><span className="mut at-kv-l"><span className="at-kv-ic"><Ico n="sparkle" size={12} /></span><span>Gradient Mode</span></span><div className="flex items-center gap-2 flex-wrap justify-end"><Seg o={[['auto', 'Otomatis'], ['on', 'Aktif'], ['off', 'Nonaktif']]} v={gradientMode || 'auto'} on={onGradientModeChange} /></div></div>}<div className="mut text-[11px] mt-2">Klik warna di bawah untuk menghapus/menampilkan latar (Make Background):</div><div className="at-swrow mt-1.5">{sess.palette.map((c, i) => {
      const isOff = hid.has(i);
      const gCss = c.grad ? VMT.gradToCss(c.grad) : null;
      return <button key={i} type="button" data-tip="atStatSw" onClick={() => onToggleLabel && onToggleLabel(i)} className={'at-sw' + (!isOff ? ' on' : '')} style={{
        width: gCss ? 36 : 26,
        borderRadius: gCss ? 99 : 8,
        background: gCss || c.hex,
        opacity: isOff ? 0.25 : 1,
        transform: isOff ? 'scale(0.88)' : 'none'
      }} />;
    })}</div></div>);
};

/* ---------- Tombol Aksi Ekspor Multi-Format (SVG, PNG, DXF, AI, EPS) ---------- */
const ExportActions = ({ sess, fileName, dxfMode, flash, compact }) => {
  const baseName = fileName || 'trace';
  const dlSvg = () => { atDownload(baseName + '.svg', sess.svg, 'image/svg+xml'); flash('SVG diunduh'); };
  const dlPng = async () => {
    flash('Merender PNG 2x…');
    try {
      const c = await VMT.rasterizeSVG(sess.svg, sess.W, sess.H, 2);
      c.toBlob(b => { atDownload(baseName + '@2x.png', b); flash('PNG 2x diunduh'); }, 'image/png');
    } catch (e) { flash('Gagal merender PNG'); }
  };
  const dlDxf = () => { atDownload(baseName + '.dxf', VMT.exportDXF(sess.regs, sess.W, sess.H, dxfMode || 'spline'), 'application/dxf'); flash('DXF CAD diunduh'); };
  const dlAi = () => {
    const doc = VE.parseSVG(sess.svg);
    atDownload(baseName + '.ai', VE.exportAI(doc, {}), 'application/pdf');
    flash('Adobe Illustrator (.AI) diunduh');
  };
  const dlEps = () => {
    const doc = VE.parseSVG(sess.svg);
    atDownload(baseName + '.eps', VE.exportEPS(doc, {}), 'application/postscript');
    flash('PostScript (.EPS) diunduh');
  };
  return (<div className={'at-actions' + (compact ? ' compact' : '')}><button type="button" className="btn pri" data-tip="atExpSvg" onClick={dlSvg}><Ico n="download" size={14} /> SVG</button><button type="button" className="btn sec" data-tip="atExpCopy" onClick={() => atCopy(sess.svg, flash)}><Ico n="copy" size={14} /> Salin SVG</button><button type="button" className="btn sec" data-tip="atExpPng" onClick={dlPng}><Ico n="image" size={14} /> PNG 2x</button><button type="button" className="btn sec" data-tip="atExpDxf" onClick={dlDxf}><Ico n="download" size={14} /> DXF</button><button type="button" className="btn sec" data-tip="atExpAi" onClick={dlAi}><Ico n="download" size={14} /> AI</button><button type="button" className="btn sec" data-tip="atExpEps" onClick={dlEps}><Ico n="download" size={14} /> EPS</button></div>);
};

/* =====================================================================
   ReviewScreen — Layar Ulasan Interaktif (Dengan Tab Proses Tracing Real-Time
   & Tab Bandingkan Hasil Split/Outline)
   ===================================================================== */
const ReviewScreen = ({
  sess, onUpdateSess, onRetracePalette, onSyncJobPalette,
  maxColorEnabled, maxColors, onMaxColorChange, gradientMode, onGradientModeChange,
  job, fileName, cfgUsed, dxfMode, onRetry, onSegEdit, onNodeEdit, onOpenAdvWizard, initialTab, onTabChange, flash, onUploadNew, onOpenSettings, onPasteImage
}) => {
  const [activeTab, setActiveTabState] = useState(() => initialTab || (VMT.getTraceCtrl().holdOnComplete !== false ? 'trace' : 'compare'));
  const setActiveTab = t => { setActiveTabState(t); if (onTabChange) onTabChange(t); };
  const [bgPickMode, setBgPickMode] = useState(false);
  const [hlLabel, setHlLabel] = useState(null); /* [HL-COLOR] indeks palet yang sedang disorot */
  const hlHexRev = hlLabel != null && sess.palette && sess.palette[hlLabel] ? sess.palette[hlLabel].hex : null;
  const [stackMode, setStackMode] = useState(sess.stackMode || (cfgUsed && cfgUsed.stackMode) || 'stack');
  const [strokeOn, setStrokeOn] = useState(sess.stroke != null ? sess.stroke : (cfgUsed ? cfgUsed.stroke !== false : true));
  const hiddenLabels = sess.hiddenLabels || [];
  const initPalRef = useRef(null);
  if (!initPalRef.current && sess && sess.palette) {
    initPalRef.current = sess.palette.map(c => c.hex.toLowerCase());
  }
  const [palEdited, setPalEdited] = useState(false);
  const [pendingPal, setPendingPal] = useState(null); /* palet hasil tambah/hapus warna yang menunggu tombol Trace Ulang */
  const wideScr = rvUseWide(1000);
  const [sideOpen, setSideOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000);
  const [exportOpen, setExportOpen] = useState(false);
  rvUseBodyFlag();
  useEffect(() => {
    if (!exportOpen) return;
    const h = e => { if (!(e.target && e.target.closest && e.target.closest('.rv-export'))) setExportOpen(false); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [exportOpen]);

  const rebuildSvg = (nextHidden, nextStack, nextStroke, customRegs = null, customPal = null) => {
    const useRegs = customRegs || sess.regs;
    const usePal = customPal || sess.palette;
    const svg = VMT.assembleSVG(useRegs, sess.W, sess.H, {
      stackMode: nextStack,
      stroke: nextStroke,
      bg: 'none',
      safetyBg: nextHidden.length === 0 && !(sess.stats && sess.stats.alpha && sess.stats.alpha.hasAlpha),
      hiddenLabels: nextHidden,
    });
    if (sess.traceHistory) {
      sess.traceHistory.svg = svg;
      sess.traceHistory.regs = useRegs;
      sess.traceHistory.palette = usePal;
      if (sess.traceHistory.bezierLoops) {
        sess.traceHistory.bezierLoops = sess.traceHistory.bezierLoops.map(bl => ({
          ...bl,
          color: (usePal[bl.label] && usePal[bl.label].hex) || bl.color
        }));
      }
      if (sess.traceHistory.paletteProbes) {
        sess.traceHistory.paletteProbes = sess.traceHistory.paletteProbes.map((pr, idx) =>
          usePal[idx] ? { ...pr, hex: usePal[idx].hex, r: usePal[idx].r, g: usePal[idx].g, b: usePal[idx].b } : pr
        );
      }
    }
    onUpdateSess({ ...sess, svg, regs: useRegs, palette: usePal, hiddenLabels: nextHidden, stackMode: nextStack, stroke: nextStroke });
  };

  const handlePaletteChange = newHexes => {
    if (!newHexes || !newHexes.length) return;
    setPalEdited(true);
    const curHexes = sess.palette.map(c => c.hex.toLowerCase());
    /* Tambah/hapus warna (atau sedang ada perubahan tertunda): jangan trace otomatis, tunggu tombol Trace Ulang */
    if (pendingPal || newHexes.length !== curHexes.length) {
      setPendingPal(newHexes.map(h => h.toLowerCase()));
      return;
    }
    /* Ubah warna pada jumlah yang sama: perbarui warna SVG secara instan tanpa mengubah geometri */
    if (onSyncJobPalette) onSyncJobPalette(newHexes);
    const nextPal = sess.palette.map((c, i) => {
      const hx = newHexes[i].toLowerCase();
      const [r, g, b] = VMT.rgbOf(hx);
      return { ...c, r, g, b, hex: VMT.hexOf(r, g, b) };
    });
    const nextRegs = sess.regs.map(rg => ({
      ...rg,
      color: (nextPal[rg.label] && nextPal[rg.label].hex) || rg.color
    }));
    rebuildSvg(hiddenLabels, stackMode, strokeOn, nextRegs, nextPal);
  };

  const handlePaletteGradChange = (labelIdx, newGrad, midHex) => {
    setPalEdited(true);
    if (!newGrad || !newGrad.stops || newGrad.stops.length < 2) {
      const curCol = sess.palette[labelIdx];
      const baseHx = (midHex || (curCol && curCol.hex) || '#000000').toLowerCase();
      const [r, g, b] = VMT.rgbOf(baseHx);
      const nextPal = sess.palette.map((c, i) => i === labelIdx ? {
        ...c, r, g, b, hex: VMT.hexOf(r, g, b), isGradient: false, grad: null, userGrad: null
      } : c);
      const nextRegs = sess.regs.map(rg => {
        if (rg.label !== labelIdx) return rg;
        return {
          ...rg,
          color: baseHx,
          grad: null,
          loops: (rg.loops || []).map(lp => lp.grad ? { ...lp, grad: null } : lp)
        };
      });
      rebuildSvg(hiddenLabels, stackMode, strokeOn, nextRegs, nextPal);
      return;
    }
    const baseHx = (midHex || newGrad.base || newGrad.stops[0].color || '#000000').toLowerCase();
    const [r, g, b] = VMT.rgbOf(baseHx);
    const userG = { ...newGrad, base: baseHx, userCreated: true, stops: newGrad.stops.map(s => ({ ...s })) };
    const nextPal = sess.palette.map((c, i) => i === labelIdx ? {
      ...c, r, g, b, hex: VMT.hexOf(r, g, b), isGradient: true, grad: userG, userGrad: userG,
      ...(newGrad.opacity != null ? { opacity: newGrad.opacity } : {})
    } : c);
    const nextRegs = sess.regs.map(rg => {
      if (rg.label !== labelIdx) return rg;
      const updGrad = g => g ? { ...g, ...userG, stops: userG.stops.map(s => ({ ...s })) } : { ...userG };
      return {
        ...rg,
        color: baseHx,
        ...(newGrad.opacity != null ? { opacity: newGrad.opacity } : {}),
        grad: updGrad(rg.grad),
        loops: (rg.loops || []).map(lp => ({
          ...lp,
          ...(newGrad.opacity != null ? { opacity: newGrad.opacity } : {}),
          grad: updGrad(lp.grad)
        }))
      };
    });
    rebuildSvg(hiddenLabels, stackMode, strokeOn, nextRegs, nextPal);
  };

  const handlePaletteOpacityChange = (labelIdx, nextOp) => {
    setPalEdited(true);
    const clOp = VMT.clamp(nextOp == null ? 1 : +nextOp, 0, 1);
    const nextPal = sess.palette.map((c, i) => i === labelIdx ? {
      ...c,
      opacity: clOp,
      grad: c.grad ? { ...c.grad, opacity: clOp } : null
    } : c);
    const nextRegs = sess.regs.map(rg => {
      if (rg.label !== labelIdx) return rg;
      return {
        ...rg,
        opacity: clOp,
        grad: rg.grad ? { ...rg.grad, opacity: clOp } : null,
        loops: (rg.loops || []).map(lp => ({
          ...lp,
          opacity: clOp,
          grad: lp.grad ? { ...lp.grad, opacity: clOp } : null
        }))
      };
    });
    rebuildSvg(hiddenLabels, stackMode, strokeOn, nextRegs, nextPal);
  };

  const handlePaletteRetrace = () => {
    if (!pendingPal || !onRetracePalette) return;
    const h = pendingPal;
    setPendingPal(null);
    onRetracePalette(h);
  };

  const handlePaletteDiscard = () => {
    setPendingPal(null);
    setPalEdited(!!(job && job.userPalette));
    flash('Perubahan palet dibatalkan');
  };

  const handlePaletteReset = () => {
    const baseHexes = (job && job.autoPalette && job.autoPalette.length) ? job.autoPalette : (initPalRef.current || []);
    if (!baseHexes.length) return;
    setPalEdited(false);
    setPendingPal(null);
    if (onSyncJobPalette) onSyncJobPalette(null);
    if (baseHexes.length === sess.palette.length) {
      const nextPal = sess.palette.map((c, i) => {
        const hx = baseHexes[i].toLowerCase();
        const [r, g, b] = VMT.rgbOf(hx);
        return { ...c, r, g, b, hex: VMT.hexOf(r, g, b) };
      });
      const nextRegs = sess.regs.map(rg => ({
        ...rg,
        color: (nextPal[rg.label] && nextPal[rg.label].hex) || rg.color
      }));
      rebuildSvg(hiddenLabels, stackMode, strokeOn, nextRegs, nextPal);
      flash('Palet warna dikembalikan ke warna otomatis');
    } else {
      /* Jumlah warna berbeda: siapkan sebagai perubahan tertunda, trace ulang manual */
      setPendingPal(baseHexes.map(h => h.toLowerCase()));
      setPalEdited(true);
    }
  };

  const toggleLabel = labelIdx => {
    const set = new Set(hiddenLabels);
    if (set.has(labelIdx)) { set.delete(labelIdx); flash('Region warna ditampilkan kembali'); }
    else { set.add(labelIdx); flash('Warna dijadikan background transparan'); }
    rebuildSvg([...set], stackMode, strokeOn);
  };

  const toggleByDocCoord = (docX, docY) => {
    const wx = VMT.clamp(Math.floor(docX / sess.scale), 0, sess.w - 1);
    const wy = VMT.clamp(Math.floor(docY / sess.scale), 0, sess.h - 1);
    const L = sess.labels[wy * sess.w + wx];
    if (L >= 0) toggleLabel(L);
  };

  const dockExtra = (<React.Fragment><span className="rv-sep" /><button type="button" data-tip="atRevBgPick" className={'rv-btn' + (bgPickMode ? ' on' : '')} onClick={() => setBgPickMode(!bgPickMode)}><Ico n="pipette" size={14} /> {bgPickMode ? 'Selesai' : 'Hapus latar'}</button><button type="button" data-tip="atRevSegEdit" className="rv-btn" onClick={onSegEdit}><Ico n="brush" size={14} /> Segmentasi</button>{onNodeEdit && <button type="button" data-tip="atRtTabNodeEdit" className="rv-btn" onClick={onNodeEdit}><Ico n="vector" size={14} /> Vector Editor</button>}<span className="rv-sep" /><Seg o={[['stack', 'Stack'], ['cutout', 'Cut-out'], ['grouped', 'Grouped']]} v={stackMode} tips={{
    stack: 'atStack_stack',
    cutout: 'atStack_cutout',
    grouped: 'atStack_grouped'
  }} on={m => {
    setStackMode(m);
    rebuildSvg(hiddenLabels, m, strokeOn);
  }} /><AtCheck tip="atStrokeToggle" checked={strokeOn} onChange={val => {
    setStrokeOn(val);
    rebuildSvg(hiddenLabels, stackMode, val);
  }}>Stroke anti-celah</AtCheck></React.Fragment>);

  return ReactDOM.createPortal((<div className="rv-root">{activeTab === 'trace' ? <RealTimeTraceStudio prog={{
    stage: 'done',
    frac: 1,
    detail: 'Vektorisasi selesai',
    viz: sess.traceHistory
  }} job={job} sess={sess} isFinished={true} onSwitchToCompare={() => setActiveTab('compare')} onSegEdit={onSegEdit} onRetry={onRetry} onOpenAdvWizard={onOpenAdvWizard} onPaletteChange={handlePaletteChange} onPaletteGradChange={handlePaletteGradChange} onPaletteOpacityChange={handlePaletteOpacityChange} onPaletteReset={handlePaletteReset} pendingPal={pendingPal} onPaletteRetrace={handlePaletteRetrace} onPaletteDiscard={handlePaletteDiscard} paletteEdited={palEdited || !!(job && job.userPalette)} maxColorEnabled={maxColorEnabled} maxColors={maxColors} onMaxColorChange={onMaxColorChange} gradientMode={gradientMode} onGradientModeChange={onGradientModeChange} hiddenLabels={hiddenLabels} onToggleNone={toggleLabel} hlLabel={hlLabel} onHlChange={setHlLabel} fileName={fileName} dxfMode={dxfMode} flash={flash} /> : <div className={'rv-stage' + (sideOpen && wideScr ? ' side-open' : '')}><CompareView imgUrl={job.url} imgElem={job.img} svg={sess.svg} regs={sess.regs} hiddenLabels={hiddenLabels} W={sess.W} H={sess.H} bgPickMode={bgPickMode} onToggleBgLabel={toggleByDocCoord} highlightLabel={hlHexRev ? hlLabel : null} highlightHex={hlHexRev} floating={true} pad={{
      t: 64,
      r: sideOpen && wideScr ? 352 : 0,
      b: 108,
      l: 0
    }} dockExtra={dockExtra} /><RvSide open={sideOpen} onToggle={() => setSideOpen(o => !o)} icon="layers" title="Ringkasan hasil" sub={sess.palette.length + ' warna · ' + (sess.regs.length - hiddenLabels.length) + ' region aktif'}><ResultStats sess={sess} job={job} flash={flash} hiddenLabels={hiddenLabels} onToggleLabel={toggleLabel} hlLabel={hlLabel} onHlChange={setHlLabel} onPaletteChange={handlePaletteChange} onPaletteGradChange={handlePaletteGradChange} onPaletteOpacityChange={handlePaletteOpacityChange} onPaletteReset={handlePaletteReset} pendingPal={pendingPal} onPaletteRetrace={handlePaletteRetrace} onPaletteDiscard={handlePaletteDiscard} paletteEdited={palEdited || !!(job && job.userPalette)} maxColorEnabled={maxColorEnabled} maxColors={maxColors} onMaxColorChange={onMaxColorChange} gradientMode={gradientMode} onGradientModeChange={onGradientModeChange} /></RvSide></div>}<div className="rv-top"><div className="rv-tabs rv-glass" role="tablist"><button type="button" role="tab" aria-selected={activeTab === 'trace'} data-tip="atRtTabProcess" className={'rv-tab' + (activeTab === 'trace' ? ' on' : '')} onClick={() => setActiveTab('trace')}><Ico n="layers" size={14} /><span>Alur 7 tahap</span></button>{onSegEdit && <button type="button" className="rv-tab" title="Edit segmen" aria-label="Edit segmen" onClick={onSegEdit}><Ico n="brush" size={14} /><span>Edit segmen</span></button>}{onNodeEdit && <button type="button" className="rv-tab" data-tip="atRtTabNodeEdit" title="Vector Editor" aria-label="Vector Editor" onClick={onNodeEdit}><Ico n="vector" size={14} /><span>Vector Editor</span></button>}<button type="button" role="tab" aria-selected={activeTab === 'compare'} data-tip="atRtTabCompare" className={'rv-tab' + (activeTab === 'compare' ? ' on' : '')} onClick={() => setActiveTab('compare')}><Ico n="eye" size={14} /><span>Bandingkan</span></button></div><div className="rv-acts rv-glass"><div className="rv-export"><button type="button" className="rv-exp" aria-expanded={exportOpen} onClick={() => setExportOpen(o => !o)}><Ico n="download" size={14} /> Ekspor</button>{exportOpen && <div className="rv-pop rv-glass"><ExportActions sess={sess} fileName={fileName} dxfMode={dxfMode} flash={flash} compact={true} /></div>}</div>{onPasteImage && <button type="button" className="rv-ibtn" data-tip="atPasteImg" onClick={onPasteImage} aria-label="Tempel gambar dari clipboard"><Ico n="copy" size={16} /></button>}<button type="button" className="rv-ibtn" data-tip="atRevRetry" onClick={onRetry} aria-label="Konfigurasi dan trace ulang"><Ico n="refresh" size={16} /></button><button type="button" className="rv-ibtn" data-tip="atUploadNew" onClick={onUploadNew} aria-label="Upload gambar baru"><Ico n="upload" size={16} /></button><button type="button" className="rv-ibtn" data-tip="atHwSettings" onClick={onOpenSettings} aria-label="Pengaturan"><Ico n="settings" size={16} /></button></div></div></div>), document.body);
};

export { ExportActions, ReviewScreen };
