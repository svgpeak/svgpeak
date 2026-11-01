import React, { useRef, useState, useEffect } from 'react';
import { clampN, hsv2hex, hex2hsv, hex2rgb, rgb2hex, pickScreenColor, Ico, Float, Slider } from './CommonControls.jsx';
import { VMT } from '../engine/VmtEngine.jsx';
import { makeHarmoniousStopHex, M3HexInput } from './ColorPicker.jsx';
import { AtToggle, AtNum } from './TraceSharedUI.jsx';

/* ---------- Chip Pemilih Warna, Linear/Radial Gradient & Transparansi (Universal) ---------- */
const AtColorChip = ({ hex, grad, opacity = 1, onChange, onGradChange, onOpacityChange, onRemove, detectedPool, compact, selected, onSelect, isNone, onToggleNone }) => {
  const btnRef = useRef(null), svRef = useRef(null), actRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [localGrad, setLocalGrad] = useState(() => (grad && grad.stops && grad.stops.length >= 2) ? grad : null);
  const [localOp, setLocalOp] = useState(() => opacity == null ? 1 : clampN(+opacity, 0, 1));
  const latestGradRef = useRef(localGrad);
  const latestOpRef = useRef(localOp);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onGradRef = useRef(onGradChange); onGradRef.current = onGradChange;
  const onOpRef = useRef(onOpacityChange); onOpRef.current = onOpacityChange;

  useEffect(() => {
    if (grad !== undefined) {
      const ng = (grad && grad.stops && grad.stops.length >= 2) ? grad : null;
      latestGradRef.current = ng;
      setLocalGrad(ng);
    }
  }, [grad]);
  useEffect(() => {
    if (opacity !== undefined) {
      const no = clampN(+opacity, 0, 1);
      latestOpRef.current = no;
      setLocalOp(no);
    }
  }, [opacity]);

  const effGrad = localGrad;
  const effOp = localOp;
  const isGrad = !!(effGrad && effGrad.stops && effGrad.stops.length >= 2);
  const [stopIdx, setStopIdx] = useState(0);
  const safeStopIdx = isGrad ? VMT.clamp(stopIdx, 0, effGrad.stops.length - 1) : 0;
  const activeHex = isGrad ? (effGrad.stops[safeStopIdx]?.color || hex) : hex;
  const activeStopOp = isGrad
    ? (effGrad.stops[safeStopIdx]?.op != null ? clampN(+effGrad.stops[safeStopIdx].op, 0, 1) : effOp)
    : effOp;

  const [hsv, setHsv] = useState(() => [0, 0, 0]);
  const [drg, setDrg] = useState(false);
  const [pk, setPk] = useState(false);
  const cur = open ? hsv2hex(hsv[0], hsv[1], hsv[2]) : activeHex;
  useEffect(() => {
    if (!open) return;
    if (activeHex && activeHex.toLowerCase() !== hsv2hex(hsv[0], hsv[1], hsv[2]).toLowerCase()) {
      setHsv(hex2hsv(activeHex));
    }
  }, [open, activeHex, safeStopIdx, isGrad]);

  const rafEmitRef = useRef(0);
  const pendingTaskRef = useRef(null);
  useEffect(() => () => { if (rafEmitRef.current) cancelAnimationFrame(rafEmitRef.current); }, []);

  const scheduleParentNotify = fn => {
    pendingTaskRef.current = fn;
    if (!rafEmitRef.current) {
      rafEmitRef.current = requestAnimationFrame(() => {
        rafEmitRef.current = 0;
        const task = pendingTaskRef.current;
        pendingTaskRef.current = null;
        if (task) task();
      });
    }
  };

  const flushPendingHex = () => {
    if (rafEmitRef.current) {
      cancelAnimationFrame(rafEmitRef.current);
      rafEmitRef.current = 0;
    }
    if (pendingTaskRef.current) {
      const task = pendingTaskRef.current;
      pendingTaskRef.current = null;
      task();
    }
  };

  const commitGrad = (nextG, midHx, immediate = false) => {
    latestGradRef.current = nextG;
    setLocalGrad(nextG);
    const run = () => {
      if (onGradRef.current) onGradRef.current(nextG, midHx);
      else if (midHx && onChangeRef.current) onChangeRef.current(midHx);
    };
    if (immediate) {
      if (rafEmitRef.current) { cancelAnimationFrame(rafEmitRef.current); rafEmitRef.current = 0; }
      pendingTaskRef.current = null;
      run();
    } else {
      scheduleParentNotify(run);
    }
  };

  const commitOpacity = nextAlpha => {
    const cl = clampN(+nextAlpha, 0, 1);
    latestOpRef.current = cl;
    setLocalOp(cl);
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const sIdx = VMT.clamp(stopIdx, 0, gCur.stops.length - 1);
      const nextStops = gCur.stops.map((s, idx) => idx === sIdx ? { ...s, op: cl } : { ...s });
      const midHex = nextStops[Math.floor(nextStops.length / 2)]?.color || activeHex;
      const nextG = { ...gCur, opacity: cl, stops: nextStops, _userCreated: true, userCreated: true };
      latestGradRef.current = nextG;
      setLocalGrad(nextG);
      scheduleParentNotify(() => {
        if (onGradRef.current) onGradRef.current(nextG, midHex);
        if (onOpRef.current) onOpRef.current(cl);
      });
    } else {
      scheduleParentNotify(() => {
        if (onOpRef.current) onOpRef.current(cl);
      });
    }
  };

  const applyNewHex = nh => {
    const cleanHex = nh.toLowerCase();
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const sIdx = VMT.clamp(stopIdx, 0, gCur.stops.length - 1);
      const nextStops = gCur.stops.map((s, idx) => idx === sIdx ? { ...s, color: cleanHex } : { ...s });
      const midHex = nextStops[Math.floor(nextStops.length / 2)]?.color || cleanHex;
      commitGrad({ ...gCur, base: midHex, stops: nextStops, _userCreated: true, userCreated: true }, midHex, false);
    } else {
      scheduleParentNotify(() => {
        if (onChangeRef.current) onChangeRef.current(cleanHex);
      });
    }
  };

  const switchFillMode = mode => {
    if (mode === 'solid') {
      const solidHx = (cur || activeHex || hex).toLowerCase();
      latestGradRef.current = null;
      setLocalGrad(null);
      if (onGradRef.current) onGradRef.current(null, solidHx);
      else if (onChangeRef.current) onChangeRef.current(solidHx);
    } else {
      const gCur = latestGradRef.current;
      let g;
      if (gCur && gCur.stops && gCur.stops.length >= 2) {
        const ang = gCur.angleDeg ?? gCur.angle ?? 135;
        g = { ...gCur, type: mode, angleDeg: ang, angle: ang, _userCreated: true, userCreated: true };
      } else {
        const c2 = makeHarmoniousStopHex(hex, detectedPool);
        g = VMT.createDefaultGrad(hex, mode, 135, latestOpRef.current, c2);
        setStopIdx(0);
      }
      commitGrad(g, g.base || hex, true);
    }
  };

  const addGradStop = () => {
    const gCur = latestGradRef.current;
    if (!gCur || !Array.isArray(gCur.stops) || gCur.stops.length < 2 || gCur.stops.length >= 8) return;
    const stops = gCur.stops.map((s, i) => ({
      offset: s && s.offset != null ? +s.offset : +(i / Math.max(1, gCur.stops.length - 1)).toFixed(2),
      color: (s && s.color ? s.color : hex).toLowerCase(),
      op: s && s.op != null ? clampN(+s.op, 0, 1) : 1
    })).sort((a, b) => a.offset - b.offset);
    const idx = clampN(safeStopIdx, 0, Math.max(0, stops.length - 2));
    const sA = stops[idx] || stops[0];
    const sB = stops[idx + 1] || stops[stops.length - 1] || sA;
    const [r1, g1, b1] = hex2rgb(sA.color || hex);
    const [r2, g2, b2] = hex2rgb(sB.color || hex);
    let midCol = rgb2hex((r1 + r2) >> 1, (g1 + g2) >> 1, (b1 + b2) >> 1).toLowerCase();
    if (midCol === (sA.color || '').toLowerCase() || midCol === (sB.color || '').toLowerCase()) {
      midCol = makeHarmoniousStopHex(midCol, detectedPool);
    }
    const rawStops = [
      ...stops.slice(0, idx + 1),
      { offset: 0.5, color: midCol, op: +(((sA.op ?? 1) + (sB.op ?? 1)) * 0.5).toFixed(2) },
      ...stops.slice(idx + 1)
    ];
    const nextStops = rawStops.map((s, i) => ({
      ...s,
      offset: +(i / Math.max(1, rawStops.length - 1)).toFixed(2)
    }));
    setStopIdx(idx + 1);
    setHsv(hex2hsv(midCol));
    commitGrad({
      ...gCur,
      base: nextStops[Math.floor(nextStops.length / 2)].color,
      stops: nextStops,
      _userCreated: true,
      userCreated: true,
      _cachedCg: null,
      _rampCache: null
    }, midCol, true);
  };

  const removeGradStop = (idx = safeStopIdx) => {
    const gCur = latestGradRef.current;
    if (!gCur || !gCur.stops) return;
    if (gCur.stops.length <= 2) {
      /* Jika tersisa 2 stop lalu dihapus 1 stop, kembalikan ke Solid menggunakan warna stop yang tersisa */
      const remStop = gCur.stops[idx === 0 ? 1 : 0] || gCur.stops[0];
      const remHex = (remStop && remStop.color ? remStop.color : hex).toLowerCase();
      latestGradRef.current = null;
      setLocalGrad(null);
      setStopIdx(0);
      setHsv(hex2hsv(remHex));
      if (onGradRef.current) onGradRef.current(null, remHex);
      else if (onChangeRef.current) onChangeRef.current(remHex);
      return;
    }
    const nextStops = gCur.stops.filter((_, i) => i !== idx);
    nextStops.forEach((s, i) => { s.offset = +(i / Math.max(1, nextStops.length - 1)).toFixed(2); });
    const nextIdx = Math.max(0, Math.min(safeStopIdx >= idx ? safeStopIdx - 1 : safeStopIdx, nextStops.length - 1));
    const nextCol = nextStops[nextIdx].color || hex;
    setStopIdx(nextIdx);
    setHsv(hex2hsv(nextCol));
    commitGrad({ ...gCur, base: nextStops[Math.floor(nextStops.length / 2)].color || nextCol, stops: nextStops, _userCreated: true, userCreated: true }, nextCol, true);
  };

  const setGradAngle = deg => {
    const gCur = latestGradRef.current;
    if (!gCur || !gCur.stops || gCur.stops.length < 2) return;
    commitGrad({
      ...gCur,
      angleDeg: deg,
      angle: deg,
      _userCreated: true,
      userCreated: true
    }, gCur.base || hex, false);
  };

  const emit = (h, s, v) => {
    setHsv([h, s, v]);
    applyNewHex(hsv2hex(h, s, v));
  };
  const svFrom = e => {
    const r = svRef.current.getBoundingClientRect();
    emit(hsv[0], clampN((e.clientX - r.left) / r.width, 0, 1), 1 - clampN((e.clientY - r.top) / r.height, 0, 1));
  };
  const svDown = e => { try { svRef.current.setPointerCapture(e.pointerId); } catch (x) {} actRef.current = true; setDrg(true); svFrom(e); };
  const svMove = e => { if (actRef.current) svFrom(e); };
  const svUp = () => { actRef.current = false; setDrg(false); flushPendingHex(); };
  const pipe = async () => {
    if (pk) return;
    setPk(true);
    const c = await pickScreenColor();
    setPk(false);
    if (c && /^#[0-9a-f]{6}$/i.test(c)) {
      const n = c.toLowerCase();
      setHsv(hex2hsv(n));
      applyNewHex(n);
      flushPendingHex();
    }
  };

  const gradCss = isGrad ? VMT.gradToCss(effGrad) : null;
  const gradBadge = isGrad ? (effGrad.type === 'radial' ? 'RAD' : 'LIN') : null;
  const opPct = Math.round(activeStopOp * 100);
  const gradAngle = isGrad ? Math.round(effGrad.angleDeg ?? effGrad.angle ?? 135) : 135;
  const gradDesc = isGrad
    ? `${effGrad.type === 'radial' ? 'Radial' : 'Linear'} Gradient (${effGrad.stops.map(s => s.color.toUpperCase()).join(' → ')})`
    : hex.toUpperCase();

  return (<span className={'at-chip' + (compact ? ' compact' : '') + (isGrad ? ' is-grad' : '') + (selected ? ' at-chip-sel' : '') + (isNone ? ' is-none' : '')} style={{
  '--c': hex,
  '--g': gradCss || hex
}}><button ref={btnRef} type="button" className="at-chip-btn" data-tip={onSelect ? undefined : 'atChipColor'} title={onSelect ? selected ? gradDesc + ' · klik untuk ubah warna/gradient' : gradDesc + ' · klik untuk memilih · klik ganda untuk ubah' : gradDesc} aria-pressed={onSelect ? !!selected : undefined} onClick={onSelect ? () => {
    onSelect();
  } : () => setOpen(o => !o)} onDoubleClick={onSelect ? () => setOpen(o => !o) : undefined}><span className="at-chip-dot" style={{
      opacity: effOp
    }} />{isGrad && <span className="at-chip-gbadge">{gradBadge}</span>}<span className="at-chip-hx">{isGrad ? `${gradBadge} · ${effGrad.stops[0].color.toUpperCase()}→${effGrad.stops[effGrad.stops.length - 1].color.toUpperCase()}` : hex.toUpperCase()}{effOp < 0.995 ? ` · ${Math.round(effOp * 100)}%` : ''}</span></button>{onSelect && <button type="button" className="at-chip-x at-chip-ed" title="Ubah warna, gradien & transparansi" aria-label="Ubah warna" onClick={() => setOpen(o => !o)}><Ico n="sliders" size={11} /></button>}<button type="button" className="at-chip-x" data-tip="atChipDel" onClick={onRemove} aria-label="Hapus warna"><Ico n="x" size={11} /></button>{open && <Float anchor={btnRef} open={open} onClose={() => {
    flushPendingHex();
    setOpen(false);
  }} w={280} cls="cp"><div className="cp-mode-tabs"><button type="button" className={'cp-mode-tab' + (!isGrad ? ' on' : '')} onClick={() => switchFillMode('solid')}>Solid</button><button type="button" className={'cp-mode-tab' + (isGrad && effGrad.type !== 'radial' ? ' on' : '')} onClick={() => switchFillMode('linear')}>Linear Grad</button><button type="button" className={'cp-mode-tab' + (isGrad && effGrad.type === 'radial' ? ' on' : '')} onClick={() => switchFillMode('radial')}>Radial Grad</button></div>{isGrad && <div className="cp-grad-box"><div className="flex items-center justify-between gap-1.5 flex-wrap"><span className="text-[10.5px] font-bold" style={{
          color: 'var(--ink)'
        }}>{effGrad.type === 'radial' ? 'Radial Gradient' : `Linear Gradient (${gradAngle}°)`}</span><div className="flex items-center gap-1">{effGrad.stops.length < 8 && <button type="button" className="cp-stop-btn" onClick={addGradStop} title="Tambah titik stop warna">+ Stop</button>}<button type="button" className="cp-stop-btn del" title={effGrad.stops.length <= 2 ? 'Hapus stop warna aktif & ubah ke Solid' : `Hapus warna Stop #${safeStopIdx + 1}`} onClick={() => removeGradStop(safeStopIdx)}>Hapus Stop</button></div></div><div className="cp-grad-bar"><div className="cp-grad-bar-fill" style={{
          background: gradCss || hex
        }} /></div><div className="cp-stop-row">{effGrad.stops.map((st, si) => <div key={si} className={'cp-stop-btn' + (safeStopIdx === si ? ' on' : '')} onClick={() => {
          setStopIdx(si);
          setHsv(hex2hsv(st.color || hex));
        }}><span className="cp-stop-dot" style={{
            background: st.color,
            opacity: st.op ?? 1
          }} /><span>{Math.round((st.offset ?? si / Math.max(1, effGrad.stops.length - 1)) * 100)}%</span><button type="button" className="cp-stop-del" title={effGrad.stops.length <= 2 ? 'Hapus stop ini (jadi Solid)' : `Hapus warna Stop #${si + 1}`} aria-label={`Hapus warna Stop ${si + 1}`} onClick={e => {
            e.stopPropagation();
            removeGradStop(si);
          }}>×</button></div>)}</div>{effGrad.type !== 'radial' && <Slider min={0} max={360} step={1} value={gradAngle} on={setGradAngle} label="Sudut Gradien" style={{
        marginTop: 4
      }} />}</div>}<div ref={svRef} className="sv" data-tip="cpSV" style={{
      background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${hsv2hex(hsv[0], 1, 1)})`
    }} onPointerDown={svDown} onPointerMove={svMove} onPointerUp={svUp} onPointerCancel={svUp}><div className={'sv-h' + (drg ? ' drag' : '')} style={{
        left: hsv[1] * 100 + '%',
        top: (1 - hsv[2]) * 100 + '%',
        background: cur
      }} /></div><Slider min={0} max={360} step={1} value={Math.round(hsv[0])} on={h => emit(h, hsv[1], hsv[2])} label="Hue" tip="cpHue" style={{
      marginTop: 10
    }} thumb={hsv2hex(hsv[0], 1, 1)} track="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" /><div className="cp-alpha-row"><div className="cp-alpha-top"><span>{isGrad ? `Transparansi Stop #${safeStopIdx + 1}` : 'Transparansi (Opacity)'}</span><span className="font-mono font-bold" style={{
          color: 'var(--ink)'
        }}>{opPct}%</span></div><div className="cp-alpha-track-wrap"><Slider min={0} max={100} step={1} value={opPct} on={pct => commitOpacity(pct / 100)} thumb={cur} track={`linear-gradient(to right, rgba(0,0,0,0), ${cur})`} /></div></div><div className="flex items-center gap-2 mt-3"><span className="cp-prev" style={{
        background: isGrad ? gradCss || cur : cur,
        opacity: activeStopOp,
        flex: 'none'
      }} /><M3HexInput value={cur} label="HEX" tip="cpHex" onChange={nh => {
        setHsv(hex2hsv(nh));
        applyNewHex(nh);
      }} onCommit={flushPendingHex} /><button type="button" className={'eyed' + (pk ? ' on' : '')} data-tip="cpPipette" aria-label="Pipet warna layar" onClick={pipe}><Ico n="pipette" size={16} /></button></div>{detectedPool && detectedPool.length > 0 && <div className="mt-3 pt-2.5" style={{
      borderTop: '1px solid var(--line)'
    }}><div className="text-[10.5px] mut mb-1.5 font-medium">Warna terdeteksi di gambar:</div><div className="at-swrow">{detectedPool.slice(0, 14).map((sw, si) => <button key={si} type="button" data-tip="atCandSwatch" className={'at-sw' + (sw.toLowerCase() === cur.toLowerCase() ? ' on' : '')} style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: sw
        }} onClick={() => {
          setHsv(hex2hsv(sw));
          applyNewHex(sw.toLowerCase());
          flushPendingHex();
        }} />)}</div></div>}{onToggleNone && <button type="button" className={'cp-none' + (isNone ? ' on' : '')} onClick={() => {
      onToggleNone();
      setOpen(false);
    }}><span className="cp-none-sw" /><span>{isNone ? 'Tampilkan warna kembali' : 'Jadikan None (transparan)'}<small>{isNone ? 'Mengembalikan area warna ini ke SVG' : 'Tanpa trace ulang · bisa dikembalikan kapan saja'}</small></span></button>}</Float>}</span>);
};

/* ---------- Palet "Warna dominan terdeteksi" dengan Konsolidasi Gradient & Kontrol Max Color ---------- */
const AtDetectedPalette = ({
  colors, items, edited, job, onChange, onGradChange, onOpacityChange, onReset, flash,
  selected, onSelect, hidden, onToggleNone, pending, onRetrace, onDiscard,
  maxColorEnabled, maxColors, onMaxColorChange
}) => {
  const detectedPool = (job && job.detectedPool) || [];
  const say = m => { if (flash) flash(m); };
  const effMaxOn = !!maxColorEnabled;
  const effMaxVal = VMT.clamp(maxColors || 16, 2, 64);
  const [numDraft, setNumDraft] = useState(() => String(effMaxVal));
  useEffect(() => { setNumDraft(String(effMaxVal)); }, [effMaxVal]);

  const commitMaxNum = rawVal => {
    const parsed = parseInt(rawVal, 10);
    if (!Number.isFinite(parsed)) {
      setNumDraft(String(effMaxVal));
      return;
    }
    const clamped = VMT.clamp(parsed, 2, 64);
    setNumDraft(String(clamped));
    if (onMaxColorChange) onMaxColorChange(true, clamped);
  };

  const add = () => {
    if (effMaxOn && colors.length >= effMaxVal) {
      say(`Batas Max Color (${effMaxVal} warna) aktif — tidak bisa lebih dari ${effMaxVal} warna`);
      return;
    }
    const nextHex = VMT.detectNextImageColor(job ? (job.previewWork || job.work) : null, job ? job.mask : null, colors, detectedPool);
    if (!nextHex) { say('Tidak ada warna dominan lain yang terdeteksi'); return; }
    const h = nextHex.toLowerCase();
    if (colors.includes(h)) { say('Semua warna dominan gambar sudah ada di palet'); return; }
    onChange([...colors, h]);
    say('Warna ' + h.toUpperCase() + ' ditambahkan');
  };
  const update = (i, hx) => { const n = colors.slice(); n[i] = hx.toLowerCase(); onChange(n); };
  const remove = i => {
    if (colors.length <= 1) { say('Minimal 1 warna harus tersisa'); return; }
    onChange(colors.filter((_, j) => j !== i));
  };

  const gradCount = (items && items.length === colors.length)
    ? items.filter(it => it && it.grad && it.grad.stops && it.grad.stops.length >= 2).length
    : 0;

  return (<div className="at-palbar"><div className="at-swrow" style={{
    justifyContent: 'flex-start'
  }}>{colors.map((hx, i) => {
      const it = items && items[i] || null;
      const g = it && it.grad && it.grad.stops && it.grad.stops.length >= 2 ? it.grad : null;
      const op = it && it.opacity != null ? it.opacity : 1;
      return <AtColorChip key={i} compact={true} hex={hx} grad={g} opacity={op} detectedPool={detectedPool} selected={onSelect ? selected === i : undefined} onSelect={onSelect ? () => onSelect(i) : undefined} isNone={!!(hidden && hidden.has(i))} onToggleNone={onToggleNone ? () => onToggleNone(i) : undefined} onGradChange={onGradChange ? (newG, midHx) => onGradChange(i, newG, midHx) : undefined} onOpacityChange={onOpacityChange ? newOp => onOpacityChange(i, newOp) : undefined} onChange={nh => update(i, nh)} onRemove={() => remove(i)} />;
    })}<button type="button" className="at-addsw mini" data-tip="atAddImgColor" aria-label="Tambah warna" style={effMaxOn && colors.length >= effMaxVal ? {
      opacity: 0.4,
      cursor: 'not-allowed'
    } : undefined} onClick={add}><Ico n="plus" size={13} /></button>{edited && <button type="button" className="at-addsw mini" title="Kembalikan ke warna terdeteksi otomatis" aria-label="Kembalikan palet otomatis" onClick={onReset}><Ico n="reset" size={12} /></button>}</div>{onMaxColorChange && <div className="at-maxcol-bar"><div className="flex items-center gap-2"><AtToggle on={effMaxOn} act={v => onMaxColorChange(v, effMaxVal)} label="Aktifkan Max Color" /><span className="text-[11px] font-bold" style={{
        color: 'var(--ink)'
      }}>Max Color</span><span className="at-rec-badge" style={{
        padding: '1px 6px',
        fontSize: '9.5px'
      }}>{effMaxOn ? 'Aktif' : 'Nonaktif'}</span></div><div style={!effMaxOn ? {
      opacity: 0.45,
      pointerEvents: 'none'
    } : undefined}><AtNum v={effMaxVal} min={2} max={64} step={1} on={n => commitMaxNum(n)} /></div><span className="text-[10.5px] mut">{effMaxOn ? <>Maks <b>{effMaxVal}</b> palet ({colors.length}/{effMaxVal})</> : 'Tanpa batas maksimum'}</span></div>}{gradCount > 0 && <span className="at-pal-note" style={{
    color: 'var(--acc)'
  }}>★ {gradCount} palet Gradient ({items.filter(it => it && it.grad).map(it => it.grad.type === 'radial' ? 'Radial' : 'Linear').filter((v, idx, a) => a.indexOf(v) === idx).join('/')}) terkonsolidasi otomatis · klik ganda chip LIN/RAD untuk edit stop warna</span>}{pending && <div className="at-pal-pending"><span className="txt">Palet diubah ({colors.length} warna) — belum di-trace. Hasil SVG masih yang lama.</span><button type="button" className="btn pri" data-tip="atRetracePal" onClick={onRetrace}><Ico n="refresh" size={12} /> Trace Ulang</button><button type="button" className="btn sec" onClick={onDiscard}>Batalkan</button></div>}{edited && !pending && <span className="at-pal-note">Palet kustom aktif ({colors.length} warna) — dipakai saat vektorisasi</span>}{onSelect && <span className="at-pal-note" style={{
    color: selected != null && colors[selected] ? 'var(--acc)' : 'var(--mut)'
  }}>{selected != null && colors[selected] ? 'Menyorot ' + colors[selected].toUpperCase() + ' · klik lagi untuk batal' : 'Klik warna untuk menyorot objeknya'}</span>}</div>);
};

/* ---------- Editor Palet Kustom (Tambah Warna = Otomatis Deteksi dari Gambar) ---------- */
const PaletteEdit = ({ colors, onChange, allowEmpty, job, flash }) => {
  const detectedPool = (job && job.detectedPool) || [];

  const addAutoDetectedColor = () => {
    const nextHex = VMT.detectNextImageColor(
      job ? (job.previewWork || job.work) : null,
      job ? job.mask : null,
      colors,
      detectedPool
    );
    if (!nextHex) return;
    const h = nextHex.toLowerCase();
    if (!colors.includes(h)) {
      onChange([...colors, h]);
      if (flash) flash('Warna ' + h.toUpperCase() + ' terdeteksi dari gambar & ditambahkan');
    } else if (flash) {
      flash('Semua warna dominan gambar sudah ada di daftar palet');
    }
  };

  const updateAt = (idx, hex) => {
    const next = colors.slice();
    next[idx] = hex.toLowerCase();
    onChange(next);
  };

  const mergeSimilar = () => {
    const cs = colors.map(h => { const [r, g, b] = VMT.rgbOf(h); return { h, r, g, b }; });
    const out = [];
    for (const c of cs) {
      const f = out.find(o => VMT.cdist2(c.r, c.g, c.b, o.r, o.g, o.b) < 2600);
      if (!f) out.push(c);
    }
    onChange(out.map(o => o.h));
    if (flash) flash('Warna yang mirip berhasil digabungkan (' + out.length + ' warna tersisa)');
  };

  const unusedDetected = detectedPool.filter(h => !colors.includes(h.toLowerCase())).slice(0, 12);

  return (<div><div className="at-swrow at-swrow-lg">{colors.map((hx, i) => <AtColorChip key={i} hex={hx} detectedPool={detectedPool} onChange={newHx => updateAt(i, newHx)} onRemove={() => onChange(colors.filter((_, j) => j !== i))} />)}<button type="button" className="at-addsw" data-tip="atAddImgColor" onClick={addAutoDetectedColor}><Ico n="plus" size={13} /><span>Tambah Warna Gambar</span></button></div>{unusedDetected.length > 0 && <div className="mt-3 p-2.5 rounded-xl" style={{
    background: 'var(--sub)',
    border: '1px solid var(--line)'
  }}><div className="flex items-center justify-between gap-2 mb-1.5"><span className="text-[11px] mut font-medium">Kandidat warna lain yang terdeteksi di gambar (klik untuk menambahkan):</span><span className="text-[10.5px] mut">Berikutnya: <b style={{
          color: 'var(--ink)'
        }}>{unusedDetected[0].toUpperCase()}</b></span></div><div className="at-swrow">{unusedDetected.map((sw, idx) => <button key={sw} type="button" data-tip="atCandSwatch" className={'at-sw' + (idx === 0 ? ' on' : '')} style={{
        background: sw,
        width: 24,
        height: 24
      }} onClick={() => {
        onChange([...colors, sw.toLowerCase()]);
        if (flash) flash('Warna ' + sw.toUpperCase() + ' ditambahkan ke palet');
      }} />)}</div></div>}<div className="flex flex-wrap gap-2 mt-2.5 items-center"><span className="mut text-[11px]">{colors.length} warna aktif · klik chip warna untuk kustomisasi, atau klik <b>+ Tambah Warna Gambar</b> untuk menambah warna otomatis dari gambar</span>{colors.length > 1 && <button type="button" className="btn sec" data-tip="atMergeSim" style={{
      padding: '6px 10px',
      fontSize: 11.5
    }} onClick={mergeSimilar}>Gabung warna mirip</button>}{!colors.length && !allowEmpty && <span className="text-[11px]" style={{
      color: '#dc2626'
    }}>Tambahkan minimal 1 warna</span>}</div></div>);
};

export { AtColorChip, AtDetectedPalette, PaletteEdit };
