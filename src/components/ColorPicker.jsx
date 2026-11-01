import React, { useRef, useState, useEffect } from 'react';
import { hex2hsv, clampN, hsv2hex, hex2rgb, rgb2hex, pickScreenColor, Ico, Float, Slider } from './CommonControls.jsx';
import { VMT } from '../engine/VmtEngine.jsx';

/* =====================================================================
   Material UI 3.0 Custom Minimalist Hex Input & Color Picker (Tanpa <input> Native)
   ===================================================================== */
const M3_QUICK_SWATCHES = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#18181b', '#71717a', '#ffffff'];

const M3HexInput = ({ value, onChange, onCommit, label = 'HEX', tip }) => {
  const edRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const clean6 = String(value || '#000000').replace(/^#/, '').slice(0, 6).toUpperCase();

  useEffect(() => {
    const el = edRef.current;
    if (el && !focused && el.textContent !== clean6) {
      el.textContent = clean6;
    }
  }, [clean6, focused]);

  const handleInput = e => {
    const raw = e.currentTarget.textContent || '';
    const hexOnly = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
    if (hexOnly !== raw) {
      e.currentTarget.textContent = hexOnly;
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(e.currentTarget);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) {}
    }
    if (hexOnly.length === 6) {
      onChange('#' + hexOnly.toLowerCase());
    }
  };

  const commitNow = () => {
    const el = edRef.current;
    if (!el) return;
    const raw = (el.textContent || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    if (raw.length === 3) {
      const full = '#' + raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
      el.textContent = full.slice(1).toUpperCase();
      onChange(full);
    } else if (raw.length === 6) {
      const full = '#' + raw;
      el.textContent = raw.toUpperCase();
      onChange(full);
    } else {
      el.textContent = clean6;
    }
    if (onCommit) onCommit();
  };

  return (<div className={'m3-field' + (focused ? ' focus' : '')} data-tip={tip} onClick={() => {
  if (edRef.current) edRef.current.focus();
}}>{label && <span className="m3-field-lbl">{label}</span>}<span className="m3-field-hash">#</span><div ref={edRef} role="textbox" aria-label={label || 'Kode Hex'} contentEditable={true} spellCheck={false} data-placeholder="RRGGBB" className="m3-field-ed" onFocus={e => {
    setFocused(true);
    try {
      const range = document.createRange();
      range.selectNodeContents(e.currentTarget);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {}
  }} onBlur={() => {
    setFocused(false);
    commitNow();
  }} onInput={handleInput} onPaste={e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    const hexOnly = text.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
    if (edRef.current) edRef.current.textContent = hexOnly;
    if (hexOnly.length === 6) onChange('#' + hexOnly.toLowerCase());
  }} onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (edRef.current) edRef.current.textContent = clean6;
      e.currentTarget.blur();
    }
  }} /></div>);
};

/* Helper: Buat warna stop pendamping yang harmonis saat beralih dari Solid ke Linear/Radial Gradient */
const makeHarmoniousStopHex = (baseHex, pool = null) => {
  const clean = /^#[0-9a-f]{6}$/i.test(baseHex) ? baseHex.toLowerCase() : '#4f46e5';
  if (pool && pool.length) {
    for (const cand of pool) {
      if (cand && /^#[0-9a-f]{6}$/i.test(cand) && cand.toLowerCase() !== clean) {
        const [r1, g1, b1] = [parseInt(clean.slice(1, 3), 16), parseInt(clean.slice(3, 5), 16), parseInt(clean.slice(5, 7), 16)];
        const [r2, g2, b2] = [parseInt(cand.slice(1, 3), 16), parseInt(cand.slice(3, 5), 16), parseInt(cand.slice(5, 7), 16)];
        const d = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
        if (d >= 45 && d <= 260) return cand.toLowerCase();
      }
    }
  }
  const [h, s, v] = hex2hsv(clean);
  const nh = (h + 28) % 360;
  const ns = clampN(s < 0.18 ? 0.55 : s * 0.92, 0.15, 1);
  const nv = v > 0.62 ? clampN(v - 0.34, 0.18, 1) : clampN(v + 0.36, 0.25, 1);
  return hsv2hex(nh, ns, nv).toLowerCase();
};

const hexWithAlphaCss = (hex, op = 1) => {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
  const a = clampN(op == null ? 1 : +op, 0, 1);
  if (a >= 0.999) return clean;
  const r = parseInt(clean.slice(1, 3), 16), g = parseInt(clean.slice(3, 5), 16), b = parseInt(clean.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${+a.toFixed(3)})`;
};

const M3ColorInput = ({
  value, origValue, grad: gradProp = null, opacity: opProp = 1,
  onChange, onGradChange, onOpacityChange, onCommit, onReset,
  label = 'HEX', detectedPool = [], allowGradient = true, allowOpacity = true
}) => {
  const btnRef = useRef(null), svRef = useRef(null), actRef = useRef(false);
  const rafRef = useRef(0), pendingTaskRef = useRef(null);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onGradRef = useRef(onGradChange); onGradRef.current = onGradChange;
  const onOpRef = useRef(onOpacityChange); onOpRef.current = onOpacityChange;

  const normVal = /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000';
  const [open, setOpen] = useState(false);
  const [localGrad, setLocalGrad] = useState(() => (gradProp && gradProp.stops && gradProp.stops.length >= 2) ? gradProp : null);
  const [localOp, setLocalOp] = useState(() => clampN(opProp == null ? 1 : +opProp, 0, 1));
  const [stopIdx, setStopIdx] = useState(0);

  const latestGradRef = useRef(localGrad);
  const latestOpRef = useRef(localOp);

  useEffect(() => {
    if (gradProp !== undefined) {
      const ng = (gradProp && gradProp.stops && gradProp.stops.length >= 2) ? gradProp : null;
      latestGradRef.current = ng;
      setLocalGrad(ng);
    }
  }, [gradProp]);
  useEffect(() => {
    if (opProp !== undefined && opProp !== null) {
      const no = clampN(+opProp, 0, 1);
      latestOpRef.current = no;
      setLocalOp(no);
    }
  }, [opProp]);

  const effGrad = localGrad;
  const isGrad = !!(effGrad && effGrad.stops && effGrad.stops.length >= 2);
  const safeStopIdx = isGrad ? clampN(stopIdx, 0, effGrad.stops.length - 1) : 0;
  const activeHex = isGrad ? (effGrad.stops[safeStopIdx]?.color || normVal) : normVal;
  const activeOp = isGrad
    ? clampN(effGrad.stops[safeStopIdx]?.op ?? localOp ?? 1, 0, 1)
    : clampN(localOp, 0, 1);

  const [hsv, setHsv] = useState(() => hex2hsv(activeHex));
  const [drg, setDrg] = useState(false);
  const [pk, setPk] = useState(false);
  const cur = open ? hsv2hex(hsv[0], hsv[1], hsv[2]) : activeHex;

  useEffect(() => {
    if (activeHex && activeHex.toLowerCase() !== hsv2hex(hsv[0], hsv[1], hsv[2]).toLowerCase()) {
      setHsv(hex2hsv(activeHex));
    }
  }, [activeHex, safeStopIdx, isGrad]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const scheduleParentNotify = fn => {
    pendingTaskRef.current = fn;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const task = pendingTaskRef.current;
        pendingTaskRef.current = null;
        if (task) task();
      });
    }
  };

  const flushEmit = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (pendingTaskRef.current) {
      const task = pendingTaskRef.current;
      pendingTaskRef.current = null;
      task();
    }
    if (onCommit) onCommit();
  };

  const emitGradUpdate = (nextG, fallbackHx, nextOpVal = latestOpRef.current, immediate = false) => {
    latestGradRef.current = nextG;
    setLocalGrad(nextG);
    const midHx = (nextG && nextG.stops && nextG.stops.length)
      ? (nextG.stops[Math.floor(nextG.stops.length / 2)]?.color || fallbackHx)
      : fallbackHx;
    const run = () => {
      if (onGradRef.current) {
        onGradRef.current(nextG, midHx, nextOpVal);
      } else if (onChangeRef.current && midHx) {
        onChangeRef.current(midHx, nextG, nextOpVal);
      }
    };
    if (immediate) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      pendingTaskRef.current = null;
      run();
    } else {
      scheduleParentNotify(run);
    }
  };

  const scheduleEmit = hexVal => {
    const cleanHex = hexVal.toLowerCase();
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const sIdx = clampN(stopIdx, 0, gCur.stops.length - 1);
      const nextStops = gCur.stops.map((s, idx) => idx === sIdx ? { ...s, color: cleanHex } : { ...s });
      const midHex = nextStops[Math.floor(nextStops.length / 2)]?.color || cleanHex;
      const nextG = { ...gCur, base: midHex, stops: nextStops, _userCreated: true, userCreated: true };
      emitGradUpdate(nextG, cleanHex, latestOpRef.current, false);
    } else {
      scheduleParentNotify(() => {
        if (onChangeRef.current) onChangeRef.current(cleanHex, null, latestOpRef.current);
      });
    }
  };

  const switchPaintMode = modeType => {
    if (modeType === 'solid') {
      const solidHx = cur.toLowerCase();
      latestGradRef.current = null;
      setLocalGrad(null);
      if (onGradRef.current) onGradRef.current(null, solidHx, latestOpRef.current);
      else if (onChangeRef.current) onChangeRef.current(solidHx, null, latestOpRef.current);
      if (onCommit) onCommit();
      return;
    }
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const ang = gCur.angleDeg ?? gCur.angle ?? 135;
      const nextG = { ...gCur, type: modeType, angleDeg: ang, angle: ang, _userCreated: true, userCreated: true };
      emitGradUpdate(nextG, normVal, latestOpRef.current, true);
      if (onCommit) onCommit();
      return;
    }
    const c1 = normVal;
    const c2 = makeHarmoniousStopHex(c1, detectedPool);
    const op = latestOpRef.current;
    const newG = (typeof VMT !== 'undefined' && VMT.createDefaultGrad)
      ? VMT.createDefaultGrad(c1, modeType, 135, op, c2)
      : { type: modeType, base: c1, angleDeg: 135, angle: 135, _userCreated: true, userCreated: true, stops: [{ offset: 0, color: c1, op }, { offset: 1, color: c2, op }] };
    setStopIdx(0);
    emitGradUpdate(newG, c1, op, true);
    if (onCommit) onCommit();
  };

  const handleOpacitySlider = pct => {
    const nextOp = clampN(pct / 100, 0, 1);
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const sIdx = clampN(stopIdx, 0, gCur.stops.length - 1);
      const nextStops = gCur.stops.map((s, idx) => idx === sIdx ? { ...s, op: nextOp } : { ...s });
      const nextG = { ...gCur, stops: nextStops, _userCreated: true, userCreated: true };
      emitGradUpdate(nextG, normVal, latestOpRef.current, false);
    } else {
      latestOpRef.current = nextOp;
      setLocalOp(nextOp);
      scheduleParentNotify(() => {
        if (onOpRef.current) onOpRef.current(nextOp);
        else if (onGradRef.current) onGradRef.current(null, cur.toLowerCase(), nextOp);
        else if (onChangeRef.current) onChangeRef.current(cur.toLowerCase(), null, nextOp);
      });
    }
  };

  const handleAngleSlider = ang => {
    const gCur = latestGradRef.current;
    if (!gCur || !gCur.stops || gCur.stops.length < 2) return;
    const nextG = { ...gCur, angleDeg: ang, angle: ang, _userCreated: true, userCreated: true };
    emitGradUpdate(nextG, normVal, latestOpRef.current, false);
  };

  const addGradStop = () => {
    const gCur = latestGradRef.current;
    if (!gCur || !Array.isArray(gCur.stops) || gCur.stops.length < 2 || gCur.stops.length >= 8) return;
    const stops = gCur.stops.map((s, i) => ({
      offset: s && s.offset != null ? +s.offset : +(i / Math.max(1, gCur.stops.length - 1)).toFixed(2),
      color: (s && s.color ? s.color : normVal).toLowerCase(),
      op: s && s.op != null ? clampN(+s.op, 0, 1) : 1
    })).sort((a, b) => a.offset - b.offset);
    const idx = clampN(safeStopIdx, 0, Math.max(0, stops.length - 2));
    const sA = stops[idx] || stops[0];
    const sB = stops[idx + 1] || stops[stops.length - 1] || sA;
    const [r1, g1, b1] = hex2rgb(sA.color || normVal);
    const [r2, g2, b2] = hex2rgb(sB.color || normVal);
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
    const nextG = {
      ...gCur,
      base: nextStops[Math.floor(nextStops.length / 2)].color,
      stops: nextStops,
      _userCreated: true,
      userCreated: true,
      _cachedCg: null,
      _rampCache: null
    };
    setStopIdx(idx + 1);
    setHsv(hex2hsv(midCol));
    emitGradUpdate(nextG, midCol, latestOpRef.current, true);
  };

  const removeGradStopAt = (targetIdx = safeStopIdx) => {
    const gCur = latestGradRef.current;
    if (!gCur || !gCur.stops) return;
    if (gCur.stops.length <= 2) {
      /* Jika hanya tersisa 2 stop lalu pengguna menghapus 1 stop, konversi menjadi Solid dengan warna stop yang tersisa */
      const remStop = gCur.stops[targetIdx === 0 ? 1 : 0] || gCur.stops[0];
      const remHex = (remStop && remStop.color ? remStop.color : normVal).toLowerCase();
      const remOp = remStop && remStop.op != null ? clampN(+remStop.op, 0, 1) : latestOpRef.current;
      latestGradRef.current = null;
      latestOpRef.current = remOp;
      setLocalGrad(null);
      setLocalOp(remOp);
      setStopIdx(0);
      setHsv(hex2hsv(remHex));
      if (onGradRef.current) onGradRef.current(null, remHex, remOp);
      else if (onChangeRef.current) onChangeRef.current(remHex, null, remOp);
      if (onOpRef.current) onOpRef.current(remOp);
      if (onCommit) onCommit();
      return;
    }
    const stops = gCur.stops.filter((_, i) => i !== targetIdx);
    stops.forEach((s, i) => { s.offset = +(i / Math.max(1, stops.length - 1)).toFixed(2); });
    const nextIdx = Math.max(0, Math.min(safeStopIdx >= targetIdx ? safeStopIdx - 1 : safeStopIdx, stops.length - 1));
    const nextCol = stops[nextIdx].color || normVal;
    const nextG = { ...gCur, base: stops[Math.floor(stops.length / 2)].color || nextCol, stops, _userCreated: true, userCreated: true };
    setStopIdx(nextIdx);
    setHsv(hex2hsv(nextCol));
    emitGradUpdate(nextG, nextCol, latestOpRef.current, true);
  };

  const emitHsv = (h, s, v) => {
    setHsv([h, s, v]);
    scheduleEmit(hsv2hex(h, s, v));
  };

  const svFrom = e => {
    const r = svRef.current.getBoundingClientRect();
    emitHsv(hsv[0], clampN((e.clientX - r.left) / r.width, 0, 1), 1 - clampN((e.clientY - r.top) / r.height, 0, 1));
  };
  const svDown = e => {
    try { svRef.current.setPointerCapture(e.pointerId); } catch (x) {}
    actRef.current = true;
    setDrg(true);
    svFrom(e);
  };
  const svMove = e => { if (actRef.current) svFrom(e); };
  const svUp = () => {
    if (!actRef.current) return;
    actRef.current = false;
    setDrg(false);
    flushEmit();
  };

  const pipe = async () => {
    if (pk) return;
    setPk(true);
    const c = await pickScreenColor();
    setPk(false);
    if (c && /^#[0-9a-f]{6}$/i.test(c)) {
      const n = c.toLowerCase();
      setHsv(hex2hsv(n));
      scheduleEmit(n);
      flushEmit();
    }
  };

  const swatches = (detectedPool && detectedPool.length ? detectedPool.slice(0, 12) : M3_QUICK_SWATCHES);
  const gradCss = isGrad && typeof VMT !== 'undefined' && VMT.gradToCss ? VMT.gradToCss(effGrad) : null;
  const curSwatchBg = gradCss || hexWithAlphaCss(cur, activeOp);
  const curMode = isGrad ? (effGrad.type === 'radial' ? 'radial' : 'linear') : 'solid';
  const curAngle = isGrad ? Math.round(effGrad.angleDeg ?? effGrad.angle ?? 135) : 135;

  return (<div className="m3-color-row"><button ref={btnRef} type="button" className={'m3-swatch-btn' + (open ? ' open' : '')} title="Buka pemilih warna, Linear/Radial Gradient & Transparansi" aria-label={'Pilih warna ' + cur.toUpperCase()} onClick={() => setOpen(o => !o)}>{origValue && <><span className="m3-swatch-orig" title={'Warna asli: ' + origValue.toUpperCase()} style={{
        background: origValue
      }} /><span className="mut" style={{
        fontSize: 10,
        lineHeight: 1
      }}>→</span></>}<span className="m3-swatch-cur" style={{
      background: curSwatchBg,
      width: isGrad ? 32 : undefined
    }} /></button><M3HexInput value={cur} label={isGrad ? `${effGrad.type === 'radial' ? 'RAD' : 'LIN'} #${safeStopIdx + 1}` : label} onChange={nh => {
    setHsv(hex2hsv(nh));
    scheduleEmit(nh);
  }} onCommit={flushEmit} /><button type="button" className={'m3-icon-btn' + (pk ? ' on' : '')} title="Ambil warna dari layar (Pipet)" aria-label="Pipet warna layar" onClick={pipe}><Ico n="pipette" size={14} /></button>{onReset && <button type="button" className="m3-icon-btn" title="Kembalikan warna asli" aria-label="Kembalikan warna asli" onClick={onReset}><Ico n="reset" size={13} /></button>}{open && <Float anchor={btnRef} open={open} onClose={() => {
    flushEmit();
    setOpen(false);
  }} w={276} cls="cp"><div className="flex items-center justify-between mb-2"><span className="text-[11px] font-bold flex items-center gap-1.5" style={{
        color: 'var(--ink)'
      }}><Ico n="palette" size={13} /> Pemilih Warna & Gradient</span><span className="font-mono text-[10.5px] font-bold px-1.5 py-0.5 rounded" style={{
        background: 'var(--sub)',
        color: 'var(--acc)'
      }}>{cur.toUpperCase()} · {Math.round(activeOp * 100)}%</span></div>{allowGradient && <div className="cp-mode-tabs" role="tablist" aria-label="Mode Warna"><button type="button" className={'cp-mode-tab' + (curMode === 'solid' ? ' on' : '')} onClick={() => switchPaintMode('solid')}>Solid</button><button type="button" className={'cp-mode-tab' + (curMode === 'linear' ? ' on' : '')} onClick={() => switchPaintMode('linear')}>Linear</button><button type="button" className={'cp-mode-tab' + (curMode === 'radial' ? ' on' : '')} onClick={() => switchPaintMode('radial')}>Radial</button></div>}{isGrad && <div className="cp-grad-box"><div className="flex items-center justify-between gap-1.5 flex-wrap"><span className="text-[10px] font-bold" style={{
          color: 'var(--ink)'
        }}>{effGrad.type === 'radial' ? 'Radial Gradient' : `Linear (${curAngle}°)`}</span><div className="flex items-center gap-1">{effGrad.stops.length < 8 && <button type="button" className="cp-stop-btn" title="Tambah titik stop warna" onClick={addGradStop}>+ Stop</button>}<button type="button" className="cp-stop-btn del" title={effGrad.stops.length <= 2 ? 'Hapus stop warna aktif & ubah ke Solid' : `Hapus warna Stop #${safeStopIdx + 1}`} onClick={() => removeGradStopAt(safeStopIdx)}>Hapus Stop</button></div></div><div className="cp-grad-bar"><div className="cp-grad-bar-fill" style={{
          background: gradCss || cur
        }} /></div><div className="cp-stop-row">{effGrad.stops.map((st, si) => <div key={si} className={'cp-stop-btn' + (safeStopIdx === si ? ' on' : '')} onClick={() => {
          setStopIdx(si);
          setHsv(hex2hsv(st.color || normVal));
        }}><span className="cp-stop-dot" style={{
            background: hexWithAlphaCss(st.color, st.op ?? 1)
          }} /><span>{Math.round((st.offset ?? si / Math.max(1, effGrad.stops.length - 1)) * 100)}%</span><button type="button" className="cp-stop-del" title={effGrad.stops.length <= 2 ? 'Hapus stop ini (jadi Solid)' : `Hapus warna Stop #${si + 1}`} aria-label={`Hapus warna Stop ${si + 1}`} onClick={e => {
            e.stopPropagation();
            removeGradStopAt(si);
          }}>×</button></div>)}</div>{effGrad.type !== 'radial' && <div className="mt-2"><div className="flex justify-between text-[10px] mut mb-0.5"><span>Sudut Linear Gradient</span><span className="font-mono font-bold" style={{
            color: 'var(--ink)'
          }}>{curAngle}°</span></div><Slider min={0} max={360} step={1} value={curAngle} on={handleAngleSlider} label="Sudut Gradient" /></div>}</div>}<div ref={svRef} className="sv" data-tip="cpSV" style={{
      background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${hsv2hex(hsv[0], 1, 1)})`
    }} onPointerDown={svDown} onPointerMove={svMove} onPointerUp={svUp} onPointerCancel={svUp}><div className={'sv-h' + (drg ? ' drag' : '')} style={{
        left: hsv[1] * 100 + '%',
        top: (1 - hsv[2]) * 100 + '%',
        background: cur
      }} /></div><Slider min={0} max={360} step={1} value={Math.round(hsv[0])} on={h => emitHsv(h, hsv[1], hsv[2])} label="Hue" tip="cpHue" style={{
      marginTop: 10
    }} thumb={hsv2hex(hsv[0], 1, 1)} track="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" />{allowOpacity && <div className="cp-alpha-row"><div className="cp-alpha-hdr"><span className="mut font-semibold">{isGrad ? `Transparansi Stop #${safeStopIdx + 1}` : 'Transparansi (Opacity)'}</span><span className="font-mono font-bold" style={{
          color: 'var(--ink)'
        }}>{Math.round(activeOp * 100)}%</span></div><div className="cp-alpha-track-wrap"><Slider min={0} max={100} step={1} value={Math.round(activeOp * 100)} on={handleOpacitySlider} label="Transparansi" thumb={cur} track={`linear-gradient(to right, rgba(0,0,0,0), ${cur})`} /></div></div>}<div className="flex items-center gap-2 mt-3"><span className="cp-prev chk" style={{
        position: 'relative',
        overflow: 'hidden',
        flex: 'none'
      }}><span style={{
          position: 'absolute',
          inset: 0,
          background: curSwatchBg
        }} /></span><M3HexInput value={cur} label="HEX" tip="cpHex" onChange={nh => {
        setHsv(hex2hsv(nh));
        scheduleEmit(nh);
      }} onCommit={flushEmit} /><button type="button" className={'eyed' + (pk ? ' on' : '')} data-tip="cpPipette" aria-label="Pipet warna" onClick={pipe}><Ico n="pipette" size={16} /></button></div><div className="mt-3 pt-2.5" style={{
      borderTop: '1px solid var(--line)'
    }}><div className="text-[10px] mut mb-1.5 font-semibold">Palet Cepat:</div><div className="at-swrow">{swatches.map((sw, si) => <button key={si} type="button" className={'at-sw' + (sw.toLowerCase() === cur.toLowerCase() ? ' on' : '')} style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          background: sw
        }} onClick={() => {
          const n = sw.toLowerCase();
          setHsv(hex2hsv(n));
          scheduleEmit(n);
          flushEmit();
        }} />)}</div></div></Float>}</div>);
};

/* Pemilih warna kustom: swatch -> popover (Solid, Linear Gradient, Radial Gradient, Stop Add/Delete, Slider Transparansi, SV, Hue, HEX, Pipet) */
const ColorField = ({ value, grad: gradProp = null, opacity: opProp = 1, on, onGradChange, onOpacityChange, tip }) => {
  const btn = useRef(null), sv = useRef(null), act = useRef(false), raf = useRef(0), pendingTaskRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [localGrad, setLocalGrad] = useState(() => (gradProp && gradProp.stops && gradProp.stops.length >= 2) ? gradProp : null);
  const [localOp, setLocalOp] = useState(() => clampN(opProp == null ? 1 : +opProp, 0, 1));
  const [stopIdx, setStopIdx] = useState(0);
  const latestGradRef = useRef(localGrad);
  const latestOpRef = useRef(localOp);

  useEffect(() => {
    if (gradProp !== undefined) {
      const ng = (gradProp && gradProp.stops && gradProp.stops.length >= 2) ? gradProp : null;
      latestGradRef.current = ng;
      setLocalGrad(ng);
    }
  }, [gradProp]);
  useEffect(() => {
    if (opProp !== undefined && opProp !== null) {
      const no = clampN(+opProp, 0, 1);
      latestOpRef.current = no;
      setLocalOp(no);
    }
  }, [opProp]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const effGrad = localGrad;
  const isGrad = !!(effGrad && effGrad.stops && effGrad.stops.length >= 2);
  const safeStopIdx = isGrad ? clampN(stopIdx, 0, effGrad.stops.length - 1) : 0;
  const normVal = /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#ffffff';
  const activeHex = isGrad ? (effGrad.stops[safeStopIdx]?.color || normVal) : normVal;
  const activeOp = isGrad ? clampN(effGrad.stops[safeStopIdx]?.op ?? localOp ?? 1, 0, 1) : clampN(localOp, 0, 1);

  const [hsv, setHsv] = useState(() => hex2hsv(activeHex));
  const [drg, setDrg] = useState(false);
  const cur = hsv2hex(hsv[0], hsv[1], hsv[2]);

  useEffect(() => {
    if (activeHex.toLowerCase() !== cur.toLowerCase()) setHsv(hex2hsv(activeHex));
  }, [activeHex, safeStopIdx, isGrad]);

  const scheduleNotify = fn => {
    pendingTaskRef.current = fn;
    if (!raf.current) {
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const task = pendingTaskRef.current;
        pendingTaskRef.current = null;
        if (task) task();
      });
    }
  };

  const emitGrad = (nextG, fallbackHx, nextOp = latestOpRef.current, immediate = false) => {
    latestGradRef.current = nextG;
    setLocalGrad(nextG);
    const midHx = (nextG && nextG.stops && nextG.stops.length)
      ? (nextG.stops[Math.floor(nextG.stops.length / 2)]?.color || fallbackHx)
      : fallbackHx;
    const run = () => {
      if (onGradChange) onGradChange(nextG, midHx, nextOp);
      else if (on && midHx) on(midHx, nextG, nextOp);
    };
    if (immediate) {
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
      pendingTaskRef.current = null;
      run();
    } else {
      scheduleNotify(run);
    }
  };

  const out = c => {
    const clean = c.toLowerCase();
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const sIdx = clampN(stopIdx, 0, gCur.stops.length - 1);
      const nextStops = gCur.stops.map((s, idx) => idx === sIdx ? { ...s, color: clean } : { ...s });
      const nextG = { ...gCur, base: nextStops[Math.floor(nextStops.length / 2)]?.color || clean, stops: nextStops, _userCreated: true, userCreated: true };
      emitGrad(nextG, clean, latestOpRef.current, false);
    } else {
      scheduleNotify(() => {
        if (on) on(clean, null, latestOpRef.current);
      });
    }
  };

  const switchMode = m => {
    if (m === 'solid') {
      const solidHx = cur.toLowerCase();
      latestGradRef.current = null;
      setLocalGrad(null);
      if (onGradChange) onGradChange(null, solidHx, latestOpRef.current);
      else if (on) on(solidHx, null, latestOpRef.current);
      return;
    }
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const ang = gCur.angleDeg ?? gCur.angle ?? 135;
      emitGrad({ ...gCur, type: m, angleDeg: ang, angle: ang, _userCreated: true, userCreated: true }, normVal, latestOpRef.current, true);
      return;
    }
    const c1 = normVal;
    const c2 = makeHarmoniousStopHex(c1);
    const op = latestOpRef.current;
    const newG = (typeof VMT !== 'undefined' && VMT.createDefaultGrad)
      ? VMT.createDefaultGrad(c1, m, 135, op, c2)
      : { type: m, base: c1, angleDeg: 135, angle: 135, _userCreated: true, userCreated: true, stops: [{ offset: 0, color: c1, op }, { offset: 1, color: c2, op }] };
    setStopIdx(0);
    emitGrad(newG, c1, op, true);
  };

  const addStop = () => {
    const gCur = latestGradRef.current;
    if (!gCur || !Array.isArray(gCur.stops) || gCur.stops.length < 2 || gCur.stops.length >= 8) return;
    const stops = gCur.stops.map((s, i) => ({
      offset: s && s.offset != null ? +s.offset : +(i / Math.max(1, gCur.stops.length - 1)).toFixed(2),
      color: (s && s.color ? s.color : normVal).toLowerCase(),
      op: s && s.op != null ? clampN(+s.op, 0, 1) : 1
    })).sort((a, b) => a.offset - b.offset);
    const idx = clampN(safeStopIdx, 0, Math.max(0, stops.length - 2));
    const sA = stops[idx] || stops[0];
    const sB = stops[idx + 1] || stops[stops.length - 1] || sA;
    const [r1, g1, b1] = hex2rgb(sA.color || normVal);
    const [r2, g2, b2] = hex2rgb(sB.color || normVal);
    let midCol = rgb2hex((r1 + r2) >> 1, (g1 + g2) >> 1, (b1 + b2) >> 1).toLowerCase();
    if (midCol === (sA.color || '').toLowerCase() || midCol === (sB.color || '').toLowerCase()) {
      midCol = makeHarmoniousStopHex(midCol);
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
    emitGrad({
      ...gCur,
      base: nextStops[Math.floor(nextStops.length / 2)].color,
      stops: nextStops,
      _userCreated: true,
      userCreated: true,
      _cachedCg: null,
      _rampCache: null
    }, midCol, latestOpRef.current, true);
  };

  const removeStopAt = (targetIdx = safeStopIdx) => {
    const gCur = latestGradRef.current;
    if (!gCur || !gCur.stops) return;
    if (gCur.stops.length <= 2) {
      const remStop = gCur.stops[targetIdx === 0 ? 1 : 0] || gCur.stops[0];
      const remHex = (remStop && remStop.color ? remStop.color : normVal).toLowerCase();
      latestGradRef.current = null;
      setLocalGrad(null);
      setStopIdx(0);
      setHsv(hex2hsv(remHex));
      if (onGradChange) onGradChange(null, remHex, latestOpRef.current);
      else if (on) on(remHex, null, latestOpRef.current);
      return;
    }
    const stops = gCur.stops.filter((_, i) => i !== targetIdx);
    stops.forEach((s, i) => { s.offset = +(i / Math.max(1, stops.length - 1)).toFixed(2); });
    const nextIdx = Math.max(0, Math.min(safeStopIdx >= targetIdx ? safeStopIdx - 1 : safeStopIdx, stops.length - 1));
    const nextCol = stops[nextIdx].color || normVal;
    setStopIdx(nextIdx);
    setHsv(hex2hsv(nextCol));
    emitGrad({ ...gCur, stops, _userCreated: true, userCreated: true }, nextCol, latestOpRef.current, true);
  };

  const onOpSlider = pct => {
    const nextOp = clampN(pct / 100, 0, 1);
    const gCur = latestGradRef.current;
    if (gCur && gCur.stops && gCur.stops.length >= 2) {
      const sIdx = clampN(stopIdx, 0, gCur.stops.length - 1);
      const nextStops = gCur.stops.map((s, idx) => idx === sIdx ? { ...s, op: nextOp } : { ...s });
      emitGrad({ ...gCur, stops: nextStops, _userCreated: true, userCreated: true }, normVal, latestOpRef.current, false);
    } else {
      latestOpRef.current = nextOp;
      setLocalOp(nextOp);
      scheduleNotify(() => {
        if (onOpacityChange) onOpacityChange(nextOp);
        if (on) on(cur.toLowerCase(), null, nextOp);
      });
    }
  };

  const emit = (h, s, v) => { setHsv([h, s, v]); out(hsv2hex(h, s, v)); };
  const svFrom = e => { const r = sv.current.getBoundingClientRect(); emit(hsv[0], clampN((e.clientX - r.left) / r.width, 0, 1), 1 - clampN((e.clientY - r.top) / r.height, 0, 1)); };
  const svDown = e => { try { sv.current.setPointerCapture(e.pointerId); } catch (x) {} act.current = true; setDrg(true); svFrom(e); };
  const svMove = e => { if (act.current) svFrom(e); };
  const svUp = () => { act.current = false; setDrg(false); };
  const [pk, setPk] = useState(false);
  const pipe = async () => { if (pk) return; setPk(true); const c = await pickScreenColor(); setPk(false); if (c && /^#[0-9a-f]{6}$/i.test(c)) { const n = c.toLowerCase(); setHsv(hex2hsv(n)); out(n); } };
  const gradCss = isGrad && typeof VMT !== 'undefined' && VMT.gradToCss ? VMT.gradToCss(effGrad) : null;
  const swatchBg = gradCss || hexWithAlphaCss(cur, activeOp);
  const curMode = isGrad ? (effGrad.type === 'radial' ? 'radial' : 'linear') : 'solid';
  const curAngle = isGrad ? Math.round(effGrad.angleDeg ?? effGrad.angle ?? 135) : 135;

  return (<div className="inline-block"><button ref={btn} type="button" data-tip={tip} className={'swatch chk' + (open ? ' open' : '')} style={{
    position: 'relative',
    overflow: 'hidden'
  }} aria-label={'Warna ' + value} onClick={() => setOpen(o => !o)}><span style={{
      position: 'absolute',
      inset: 0,
      background: swatchBg
    }} /></button><Float anchor={btn} open={open} onClose={() => setOpen(false)} w={272} cls="cp"><div className="cp-mode-tabs" role="tablist" aria-label="Mode Warna"><button type="button" className={'cp-mode-tab' + (curMode === 'solid' ? ' on' : '')} onClick={() => switchMode('solid')}>Solid</button><button type="button" className={'cp-mode-tab' + (curMode === 'linear' ? ' on' : '')} onClick={() => switchMode('linear')}>Linear</button><button type="button" className={'cp-mode-tab' + (curMode === 'radial' ? ' on' : '')} onClick={() => switchMode('radial')}>Radial</button></div>{isGrad && <div className="cp-grad-box"><div className="flex items-center justify-between gap-1.5 flex-wrap"><span className="text-[10px] font-bold" style={{
          color: 'var(--ink)'
        }}>{effGrad.type === 'radial' ? 'Radial Gradient' : `Linear (${curAngle}°)`}</span><div className="flex items-center gap-1">{effGrad.stops.length < 8 && <button type="button" className="cp-stop-btn" title="Tambah titik stop warna" onClick={addStop}>+ Stop</button>}<button type="button" className="cp-stop-btn del" title={effGrad.stops.length <= 2 ? 'Hapus stop warna aktif & ubah ke Solid' : `Hapus warna Stop #${safeStopIdx + 1}`} onClick={() => removeStopAt(safeStopIdx)}>Hapus Stop</button></div></div><div className="cp-grad-bar"><div className="cp-grad-bar-fill" style={{
          background: gradCss || cur
        }} /></div><div className="cp-stop-row">{effGrad.stops.map((st, si) => <div key={si} className={'cp-stop-btn' + (safeStopIdx === si ? ' on' : '')} onClick={() => {
          setStopIdx(si);
          setHsv(hex2hsv(st.color || normVal));
        }}><span className="cp-stop-dot" style={{
            background: hexWithAlphaCss(st.color, st.op ?? 1)
          }} /><span>{Math.round((st.offset ?? si / Math.max(1, effGrad.stops.length - 1)) * 100)}%</span><button type="button" className="cp-stop-del" title={effGrad.stops.length <= 2 ? 'Hapus stop ini (jadi Solid)' : `Hapus warna Stop #${si + 1}`} onClick={e => {
            e.stopPropagation();
            removeStopAt(si);
          }}>×</button></div>)}</div>{effGrad.type !== 'radial' && <div className="mt-2"><div className="flex justify-between text-[10px] mut mb-0.5"><span>Sudut Linear</span><span className="font-mono font-bold" style={{
            color: 'var(--ink)'
          }}>{curAngle}°</span></div><Slider min={0} max={360} step={1} value={curAngle} on={ang => emitGrad({
          ...effGrad,
          angleDeg: ang,
          angle: ang,
          _userCreated: true,
          userCreated: true
        }, normVal, latestOpRef.current, false)} label="Sudut Gradient" /></div>}</div>}<div ref={sv} className="sv" data-tip="cpSV" style={{
      background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${hsv2hex(hsv[0], 1, 1)})`
    }} onPointerDown={svDown} onPointerMove={svMove} onPointerUp={svUp} onPointerCancel={svUp}><div className={'sv-h' + (drg ? ' drag' : '')} style={{
        left: hsv[1] * 100 + '%',
        top: (1 - hsv[2]) * 100 + '%',
        background: cur
      }} /></div><Slider min={0} max={360} step={1} value={Math.round(hsv[0])} on={h => emit(h, hsv[1], hsv[2])} label="Hue" tip="cpHue" style={{
      marginTop: 10
    }} thumb={hsv2hex(hsv[0], 1, 1)} track="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" /><div className="cp-alpha-row"><div className="cp-alpha-hdr"><span className="mut font-semibold">{isGrad ? `Transparansi Stop #${safeStopIdx + 1}` : 'Transparansi (Opacity)'}</span><span className="font-mono font-bold" style={{
          color: 'var(--ink)'
        }}>{Math.round(activeOp * 100)}%</span></div><div className="cp-alpha-track-wrap"><Slider min={0} max={100} step={1} value={Math.round(activeOp * 100)} on={onOpSlider} label="Transparansi" thumb={cur} track={`linear-gradient(to right, rgba(0,0,0,0), ${cur})`} /></div></div><div className="flex items-center gap-2 mt-3"><span className="cp-prev chk" style={{
        position: 'relative',
        overflow: 'hidden',
        flex: 'none'
      }}><span style={{
          position: 'absolute',
          inset: 0,
          background: swatchBg
        }} /></span><M3HexInput value={cur} label="HEX" tip="cpHex" onChange={n => {
        setHsv(hex2hsv(n));
        out(n);
      }} /><button type="button" className={'eyed' + (pk ? ' on' : '')} data-tip="cpPipette" aria-label="Pipet warna" onClick={pipe}><Ico n="pipette" size={16} /></button></div></Float></div>);
};

/* Segmented control dengan pil penanda yang bergeser halus */
const Seg = ({ o, v, on, tip, tips, cls }) => { const i = o.findIndex(x => x[0] === v); return (<div className={'seg' + (cls ? ' ' + cls : '')} data-tip={tip || undefined}><div className="seg-p" style={{
    width: `calc((100% - 6px) / ${o.length})`,
    transform: `translateX(${Math.max(0, i) * 100}%)`,
    opacity: i < 0 ? 0 : 1
  }} />{o.map(([k, t, ic]) => <button key={k} data-tip={tips && tips[k] || undefined} className={v === k ? 'on' : ''} onClick={() => on(k)}>{ic && <Ico n={ic} size={cls && cls.includes('stk') ? 15 : 13} />}<span>{t}</span></button>)}</div>); };

export { Seg, M3ColorInput, makeHarmoniousStopHex, M3HexInput, ColorField };
