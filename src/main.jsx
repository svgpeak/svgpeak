import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { App } from './App.jsx';

/* Bersihkan sisa elemen portal statis jika halaman pernah disimpan melalui Save Page As (Ctrl+S) */
document.body.classList.remove('rv-open');
document.querySelectorAll('body > .rv-root, body > .ov, body > .tt').forEach(el => el.remove());
ReactDOM.createRoot(document.getElementById('root')).render(<App />);

