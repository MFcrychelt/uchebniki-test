// Генерация PWA-иконок (192/512) без внешних зависимостей.
// Рисуем синее «свитое» поле с белой книгой и строкой подписи.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public");
mkdirSync(outDir, { recursive: true });

// --- Минимальный PNG-энкодер (RGBA, 8 bit) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Рисование иконки ---
function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = size / 64; // рисуем в системе 64x64 и масштабируем
  const bg = [37, 99, 235]; // blue-600
  const bgDark = [29, 78, 216]; // blue-700
  const white = [255, 255, 255];

  const put = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // Простое альфа-смешивание с существующим пикселем
    const sa = a / 255;
    const da = px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa);
    px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
    px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };

  const fillRect = (x0, y0, x1, y1, color) => {
    const i0 = Math.round(x0 * S), i1 = Math.round(x1 * S);
    const j0 = Math.round(y0 * S), j1 = Math.round(y1 * S);
    for (let y = j0; y <= j1 && y < size; y++)
      for (let x = i0; x <= i1 && x < size; x++) put(x, y, color);
  };
  const fillCircle = (cx, cy, r, color) => {
    const c = Math.round(cx * S), rr = Math.round(r * S);
    const y0 = Math.round(cy * S) - rr, y1 = Math.round(cy * S) + rr;
    const x0 = c - rr, x1 = c + rr;
    for (let y = y0; y <= y1 && y < size; y++)
      for (let x = x0; x <= x1 && x < size; x++) {
        const dx = x - c, dy = y - Math.round(cy * S);
        if (dx * dx + dy * dy <= rr * rr) put(x, y, color);
      }
  };

  // Фон с закруглением по углам
  const rad = Math.round(14 * S);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      const inCorner =
        (x < rad && y < rad) ||
        (x >= size - rad && y < rad) ||
        (x < rad && y >= size - rad) ||
        (x >= size - rad && y >= size - rad);
      if (inCorner) {
        const ccx = x < rad ? rad : size - 1 - rad;
        const ccy = y < rad ? rad : size - 1 - rad;
        const dx = x - ccx, dy = y - ccy;
        inside = dx * dx + dy * dy <= rad * rad;
      }
      if (!inside) {
        const i = (y * size + x) * 4;
        px[i + 3] = 0;
        continue;
      }
      // Диагональный градиент
      const t = (x + y) / (2 * size);
      const c = [
        Math.round(bg[0] + (bgDark[0] - bg[0]) * t),
        Math.round(bg[1] + (bgDark[1] - bg[1]) * t),
        Math.round(bg[2] + (bgDark[2] - bg[2]) * t),
      ];
      const i = (y * size + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }

  // Обложка книги (белая), слегка «раскрытая»
  fillRect(16, 14, 48, 46, white);
  // Корешок
  fillRect(16, 14, 20, 46, bgDark);
  // Страницы (линии)
  for (let i = 0; i < 3; i++) fillRect(25, 20 + i * 6, 42, 21.5 + i * 6, [219, 234, 254]);

  return px;
}

for (const size of [192, 512]) {
  const px = makeIcon(size);
  const png = encodePng(size, size, px);
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`✓ ${file} (${png.length} bytes)`);
}
