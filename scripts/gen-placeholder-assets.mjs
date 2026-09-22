// 占位素材生成器：SVG 角色帧 + 测试音 + manifest + 图标
// 用法：npm run gen:assets
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets-app', 'default');

const W = 600, H = 800;
const HEAD = { x: 300, y: 260, r: 150 };
const EYE_L = 235, EYE_R = 365, EYE_Y = 255, EYE_R2 = 26, PUPIL = 12;
const MOUTH = { x: 300, y: 330 };
const SKIN = '#ffb25a';
const SKIN_DARK = '#e8933f';
const OUTLINE = '#b06a2a';

function catSvg({ pupilDx = 0, pupilDy = 0, mouth = 'line', blush = false, sparkles = false, tilt = 0 } = {}) {
  const mx = pupilDx, my = pupilDy;
  const mouthSvg = mouth === 'line'
    ? `<path d="M ${MOUTH.x - 18} ${MOUTH.y} Q ${MOUTH.x} ${MOUTH.y + 12} ${MOUTH.x + 18} ${MOUTH.y}" stroke="${OUTLINE}" stroke-width="5" fill="none" stroke-linecap="round"/>`
    : '';
  const blushSvg = blush
    ? `<ellipse cx="185" cy="315" rx="26" ry="14" fill="#ff9d9d" opacity="0.75"/>
       <ellipse cx="415" cy="315" rx="26" ry="14" fill="#ff9d9d" opacity="0.75"/>`
    : '';
  const sparklesSvg = sparkles
    ? `<text x="120" y="150" font-size="36">✦</text><text x="452" y="180" font-size="28">✦</text><text x="430" y="90" font-size="22">＋</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="rotate(${tilt} 300 420)">
    <!-- 耳朵 -->
    <path d="M 190 170 L 205 52 L 292 122 Z" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M 410 170 L 395 52 L 308 122 Z" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M 205 150 L 212 92 L 262 128 Z" fill="#ffd9c2"/>
    <path d="M 395 150 L 388 92 L 338 128 Z" fill="#ffd9c2"/>
    <!-- 身体 -->
    <ellipse cx="300" cy="580" rx="175" ry="185" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="6"/>
    <ellipse cx="300" cy="625" rx="105" ry="120" fill="#ffe3c2"/>
    <!-- 头 -->
    <circle cx="${HEAD.x}" cy="${HEAD.y}" r="${HEAD.r}" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="6"/>
    <!-- 眼睛 -->
    <circle cx="${EYE_L}" cy="${EYE_Y}" r="${EYE_R2}" fill="#fff" stroke="${OUTLINE}" stroke-width="3"/>
    <circle cx="${EYE_R}" cy="${EYE_Y}" r="${EYE_R2}" fill="#fff" stroke="${OUTLINE}" stroke-width="3"/>
    <circle cx="${EYE_L + mx}" cy="${EYE_Y + my}" r="${PUPIL}" fill="#3a2b20"/>
    <circle cx="${EYE_R + mx}" cy="${EYE_Y + my}" r="${PUPIL}" fill="#3a2b20"/>
    <circle cx="${EYE_L + mx + 4}" cy="${EYE_Y + my - 4}" r="4" fill="#fff"/>
    <circle cx="${EYE_R + mx + 4}" cy="${EYE_Y + my - 4}" r="4" fill="#fff"/>
    ${blushSvg}
    <path d="M 300 288 L 300 310" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round"/>
    ${mouthSvg}
    <!-- 胡须 -->
    <path d="M 165 300 L 118 290 M 165 325 L 120 330" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round"/>
    <path d="M 435 300 L 482 290 M 435 325 L 480 330" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round"/>
    ${sparklesSvg}
  </g>
</svg>`;
}

// 眨眼/口型覆盖帧：全画布、只画覆盖元素，便于与底图对齐叠加
function blinkOverlay(level) {
  const lid = SKIN;
  const covers = `
    <rect x="${EYE_L - 34}" y="${EYE_Y - 32}" width="68" height="64" fill="${lid}"/>
    <rect x="${EYE_R - 34}" y="${EYE_Y - 32}" width="68" height="64" fill="${lid}"/>`;
  const lines = level >= 2
    ? `<path d="M ${EYE_L - 20} ${EYE_Y + 4} Q ${EYE_L} ${EYE_Y + 16} ${EYE_L + 20} ${EYE_Y + 4}" stroke="${OUTLINE}" stroke-width="5" fill="none" stroke-linecap="round"/>
       <path d="M ${EYE_R - 20} ${EYE_Y + 4} Q ${EYE_R} ${EYE_Y + 16} ${EYE_R + 20} ${EYE_Y + 4}" stroke="${OUTLINE}" stroke-width="5" fill="none" stroke-linecap="round"/>`
    : `<path d="M ${EYE_L - 20} ${EYE_Y - 10} Q ${EYE_L} ${EYE_Y + 2} ${EYE_L + 20} ${EYE_Y - 10}" stroke="${OUTLINE}" stroke-width="5" fill="none" stroke-linecap="round"/>
       <path d="M ${EYE_R - 20} ${EYE_Y - 10} Q ${EYE_R} ${EYE_Y + 2} ${EYE_R + 20} ${EYE_Y - 10}" stroke="${OUTLINE}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${covers}${lines}</svg>`;
}

function mouthOverlay(level) {
  const shape = level >= 2
    ? `<ellipse cx="${MOUTH.x}" cy="${MOUTH.y + 6}" rx="24" ry="18" fill="#8c3a1f"/>
       <ellipse cx="${MOUTH.x}" cy="${MOUTH.y + 14}" rx="13" ry="8" fill="#ff8f9f"/>`
    : `<ellipse cx="${MOUTH.x}" cy="${MOUTH.y + 4}" rx="14" ry="9" fill="#8c3a1f"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${shape}</svg>`;
}

function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log('生成', path.relative(ROOT, p));
}

// ---------- 测试音：三音上行琶音（C5 E5 G5），无外部依赖 ----------
function testWav() {
  const rate = 22050;
  const notes = [[523.25, 0.4], [659.25, 0.4], [783.99, 0.5]];
  const total = notes.reduce((s, n) => s + n[1], 0);
  const samples = Math.floor(rate * total);
  const data = Buffer.alloc(samples * 2);
  let idx = 0, t0 = 0;
  for (const [freq, dur] of notes) {
    const n = Math.floor(rate * dur);
    for (let i = 0; i < n; i++, idx++) {
      const t = i / rate;
      const fade = Math.min(1, i / (rate * 0.02), (n - i) / (rate * 0.05));
      const v = Math.sin(2 * Math.PI * freq * (t0 + t)) * 0.5 * fade;
      data.writeInt16LE(Math.round(v * 32767), idx * 2);
    }
    t0 += dur;
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// ---------- 极简 PNG 编码器（托盘/应用图标用） ----------
let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 简化猫头图标：圆脸 + 双耳 + 眼睛
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size * 0.56, r = size * 0.36;
  const ear1 = [[cx - r * 0.7, cy - r * 0.5], [cx - r * 0.55, cy - r * 1.35], [cx + r * 0.05, cy - r * 0.85]];
  const ear2 = [[cx + r * 0.7, cy - r * 0.5], [cx + r * 0.55, cy - r * 1.35], [cx - r * 0.05, cy - r * 0.85]];
  const inTri = (p, a, b, c) => {
    const s = (ax, ay, bx, by, cx2, cy2) => (ax - cx2) * (by - cy2) - (bx - cx2) * (ay - cy2);
    const [x, y] = p;
    const d1 = s(x, y, a[0], a[1], b[0], b[1]), d2 = s(x, y, b[0], b[1], c[0], c[1]), d3 = s(x, y, c[0], c[1], a[0], a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ORANGE = hex('#ffb25a'), DARK = hex('#3a2b20'), CREAM = hex('#ffe3c2');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = [x + 0.5, y + 0.5];
      const d = Math.hypot(p[0] - cx, p[1] - cy);
      let color = null;
      if (inTri(p, ...ear1) || inTri(p, ...ear2)) color = ORANGE;
      if (d <= r) color = ORANGE;
      if (d <= r * 0.62 && p[1] > cy - r * 0.1) color = CREAM;
      if (color) {
        // 眼睛
        if (Math.hypot(p[0] - (cx - r * 0.35), p[1] - (cy - r * 0.08)) < r * 0.09) color = DARK;
        if (Math.hypot(p[0] - (cx + r * 0.35), p[1] - (cy - r * 0.08)) < r * 0.09) color = DARK;
        const i = (y * size + x) * 4;
        px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = 255;
      }
    }
  }
  return encodePng(size, size, px);
}

// ---------- 主流程 ----------
fs.rmSync(OUT, { recursive: true, force: true });

// 姿态
write('poses/idle.svg', catSvg({}));
write('poses/happy.svg', catSvg({ mouth: 'smile-blush', blush: true, sparkles: true, tilt: -4 }));

// 视线方向帧 g{c}r{r}.svg —— 3×3，瞳孔随格位偏移
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    write(`gaze/g${c}r${r}.svg`, catSvg({ pupilDx: (c - 1) * 15, pupilDy: (r - 1) * 11 }));
  }
}

// 眨眼 / 口型覆盖帧
write('blink/half.svg', blinkOverlay(1));
write('blink/closed.svg', blinkOverlay(2));
write('mouth/half.svg', mouthOverlay(1));
write('mouth/open.svg', mouthOverlay(2));

// 测试音
write('audio/test.wav', testWav());

// manifest（与 docs/asset-spec.md 的规范保持一致）
write('manifest.json', JSON.stringify({
  name: '占位酱',
  version: 1,
  canvas: { width: W, height: H },
  poses: [
    { id: 'idle', name: '待机', src: 'poses/idle.svg' },
    { id: 'happy', name: '开心', src: 'poses/happy.svg' }
  ],
  gaze: { pose: 'idle', cols: 3, rows: 3, srcPattern: 'gaze/g{c}r{r}.svg' },
  blink: { frames: [{ level: 1, src: 'blink/half.svg' }, { level: 2, src: 'blink/closed.svg' }] },
  mouth: { frames: [{ level: 1, src: 'mouth/half.svg' }, { level: 2, src: 'mouth/open.svg' }] },
  themes: {
    day: { name: '日间', starCount: 0 },
    night: { name: '夜间', starCount: 60 }
  },
  testAudio: 'audio/test.wav'
}, null, 2));

// 图标：托盘 + 打包资源
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'app', 'main', 'tray.png'), drawIcon(32));
fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), drawIcon(256));
console.log('生成 app/main/tray.png (32x32)');
console.log('生成 build/icon.png (256x256)');
console.log('占位素材生成完毕 →', path.relative(ROOT, OUT));
