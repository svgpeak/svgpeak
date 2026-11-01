import React, { useState, useRef, useEffect, useCallback as atUseCallback } from 'react';
import { loadPrefs, applyTheme, applyMotion, savePrefs, TipHost, Help, Settings } from './components/TooltipsAndModals.jsx';
import { AutoTrace } from './components/AutoTrace.jsx';
import { Ico } from './components/CommonControls.jsx';

const _toastListeners = new Set();
const emitToast = msg => _toastListeners.forEach(fn => fn(msg));
const ToastHost = React.memo(() => {
  const [toast, setToast] = useState('');
  const timerRef = useRef(0);
  useEffect(() => {
    const fn = t => {
      setToast(t);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(''), 2200);
    };
    _toastListeners.add(fn);
    return () => { _toastListeners.delete(fn); clearTimeout(timerRef.current); };
  }, []);
  return (<div className="app-toast" style={{
  transform: `translateX(-50%) translateY(${toast ? 0 : 16}px)`,
  opacity: toast ? 1 : 0
}}>{toast}</div>);
});

function App() {
  const [prefs, setPrefs] = useState(() => loadPrefs());
  useEffect(() => { applyTheme(prefs.theme); applyMotion(prefs.motion); }, []);
  useEffect(() => { if (prefs.persist) savePrefs(prefs); }, [prefs]);
  const [help, setHelp] = useState(false), [settings, setSettings] = useState(false), [settingsTab, setSettingsTab] = useState('umum');
  /* Semua pengaturan (Umum, Hardware & Trace, Pintasan, Teknologi) kini berada dalam satu modal */
  const openSettings = atUseCallback((tab) => { if (tab) setSettingsTab(tab); setSettings(true); }, []);
  const setHwSettings = atUseCallback(v => { if (v) { setSettingsTab('hw'); setSettings(true); } else setSettings(false); }, []);
  const openGeneralSettings = atUseCallback(() => { setSettingsTab('umum'); setSettings(true); }, []);
  const flash = atUseCallback(t => emitToast(t), []);
  useEffect(() => {
    const kd = e => {
      const t = e.target, typing = !!(t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]'));
      if (help) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); setHelp(false); } return; }
      if (settings) { if (e.key === 'Escape' || e.key === ',') { e.preventDefault(); setSettings(false); } return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setHelp(true); }
      else if (e.key === ',') { e.preventDefault(); setSettings(s => !s); }
    };
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, [help, settings]);
  return (<div className="app-ws app-full"><div className="mx-auto ws-fin"><div className="ws-body"><div className="fade ws-fill"><AutoTrace flash={flash} onOpenGeneralSettings={openGeneralSettings} hwModalOpenExternal={settings} setHwModalOpenExternal={setHwSettings} /></div></div></div><div className="app-tabbar" aria-label="Bilah aplikasi"><div className="app-tabbtn on" data-tip="appTabTrace"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /></svg>Auto Trace</div><button type="button" data-tip="atHwSettings" className="app-tabbtn" onClick={() => openSettings('hw')}><Ico n="settings" size={15} />Pengaturan</button></div><ToastHost />{prefs.tips !== false && <TipHost />}<Help open={help} onClose={() => setHelp(false)} /><Settings open={settings} onClose={() => setSettings(false)} prefs={prefs} setPrefs={setPrefs} flash={flash} tab={settingsTab} setTab={setSettingsTab} /></div>);
}

export { App };
