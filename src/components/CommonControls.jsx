import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';

const LOGO_INNER = "<path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M2015.49 1411C1873 1504.86 2015.49 1411 1873 1504.86C1635 1180.91 1635 1180.91 1635 1180.91L1445 1423.72L1392 1391.82L1298.43 1497.44L1187.33 1628.67L1405 1490.4C1471.72 1541.79 1405 1490.4 1471.72 1541.79L1650 1378.68L1809.08 1537C903.91 1769.87 1809.08 1537 903.91 1769.87L1522.42 1003.43C1562.76 953.44 1634.75 939.75 1680.95 990.04C1691.79 1001.59 1691.79 1001.59 2015.49 1411Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M3864.2 1173.24C3761 1206.09 3864.2 1173.24 3761 1206.09C3675.38 1105 3494.54 1150.62 3497.37 1293.04C3500.48 1449.88 3730.7 1465.73 3762.88 1343.16C3741.55 1339.52 3653.03 1348.11 3641.84 1340.17C3638.53 1337.82 3636.37 1333.72 3636.42 1329.64C3636.69 1310.56 3636.69 1310.56 3636.11 1268C3635.893 1252.095 3640.99 1243.43 3657.25 1244.43L3867.04 1244.29C3872.48 1243.26 3878.1 1245.17 3881.47 1249.54C3884.55 1255.53 3885.75 1262.28 3885.33 1269L3884.8 1528.85C3843.67 1529.01 3807.01 1502.9 3793 1464.22C3732.88 1559.93 3576.06 1545.77 3489.42 1498.58C3395.28 1447.31 3351.79 1332.18 3379.4 1230.43C3426.78 1055.83 3624.56 1009.66 3776.69 1072.3C3819.69 1090.01 3853.16 1127.96 3864.2 1173.24Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M1658.77 798.15C1659.24 845.74 1658.77 798.15 1659.24 845.74C1772.6 854.46 1881.97 891.5 1977.73 952.81C2022.07 907.49 2093.78 964.54 2062.46 1019C2147.48 1086.58 2219.27 1169.2 2276.49 1261.52C2340.99 1263.02 2276.49 1261.52 2340.99 1263.02L2341.13 1353.23C2258.22 1353.18 2341.13 1353.23 2258.22 1353.18C2256.54 1270.46 2258.22 1353.18 2256.54 1270.46C2256.54 1270.46 2198.84 1188.97 2195.56 1186.27C2255.35 1339.37 2154.25 1474.81 2026.57 1550.58C1932.31 1606.51 1831.78 1649.59 1725.78 1677.8C1585.22 1715.22 1441.72 1741.31 1297 1755.97C1446.6 1722.92 1592.28 1677.26 1734.53 1620.52C1842.37 1577.51 1942.35 1520.1 2031.5 1445.5C2117.75 1373.32 2170.4 1253.39 2118.51 1145.47C2099.59 1106.1 2072.86 1070.1 2042 1039.3C1997.71 1063.19 1947.57 1019.28 1964.84 972.18C1873.43 912.06 1768.25 876.06 1659.13 868.1C1657.81 908.99 1659.13 868.1 1657.81 908.99C1551.42 906.41 1551.68 907.13 1551.42 906.41C1550.87 869.3 1551.42 906.41 1550.87 869.3C1451.75 876.85 1356.92 912.25 1276.22 970.28C1294.37 1014.58 1251.45 1060.44 1206.17 1043.15C1091.14 1258 1206.17 1043.15 1091.14 1258C1116.92 1259.06 1091.14 1258 1116.92 1259.06L1116.89 1352.83L1020.89 1353.11L1020.82 1258.78C1067.04 1258.07 1020.82 1258.78 1067.04 1258.07C1187.61 1031 1067.04 1258.07 1187.61 1031C1137.97 979.03 1213.6 903.17 1265 953C1348.59 891.76 1447.58 854.9 1550.89 846.86C1551.24 801.95 1550.89 846.86 1551.24 801.95C1658.77 798.15 1551.24 801.95 1658.77 798.15Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M2913.82 1169.68L2816 1198.13C2772.88 1146.31 2691.61 1138.37 2630.24 1156.25C2618.53 1159.66 2607.04 1173.55 2609.76 1186.2C2613.15 1201.98 2631.35 1212.29 2645.9 1215.08C2693.26 1224.16 2739.53 1232.47 2786.97 1240.95C2824.55 1247.67 2870.92 1264.92 2895.69 1295.31C2942.27 1352.46 2927.72 1454.03 2864.86 1493.86C2777.73 1549.08 2621.9 1546.39 2532.23 1498.79C2507.31 1485.56 2485.69 1464.47 2470.29 1441C2538 1363.01 2470.29 1441 2538 1363.01C2601.31 1426.38 2677 1437.45 2761.9 1422.88C2799.6 1416.41 2811.39 1370.7 2772.71 1358.3C2761.32 1354.65 2750.9 1350.25 2738.91 1348.12C2671.58 1336.17 2551.65 1327.01 2509.01 1268.99C2461.87 1204.84 2491.7 1106.82 2563.3 1075.29C2641.07 1041.04 2721.77 1042.8 2802.87 1061.08C2858.7 1073.66 2901.94 1112.44 2913.82 1169.68Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M4063.1 1361.14C4060.86 1522.85 4063.1 1361.14 4060.86 1522.85C4060.802 1527.027 4054.03 1528.05 4049.99 1528.02L3960.96 1528.27C3954.92 1529.25 3948.82 1526.21 3946.45 1520.56C3945.66 1518.67 3945.66 1514.12 3945.72 1512.01L3945.71 1070.97C3945.71 1052.23 3959.51 1049.44 3975 1050.69L4192 1050.73C4243.28 1050.74 4305.01 1061.67 4341 1101.99C4391.52 1158.57 4384.13 1261.4 4330.61 1313.62C4306.58 1337.08 4270.97 1352.92 4237.77 1356.81C4180.14 1363.57 4120.99 1362.94 4063.1 1361.14ZM4065.13 1257.89C4212.02 1253.01 4065.13 1257.89 4212.02 1253.01C4270.965 1251.052 4261.534 1154.596 4212.77 1153.26C4065.26 1149.22 4212.77 1153.26 4065.26 1149.22C4065.13 1257.89 4065.26 1149.22 4065.13 1257.89Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M4793.08 1362.02L4500.22 1362.25C4518.41 1454.87 4645.07 1449.63 4699.27 1391.12L4782.8 1445.34C4725.52 1534.86 4601.67 1546.81 4508.33 1515.69C4416.4 1485.04 4367.67 1398.32 4380.81 1303.92C4398.69 1175.57 4514.09 1116.46 4634.87 1132.09C4746.86 1146.59 4824.1 1250.45 4793.08 1362.02ZM4502.21 1283.75L4682.81 1283.74C4659.08 1200.77 4528.58 1202.57 4502.21 1283.75Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M5233.12 1524.08C5182.81 1523.22 5233.12 1524.08 5182.81 1523.22C5182.81 1523.22 5182.81 1523.22 5109.86 1395.94C5126.82 1340.99 5124.08 1262.98 5063.47 1236.54C4963.05 1192.74 4888.67 1317.52 4954 1399.23L5026 1291.86L5171.82 1523.58C5116.15 1523.85 5171.82 1523.58 5116.15 1523.85L5025 1389.36L4940.93 1517.93C4789.19 1480.9 4771.42 1242.02 4896.07 1163.06C4988.37 1104.6 5163.31 1112.58 5215.61 1222.4C5226.9 1246.13 5233.65 1273.68 5234.33 1299.97C5234.91 1322.32 5234.91 1322.32 5233.12 1524.08Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M2910.17 1054.36L3040 1053.95C3048.63 1074.92 3162.67 1367.21 3162.68 1367.2L3284.83 1053.83L3411.19 1053.85C3411.19 1053.85 3216.21 1526.44 3214.94 1527.52L3107.969 1523.538Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M5390 1265.58C5390 1265.58 5545.06 1134.04 5545.06 1134.04C5545.06 1134.04 5545.06 1134.04 5698.13 1131.91C5698.13 1131.91 5698.13 1131.91 5406 1381.33C5390.47 1367.26 5406.39 1382.06 5390.47 1367.26C5386.68 1521.66 5390.47 1367.26 5386.68 1521.66C5386.584 1525.556 5282.97 1525.47 5282.97 1525.47C5275.3 1521.93 5273.994 1510.783 5274.16 1505.03L5273.89 1058C5273.88 1046.88 5275.27 1033.59 5289.97 1034.49L5377.19 1034.45C5381.78 1035.17 5385.65 1038.25 5387.52 1042.49C5389.84 1047.72 5389.84 1047.72 5390 1265.58Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M2118.7 1530.09L2312.25 1770C2309.92 1772 2070.72 1770.98 2045.25 1770.95C2043.46 1770.95 2040.19 1770.13 2038.4 1769.64L1769.59 1714C1890.68 1671.91 2022.02 1615.79 2118.7 1530.09Z\"/><path fill=\"#4f46e5\" style=\"fill:var(--acc,#4f46e5)\" fill-rule=\"evenodd\" d=\"M5514.64 1318.2L5702.82 1523.56C5699.05 1525.99 5546.12 1526.7 5542.53 1524.52C5533.72 1519.18 5542.53 1524.52 5414.89 1387C5514.64 1318.2 5414.89 1387 5514.64 1318.2Z\"/>";

/* Linearisasi sRGB untuk konversi ke OKLab */
const lin = v => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};


/* profil 1D (u in [0,1]) -> daftar stop via 32 bin + RDP warna; kembalikan {st:[{u,c}], rmse} */
const hex2 = v => Math.max(0, Math.min(255, Math.round(Number.isFinite(+v) ? +v : 0))).toString(16).padStart(2, '0');
const toHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
const rgb2hex = toHex;
const hex2rgb = hx => {
  const s = String(hx || '#000000').trim().replace(/^#/, '');
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16), g = parseInt(s[1] + s[1], 16), b = parseInt(s[2] + s[2], 16);
    return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
  }
  const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
};
const hsv2hex = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return toHex(f(5) * 255, f(3) * 255, f(1) * 255); };
const hex2hsv = hx => {
  const [r255, g255, b255] = hex2rgb(hx);
  const r = r255 / 255, g = g255 / 255, b = b255 / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, mx ? d / mx : 0, mx];
};
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const usePresence = (open, ms = 160) => {
  const [m, setM] = useState(open), [lv, setLv] = useState(false);
  useEffect(() => {
    if (open) { setM(true); setLv(false); return; }
    if (!m) return; setLv(true);
    const t = setTimeout(() => { setM(false); setLv(false); }, ms); return () => clearTimeout(t);
  }, [open]);
  return [m, lv];
};
const pickFiles = (accept, cb) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = true; i.onchange = () => { if (i.files.length) cb(Array.from(i.files)); }; i.click(); };
const ICONS = {
  keyboard: 'M2 6h20v12H2z M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M6 14h.01 M10 14h4 M14 14h.01 M18 14h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  detect: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0z',
  pipette: 'M2 22l1-1h3l9-9 M16.5 3.5a2.12 2.12 0 0 1 3 3L12 14l-4 1 1-4 7.5-7.5z',
  screen: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  trash: 'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  palette: 'M12 2a10 10 0 1 0 0 20 2 2 0 0 0 0-4h-1.5a1.5 1.5 0 0 1 0-3H15a5 5 0 0 0 0-10z M6.5 11.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M9 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M14.5 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M17 11.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  hash: 'M4 9h16 M4 15h16 M10 3 8 21 M16 3l-2 18',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  copy: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6v4H9z',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  play: 'M5 3l14 9-14 9V3z',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  zoomIn: 'M11 8v6 M8 11h6 M21 21l-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  zoomOut: 'M8 11h6 M21 21l-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  fit: 'M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M16 21h3a2 2 0 0 0 2-2v-3',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
  check: 'M5 12l5 5 9-10',
  x: 'M18 6 6 18 M6 6l12 12',
  wand: 'M15 4V2 M15 16v-2 M8 9h2 M20 9h2 M17.8 11.8 19 13 M15 9h0 M11.2 6.2 10 5 M17.8 6.2 19 5 M3 21l9-9 M12.2 11.8 14 10',
  layers: 'M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  auto: 'M12 3a9 9 0 1 0 9 9 M12 7v5l3 3',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  shapes: 'M7 3l4 7H3z M14 14h7v7h-7z M7 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  brush: 'M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08 M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z',
  nodes: 'M4 18c4 0 4-12 8-12s4 12 8 12 M4 18h0 M20 18h0 M12 6h0 M2 12h4 M18 12h4',
  grid: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pencil: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  objects: 'M3 3h10v10H3z M11 11h10v10H11z',
  drop: 'M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9z',
  chip: 'M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
  memory: 'M2 8h20v8H2z M6 16v3 M10 16v3 M14 16v3 M18 16v3 M6 11h2 M11 11h2 M16 11h2',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  shrink: 'M4 14h6v6 M20 10h-6V4 M14 10l7-7 M3 21l7-7',
  expand: 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7',
  flow: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M9 6h6a3 3 0 0 1 3 3v6',
  code: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
  atom: 'M12 12h.01 M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5z M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5z',
  wind: 'M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2 M9.6 4.6A2 2 0 1 1 11 8H2 M12.6 19.4A2 2 0 1 0 14 16H2',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3z M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5 M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  alertDot: 'M12 8v5 M12 16.5h.01 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  checkCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12.5l3 3 5-6',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M3 12h18',
  node: 'M5 5h4v4H5z M15 15h4v4h-4z M9 7h3a3 3 0 0 1 3 3v5',
  vector: 'M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z M2 2l7.586 7.586 M11 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  lineSeg: 'M5 19L19 5 M4 17h4v4H4z M16 3h4v4h-4z',
  radiusCorner: 'M4 19V9a5 5 0 0 1 5-5h10 M9 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  sharpCorner: 'M4 19V4h15 M4 4l6 6',
  paste: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6v4H9z M9 14l2 2 4-4',
  curve: 'M3 19C8 19 6 5 12 5s4 14 9 14 M3 19h.01 M21 19h.01',
  eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19 M14.12 14.12a3 3 0 1 1-4.24-4.24 M1 1l22 22',
};
const LOGO_HTML_OBJ = { __html: LOGO_INNER };
let _logoSeq = 0;
const BrandLogo = React.memo(({ height = 36, style }) => {
  /* ID gradien harus unik per instance: salinan di header lama (display:none) sebelumnya "merebut" ID sehingga logo lain tak berwarna */
  const obj = React.useMemo(() => { const k = '-' + (++_logoSeq); return { __html: LOGO_INNER }; }, []);
  return (<svg role="img" aria-label="SVGPeak" viewBox="860 780 4870 1010" style={{
  height,
  width: 'auto',
  flex: 'none',
  display: 'block',
  ...(style || {})
}} dangerouslySetInnerHTML={obj} />);
});
const Ico = React.memo(({ n, size = 14 }) => {
  const d = ICONS[n]; if (!d) return null;
  return (<svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>);
});
const Chev = ({ open }) => (<svg className="chev" style={{
  transform: open ? 'rotate(180deg)' : 'none'
}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);

/* Slider kustom: track + thumb, pointer drag, klik-lompat halus, keyboard (panah, PageUp/Down, Home/End) */
const Slider = ({ min, max, step = 1, value, on, style, track, thumb, label, tip }) => {
  const ref = useRef(null), act = useRef(false), [dr, setDr] = useState(false), v = clampN(value, min, max), pct = (v - min) / (max - min) * 100;
  const from = e => {
    const r = ref.current.getBoundingClientRect(), t = clampN((e.clientX - r.left - 8) / Math.max(1, r.width - 16), 0, 1);
    const x = clampN(+(Math.round((min + t * (max - min) - min) / step) * step + min).toFixed(6), min, max); if (x !== value) on(x);
  };
  const down = e => { if (e.button > 0) return; try { ref.current.setPointerCapture(e.pointerId); } catch (x) {} act.current = true; from(e); ref.current.focus({ preventScroll: true }); };
  const mv = e => { if (!act.current) return; if (!dr) setDr(true); from(e); };
  const end = () => { act.current = false; setDr(false); };
  const key = e => {
    const k = e.key, big = Math.max(step, (max - min) / 10); let x = null;
    if (k === 'ArrowRight' || k === 'ArrowUp') x = v + step; else if (k === 'ArrowLeft' || k === 'ArrowDown') x = v - step;
    else if (k === 'PageUp') x = v + big; else if (k === 'PageDown') x = v - big; else if (k === 'Home') x = min; else if (k === 'End') x = max;
    if (x !== null) { e.preventDefault(); on(clampN(+x.toFixed(6), min, max)); }
  };
  return (<div ref={ref} className={'sl' + (dr ? ' drag' : '') + (track ? ' hue' : '')} tabIndex={0} role="slider" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={v} style={style} data-tip={tip} onPointerDown={down} onPointerMove={mv} onPointerUp={end} onPointerCancel={end} onKeyDown={key}><div className="sl-r"><div className="sl-t" style={track ? {
      background: track
    } : null}>{!track && <div className="sl-f" style={{
        width: pct + '%'
      }} />}</div><div className="sl-h" style={{
      left: pct + '%',
      ...(thumb ? {
        background: thumb
      } : null)
    }} /></div></div>);
};

/* Panel mengambang (portal) + animasi masuk/keluar, posisi otomatis (flip ke atas), tutup via klik luar / Esc */
const Float = ({ anchor, open, onClose, w, cls = '', preferUp = false, children }) => {
  const [m, lv] = usePresence(open), [pos, setPos] = useState(null), ref = useRef(null);
  useLayoutEffect(() => {
    if (!open || !m) return;
    const place = () => {
      const btnEl = anchor.current, el = ref.current;
      if (!btnEl || !el) return;
      const a = btnEl.getBoundingClientRect();
      const W = w || a.width, h = el.offsetHeight || 220;
      const inBottomBar = !!(btnEl.closest && btnEl.closest('.fig-floating-bar'));
      const spaceBelow = window.innerHeight - a.bottom - 12;
      const spaceAbove = a.top - 12;

      /* Buka ke atas jika di floating bar bawah, preferUp aktif, atau ruang bawah sempit */
      let up = preferUp || inBottomBar || (spaceBelow < h && spaceAbove > spaceBelow);
      let top = up ? (a.top - h - 10) : (a.bottom + 8);

      /* Jaring pengaman agar tidak pernah keluar dari batas atas/bawah viewport */
      top = clampN(top, 8, Math.max(8, window.innerHeight - h - 8));
      /* Pusatkan horizontal terhadap tombol bila di floating bar, lalu kunci di dalam layar */
      const rawLeft = inBottomBar ? (a.left + a.width / 2 - W / 2) : a.left;
      const left = clampN(rawLeft, 8, Math.max(8, window.innerWidth - W - 8));

      setPos({ left, top, up, W });
    };
    place();
    let raf = requestAnimationFrame(place);
    const schedulePlace = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); });
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedulePlace) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener('resize', schedulePlace, { passive: true });
    window.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', schedulePlace);
      window.removeEventListener('scroll', schedulePlace, true);
    };
  }, [open, m, w, preferUp]);

  useEffect(() => {
    if (!open) return;
    const dn = e => {
      const t = e.target;
      if ((ref.current && ref.current.contains(t)) || (anchor.current && anchor.current.contains(t))) return;
      onClose();
    };
    const kd = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', dn);
    document.addEventListener('keydown', kd);
    return () => {
      document.removeEventListener('pointerdown', dn);
      document.removeEventListener('keydown', kd);
    };
  }, [open]);

  if (!m) return null;
  return ReactDOM.createPortal(
    (<div ref={ref} className={'flt ' + cls + (lv ? ' out' : ' in') + (pos && pos.up ? ' up' : '')} style={{
  left: pos ? pos.left : 0,
  top: pos ? pos.top : 0,
  width: pos ? pos.W : undefined,
  visibility: pos ? 'visible' : 'hidden'
}}>{children}</div>),
    document.fullscreenElement || document.body
  );
};

/* Dropdown kustom (pengganti <select>) */
const Select = ({ value, options, on, tip }) => {
  const btn = useRef(null), [open, setOpen] = useState(false), [hi, setHi] = useState(0), idx = options.findIndex(o => o[0] === value), cur = options[idx] || options[0];
  const toggle = () => { setHi(Math.max(0, idx)); setOpen(o => !o); };
  const choose = k => { on(k); setOpen(false); btn.current && btn.current.focus(); };
  const key = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) return toggle(); setHi(h => clampN(h + (e.key === 'ArrowDown' ? 1 : -1), 0, options.length - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open ? choose(options[hi][0]) : toggle(); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (<div><button ref={btn} type="button" data-tip={tip} className={'fld sel' + (open ? ' open' : '')} onClick={toggle} onKeyDown={key} aria-haspopup="listbox" aria-expanded={open}><span className="sel-l">{cur[2] && <Ico n={cur[2]} size={14} />}<span>{cur[1]}</span></span><Chev open={open} /></button><Float anchor={btn} open={open} onClose={() => setOpen(false)}>{options.map(([k, t, ic], i) => <div key={k} role="option" aria-selected={k === value} className={'opt' + (i === hi ? ' hi' : '') + (k === value ? ' on' : '')} onMouseEnter={() => setHi(i)} onClick={() => choose(k)}><span className="sel-l">{ic && <Ico n={ic} size={14} />}<span>{t}</span></span><svg className="ck" style={{
        opacity: k === value ? 1 : 0
      }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></div>)}</Float></div>);
};


/* Input angka kustom: tombol − / + , ketik langsung, panah atas/bawah */
const hex3b = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(+v))).toString(16).padStart(2, '0')).join('');
const cssPaint = c => {
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(c || ''); if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return a > 0.02 ? hex3b(m[1], m[2], m[3]) : null;
};
const colorAtPoint = (x, y) => {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest && el.closest('.pip-ov')) continue;
    let c = null;
    try {
      if (el instanceof SVGGeometryElement) {
        const cs = getComputedStyle(el);
        if (+cs.fillOpacity > 0) c = cssPaint(cs.fill);
        if (!c && +cs.strokeOpacity > 0) c = cssPaint(cs.stroke);
      } else if (el instanceof HTMLCanvasElement) {
        const r = el.getBoundingClientRect(), g = el.getContext('2d');
        if (g && r.width && r.height) { const d = g.getImageData(Math.floor((x - r.left) * el.width / r.width), Math.floor((y - r.top) * el.height / r.height), 1, 1).data; if (d[3] > 5) c = hex3b(d[0], d[1], d[2]); }
      } else if (el instanceof HTMLImageElement && el.naturalWidth) {
        const r = el.getBoundingClientRect(), cv = document.createElement('canvas'); cv.width = cv.height = 1;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(el, Math.floor((x - r.left) / r.width * el.naturalWidth), Math.floor((y - r.top) / r.height * el.naturalHeight), 1, 1, 0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data; if (d[3] > 5) c = hex3b(d[0], d[1], d[2]);
      } else if (el instanceof HTMLElement) c = cssPaint(getComputedStyle(el).backgroundColor);
    } catch (e) {}
    if (c) return c;
  }
  return null;
};
const pagePipette = () => new Promise(res => {
  const host = document.fullscreenElement || document.body, ov = document.createElement('div'), ring = document.createElement('div'), chip = document.createElement('div'), hint = document.createElement('div');
  ov.className = 'pip-ov'; ring.className = 'pip-ring'; chip.className = 'pip-chip'; hint.className = 'pip-hint';
  chip.innerHTML = '<i></i><span>—</span>'; hint.textContent = 'Klik untuk mengambil warna · Esc untuk batal';
  ov.append(ring, chip, hint); host.appendChild(ov);
  let cur = null;
  const upd = e => {
    ring.style.left = chip.style.left = e.clientX + 'px'; ring.style.top = chip.style.top = e.clientY + 'px';
    cur = colorAtPoint(e.clientX, e.clientY); chip.firstChild.style.background = cur || ''; chip.lastChild.textContent = cur ? cur.toUpperCase() : 'Tidak ada warna';
  };
  const done = c => { removeEventListener('keydown', kd, true); ov.remove(); res(c); };
  const kd = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(null); } };
  ov.addEventListener('pointermove', upd);
  ov.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); upd(e); if (e.pointerType === 'mouse') done(cur); });
  ov.addEventListener('pointerup', e => { e.stopPropagation(); if (e.pointerType !== 'mouse') done(cur); });
  ov.addEventListener('pointercancel', () => done(null));
  addEventListener('keydown', kd, true);
});
const pickScreenColor = async () => {
  if (window.EyeDropper) { try { const r = await new window.EyeDropper().open(); return String(r.sRGBHex).toLowerCase(); } catch (e) { return null; } }
  return pagePipette();
};

export { hex2hsv, clampN, hsv2hex, hex2rgb, rgb2hex, pickScreenColor, Ico, Float, Slider, usePresence, BrandLogo, ICONS, pickFiles, Select };
