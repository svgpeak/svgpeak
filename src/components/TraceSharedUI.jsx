import React, { useRef, useState, useEffect, useMemo as atUseMemo } from 'react';
import { VMT } from '../engine/VmtEngine.jsx';
import { Ico } from './CommonControls.jsx';

const AT_LS = 'svgpeak-trace-ui-v2';
const AT_PRESETS = 'svgpeak-trace-presets-v1';
const atLoad = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } };
const atSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const atDownload = (name, content, type) => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
};
const atCopy = async (t, flash) => {
  try { await navigator.clipboard.writeText(t); flash('SVG disalin ke clipboard'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); flash('SVG disalin ke clipboard'); } catch (x) { flash('Gagal menyalin'); }
    ta.remove();
  }
};
const AT_RES_LABELS = {
  original: 'Resolusi Asli',
  high: 'Resolusi Tinggi',
  medium: 'Resolusi Sedang',
  low: 'Resolusi Rendah'
};
const atGetResLabel = mode => AT_RES_LABELS[mode] || 'Resolusi Asli';
const atEnsureWorkSlot = (j, workKey, backupKey, maxDim) => {
  if (!j || !j[workKey]) return null;
  const slot = j[workKey];
  if (!slot._materialized) {
    const built = VMT.makeWork({ img: j.img, w: j.w, h: j.h }, maxDim);
    slot.data = built.data;
    slot.origAlpha = built.origAlpha;
    slot._materialized = true;
    j[backupKey] = built.data.data.slice();
    if (j.work === slot) j.workOrig = j[backupKey];
  }
  return slot;
};
const atEnsureOrigWork = (j, mode = 'original') => {
  if (!j) return null;
  if (mode === 'high') return atEnsureWorkSlot(j, 'highWork', 'highBackup', j.maxHigh);
  if (mode === 'medium') return atEnsureWorkSlot(j, 'medWork', 'medBackup', j.maxMed);
  if (mode === 'low') return j.lowWork;
  return atEnsureWorkSlot(j, 'origWork', 'origBackup', j.maxOrig);
};
const atResetWork = j => {
  if (!j || !j.work) return;
  if (j.work === j.origWork && !j.origWork._materialized) atEnsureOrigWork(j, 'original');
  else if (j.work === j.highWork && !j.highWork._materialized) atEnsureOrigWork(j, 'high');
  else if (j.work === j.medWork && !j.medWork._materialized) atEnsureOrigWork(j, 'medium');
  if (j.work.data && j.workOrig) j.work.data.data.set(j.workOrig);
};

const AT_PIPES = [
  { id: 'auto', icon: 'bolt', t: 'Fully Automatic', d: 'Vektorisasi satu klik. Tipe citra, kualitas & derau, palet warna CIE-Lab, segmentasi MRF Potts, dekonvolusi sub-piksel pantai, dan optimasi kurva Bézier dihitung otomatis.', who: 'Pengguna umum · akurasi tinggi', steps: '1 klik → tinjau hasil' },
  { id: 'basic', icon: 'sliders', t: 'Basic Wizard', d: 'Panduan tanya-jawab terpandu: pilih tipe gambar, atur transparansi, kualitas, mode warna (termasuk rekomendasi otomatis), dan tinjau/edit palet sebelum vektorisasi.', who: 'Desainer grafis umum', steps: '5 langkah → tinjau → ekspor' },
  { id: 'adv', icon: 'chip', t: 'Advanced Wizard', d: 'Kendali matematis penuh: kompensasi alpha, generator palet & komparator kuantisasi, tuning MRF, editor segmentasi piksel, optimasi kontur & Bézier, hingga ekspor CAD/percetakan.', who: 'Profesional sablon · CAD · CNC', steps: '6 tahap mendalam + preset' },
];
const AT_ALGS = [
  ['1 · Bilateral Filter & Klasifikasi', 'Matriks ko-okurensi warna (GLCM 4-arah), entropi spektral, dan penapisan bilateral edge-preserving mencegah ujung goresan kuas memudar menjadi duri tajam (Anti Stroke-End Spiking).'],
  ['2 · Kuantisasi CIE-Lab & Adaptive Layer Difference', 'Seeding K-Means++ bebas-ramp transisi dengan toleransi layer_difference rendah (ΔE ~ 4.2) dan enrichment detail mikro agar gradasi tanah besar & detail tanah kecil tetap utuh.'],
  ['3 · QuadTree & Local-Neighborhood Edge Snapping', 'Dekomposisi blok halus + Local-Neighborhood Edge Snapping yang mengunci piksel transisi anti-aliasing ke warna jangkar tetangga lokal (mencegah bintik krem / False Color Mapping).'],
  ['4 · MRF Potts Adaptif, Morfologi & Sliver Removal', 'Optimasi MRF Potts berbatas kontras palet, filter_speckle rendah (2 px), morphological closing/opening ujung jahitan #, serta penghapusan poligon sliver berasio Area/Perimeter² rendah.'],
  ['5 · Inversi Sub-Piksel "Beach" & Unpin Tangga', 'Dekonvolusi sub-piksel I = α·CA + (1−α)·CB dengan pelepasan kunci anak-tangga (staircase unpinning) agar bayangan tanah & bawah karung yang melengkung tidak patah-patah.'],
  ['6 · Graf Planar & Pemangkasan Duri Batas', 'Penelusuran half-edge terarah dengan verteks bersama, penguncian T-junctions, dan pemangkasan duri celah batas (Boundary Sliver Artifact filter).'],
  ['7 · Multi-Scale Curvature Extrema & CG Smoother', 'Deteksi kelengkungan (curvature extrema) multi-skala mengunci titik ujung daun hijau & outline atas (C⁰) sekaligus membulatkan ujung kuas jahitan # (G¹) dan meluruhkan tangga.'],
  ['8 · Fitting Bézier Kubik Presisi Tinggi', 'Toleransi RDP (ε) rendah & fitting kurva Bézier kubik G¹ ketat dengan re-parameterisasi Gauss-Newton agar lengkungan bayangan dan kontur organik mulus tanpa polygonal faceting.'],
];
const AT_TYPE_OPTS = [
  { id: 'auto', t: 'Otomatis', d: 'Mesin mengklasifikasikan sendiri (GLCM + entropi + Scharr 2D)' },
  { id: 'blended', t: 'Artwork with Blended Edges', d: 'Logo/ilustrasi dengan tepi anti-aliasing yang halus' },
  { id: 'aliased', t: 'Artwork without Blended Edges', d: 'Pixel art / tangkapan layar tajam tanpa anti-aliasing' },
  { id: 'photo', t: 'Photograph', d: 'Foto natural dengan variasi warna kompleks' },
];
const AT_ALPHA_OPTS = [
  { id: 'keep', t: 'Biarkan transparan', d: 'Area transparan tidak ditrace + un-premultiply halo tepi' },
  { id: 'white', t: 'Ratakan ke putih', d: 'Alpha flattening + defringing halo ke putih' },
  { id: 'custom', t: 'Ratakan ke warna kustom', d: 'Pilih warna latar kustom untuk flattening' },
];
const AT_COLOR_MODES = [
  { id: 'two', icon: 'contrast', t: 'Two Colors', d: 'Reduksi biner: dua warna dominan berkontras tinggi (ideal untuk siluet, line art, stempel, & logo monokrom)' },
  { id: 'auto', icon: 'sparkle', t: 'Automatic Colors', d: 'Deteksi jumlah warna optimal secara otomatis via evaluasi statistik BIC/MDL di ruang perseptual CIE-Lab' },
  { id: 'custom', icon: 'palette', t: 'Custom Colors', d: 'Kunci daftar palet kustom: tambah warna otomatis yang terdeteksi dari gambar, ubah warna, atau gabungkan warna mirip' },
  { id: 'unlimited', icon: 'layers', t: 'Unlimited Colors', d: 'Alokasi warna dinamis maksimal dengan sensitivitas tinggi untuk menangkap gradasi halus & variasi warna kaya' },
];

/* ---------- Komponen Input Kustom (Pengganti Native HTML Input) ---------- */
const AtOptCard = ({ on, t, d, icon, rec, recLabel, tip, onClick }) => (<button type="button" data-tip={tip} onClick={onClick} className={'at-opt' + (on ? ' on' : '')}>{icon && <span className="at-opt-ic"><Ico n={icon} size={18} /></span>}<span className="at-opt-tx"><span className="at-opt-t"><span>{t}</span>{rec && <span className="at-rec-badge">★ {recLabel || 'Direkomendasikan'}</span>}</span>{d && <span className="at-opt-d">{d}</span>}</span><span className={'at-radio' + (on ? ' on' : '')}>{on && <Ico n="check" size={12} />}</span></button>);

const AtRow = ({ t, d, tip, children }) => (<div className="at-row" data-tip={tip}><div className="at-row-tx"><div className="at-row-t">{t}</div>{d && <div className="at-row-d">{d}</div>}</div><div className="at-row-ct">{children}</div></div>);

/* Stepper Angka Kustom: mendukung klik −/+, geser horizontal (scrub), dan panah keyboard tanpa <input type="number"> */
const AtNum = ({ v, min, max, step = 1, on, tip }) => {
  const dragRef = useRef(null);
  const clampV = x => VMT.clamp(Math.round((x - min) / step) * step + min, min, max);
  const onDown = e => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    dragRef.current = { x0: e.clientX, v0: v };
  };
  const onMove = e => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x0;
    const delta = Math.round(dx / 6) * step;
    const nv = clampV(dragRef.current.v0 + delta);
    if (nv !== v) on(nv);
  };
  const onUp = () => { dragRef.current = null; };
  const onKey = e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); on(clampV(v + (e.shiftKey ? step * 5 : step))); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); on(clampV(v - (e.shiftKey ? step * 5 : step))); }
    else if (e.key === 'Home') { e.preventDefault(); on(min); }
    else if (e.key === 'End') { e.preventDefault(); on(max); }
  };
  return (<div className="fld num" style={{
  width: 120
}} data-tip={tip}><button type="button" className="nb" disabled={v <= min} onClick={() => on(clampV(v - step))} aria-label="Kurangi">−</button><div role="spinbutton" tabIndex={0} aria-valuemin={min} aria-valuemax={max} aria-valuenow={v} className="at-num-val" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}>{v}</div><button type="button" className="nb" disabled={v >= max} onClick={() => on(clampV(v + step))} aria-label="Tambah">+</button></div>);
};

const AtToggle = ({ on, act, label, tip }) => (<button type="button" role="switch" data-tip={tip} aria-checked={on} aria-label={label} onClick={() => act(!on)} className={'at-tgl' + (on ? ' on' : '')}><span className="at-tgl-k" /></button>);

/* Checkbox Kustom Material UI 3.0 Modern Minimalist dengan State-Layer Halo & Animasi Checkmark */
const AtCheck = ({ checked, onChange, tip, children, wrap }) => (<button type="button" role="checkbox" data-tip={tip} aria-checked={!!checked} onClick={() => onChange(!checked)} className={'at-chk-btn m3-chk' + (checked ? ' on' : '') + (wrap ? ' wrap' : '')}><span className="m3-chk-target" aria-hidden="true"><span className="m3-chk-halo" /><span className="at-chk-box"><svg className="at-chk-svg" width="12" height="12" viewBox="0 0 18 18" fill="none"><path d="M4.2 9.3L7.5 12.6L13.8 5.5" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" /></svg></span></span><span className="m3-chk-label">{children}</span></button>);

/* Toggle modern: ikon + label, tanpa kotak centang — dipakai untuk opsi tampilan kanvas (Simpul & handle, Kisi) */
const AtViewToggle = ({ checked, onChange, tip, icon, children }) => (<button type="button" role="switch" data-tip={tip} aria-checked={!!checked} onClick={() => onChange(!checked)} className={'at-vt' + (checked ? ' on' : '')}><Ico n={icon} size={14} /><span>{children}</span></button>);

/* Kotak Teks Kustom tanpa <input> native (untuk Nama Preset) */
const AtTextBox = ({ value, onChange, placeholder, onEnter, tip }) => {
  const edRef = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const el = edRef.current;
    if (el && el.textContent !== value) el.textContent = value || '';
  }, [value]);
  return (<div className={'at-txtbox' + (focused ? ' focus' : '')} data-tip={tip} onClick={() => edRef.current && edRef.current.focus()}><Ico n="sparkle" size={14} /><div ref={edRef} role="textbox" contentEditable={true} spellCheck={false} data-placeholder={placeholder || 'Ketik nama preset…'} className="at-txtbox-ed" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onInput={e => onChange(e.currentTarget.textContent || '')} onKeyDown={e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onEnter) onEnter();
    }
    e.stopPropagation();
  }} />{value && <button type="button" className="at-chip-x" onClick={e => {
    e.stopPropagation();
    onChange('');
    if (edRef.current) edRef.current.textContent = '';
  }} aria-label="Bersihkan"><Ico n="x" size={11} /></button>}</div>);
};

const AtEmpty = ({ icon, t, d, children }) => (<div className="at-empty"><span className="at-empty-ic"><Ico n={icon} size={26} /></span><div className="at-empty-t">{t}</div>{d && <div className="at-empty-d">{d}</div>}{children}</div>);

/* Pan/Zoom di CompareView & SegEditor:
   Karena kanvas merender relatif terhadap pusat (cw/2 + v.tx, ch/2 + v.ty),
   koordinat (dx, dy) yang dikirim ke zoomAt adalah offset relatif terhadap PUSAT kanvas (0,0 = pusat)! */
const atUsePanZoom = () => {
  const [v, setV] = useState({ z: 1, tx: 0, ty: 0 });
  const vRef = useRef(v);
  const api = atUseMemo(() => ({
    vRef,
    zoomAt(dx, dy, nz, cur) {
      const c = cur || vRef.current;
      nz = VMT.clamp(nz, 0.1, 60);
      const k = nz / c.z;
      const next = { z: nz, tx: dx - (dx - c.tx) * k, ty: dy - (dy - c.ty) * k };
      vRef.current = next;
      setV(next);
    },
    pan(dx, dy) {
      const c = vRef.current;
      const next = { ...c, tx: c.tx + dx, ty: c.ty + dy };
      vRef.current = next;
      setV(next);
    },
    reset() {
      const next = { z: 1, tx: 0, ty: 0 };
      vRef.current = next;
      setV(next);
    },
    set(next) {
      if (typeof next === "function") {
        setV(p => {
          const r = next(vRef.current || p);
          vRef.current = r;
          return r;
        });
      } else if (next) {
        vRef.current = next;
        setV(next);
      }
    },
  }), []);
  return [v, api];
};

export { atUsePanZoom, AtCheck, AtToggle, AtNum, AtRow, AtViewToggle, atDownload, atCopy, atLoad, AT_LS, atSave, AT_TYPE_OPTS, AtOptCard, AT_ALPHA_OPTS, AT_COLOR_MODES, AT_PRESETS, atResetWork, atGetResLabel, AtEmpty, AtTextBox, atEnsureOrigWork, AT_PIPES };
