# SVGPeak 1.2 — Modular React (.jsx) + Tailwind CSS

Proyek ini adalah hasil modularisasi dari **SVGPEAK 1.2.html** menjadi arsitektur multi-file **React (`.jsx`)** + **1 file `index.html`** menggunakan **Vite** dan **Tailwind CSS** lokal tanpa ketergantungan script CDN (`react`, `react-dom`, `htm`, maupun `cdn.tailwindcss.com`).

## Struktur Direktori

```text
svgpeak-react-tailwind/
├── index.html                           # Satu-satunya file HTML (entry point tanpa CDN)
├── package.json                         # Dependensi lokal React 18, Vite, dan Tailwind CSS
├── vite.config.js                       # Konfigurasi bundler Vite + plugin React
├── tailwind.config.js                   # Konfigurasi tema & token warna Tailwind CSS
├── postcss.config.js                    # Konfigurasi PostCSS (Tailwind + Autoprefixer)
└── src/
    ├── main.jsx                         # Bootstrapper ReactDOM.createRoot & impor CSS
    ├── App.jsx                          # Komponen utama aplikasi & ToastHost
    ├── styles/
    │   ├── index.css                    # Entrypoint stylesheet utama
    │   ├── tailwind.css                 # Direktif @tailwind base/components/utilities
    │   ├── design-system.css            # Variabel CSS, layout, & komponen SVGPeak
    │   └── m3-ui.css                    # Material Design 3 custom controls & color picker
    ├── engine/
    │   ├── VectorEngine.jsx             # Engine vektor VE (parser SVG & eksportir AI/EPS)
    │   └── VmtEngine.jsx                # Bayesian Sub-Pixel Vectorization Engine (VMT)
    └── components/
        ├── CommonControls.jsx           # Utilitas warna, BrandLogo, Ico, Slider, Float, Select, Pipette
        ├── ColorPicker.jsx              # M3HexInput, M3ColorInput, ColorField, Seg
        ├── TooltipsAndModals.jsx        # Sistem tooltip (TipHost), modal Pintasan (Help), & Pengaturan (Settings)
        ├── TraceSharedUI.jsx            # Konstanta AutoTrace & komponen input dasar (AtOptCard, AtRow, AtNum, dll.)
        ├── CanvasRenderUtils.jsx        # Utilitas render kanvas, wireframe cache, & portal RvSide/RvPortal
        ├── CompareView.jsx              # Komponen perbandingan gambar asli vs hasil vektor (Split/Overlay/Diff)
        ├── SegPreviewCompare.jsx        # Pratinjau komparasi segmentasi warna
        ├── SegEditor.jsx                # Editor segmentasi piksel & label warna interaktif
        ├── NodeEditor.jsx               # Editor simpul kurva Bezier, fillet, & manipulasi path vektor
        ├── PaletteComponents.jsx        # AtColorChip, AtDetectedPalette, & PaletteEdit
        ├── HwSettingsPanel.jsx          # Konfigurasi akselerasi hardware (WebGPU/WebGL2/SIMD Worker)
        ├── RealTimeTraceStudio.jsx      # Studio visualisasi proses vectorization real-time & ProgressSteps
        ├── ReviewScreen.jsx             # Layar tinjauan hasil akhir, statistik (ResultStats), & ExportActions
        ├── BasicWizard.jsx              # Wizard langkah-demi-langkah mode dasar (Basic Wizard)
        ├── AdvWizard.jsx                # Wizard konfigurasi lanjutan (Advanced Wizard)
        └── AutoTrace.jsx                # Workspace utama AutoTrace
```

## Cara Menjalankan Proyek

1. **Instal dependensi lokal:**
   ```bash
   npm install
   ```

2. **Jalankan server pengembangan (development):**
   ```bash
   npm run dev
   ```

3. **Bangun untuk produksi (production build):**
   ```bash
   npm run build
   ```
