import React, { useState, useEffect } from 'react';
import { VMT } from '../engine/VmtEngine.jsx';
import { Ico, Slider } from './CommonControls.jsx';
import { AtRow, AtNum, AtToggle } from './TraceSharedUI.jsx';
import { Seg } from './ColorPicker.jsx';

/* ---------- Panel & Modal Pengaturan Hardware, RAM, CPU Core, Multi-Thread & VGA ---------- */
const useHwConfig = () => {
  const [hw, setHw] = useState(() => VMT.getHwConfig());
  useEffect(() => VMT.subscribeHwConfig(setHw), []);
  const update = patch => VMT.setHwConfig(patch);
  const reset = () => VMT.resetHwConfig();
  return [hw, update, reset];
};

const fmtRam = mb => mb >= 1024 ? (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1) + ' GB (' + mb + ' MB)' : mb + ' MB';
const fmtRamShort = mb => mb >= 1024 ? (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1) + ' GB' : mb + ' MB';

const AtHwSettingsPanel = ({ flash }) => {
  const [hw, setHw, resetHw] = useHwConfig();
  const info = VMT.getHwInfo();
  const caps = VMT.MemPool.computeRamCaps(840);

  const maxCoreLimit = Math.max(16, info.logicalCores * 2);
  const halfCores = Math.max(1, Math.floor(info.logicalCores / 2));

  return (<div className="space-y-3 fade"><div className="at-hw-grid"><div className="at-hw-stat"><div className="at-hw-stat-top"><span>ALOKASI RAM TRACING</span><Ico n="memory" size={14} /></div><div className="at-hw-stat-val">{fmtRamShort(hw.ramMb)}</div><div className="at-hw-stat-sub">Sistem: ~{info.devMemGb} GB · Pool maks {caps.effMaxDim}px</div></div><div className="at-hw-stat"><div className="at-hw-stat-top"><span>CPU & MULTI-THREAD</span><Ico n="chip" size={14} /></div><div className="at-hw-stat-val">{hw.multiThread ? hw.cpuCores + ' Core Aktif' : 'Single Thread (1 Core)'}</div><div className="at-hw-stat-sub">Terdeteksi: {info.logicalCores} Logical Processors</div></div><div className="at-hw-stat"><div className="at-hw-stat-top"><span>AKSELERASI VGA / GPU</span><Ico n="bolt" size={14} /></div><div className="at-hw-stat-val">{hw.useGpu && info.gpu.available ? info.gpu.webgl2 ? 'VGA WebGL2 Aktif' : 'VGA WebGL Aktif' : 'Nonaktif (CPU)'}</div><div className="at-hw-stat-sub" title={info.gpu.renderer}>{info.gpu.renderer}</div></div></div><div className="at-hw-sec"><div className="at-hw-sec-h"><div className="at-hw-sec-t"><Ico n="memory" size={16} /><span>1 · Alokasi RAM Saat Proses Tracing</span></div><span className="at-rec-badge">{hw.ramMode === 'auto' ? 'Otomatis' : 'Manual'} · {fmtRam(hw.ramMb)}</span></div><AtRow tip="atHwRamMode" t="Mode Alokasi Memori RAM" d="Otomatis menyesuaikan RAM perangkat atau atur kuota buffer tracing secara manual"><Seg tip="atHwRamMode" o={[['auto', 'Otomatis'], ['custom', 'Manual / Kustom']]} v={hw.ramMode} on={m => {
        setHw({
          ramMode: m
        });
        flash && flash(m === 'auto' ? 'Alokasi RAM diatur ke Otomatis' : 'Mode Alokasi RAM Manual aktif');
      }} /></AtRow><AtRow tip="atHwRamSlider" t="Kapasitas RAM untuk Tracing" d={`Mengatur ukuran MemPool TypedArray, sampel warna CIE-Lab (${caps.maxPaletteSamples || caps.maxSamples} sampel), dan batas resolusi kerja (${caps.effMaxDim} px)`}><div className="flex items-center gap-2 flex-wrap"><Slider tip="atHwRamSlider" min={128} max={16384} step={128} value={hw.ramMb} on={v => setHw({
          ramMode: 'custom',
          ramMb: v
        })} style={{
          width: 170
        }} /><AtNum tip="atHwRamSlider" v={hw.ramMb} min={128} max={16384} step={128} on={v => setHw({
          ramMode: 'custom',
          ramMb: v
        })} /></div></AtRow><div className="at-hw-meter"><div className="at-hw-meter-f" style={{
        width: Math.min(100, Math.max(4, hw.ramMb / 8192 * 100)) + '%'
      }} /></div><div className="flex items-center justify-between gap-2 flex-wrap mt-2"><span className="text-[11px] mut">Preset cepat alokasi RAM:</span><div className="ved-pills">{[[256, '256 MB'], [512, '512 MB'], [1024, '1 GB'], [2048, '2 GB'], [4096, '4 GB'], [8192, '8 GB'], [16384, '16 GB']].map(([mb, lb]) => <button key={mb} type="button" data-tip="atHwRamPreset" className={'ved-pill' + (hw.ramMb === mb ? ' on' : '')} onClick={() => {
          setHw({
            ramMode: 'custom',
            ramMb: mb
          });
          flash && flash('Alokasi RAM disetel ke ' + lb);
        }}>{lb}</button>)}</div></div></div><div className="at-hw-sec"><div className="at-hw-sec-h"><div className="at-hw-sec-t"><Ico n="chip" size={16} /><span>2 · Pengaturan CPU Core & Multi-Thread (Web Worker Pool)</span></div><span className="at-rec-badge solid">{hw.multiThread ? 'Multi-Thread ON · ' + hw.cpuCores + ' Core' : 'Single-Thread (1 Core)'}</span></div><AtRow tip="atHwMultiThread" t="Support Multi-Thread (Parallel Web Workers)" d="Memecah beban Bilateral Filter, Gradien Scharr 2D, MRF Potts, Conjugate Gradient Smoothing, dan Fitting Kurva B\xE9zier ke banyak thread CPU secara paralel"><AtToggle tip="atHwMultiThread" on={hw.multiThread} act={on => {
        const nextCores = on ? Math.max(2, info.logicalCores) : 1;
        setHw({
          multiThread: on,
          cpuCores: nextCores
        });
        flash && flash(on ? `Multi-Thread diaktifkan (${nextCores} CPU Core)` : 'Multi-Thread dinonaktifkan (Single Core)');
      }} label="Support Multi-Thread" /></AtRow><div className={'at-collapse' + (hw.multiThread ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atHwCpuCores" t={`Jumlah CPU Core / Worker Threads (Terdeteksi: ${info.logicalCores} Core)`} d="Jumlah worker thread paralel yang dieksekusi bersamaan saat proses tracing"><div className="flex items-center gap-2 flex-wrap"><Slider tip="atHwCpuCores" min={1} max={maxCoreLimit} step={1} value={hw.cpuCores} on={v => setHw({
              multiThread: v > 1,
              cpuCores: v
            })} style={{
              width: 170
            }} /><AtNum tip="atHwCpuCores" v={hw.cpuCores} min={1} max={maxCoreLimit} step={1} on={v => setHw({
              multiThread: v > 1,
              cpuCores: v
            })} /></div></AtRow><div className="at-hw-cores">{Array.from({
            length: Math.min(16, maxCoreLimit)
          }, (_, i) => <button key={i} type="button" data-tip="atHwCpuCores" onClick={() => setHw({
            multiThread: i + 1 > 1,
            cpuCores: i + 1
          })} className={'at-hw-core' + (i < hw.cpuCores ? ' on' : '')}>C{i + 1}</button>)}</div><div className="flex items-center justify-between gap-2 flex-wrap mt-2.5"><span className="text-[11px] mut">Preset alokasi CPU Core:</span><div className="ved-pills">{[[1, '1 Core (Single)'], [halfCores, `Separuh (${halfCores} Core)`], [info.logicalCores, `Semua Core (${info.logicalCores} Core)`], [Math.min(32, info.logicalCores * 2), `Hyper-Thread (${Math.min(32, info.logicalCores * 2)} Thread)`]].map(([c, lb], idx) => <button key={idx} type="button" data-tip="atHwCpuPreset" className={'ved-pill' + (hw.cpuCores === c ? ' on' : '')} onClick={() => {
              setHw({
                multiThread: c > 1,
                cpuCores: c
              });
              flash && flash(`CPU disetel ke ${c} Core`);
            }}>{lb}</button>)}</div></div><AtRow tip="atHwThreadPrio" t="Prioritas & Kecepatan Eksekusi Thread" d="Turbo memangkas jeda transisi antar-tahap agar multi-core menyelesaikan tracing secepat mungkin"><Seg tip="atHwThreadPrio" o={[['turbo', 'Turbo (Cepat)'], ['balanced', 'Balanced'], ['eco', 'Eco (Hemat)']]} v={hw.threadPriority || 'turbo'} on={v => setHw({
            threadPriority: v
          })} /></AtRow></div></div></div><div className="at-hw-sec"><div className="at-hw-sec-h"><div className="at-hw-sec-t"><Ico n="bolt" size={16} /><span>3 · Pengaturan VGA / Akselerasi GPU (WebGL2 / WebGPU)</span></div><span className="at-rec-badge">{hw.useGpu && info.gpu.available ? 'VGA Aktif' : 'CPU Saja'}</span></div><div className="at-note" style={{
      marginTop: 0
    }}><div><b>VGA Terdeteksi:</b> {info.gpu.renderer}</div><div className="text-[11px] mut mt-0.5">Vendor: {info.gpu.vendor} · WebGL2: {info.gpu.webgl2 ? 'Didukung' : 'Fallback WebGL1'} · Float32 FBO: {info.gpu.colorBufferFloat ? 'Aktif (RGBA32F)' : 'RGBA8'} · WebGPU: {info.gpu.webgpu ? 'Tersedia' : 'Fallback WebGL2'} · OffscreenCanvas: {info.gpu.offscreenCanvas ? 'Didukung' : 'Main-Thread'} · Max Texture: {info.gpu.maxTexSize}×{info.gpu.maxTexSize} px</div><div className="text-[11px] mt-1.5 pt-1.5" style={{
        borderTop: '1px dashed var(--line)',
        color: 'var(--acc)'
      }}><b>Pipeline GPU Tahap 1–5 Lengkap (Full End-to-End Zero-Copy VRAM):</b> 11 Slot Menetap (<code>texRawRGBA</code>, <code>texFltRGBA</code>, <code>texLabGrad</code>, <code>texEdgeField</code>, <code>texTensor</code>, <code>texFlanks</code>, <code>texPalLut</code>, <code>texLabelsA/B</code>, <code>bufVerticesA/B</code>) · Kernel Aktif: <b>Alpha Defringing 7×7</b>, <b>Bilateral Corner-Preserving 5×5</b>, <b>DiZenzo Scharr 2D Tensor</b>, <b>Structure Tensor 3×3</b>, <b>Normal-Ray Flank Unmixing</b>, <b>4-Color Chromatic MRF Potts + 9-Bit Topological Invariant</b>, <b>Morphological/Ribbon Clean</b>, <b>Planar Vertex Beach Deconvolution</b>, <b>Staircase Despeckle + Multi-Scale Savitzky-Golay Fairing</b>, <b>4th-Order Elastica Relaxation</b>, <b>Gauss-Newton Cubic Bézier Batch Fitting</b> & <b>Closed-Loop CIEDE2000/Boundary-IoU Evaluator</b> · Kuota VRAM: <b>{VMT.GPUMemPool.getStats().vramBudgetMb} MB</b> (Terpakai: <b>{VMT.GPUMemPool.getStats().currentVramMb} MB</b> / Puncak: <b>{VMT.GPUMemPool.getStats().peakVramMb} MB</b>)</div></div><AtRow tip="atHwUseGpu" t="Pakai VGA Saat Proses Tracing" d="Jalankan shader GLSL pada kartu grafis (VGA) untuk mempercepat Bilateral Edge-Preserving Pre-Filter dan komputasi piksel"><AtToggle tip="atHwUseGpu" on={hw.useGpu && info.gpu.available} act={on => {
        if (!info.gpu.available && on) {
          flash && flash('WebGL tidak tersedia di browser ini');
          return;
        }
        setHw({
          useGpu: on
        });
        flash && flash(on ? 'Akselerasi VGA / GPU diaktifkan' : 'Akselerasi VGA dinonaktifkan (Mode CPU)');
      }} label="Pakai VGA" /></AtRow><div className={'at-collapse' + (hw.useGpu && info.gpu.available ? ' open' : '')}><div className="at-collapse-in"><AtRow tip="atHwGpuPower" t="Preferensi Kartu VGA (Power Preference)" d="Pilih VGA Diskrit (Performa Tinggi) atau GPU Terintegrasi (Hemat Daya)"><Seg tip="atHwGpuPower" o={[['high-performance', 'VGA Performa Tinggi'], ['low-power', 'VGA Hemat Daya']]} v={hw.gpuPower || 'high-performance'} on={v => setHw({
            gpuPower: v
          })} /></AtRow><AtRow tip="atHwGpuPipe" t="Cakupan Pipeline Shader VGA" d="Menentukan tahapan komputasi piksel yang didelegasikan ke shader VGA"><Seg tip="atHwGpuPipe" o={[['full', 'Penuh (Shader + Gradien)'], ['filter', 'Bilateral Shader Saja']]} v={hw.gpuPipeline || 'full'} on={v => setHw({
            gpuPipeline: v
          })} /></AtRow></div></div></div><div className="flex items-center justify-between gap-2 flex-wrap pt-1"><div className="flex items-center gap-2 flex-wrap"><button type="button" data-tip="atHwReset" className="btn sec text-xs" onClick={() => {
        resetHw();
        flash && flash('Pengaturan hardware dikembalikan ke default');
      }}><Ico n="reset" size={13} /> Reset Default</button></div></div></div>);
};

export { AtHwSettingsPanel, useHwConfig, fmtRamShort };
