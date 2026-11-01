import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { usePresence, clampN, Ico, BrandLogo } from './CommonControls.jsx';
import { Seg } from './ColorPicker.jsx';
import { AtHwSettingsPanel } from './HwSettingsPanel.jsx';

/* ---------- Tooltip kustom (delegasi event pada atribut data-tip) ---------- */
const TIPS = {
  help: { k: '?', t: 'Pintasan keyboard', d: 'Menampilkan daftar semua pintasan keyboard.' },
  settings: { k: ',', t: 'Pengaturan', d: 'Tema, animasi, preferensi UI, dan opsi aplikasi.', w: 'Ubah tampilan atau perilaku aplikasi.' },
  setTheme: { t: 'Tema', d: 'Warna antarmuka: mengikuti sistem, terang, atau gelap.' },
  setMotion: { t: 'Animasi', d: 'Mengontrol animasi dan transisi UI.', w: 'Nonaktifkan jika mengalami lag atau lebih suka antarmuka tenang.' },
  setTips: { t: 'Tooltip', d: 'Menampilkan petunjuk saat mengarahkan kursor ke kontrol.', w: 'Nonaktifkan jika sudah mahir memakai aplikasi.' },
  setPersist: { t: 'Simpan preferensi', d: 'Menyimpan tema, animasi, dan preferensi UI di browser (localStorage).' },
  setReset: { t: 'Reset pengaturan', d: 'Mengembalikan semua preferensi aplikasi ke nilai bawaan.' },
  setAbout: { t: 'Tentang', d: 'Versi aplikasi dan informasi teknis.' },
  closeDlg: { k: 'Esc', t: 'Tutup', d: 'Menutup panel ini.' },

  cpSV: { t: 'Saturasi & kecerahan', d: 'Seret untuk mengatur kepekatan (kiri ke kanan) dan kecerahan (bawah ke atas) warna.' },
  cpHue: { t: 'Hue', d: 'Geser untuk memilih rona warna dasar. Panah keyboard menggeser 1 derajat.' },
  cpPipette: { t: 'Pipet warna', d: 'Ambil warna dari mana saja di layar. Di browser tanpa dukungan pipet bawaan, pipet mengambil warna elemen SVG, canvas, atau gambar di halaman. Esc untuk batal.' },
  cpHex: { t: 'Kode hex', d: 'Ketik 6 digit hex warna (tanpa #). Diterapkan otomatis saat lengkap.' },

  setTabUmum: { t: 'Pengaturan umum', d: 'Tema warna, animasi, tooltip, dan penyimpanan preferensi.' },
  setTabKeys: { t: 'Pintasan keyboard', d: 'Daftar pintasan keyboard yang tersedia di aplikasi.' },
  setTabTech: { t: 'Teknologi & arsitektur', d: 'Daftar pustaka dan API browser yang digunakan.' },
  /* --- Tab Switcher & Auto Trace Tooltips --- */
  appTabTrace: { k: '`', t: 'Tab Auto Trace', d: 'Beralih ke ruang kerja Auto Trace (Bayesian Sub-Pixel Vectorizer) untuk mengubah gambar bitmap menjadi vektor SVG.' },
  atDropzone: { t: 'Unggah Gambar Bitmap', d: 'Klik atau seret file gambar (PNG, JPG, WebP, GIF, BMP) ke sini. Pilih lebih dari 1 file sekaligus untuk masuk ke mode Batch.' },
  atPasteImg: { t: 'Tempel Gambar', d: 'Menempelkan gambar dari clipboard (hasil salin/screenshot) untuk divektorisasi. Pintasan Ctrl+V tetap berfungsi.' },
  atUploadNew: { t: 'Upload Gambar Baru', d: 'Memilih file gambar baru dari perangkat Anda untuk dianalisis dan dikonversi menjadi vektor.' },
  atBackSetup: { t: 'Pengaturan & Pipeline', d: 'Kembali ke halaman analisis citra, pemilihan resolusi, dan pemilihan pipeline vektorisasi.' },
  atResOrig: { t: 'Resolusi Asli (Original)', d: 'Menjalankan proses tracing pada resolusi penuh (hingga 2048 px) untuk mempertahankan ketajaman sudut C⁰ dan presisi sub-piksel maksimal.', w: 'Logo, ikon, tipografi, dan ilustrasi beresolusi sedang-tinggi.' },
  atResHigh: { t: 'Resolusi Tinggi (High)', d: 'Menjalankan proses tracing pada skala ~75% (hingga 1440 px) untuk menjaga ketajaman detail dan sudut dengan komputasi MRF yang lebih ringan dibanding resolusi penuh.', w: 'Ilustrasi detail, artwork beresolusi tinggi (1400–2500 px), dan desain kompleks.' },
  atResMed: { t: 'Resolusi Sedang (Medium)', d: 'Menjalankan proses tracing pada skala menengah ~62.5% (hingga 960 px) untuk keseimbangan ideal antara kecepatan proses, kehalusan kurva Bézier, dan akurasi bentuk.', w: 'Gambar ukuran menengah-besar, clipart, dan foto dengan detail moderat.' },
  atResLow: { t: 'Resolusi Rendah (Low / Fast)', d: 'Menjalankan proses tracing pada skala separuh (hingga 480 px) untuk mempercepat komputasi MRF dan meredam derau/artefak kompresi secara alami.', w: 'Foto berukuran sangat besar (>2500 px) atau gambar berkualitas rendah/berderau.' },
  atPipe_auto: { t: 'Pipeline Fully Automatic', d: 'Vektorisasi satu klik otomatis penuh. Klasifikasi citra, ekstraksi palet CIE-Lab (BIC), segmentasi MRF Potts, dekonvolusi sub-piksel pantai, dan kurva Bézier G¹ dihitung otomatis.', w: 'Saat ingin hasil cepat dan akurat tanpa mengatur parameter manual.' },
  atPipe_basic: { t: 'Pipeline Basic Wizard', d: 'Panduan interaktif 5 langkah: pilih jenis gambar, transparansi, kualitas & kehalusan kurva, mode warna, serta tinjau/edit palet sebelum vektorisasi.', w: 'Saat ingin memilih mode warna atau menyesuaikan palet sebelum di-trace.' },
  atPipe_adv: { t: 'Pipeline Advanced Wizard', d: 'Kendali matematis penuh 6 tahap: kompensasi halo alpha, generator palet & komparator kuantisasi, tuning MRF, editor segmentasi piksel, kehalusan kurva, dan preset.', w: 'Gambar kompleks, kualitas rendah, atau kebutuhan produksi CAD/CNC/sablon.' },
  atPipeStart_auto: { t: 'Mulai Vektorisasi Otomatis', d: 'Langsung memproses gambar dengan pipeline Fully Automatic menggunakan resolusi dan mode warna yang dipilih.' },
  atPipeStart_basic: { t: 'Buka Basic Wizard', d: 'Masuk ke panduan 5 langkah Basic Wizard untuk menyesuaikan opsi dasar dan palet warna.' },
  atPipeStart_adv: { t: 'Buka Advanced Wizard', d: 'Masuk ke 6 tahap Advanced Wizard untuk kontrol penuh atas seluruh parameter matematis.' },
  atQuickColor: { t: 'Mode Warna Cepat', d: 'Menentukan mode kuantisasi warna untuk pipeline Fully Automatic: Two Colors (2 warna), Automatic (BIC optimal), atau Unlimited (spektrum penuh).' },
  atQuickColor_two: { t: 'Two Colors (2 Warna)', d: 'Memisahkan gambar menjadi tepat 2 warna dominan berkontras tinggi.' },
  atQuickColor_auto: { t: 'Automatic Colors (BIC)', d: 'Mendeteksi jumlah warna optimal secara otomatis di ruang warna perseptual CIE-Lab.' },
  atQuickColor_unlimited: { t: 'Unlimited Colors', d: 'Mengalokasikan lebih banyak klaster warna untuk menangkap gradasi dan detail halus.' },
  atAlgAccordion: { t: 'Arsitektur Algoritma 8-Tahap', d: 'Menampilkan atau menyembunyikan penjelasan teknis 8 tahap mesin Bayesian Sub-Pixel Vectorizer.' },
  atStepNav: { t: 'Tahap Wizard', d: 'Menunjukkan progres langkah saat ini. Klik langkah yang sudah selesai untuk kembali ke tahap tersebut.' },
  atBtnBack: { t: 'Kembali', d: 'Kembali ke langkah atau layar sebelumnya.' },
  atBtnNext: { t: 'Lanjut', d: 'Melanjutkan ke langkah konfigurasi berikutnya.' },
  atBtnRunTrace: { t: 'Mulai Vektorisasi', d: 'Menjalankan proses vektorisasi sub-piksel sesuai konfigurasi yang telah dipilih.' },
  atType_auto: { t: 'Deteksi Tipe Otomatis', d: 'Biarkan mesin mengenali karakteristik gambar menggunakan matriks GLCM 4-arah, entropi spektral, dan gradien Scharr 2D.' },
  atType_blended: { t: 'Artwork dengan Tepi Anti-Aliasing', d: 'Mengaktifkan dekonvolusi sub-piksel pantai (Beach Inversion) penuh untuk memulihkan kontur mulus dari piksel transisi.', w: 'Logo, ikon, stiker, dan ilustrasi digital.' },
  atType_aliased: { t: 'Artwork Tanpa Anti-Aliasing', d: 'Menjaga batas piksel tegas tanpa perataan tepi anti-aliasing.', w: 'Pixel art, bitmap 1-bit, atau tangkapan layar piksel tajam.' },
  atType_photo: { t: 'Fotografi (Photograph)', d: 'Mengoptimalkan kuota palet warna CIE-Lab dan regularisasi MRF untuk gambar foto.', w: 'Foto potret, pemandangan, atau objek dunia nyata.' },
  atAlpha_keep: { t: 'Pertahankan Transparansi', d: 'Area transparan tidak di-trace dan tepi semi-transparan di-unpremultiply agar bebas dari cincin halo.' },
  atAlpha_white: { t: 'Ratakan ke Latar Putih', d: 'Melebur kanal alpha di atas latar putih bersih sebelum proses vektorisasi.' },
  atAlpha_custom: { t: 'Ratakan ke Warna Kustom', d: 'Melebur kanal alpha di atas warna latar pilihan Anda.' },
  atAlphaColor: { t: 'Warna Latar Flattening', d: 'Pilih warna latar yang digunakan untuk meratakan piksel semi-transparan.' },
  atQualSeg: { t: 'Kualitas Gambar Input', d: 'Mengatur kekuatan penapisan bilateral dan penalti energi MRF (β). Pilih Rendah jika gambar banyak derau/kompresi JPEG.' },
  atDetailSeg: { t: 'Level Detail Segmen', d: 'Mengatur kepekaan ukuran segmen: Rendah untuk bentuk simpel, Tinggi untuk mempertahankan detail kecil.' },
  atBasicSmooth: { t: 'Kehalusan Kurva & Sudut Halus', d: 'Mengatur kekuatan penghalusan kontur Taubin + G¹ Bézier fitting. Nilai lebih tinggi menghasilkan lengkungan dan ujung bulat (smooth corner) yang ekstra mulus tanpa garis kasar.' },
  atColMode_two: { t: 'Mode Dua Warna (Two Colors)', d: 'Reduksi biner menjadi 2 warna kontras tertinggi. Sangat cocok untuk logo hitam-putih, siluet, line art, dan stempel.' },
  atColMode_auto: { t: 'Mode Warna Otomatis (Automatic)', d: 'Menentukan jumlah warna terbaik secara otomatis menggunakan kriteria statistik BIC di ruang CIE-Lab.' },
  atColMode_custom: { t: 'Mode Warna Kustom (Custom Colors)', d: 'Mengunci palet pada daftar warna yang Anda pilih, ubah, atau tambahkan dari gambar.' },
  atColMode_unlimited: { t: 'Mode Warna Tak Terbatas (Unlimited)', d: 'Mengizinkan alokasi klaster warna maksimal dengan sensitivitas tinggi untuk menangkap gradasi dan nuansa warna.' },
  atChipColor: { t: 'Ubah Warna Palet', d: 'Klik untuk membuka pemilih warna (area saturasi/kecerahan, hue, pipet layar, dan kandidat warna gambar).' },
  atChipDel: { t: 'Hapus Warna dari Palet', d: 'Menghapus warna ini dari daftar palet aktif.' },
  atAddImgColor: { t: 'Tambah Warna dari Gambar', d: 'Mendeteksi dan menambahkan warna dominan berikutnya dari gambar secara otomatis ke dalam palet.' },
  atCandSwatch: { t: 'Kandidat Warna Terdeteksi', d: 'Klik untuk langsung menambahkan warna yang terdeteksi dari gambar ini ke daftar palet aktif.' },
  atMergeSim: { t: 'Gabung Warna Mirip', d: 'Melebur warna-warna palet yang jarak perseptualnya sangat dekat agar tidak terjadi duplikasi layer.' },
  atAdvPalMode: { t: 'Mode Alokasi Klaster', d: 'Fixed mengunci jumlah warna persis sesuai angka K; Flexible memilih jumlah warna optimal via BIC.' },
  atAdvTargetK: { t: 'Jumlah Warna Target (K)', d: 'Jumlah warna eksak untuk K-Means++ saat mode Fixed aktif (geser kiri/kanan atau klik −/+).' },
  atAdvSens: { t: 'Sensitivitas Warna (BIC γ)', d: 'Mengatur seberapa mudah warna bernuansa dekat dipisah menjadi klaster tersendiri.' },
  atAdvPipette: { t: 'Pipet Sampel Gambar', d: 'Klik pada pratinjau gambar untuk memungut warna. Tahan Ctrl saat mengklik untuk membaurkan dengan warna terakhir.' },
  atAdvComparator: { t: 'Komparator Kuantisasi Palet', d: 'Menampilkan perbandingan gambar asli vs simulasi pembulatan warna palet sebelum segmentasi MRF dijalankan.' },
  atAdvComplexity: { t: 'Kompleksitas Segmentasi (MRF)', d: 'Mengatur keseimbangan antara kesetiaan detail piksel dan kemulusan batas segmen (parameter β model Potts).' },
  atAdvMinPx: { t: 'Ukuran Segmen Minimum (Piksel)', d: 'Segmen pulau yang luasnya di bawah angka piksel ini akan dilebur otomatis ke segmen tetangga terbesar.' },
  atAdvRunSeg: { t: 'Jalankan Segmentasi MRF', d: 'Mengeksekusi partisi QuadTree dan optimasi diskrit MRF Potts untuk membentuk peta label warna.' },
  atAdvRunTrace: { t: 'Trace Batas & Fitting Bézier', d: 'Mengekstraksi graf planar, menjalankan dekonvolusi sub-piksel pantai, penghalusan Taubin/CG, dan fitting kurva Bézier G¹.' },
  atAdvSmooth: { t: 'Kehalusan Kontur (Smoothness)', d: 'Mengatur kekuatan filter Taubin bebas-kerut dan bobot energi kelengkungan elastika. Naikkan untuk menghilangkan garis bergelombang/kasar.' },
  atAdvCorners: { t: 'Deteksi Sudut Tajam (C⁰)', d: 'Saat aktif, sudut yang benar-benar lancip dikunci sebagai sudut C⁰, sedangkan ujung melengkung tetap dijadikan kurva smooth G¹.' },
  atAdvCornerAng: { t: 'Ambang Sudut Tajam (°)', d: 'Batas minimal perubahan arah (derajat) dengan lengan lurus agar sebuah belokan dikunci sebagai sudut tajam.' },
  atAdvAA: { t: 'Mesin Anti-Aliasing Sub-Piksel', d: 'Mengaktifkan dekonvolusi pantai (Beach Inversion) dan perataan Taubin untuk menghilangkan tangga piksel (staircase).' },
  atAdvNodeDens: { t: 'Kerapatan Simpul (Node Density)', d: 'Mengatur toleransi galat fitting kurva Bézier. Turunkan agar kurva lebih mulus dengan jumlah node lebih sedikit; naikkan untuk detail mikro.' },
  atAdvAutoUpd: { t: 'Auto-Update Pratinjau', d: 'Menghitung ulang kurva Bézier secara otomatis setiap kali slider di tahap Smoothing digeser.' },
  atStack_stack: { t: 'Tumpuk Berlapis (Cake-Stack)', d: 'Menumpuk bentuk dari area terluas di bawah hingga detail di atas untuk mencegah celah antar-bentuk.' },
  atStack_cutout: { t: 'Potong Berlubang (Cut-Out Mosaic)', d: 'Melubangi bentuk di bawahnya sehingga setiap warna menjadi ubin rata yang tidak saling tumpang tindih.' },
  atStack_grouped: { t: 'Cut-Out & Kelompokkan per Warna', d: 'Membuat potongan mosaik tidak tumpang tindih dan mengelompokkannya ke dalam elemen <g> berdasarkan warna.' },
  atStrokeToggle: { t: 'Stroke Anti-Celah', d: 'Menambahkan garis tepi tipis sewarna fill untuk menutup celah render anti-aliasing di layar.' },
  atDxfMode: { t: 'Format Entitas DXF', d: 'Pilih Spline (AcDbSpline halus) atau Polyline (garis segmen rapat/sedikit) untuk kompatibilitas perangkat lunak CAD/CNC.' },
  atPresetBox: { t: 'Nama Preset Baru', d: 'Ketik nama untuk menyimpan seluruh konfigurasi parameter saat ini sebagai preset.' },
  atPresetSave: { t: 'Simpan Preset', d: 'Menyimpan konfigurasi saat ini ke penyimpanan lokal browser.' },
  atPresetLoad: { t: 'Muat Preset', d: 'Menerapkan parameter dari preset ini.' },
  atPresetDel: { t: 'Hapus Preset', d: 'Menghapus preset ini dari daftar.' },
  atCmpModes: { t: 'Mode Pratinjau Perbandingan', d: 'Pilih tampilan: Split (tirai geser), Samping (berdampingan), Bitmap saja, Vektor saja (vektor murni tajam), atau Outline/Node.' },
  atCmp_split: { t: 'Mode Split (Tirai Geser)', d: 'Bandingkan bitmap di kiri dan vektor di kanan dengan menyeret garis pembagi.' },
  atCmp_side: { t: 'Mode Berdampingan', d: 'Tampilkan bitmap di sisi kiri dan vektor di sisi kanan secara bersamaan.' },
  atCmp_bitmap: { t: 'Tampilan Bitmap Asli', d: 'Menampilkan gambar raster asli saja.' },
  atCmp_vector: { t: 'Tampilan Vektor Murni', d: 'Merender path vektor secara langsung di kanvas resolusi penuh (tetap tajam pada level zoom berapa pun).' },
  atCmp_wire: { t: 'Tampilan Outline & Simpul Node', d: 'Menampilkan garis rangka (wireframe) kontur vektor beserta posisi titik simpul (node) Bézier.' },
  atCmpZoomIn: { t: 'Perbesar Pratinjau', d: 'Memperbesar tampilan tepat ke titik tengah kanvas pratinjau tanpa menggeser posisi gambar.' },
  atCmpZoomOut: { t: 'Perkecil Pratinjau', d: 'Memperkecil tampilan terhadap titik tengah kanvas pratinjau.' },
  atCmpZoomFit: { t: 'Reset Zoom (Pas Layar)', d: 'Mengembalikan pembesaran ke 100% dan memusatkan gambar di tengah kanvas.' },
  atCmpCanvas: { t: 'Kanvas Pratinjau Interaktif', d: 'Scroll untuk zoom tepat ke arah kursor, seret untuk menggeser kanvas, atau seret garis tengah pada mode Split.' },
  atExpSvg: { t: 'Unduh Berkas .SVG', d: 'Mengunduh hasil vektorisasi sebagai file Scalable Vector Graphics (.svg).' },
  atExpCopy: { t: 'Salin Kode SVG', d: 'Menyalin kode XML SVG ke clipboard agar bisa langsung ditempel (Ctrl+V) di Figma, Illustrator, atau kode web.' },
  atExpPng: { t: 'Unduh Gambar PNG (2x HD)', d: 'Merender dan mengunduh vektor sebagai gambar PNG transparan beresolusi 2x lipat.' },
  atExpDxf: { t: 'Unduh Berkas CAD (.DXF)', d: 'Mengekspor kontur vektor ke format AutoCAD DXF untuk mesin CNC, laser cutting, atau plotter.' },
  atExpAi: { t: 'Unduh Adobe Illustrator (.AI)', d: 'Mengekspor dokumen vektor ke format .ai (berbasis PDF-1.4 vektor asli).' },
  atExpEps: { t: 'Unduh PostScript (.EPS)', d: 'Mengekspor dokumen vektor ke format Encapsulated PostScript (EPSF-3.0) untuk alur kerja percetakan.' },
  atRevBgPick: { t: 'Hapus Latar Interaktif (Make Background)', d: 'Aktifkan lalu klik area warna pada kanvas pratinjau untuk mengubah warna tersebut menjadi transparan.' },
  atRevSegEdit: { t: 'Buka Editor Segmentasi Piksel', d: 'Menyunting peta label piksel secara manual menggunakan kuas Pencil, Flood Fill, atau peleburan Zap, lalu men-trace ulang.' },
  atRetracePal: { t: 'Trace Ulang dengan Palet Baru', d: 'Menjalankan vektorisasi ulang memakai palet yang baru Anda tambah/hapus. Proses tidak berjalan otomatis agar Anda bisa mengatur beberapa warna dulu.' },
  atRevRetry: { t: 'Konfigurasi & Trace Ulang', d: 'Kembali ke pengaturan pipeline/wizard untuk mengubah parameter dan menjalankan vektorisasi ulang.' },
  atStatSw: { t: 'Toggle Visibilitas Warna Region', d: 'Klik kotak warna ini untuk menyembunyikan (menjadikan transparan) atau menampilkan kembali seluruh region berwarna ini.' },
  atSegTools: { t: 'Alat Editor Segmentasi', d: 'Pencil: lukis piksel label · Fill: warnai 1 area terhubung · Zap: lebur segmen kecil ke tetangga · Picker: ambil warna label.' },
  atSegTool_pencil: { t: 'Kuas Piksel Cepat (B)', d: 'Lukis label warna secara manual pada kisi piksel dengan pembaruan buffer instan.' },
  atSegTool_fill: { t: 'Ember Isi / Smart Fill (G)', d: 'Mengganti warna 1 segmen terhubung, seluruh segmen berwarna sama, atau segmen bertetangga yang mirip.' },
  atSegTool_wand: { t: 'Magic Fill Warna Asli (W)', d: 'Mengisi area berdasarkan kemiripan warna pada gambar bitmap asli (sangat efektif untuk menyatukan banyak segmen kecil sekaligus).' },
  atSegTool_rect: { t: 'Isi Kotak Area / Box Fill (R)', d: 'Seret kotak persegi untuk mewarnai banyak segmen kecil sekaligus di dalam area kotak.' },
  atSegTool_zap: { t: 'Lebur Segmen ke Tetangga / Zap (Z)', d: 'Menghapus segmen yang diklik dan meleburnya secara cerdas ke warna tetangga terdekat.' },
  atSegTool_picker: { t: 'Pipet Label (I / Alt+Klik)', d: 'Mengambil warna label dari piksel yang diklik untuk digunakan pada kuas atau fill.' },
  atSegFillScope: { t: 'Mode Cakupan Ember Isi (Fill Scope)', d: '1 Segmen: hanya mewarnai 1 pulau segmen yang diklik · Semua Warna Sama: langsung mengganti seluruh segmen berlabel sama di kanvas · Toleransi Tetangga: menggabungkan segmen tetangga yang warnanya mirip.' },
  atSegCleanSpeckle: { t: 'Lebur Segmen Kecil Otomatis', d: 'Melebur seluruh segmen pulau berukuran kecil di bawah ambang piksel ke segmen tetangga terdekat secara instan.' },
  atReturnReview: { t: 'Kembali ke Perakitan SVG', d: 'Kembali ke halaman Perakitan SVG & hasil proses tracing yang sudah selesai tanpa perlu men-trace ulang.' },
  atSegPalette: { t: 'Pilih Warna Label Aktif', d: 'Klik untuk memilih warna palet yang akan digunakan saat menggambar dengan Pencil atau Fill.' },
  atSegBrush: { t: 'Ukuran Kuas Pencil', d: 'Mengatur diameter kuas piksel (1 sampai 25 piksel).' },
  atSegUndo: { t: 'Undo Editan Segmen', d: 'Membatalkan langkah pengeditan piksel terakhir.' },
  atSegRedo: { t: 'Redo Editan Segmen', d: 'Mengulangi langkah pengeditan piksel yang dibatalkan.' },
  atSegRevert: { t: 'Kembalikan ke Awal (Revert)', d: 'Mengembalikan seluruh peta label ke hasil segmentasi MRF semula.' },
  atSegBounds: { t: 'Tampilkan Garis Batas Segmen', d: 'Menampilkan atau menyembunyikan garis hitam penanda perbatasan antar-warna.' },
  atSegApply: { t: 'Terapkan & Trace Ulang', d: 'Menjalankan ulang ekstraksi kontur dan kurva Bézier berdasarkan peta segmentasi yang sudah Anda perbaiki.' },
  atHwSettings: { k: ',', t: 'Pengaturan Hardware & Multi-Thread', d: 'Atur alokasi RAM saat proses tracing, jumlah CPU core, dukungan Multi-Thread (Web Worker Pool), dan akselerasi VGA / GPU (WebGL2/WebGPU).' },
  setTabHw: { t: 'Performa & Hardware Trace', d: 'Konfigurasi alokasi RAM, jumlah CPU core, dukungan multi-thread, dan akselerasi VGA untuk mesin Auto Trace.' },
  atHwRamMode: { t: 'Mode Alokasi RAM', d: 'Otomatis menyesuaikan kapasitas RAM perangkat, atau Kustom untuk menentukan batas alokasi memori buffer secara manual.' },
  atHwRamSlider: { t: 'Alokasi RAM Tracing (MB / GB)', d: 'Batas memori RAM yang dialokasikan untuk slab pool TypedArray, pohon k-d CIE-Lab, partisi QuadTree, dan antrean worker saat proses tracing berlangsung.' },
  atHwRamPreset: { t: 'Preset Kapasitas RAM', d: 'Klik untuk langsung menetapkan batas alokasi RAM saat proses tracing.' },
  atHwMultiThread: { t: 'Support Multi-Thread (Web Worker Pool)', d: 'Menjalankan komputasi berat (penapisan bilateral, gradien Scharr, MRF Potts, penghalusan kontur Conjugate Gradient, dan fitting Bézier) secara paralel di banyak thread CPU.' },
  atHwCpuCores: { t: 'Alokasi CPU Core / Worker Threads', d: 'Jumlah thread pekerja paralel (Web Workers) yang dijalankan serentak selama proses tracing.' },
  atHwCpuPreset: { t: 'Preset Jumlah CPU Core', d: 'Pilih cepat alokasi core CPU: Single Core, Separuh Core, Semua Core fisik/logis, atau Ekstra Thread.' },
  atHwThreadPrio: { t: 'Mode Penjadwalan Thread', d: 'Turbo memaksimalkan kecepatan multi-core tanpa jeda; Seimbang menjaga kelancaran UI; Eco menghemat daya baterai.' },
  atHwUseGpu: { t: 'Pakai VGA / Akselerasi GPU', d: 'Mengaktifkan akselerasi perangkat keras VGA melalui shader WebGL2 / WebGPU untuk pemfilteran bilateral edge-preserving, gradien Scharr 2D, dan pemetaan warna.' },
  atHwGpuPower: { t: 'Preferensi Adapter VGA', d: 'Pilih High-Performance untuk memaksa browser memakai kartu grafis diskrit (NVIDIA/AMD), atau Low-Power untuk GPU terintegrasi.' },
  atHwGpuPipe: { t: 'Mode Pipeline Shader VGA', d: 'Penuh: menjalankan shader Bilateral 5×5 + Gradien Scharr 2D di VGA; Filter Saja: hanya menjalankan pra-penapisan Bilateral di VGA.' },
  atHwReset: { t: 'Reset Pengaturan Hardware', d: 'Mengembalikan konfigurasi alokasi RAM, CPU core, multi-thread, dan VGA ke nilai optimal bawaan perangkat.' },
  atSegCmpModes: { t: 'Mode Perbandingan Segmentasi', d: 'Bandingkan peta label segmentasi MRF dengan gambar bitmap asli: Split (tirai geser), Samping (berdampingan), Overlay (transparan), Segmentasi saja, atau Asli saja.' },
  atSegOverlayOp: { t: 'Transparansi Overlay Gambar Asli', d: 'Atur opasitas gambar asli di atas peta segmentasi untuk mengecek ketepatan batas warna dan sudut huruf.' },
  atSegTool_pan: { t: 'Geser Kanvas (Pan Tool)', d: 'Seret kanvas untuk menggeser tampilan tanpa melukis piksel label.' },
  atAdvPresetTypo: { t: 'Preset Tipografi A–Z (Sharp & Smooth)', d: 'Mengoptimalkan parameter untuk huruf A–Z: menjaga sudut lancip (A, V, W, M, N, Z, E, F, H, I, L, T) tetap tajam C⁰, menjaga lengkungan (B, C, D, G, J, O, P, Q, R, S, U) tetap mulus G¹, dan meluruskan batang huruf yang miring/bengkok.' },
  atAdvPresetGeo: { t: 'Preset Logo Geometris & Ikon', d: 'Pelurusan garis tinggi, penguncian sumbu 0°/90°/45°, dan ketajaman puncak sudut maksimal untuk logo berbasis bentuk geometris.' },
  atAdvPresetIllus: { t: 'Preset Ilustrasi & Kurva Organik', d: 'Penghalusan kurva elastika yang luwes dengan transisi G¹ lembut untuk ilustrasi bebas dan karakter.' },
  atAdvPresetLine: { t: 'Preset Line Art & Sketsa Teknis', d: 'Peredaman tangga piksel (staircase despeckle) kuat dan perlindungan ujung garis tipis.' },
  atAdvSmoothMethod: { t: 'Algoritma Penghalusan Kontur', d: 'Hybrid (Taubin + Elastika CG): kombinasi bebas-kerut terbaik. Taubin λ|μ: perataan cepat tanpa penyusutan. Elastika CG: minimisasi kelengkungan fisik Polak-Ribière.' },
  atAdvLineStraighten: { t: 'Pelurusan Garis Bengkok (Straighten Bent Lines)', d: 'Mendeteksi segmen yang seharusnya lurus tetapi melengkung/bergelombang pasca-tracing, lalu memproyeksikannya ke garis lurus Total Least Squares (L) dan menghapus kurva S palsu.' },
  atAdvAxisSnap: { t: 'Kunci Sumbu Vertikal / Horizontal / 45°', d: 'Menyejajarkan batang huruf (I, H, T, E, F, L, M, N, D, B, P, R) atau tepi objek yang miring tipis ke sumbu 0°, 90°, atau ±45° menggunakan perpotongan rel sisi.' },
  atAdvAxisSnapDeg: { t: 'Toleransi Derajat Kunci Sumbu (°)', d: 'Batas kemiringan maksimum (0.5° – 8°) terhadap sumbu horizontal/vertikal/45° agar segmen lurus dikunci tepat ke sumbu.' },
  atAdvDespeckle: { t: 'Reduksi Gerigi Piksel (Staircase Despeckle)', d: 'Menghilangkan efek anak-tangga (staircase/jaggies) 1 piksel pada garis miring seperti kaki huruf A, V, W, X, Y, Z sebelum fitting kurva.' },
  atAdvExtremum: { t: 'Penyejajaran Puncak Kurva (Cardinal Extrema)', d: 'Menempatkan simpul ekstremum dengan garis singgung mendatar/tegak murni di puncak lengkungan huruf O, C, G, S, U, B, D, P, R.' },
  atAdvCornerMode: { t: 'Mode Diskriminator Sudut', d: 'Hybrid A–Z: membedakan otomatis sudut tajam C⁰ (garis-garis & garis-kurva) vs sudut halus G¹ (busur). Tajam Presisi: prioritaskan sudut tegas. Halus Organik: prioritaskan lengkungan.' },
  atAdvLineCurveSens: { t: 'Kepekaan Transisi Garis-ke-Kurva (Huruf D, P, R, B, G, U, J)', d: 'Mengatur kepekaan deteksi pertemuan batang lurus dengan perut lengkung huruf: menjaga sudut siku D/P/B/R tetap tajam C⁰ sekaligus menjaga transisi tangensial U/J tetap mulus G¹.' },
  atAdvApexSharp: { t: 'Rekonstruksi Puncak Sudut Lancip (Apex Ray-Intersection)', d: 'Merekonstruksi titik potong tepat dari dua sisi lurus sehingga puncak lancip huruf A, V, W, M, N, Z yang tumpul saat rasterisasi kembali tajam.' },
  atAdvCornerRound: { t: 'Preservasi Sudut Membulat (Smooth Corner G¹)', d: 'Mengontrol seberapa kuat lengkungan bertahap (busur Kåsa) dipertahankan sebagai kurva halus G¹ agar sudut bulat tidak berubah menjadi patah/faset.' },
  atAdvStemCap: { t: 'Proteksi Ujung Batang Huruf (Stem Cap & Serif Guard)', d: 'Mencegah dua sudut siku 90° yang berdekatan pada ujung batang huruf tipis (I, H, T, E, F, L, N, A) menyatu menjadi ujung bulat kapsul.' },
  atRtTabProcess: { t: 'Tab Proses Tracing (Real-Time Drawing)', d: 'Menampilkan visualisasi real-time dari awal gambar di-scanning, kuantisasi palet, segmentasi MRF, hingga digambar menjadi kurva SVG beserta diagnostik 7 tahap.' },
  atRtTabCompare: { t: 'Tab Bandingkan Hasil & Edit Latar', d: 'Bandingkan bitmap asli vs vektor SVG dengan mode Split, Samping, Outline/Node, atau hapus warna latar (Make Background).' },
  atRtTabNodeEdit: { t: 'Tab Vector Editor', d: 'Buka Vector Editor interaktif untuk memilih & memindahkan objek SVG, mengedit node & handle Bézier secara langsung, meluruskan 2 node menjadi garis lurus, mengatur radius sudut, serta menggunakan 12 fungsi Smart Snapping.' },
  atNodeTool_select: { t: 'Pilih Objek, Edit Node & Handle Bézier (V)', d: 'Mode Vector Editor terpadu: klik & seret objek SVG untuk memindahkannya, klik & seret node untuk menggeser simpul, atau tarik tangkai kendali (handle) Bézier untuk melengkungkan kurva secara otomatis.' },
  atNodeTool_add: { t: 'Tambah Node / Add Node (A)', d: 'Klik langsung pada garis atau kurva kontur untuk menyisipkan simpul (node) baru menggunakan subdivisi kubik De Casteljau tanpa mengubah bentuk kurva.' },
  atNodeTool_delete: { t: 'Hapus Node / Delete Node (D)', d: 'Klik pada node mana pun (atau tekan Delete/Backspace) untuk menghapus node dari kontur dan menyambung ulang segmen di sekitarnya.' },
  atNodeTool_line: { t: 'Garis Lurus 2 Node (L)', d: 'Pilih 2 node (atau klik Node 1 lalu Node 2) untuk meluruskan jalur di antara kedua node tersebut menjadi segmen garis lurus presisi.' },
  atNodeTool_radius: { t: 'Fitur Radius: Ubah Tajam Jadi Rounded (R)', d: 'Klik pada node sudut tajam untuk mengubahnya menjadi sudut membulat (rounded fillet) sesuai nilai radius aktif, atau geser slider radius.' },
  atNodeTool_sharp: { t: 'Ubah Node Rounded Jadi Tajam (S)', d: 'Klik pada node yang membulat (rounded/smooth) untuk mengembalikannya menjadi sudut tajam C⁰ secara instan.' },
  atNodeTool_copyrad: { t: 'Copy Radius Node (C)', d: 'Klik pada suatu node untuk menyalin nilai radius kelengkungan sudutnya ke papan klip radius.' },
  atNodeTool_pasterad: { t: 'Paste Radius ke Node Lain (P)', d: 'Klik pada node target untuk menempelkan nilai radius yang telah disalin sehingga sudutnya memiliki radius bulatan yang persis sama.' },
  atRtPause: { t: 'Jeda / Lanjutkan Proses Tracing', d: 'Menghentikan sementara animasi real-time tracing agar Anda dapat memperbesar (zoom) kanvas dan memeriksa detail pada tahap saat ini.' },
  atRtReplayAll: { t: 'Putar Ulang Proses Menggambar (0%–100%)', d: 'Memutar kembali animasi real-time dari awal pemindaian (scanning) hingga menjadi gambar vektor SVG utuh seperti sedang menggambar.' },
  atRtReplayStage: { t: 'Putar Ulang Tahap Ini', d: 'Memutar ulang animasi khusus pada tahap yang sedang dipilih untuk mengamati proses di tahap tersebut.' },
  atRtSpeed: { t: 'Kecepatan Animasi Real-Time Tracing', d: 'Atur kecepatan animasi scanning dan penggambaran kurva: 0.5× (Lambat/Detail), 1× (Normal), 2× (Cepat), atau Instan.' },
  atRtScrubber: { t: 'Garis Waktu Proses Tracing (0%–100%)', d: 'Geser ke kiri atau kanan untuk melompat ke momen mana pun dari proses scanning hingga penggambaran kurva SVG.' },
  atRtStageCard: { t: 'Pilih & Inspeksi Tahap Ini', d: 'Klik untuk melihat visualisasi kanvas dan panduan diagnostik masalah khusus pada tahap ini.' },
  atRtGhost: { t: 'Bayangan Gambar Asli (Ghost Overlay)', d: 'Menampilkan bayangan transparan gambar bitmap asli di belakang kanvas penggambaran untuk mengecek apakah ada garis yang melenceng.' },
  atRtPins: { t: 'Indikator Sudut C⁰/G¹ & Handle Bézier', d: 'Menampilkan atau menyembunyikan penanda Sudut Tajam C⁰ (kotak oranye), Sudut Halus G¹ (lingkaran biru), dan tangkai kendali kurva Bézier.' },
  atRtHold: { t: 'Tetap di Tab Proses Saat Selesai', d: 'Jika aktif, layar tidak langsung tertutup saat mencapai 100% sehingga Anda bisa langsung menginspeksi setiap tahap proses tracing.' },
  atAdpProfileCard: { t: 'Sistem Adaptive Parameter Profile', d: 'Menyesuaikan parameter ke-8 tahap pipeline (layer_difference ΔE, filter_speckle, MRF Potts β, smoothing_strength λ, dan bezier_tolerance ε) secara terpadu berdasarkan profil karakter gambar.' },
  atAdpMode_auto: { t: 'Profil Otomatis (Image Profiler Adaptif)', d: 'Menghitung warna efektif CIE-Lab, entropi warna, kepadatan tepi, detail mikro, dan kontinuitas gradasi untuk memilih Profil A, B, atau C secara otomatis.' },
  atAdpMode_flat: { t: 'Profil A — Ikon, Logo & Ilustrasi Flat', d: 'Prioritas bentuk geometris akurat, sudut C⁰ tegas, garis lurus presisi, filter bilateral ringan, dan jumlah node minimal.' },
  atAdpMode_illustration: { t: 'Profil B — Ilustrasi Berwarna & Organik', d: 'Prioritas mempertahankan bentuk organik, detail kecil/jahitan, transisi warna lokal, dan membedakan tangga piksel dari kurva asli.' },
  atAdpMode_photo: { t: 'Profil C — Foto & Lukisan Gradasi Kompleks', d: 'Prioritas pengelompokan warna/gradasi koheren, penapisan bilateral edge-preserving, dan pencegahan ledakan jumlah poligon.' },
  atAdpParamBox: { t: 'Parameter Adaptif Dinamis', d: 'Nilai parameter ini dihitung secara otomatis oleh Image Profiler dari karakteristik gambar input dan skala resolusinya.' },
  atAdpClosedLoop: { t: 'Closed-Loop Auto-Calibration (Round-Trip & Boundary IoU)', d: 'Mengevaluasi hasil tracing terhadap gambar asli menggunakan fungsi skor gabungan J = wc·Ecolor + wb·Eboundary + wt·Etopology + wd·Edetail + ws·Ecomplexity dan menguji kandidat parameter alternatif jika diperlukan penyempurnaan.' },
  atAdpTwoAxis: { t: 'Klasifikasi Dua Sumbu Independen', d: 'Memisahkan Sumbu A (Struktur Keluarga Warna: 1-Family vs Multi-Family di CIELCh) dan Sumbu B (Karakter Permukaan: Flat/Diskrit vs Gradasi/Kontinu vs Campuran).' },
  atAdpWeights: { t: 'Bobot Profil Kontinu & 6 Atribut Independen', d: 'Menghindari klasifikasi keras dengan menggabungkan bobot Flat/Ilustrasi/Foto serta 6 atribut independen (geometryPriority, detailProtection, noiseSuppression, gradientPreservation, alphaSensitivity, topologyProtection).' }
};

/* Tooltip otomatis: elemen interaktif/informatif tanpa data-tip tetap mendapat tooltip (label + deskripsi singkat) */
const AUTO_TIP_SEL = 'button,[role="tab"],summary,label,input:not([type="hidden"]):not([type="file"]),.at-sw,.at-chip,.at-stat-pill,.rv-pct,.rv-file,.rv-brand,.rv-dock-title,.rv-side-t,.at-rt-live-badge,.rv-side .at-kv,.rv-desc,.seg-p';
const autoTipText = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
const autoTip = t => {
  try {
    const el = t.closest(AUTO_TIP_SEL);
    if (!el) return null;
    const own = el.getAttribute('data-tip');
    if (own && TIPS[own]) return el;
    let label = el.getAttribute('aria-label') || el.getAttribute('title') || autoTipText(el);
    if (el.classList.contains('seg-p')) { const sg = el.closest('.seg'); const on = sg && sg.querySelector('button.on'); label = on ? autoTipText(on) : ''; }
    if (!label) return null;
    if (label.length > 48) label = label.slice(0, 46).trim() + '…';
    const row = el.closest('.at-kv');
    const rowLbl = row && row.firstElementChild ? autoTipText(row.firstElementChild) : '';
    let ttl = label, desc = '';
    const cl = el.classList;
    const pTip = el.parentElement && el.parentElement.closest ? el.parentElement.closest('[data-tip]') : null;
    if (el.tagName === 'BUTTON' && el.closest('.seg')) {
      const ctx = rowLbl || '';
      ttl = ctx ? ctx + ' · ' + label : label;
      desc = 'Pilih opsi “' + label + '”' + (ctx ? ' untuk ' + ctx : '') + '.';
    } else if (cl.contains('seg-p')) {
      ttl = 'Opsi terpilih: ' + label; desc = 'Penanda opsi yang sedang aktif pada kontrol ini.';
    } else if (cl.contains('rv-tab')) {
      desc = 'Buka tampilan “' + label + '”.';
    } else if (cl.contains('rv-exp')) {
      desc = 'Buka menu ekspor untuk mengunduh hasil vektor.';
    } else if (cl.contains('rv-ibtn') || (el.tagName === 'BUTTON' && !autoTipText(el))) {
      desc = 'Klik untuk ' + label.toLowerCase() + '.';
    } else if (el.tagName === 'BUTTON' && cl.contains('at-sw')) {
      ttl = label; desc = 'Sampel warna. Klik untuk menyorot atau mengubah objek berwarna ini.';
    } else if (el.tagName === 'BUTTON') {
      desc = 'Klik untuk menjalankan aksi “' + label + '”.';
    } else if (el.tagName === 'SUMMARY') {
      ttl = label.replace(/\s*\d+\s*$/, ''); desc = 'Klik untuk membuka atau menutup bagian ini.';
    } else if (el.tagName === 'LABEL' || el.tagName === 'INPUT') {
      desc = 'Klik untuk mengaktifkan atau menonaktifkan opsi “' + label + '”.';
    } else if (cl.contains('at-sw') || cl.contains('at-chip')) {
      ttl = label; desc = 'Sampel warna dari palet. Klik untuk menyorot objek yang memakai warna ini.';
    } else if (cl.contains('at-stat-pill')) {
      desc = 'Keterangan warna/penanda yang tampil pada kanvas tahap ini.';
    } else if (cl.contains('rv-pct')) {
      ttl = 'Progres total'; desc = 'Persentase keseluruhan proses tracing yang sudah selesai.';
    } else if (cl.contains('rv-file') || cl.contains('rv-brand')) {
      ttl = 'Nama berkas'; desc = label;
    } else if (cl.contains('rv-dock-title')) {
      ttl = 'Tahap saat ini'; desc = label;
    } else if (cl.contains('rv-side-t')) {
      ttl = 'Panel diagnostik'; desc = label;
    } else if (cl.contains('at-rt-live-badge')) {
      ttl = 'Status proses'; desc = 'Menunjukkan apakah tracing sedang berjalan, dijeda, atau sudah selesai (' + label + ').';
    } else if (cl.contains('rv-desc')) {
      return null;
    } else if (el.matches('.rv-side .at-kv')) {
      const v = el.lastElementChild ? autoTipText(el.lastElementChild) : '';
      ttl = rowLbl || label; desc = v && v !== ttl ? 'Nilai saat ini: ' + v + '.' : 'Informasi diagnostik tahap ini.';
    } else {
      desc = label;
    }
    if (pTip && !desc) return null;
    const key = 'auto:' + ttl + '|' + desc;
    if (!TIPS[key]) TIPS[key] = { t: ttl, d: desc };
    el.removeAttribute('title');
    el.setAttribute('data-tip', key);
    return el;
  } catch (e) { return null; }
};
const TipHost = () => {
  const [st, setSt] = useState({ k: null }), [pos, setPos] = useState(null), ref = useRef(null), last = useRef(null);
  if (st.k) last.current = st;
  const [m, lv] = usePresence(!!st.k, 140), d = last.current && TIPS[last.current.k];
  useEffect(() => {
    let timer = 0, grace = 0, life = 0, iv = 0, lastScrollTs = -1000, moveAttached = false;
    let cur = null, curRect = null, sup = null, shown = false, kb = false, fm = false, mx = -1, my = -1;
    const isScrollingNow = () => (performance.now() - lastScrollTs) < 150;
    const find = t => {
      if (!t || !t.closest) return null;
      let el = t.closest('[data-tip]');
      while (el) {
        const k = el.getAttribute('data-tip');
        if (k && TIPS[k]) return el;
        el = el.parentElement && el.parentElement.closest ? el.parentElement.closest('[data-tip]') : null;
      }
      return autoTip(t);
    };
    const insideCached = (r, x, y) => r && r.width > 0 && r.height > 0 && x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2;
    const move = e => {
      if (!cur || (e.pointerType && e.pointerType !== 'mouse')) return;
      mx = e.clientX; my = e.clientY;
      if (!cur.contains(e.target) && !insideCached(curRect, mx, my)) hide();
    };
    const attachMove = () => {
      if (!moveAttached) { moveAttached = true; document.addEventListener('pointermove', move, { passive: true, capture: true }); }
    };
    const detachMove = () => {
      if (moveAttached) { moveAttached = false; document.removeEventListener('pointermove', move, true); }
    };
    const stopIv = () => { if (iv) { clearInterval(iv); iv = 0; } detachMove(); };
    const hide = () => {
      if (!cur && !timer && !shown) return;
      if (timer) { clearTimeout(timer); timer = 0; }
      if (life) { clearTimeout(life); life = 0; }
      stopIv();
      cur = null; curRect = null; fm = false;
      setSt(s => s.k ? { k: null } : s);
      if (shown) {
        clearTimeout(grace);
        grace = setTimeout(() => { shown = false; }, 240);
      }
    };
    const startIv = () => {
      stopIv();
      attachMove();
      iv = setInterval(() => {
        if (!cur) { stopIv(); return; }
        if (!cur.isConnected) { hide(); return; }
        const r = cur.getBoundingClientRect();
        curRect = r;
        if (r.width === 0 || r.height === 0 || (cur.disabled && !fm && !insideCached(r, mx, my))) { hide(); return; }
        if (!fm && mx >= 0 && !insideCached(r, mx, my)) hide();
      }, 500);
    };
    const show = (el, now, byFocus) => {
      if (isScrollingNow() && !byFocus) return;
      cur = el; fm = !!byFocus;
      if (timer) clearTimeout(timer);
      if (grace) clearTimeout(grace);
      if (life) clearTimeout(life);
      const k = el.getAttribute('data-tip'); if (!TIPS[k]) return;
      const go = () => {
        timer = 0;
        if (isScrollingNow() || cur !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        curRect = r;
        shown = true;
        const as = innerWidth >= 1024 ? el.closest('aside') : null;
        setSt({ k, r, ar: as ? as.getBoundingClientRect() : null });
        startIv();
        life = setTimeout(hide, 20000);
      };
      if (shown || now) go(); else timer = setTimeout(go, 420);
    };
    const over = e => {
      if (isScrollingNow() || (e.pointerType && e.pointerType !== 'mouse')) return;
      mx = e.clientX; my = e.clientY; kb = false;
      if (cur && cur.contains && cur.contains(e.target)) return;
      if (sup && sup.contains && sup.contains(e.target)) return;
      const el = find(e.target);
      if (!el) { if (cur || timer) hide(); return; }
      if (el === cur || el === sup) return;
      show(el);
    };
    const out = e => {
      if (!cur && !sup) return;
      const rt = e.relatedTarget;
      if (sup && !(rt && sup.contains(rt))) sup = null;
      if (cur && !(rt && cur.contains(rt))) hide();
    };
    const down = e => { kb = false; sup = find(e.target); if (cur || timer || shown) hide(); };
    const fin = e => { const el = find(e.target); if (kb && el && e.target.matches && e.target.matches(':focus-visible')) show(el, true, true); };
    const key = e => {
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') { if (e.key === 'Tab') kb = true; return; }
      kb = true; if (cur || timer || fm || shown) hide();
    };
    const any = () => { if (cur || timer || shown) hide(); };
    const onScrollOrWheel = () => {
      lastScrollTs = performance.now();
      if (cur || timer || shown) hide();
    };
    const vis = () => { if (document.hidden) any(); };
    const root = document.documentElement;
    const L = (t, n, f, o) => t.addEventListener(n, f, o), R = (t, n, f, o) => t.removeEventListener(n, f, o);
    const evs = [
      [document, 'pointerover', over, { passive: true }],
      [document, 'pointerout', out, { passive: true }],
      [document, 'pointerdown', down, { passive: true, capture: true }],
      [document, 'focusin', fin, { passive: true }],
      [document, 'focusout', any, { passive: true }],
      [document, 'keydown', key, true],
      [document, 'scroll', onScrollOrWheel, { passive: true, capture: true }],
      [document, 'wheel', onScrollOrWheel, { passive: true, capture: true }],
      [document, 'contextmenu', any],
      [document, 'dragstart', any],
      [document, 'pointercancel', any, { passive: true }],
      [document, 'touchstart', any, { passive: true }],
      [document, 'visibilitychange', vis],
      [root, 'pointerleave', any, { passive: true }],
      [root, 'mouseleave', any, { passive: true }],
      [window, 'blur', any],
      [window, 'resize', any, { passive: true }]
    ];
    evs.forEach(x => L(x[0], x[1], x[2], x[3]));
    return () => { stopIv(); clearTimeout(timer); clearTimeout(grace); clearTimeout(life); evs.forEach(x => R(x[0], x[1], x[2], x[3])); };
  }, []);
  useLayoutEffect(() => {
    if (!m || !ref.current || !last.current) return;
    const { r, ar } = last.current, el = ref.current, w = el.offsetWidth, h = el.offsetHeight, G = 10;
    /* Hitung zona aman bawah agar tooltip tidak pernah tertutup floating bar (.app-tabbar / .fig-floating-bar) */
    const fbar = document.querySelector('.app-tabbar, .fig-floating-bar');
    const fbRect = (fbar && fbar.getClientRects().length) ? fbar.getBoundingClientRect() : null;
    const overlapsHoriz = fbRect && (r.right + w / 2 >= fbRect.left - 12 && r.left - w / 2 <= fbRect.right + 12);
    const maxBottom = (fbRect && overlapsHoriz) ? Math.min(innerHeight - 8, fbRect.top - 10) : (innerHeight - 8);
    let left, top, side = 'bottom';
    if (ar && ar.right + G + w <= innerWidth - 8) {
      side = 'right';
      left = ar.right + G;
      top = clampN(r.top + r.height / 2 - h / 2, 8, Math.max(8, maxBottom - h));
    } else {
      left = clampN(r.left + r.width / 2 - w / 2, 8, Math.max(8, innerWidth - w - 8));
      top = r.bottom + G;
      if ((top + h > maxBottom || (fbRect && r.top >= fbRect.top - 4)) && r.top - h - G > 8) {
        top = r.top - h - G;
        side = 'top';
      }
    }
    setPos({ left, top, side });
  }, [m, st.k, st.r]);
  if (!m || !d) return null;
  return ReactDOM.createPortal((<div ref={ref} className={'tt ' + (lv ? 'out' : 'in') + ' s-' + (pos ? pos.side : 'bottom')} style={{
  left: pos ? pos.left : 0,
  top: pos ? pos.top : 0,
  visibility: pos ? 'visible' : 'hidden'
}}><div className="tt-t"><span>{d.t}</span>{d.k && <Keys s={d.k} />}</div><div className="tt-d">{d.d}</div>{d.w && <div className="tt-r"><b>Kapan dipakai</b>{d.w}</div>}{d.pk && d.pk.map(([n, x], i) => <div key={i} className="tt-r"><b>Pilih {n} jika</b>{x}</div>)}{d.up && <div className="tt-r"><b>↑ Naikkan jika</b>{d.up}</div>}{d.dn && <div className="tt-r"><b>↓ Turunkan jika</b>{d.dn}</div>}</div>), document.fullscreenElement || document.body);
};
/* ---------- Keyboard shortcut: tampilan tombol, panel bantuan ---------- */
const Keys = ({ s }) => (<span className="keys">{s.split(' | ').map((c, i) => <span key={i} className="keyc">{i > 0 && <i>/</i>}{c.split(' + ').map((k, j) => <kbd key={j} className="kbd">{k}</kbd>)}</span>)}</span>);
const SC = [
  ['Bantuan', [['?', 'Buka / tutup panel ini'], [',', 'Buka / tutup pengaturan'], ['Esc', 'Tutup panel atau menu']]]
];
const Help = ({ open, onClose }) => {
  const [m, lv] = usePresence(open, 200);
  if (!m) return null;
  return ReactDOM.createPortal((<div className={'ov ' + (lv ? 'out' : 'in')} onPointerDown={e => {
  if (e.target === e.currentTarget) onClose();
}}><div className="hp" role="dialog" aria-label="Pintasan keyboard"><div className="flex items-center justify-between mb-4"><div><div className="text-sm font-semibold">Pintasan keyboard</div><div className="text-[11px] mut mt-0.5">Tombol huruf tidak aktif saat mengetik di kolom input.</div></div><button className="btn sec" style={{
        padding: 0,
        width: 32,
        height: 32,
        borderRadius: '50%',
        flex: 'none'
      }} onClick={onClose} aria-label="Tutup" data-tip="closeDlg"><Ico n="x" size={14} /></button></div><div className="hp-g">{SC.map(([g, rows]) => <div key={g}><div className="hp-t">{g}</div>{rows.map(([k, t]) => <div key={t} className="hp-r"><span>{t}</span><Keys s={k} /></div>)}</div>)}</div></div></div>), document.fullscreenElement || document.body);
};
/* ---------- Panel Pengaturan ---------- */
const LS_KEY = 'trace-svg-settings-v1';
const DEFAULT_PREFS = { theme: 'system', motion: 'system', tips: true, persist: true };
const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...p };
  } catch (e) { return { ...DEFAULT_PREFS }; }
};
const savePrefs = (p) => {
  try {
    if (p.persist === false) { localStorage.removeItem(LS_KEY); return; }
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch (e) {}
};
const applyTheme = (theme) => {
  const root = document.documentElement;
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  else if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
};
const applyMotion = (motion) => {
  const root = document.documentElement;
  if (motion === 'off') root.setAttribute('data-motion', 'off');
  else if (motion === 'on') root.setAttribute('data-motion', 'on');
  else root.removeAttribute('data-motion');
};
const TECH = [
  { g: "Antarmuka", ic: "layers", items: [
    ["React", "18.3.1", "atom", "Komponen dan state (build UMD produksi)."],
    ["htm", "3.1.1", "code", "Pustaka kecil bernama htm (bukan HTML) untuk menulis template ala JSX tanpa langkah build."],
    ["Tailwind CSS", "3.4.17", "wind", "Utility class lewat CDN."],
    ["SVG + CSS variables", "", "shapes", "Pratinjau vektor serta tema terang/gelap."]
  ] },
  { g: "API browser", ic: "settings", items: [
    ["EyeDropper API", "", "pipette", "Pipet warna di seluruh layar, dengan cadangan pipet halaman."],
    ["Blob + Object URL", "", "download", "Ekspor SVG langsung dari browser, tanpa server."],
    ["DOMParser", "", "code", "Membaca SVG hasil trace untuk diekspor ke format AI dan EPS."],
    ["localStorage", "", "database", "Menyimpan preferensi dan posisi dock."]
  ] }
];
const Settings = ({ open, onClose, prefs, setPrefs, flash, tab, setTab }) => {
  const [sTabLocal, setSTabLocal] = useState('umum');
  const sTab = tab || sTabLocal, setSTab = setTab || setSTabLocal;
  const [m, lv] = usePresence(open, 200);
  if (!m) return null;
  const set = (k) => (v) => {
    setPrefs(p => {
      const n = { ...p, [k]: v };
      if (k === 'theme') applyTheme(v);
      if (k === 'motion') applyMotion(v);
      if (k === 'persist' || n.persist) savePrefs(n);
      else if (k === 'persist' && !v) { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
      return n;
    });
  };
  const reset = () => {
    const n = { ...DEFAULT_PREFS };
    setPrefs(n);
    applyTheme(n.theme);
    applyMotion(n.motion);
    savePrefs(n);
    flash && flash('Pengaturan direset');
  };
  return ReactDOM.createPortal((<div className={'ov ' + (lv ? 'out' : 'in')} onPointerDown={e => {
  if (e.target === e.currentTarget) onClose();
}}><div className="hp" role="dialog" aria-label="Pengaturan" style={{
    maxWidth: 720
  }}><div className="flex items-center justify-between mb-4"><div><div className="text-sm font-semibold">Pengaturan</div><div className="text-[11px] mut mt-0.5">Tema, hardware & trace (RAM, CPU, VGA), pintasan keyboard, dan informasi aplikasi</div></div><button className="btn sec" style={{
        padding: 0,
        width: 32,
        height: 32,
        borderRadius: '50%',
        flex: 'none'
      }} onClick={onClose} aria-label="Tutup" data-tip="closeDlg"><Ico n="x" size={14} /></button></div><div className="mb-4"><Seg v={sTab} on={setSTab} cls="ic" o={[['umum', 'Umum', 'settings'], ['hw', 'Hardware & Trace', 'bolt'], ['keys', 'Pintasan', 'keyboard'], ['tech', 'Teknologi', 'chip']]} tips={{
        umum: 'setTabUmum',
        hw: 'setTabHw',
        keys: 'setTabKeys',
        tech: 'setTabTech'
      }} /></div>{sTab === 'hw' && <div key="s-hw"><AtHwSettingsPanel flash={flash} /></div>}<div className="space-y-5" style={{
      display: sTab === 'umum' ? 'block' : 'none'
    }}><div><div className="text-xs mut mb-2" data-tip="setTheme">Tema</div><Seg v={prefs.theme} on={set('theme')} o={[['system', 'Sistem'], ['light', 'Terang'], ['dark', 'Gelap']]} tip="setTheme" /><div className="text-[11px] mut mt-2">Sistem mengikuti preferensi perangkat Anda.</div></div><div style={{
        borderTop: '1px solid var(--line)',
        paddingTop: 16
      }}><div className="text-xs mut mb-2" data-tip="setMotion">Animasi</div><Seg v={prefs.motion} on={set('motion')} o={[['system', 'Sistem'], ['on', 'Aktif'], ['off', 'Nonaktif']]} tip="setMotion" /><div className="text-[11px] mut mt-2">Nonaktifkan untuk mengurangi gerakan dan beban GPU.</div></div><div style={{
        borderTop: '1px solid var(--line)',
        paddingTop: 16
      }}><div className="flex items-center justify-between gap-3 mb-2"><div data-tip="setTips"><div className="text-xs mut">Tooltip</div><div className="text-[11px] mut mt-0.5">Petunjuk saat kursor diarahkan ke kontrol</div></div><Seg cls="eq" v={prefs.tips ? 'on' : 'off'} on={k => set('tips')(k === 'on')} o={[['on', 'Aktif'], ['off', 'Mati']]} tip="setTips" /></div></div><div style={{
        borderTop: '1px solid var(--line)',
        paddingTop: 16
      }}><div className="flex items-center justify-between gap-3"><div data-tip="setPersist"><div className="text-xs mut">Simpan preferensi</div><div className="text-[11px] mut mt-0.5">Disimpan di localStorage browser ini</div></div><Seg cls="eq" v={prefs.persist ? 'on' : 'off'} on={k => set('persist')(k === 'on')} o={[['on', 'Ya'], ['off', 'Tidak']]} tip="setPersist" /></div></div><div style={{
        borderTop: '1px solid var(--line)',
        paddingTop: 16
      }} className="flex flex-wrap gap-2"><button className="btn sec text-xs" data-tip="setReset" onClick={reset}><Ico n="reset" />Reset ke bawaan</button><button className="btn sec text-xs" data-tip="help" onClick={() => setSTab('keys')}><Ico n="keyboard" />Lihat Pintasan Keyboard</button></div><div style={{
        borderTop: '1px solid var(--line)',
        paddingTop: 16
      }}><div className="abt-g" data-tip="setAbout"><Ico n="sparkle" size={13} />Tentang</div><div className="abt-card"><div className="flex items-center gap-3.5" style={{
            position: 'relative',
            zIndex: 1
          }}><div style={{
              minWidth: 0
            }}><div className="flex items-center gap-2.5 flex-wrap"><BrandLogo height={34} style={{
                  filter: 'drop-shadow(0 2px 10px rgba(99,102,241,0.28))'
                }} /><span className="abt-ver" style={{
                  background: 'var(--acc)'
                }}><Ico n="sparkle" size={10} />v1.0</span></div><div className="text-[11.5px] mut mt-2">Auto Trace</div><div className="text-[12px] font-semibold mt-1" style={{
                color: 'var(--acc)'
              }}>Created By Reza Pahlevi</div></div></div><div className="flex flex-wrap gap-1.5 mt-3.5" style={{
            position: 'relative',
            zIndex: 1
          }}>{['OKLab', 'MRF', 'Bézier fitting', 'Multi-Format Ekspor'].map(t => <span key={t} className="abt-tag" style={{
              marginLeft: 0,
              display: 'inline-block'
            }}>{t}</span>)}</div></div></div></div>{sTab === 'keys' && <div className="space-y-4 fade" key="s-keys"><div className="text-[11.5px] mut">Tombol huruf tidak aktif saat mengetik di kolom input. Tekan <kbd className="kbd">?</kbd> kapan saja untuk membuka daftar pintasan.</div><div className="hp-g">{SC.map(([g, rows]) => <div key={g}><div className="hp-t">{g}</div>{rows.map(([k, t]) => <div key={t} className="hp-r"><span>{t}</span><Keys s={k} /></div>)}</div>)}</div></div>}{sTab === 'tech' && <div className="space-y-5 fade" key="s-tech">{TECH.map(G => <div key={G.g}><div className="abt-g"><Ico n={G.ic} size={13} />{G.g}</div><div className="abt-grid">{G.items.map(([t, v, ic, d]) => <div key={t} className="abt-c"><div className="abt-b"><Ico n={ic} size={15} /></div><div style={{
              minWidth: 0
            }}><div className="abt-t">{t}{v && <span className="abt-v">{v}</span>}</div><div className="abt-d">{d}</div></div></div>)}</div></div>)}</div>}</div></div>), document.fullscreenElement || document.body);
};

export { loadPrefs, applyTheme, applyMotion, savePrefs, TipHost, Help, Settings };
