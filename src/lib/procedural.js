export const hashString = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const PALETTES = {
  sunset: ['#3b0a45', '#b3125a', '#ff5e62', '#ff9966', '#ffd8a8'],
  ocean: ['#003049', '#1273b5', '#2b9ec7', '#7ce0e8', '#eaf6f6'],
  forest: ['#0b1d15', '#1f4b2c', '#3f8f3f', '#9dcc7a', '#d9e8b8'],
  desert: ['#3d2c1a', '#9c5a1f', '#e08e45', '#f6c07a', '#fff3d6'],
  neon: ['#0d0221', '#3f0d5c', '#8a2be2', '#0ff', '#f0f'],
  mono: ['#0d0d0d', '#3a3a3a', '#7a7a7a', '#c8c8c8', '#ffffff'],
  pastel: ['#ffe3ec', '#ffb7d5', '#f5a3c7', '#ffb6c1', '#fff'],
};

const SCENES = ['mountain', 'city', 'forest', 'ocean', 'sky', 'abstract', 'portrait-shadow', 'product', 'space', 'flowers', 'fractal', 'window'];

export const detectScene = (prompt) => {
  const p = prompt.toLowerCase();
  if (/(fractal|mandala|abstract|chrome|wave)/.test(p)) return 'fractal';
  if (/(space|galaxy|planet|astro|nebula|star)/.test(p)) return 'space';
  if (/(neon|cyber|city|street|skyline|urban)/.test(p)) return 'city';
  if (/(mountain|volcano|cliff|peak|snowcapped|himalaya)/.test(p)) return 'mountain';
  if (/(forest|jungle|floral|plant|nature|tree)/.test(p)) return 'forest';
  if (/(ocean|sea|wave|beach|water|river|lake)/.test(p)) return 'ocean';
  if (/(flower|rose|bloom|garden)/.test(p)) return 'flowers';
  if (/(product|bottle|cosmetic|watch|shoe|perfume)/.test(p)) return 'product';
  if (/(portrait|woman|man|face|model|fashion)/.test(p)) return 'portrait-shadow';
  return pick(mulberry32(hashString(prompt)), SCENES);
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

const drawMountain = (ctx, rnd, W, H, pal) => {
  const layers = 3 + Math.floor(rnd() * 3);
  for (let l = 0; l < layers; l++) {
    const base = H * (0.35 + (l / (layers + 1)) * 0.6);
    ctx.fillStyle = rgba(pal[(l + 1) % pal.length], 0.55 + 0.2 * l);
    ctx.beginPath();
    ctx.moveTo(0, H);
    let x = 0;
    while (x < W) {
      const w = W * (0.1 + rnd() * 0.25);
      const hgt = H * (0.15 + rnd() * 0.45);
      ctx.lineTo(x + w / 2, base - hgt);
      ctx.lineTo(x + w, base);
      x += w;
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    if (l === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let s = 0; s < 6; s++) {
        const sx = rnd() * W;
        const sw = 8 + rnd() * 22;
        const sh = 6 + rnd() * 22;
        ctx.fillRect(sx, H * 0.1 + rnd() * H * 0.5, sw, sh);
      }
    }
  }
};

const drawCity = (ctx, rnd, W, H, pal) => {
  ctx.fillStyle = rgba(pal[0], 0.9);
  ctx.fillRect(0, 0, W, H);
  let x = 0;
  while (x < W) {
    const bw = W * (0.02 + rnd() * 0.07);
    const bh = H * (0.25 + rnd() * 0.7);
    ctx.fillStyle = rgba(pal[1 + Math.floor(rnd() * 3) % 3], 0.9);
    ctx.fillRect(x, H - bh, bw, bh);
    ctx.fillStyle = rgba(pal[0], 0.5);
    for (let wI = 0; wI < Math.floor(bw / 12); wI++) {
      for (let hI = 0; hI < Math.floor(bh / 16); hI++) {
        if (rnd() > 0.55) {
          ctx.fillStyle = rgba(pick(rnd, ['#ffd27a', '#ff6b9d', '#7ce0e8', '#ffffff']), 0.85);
          ctx.fillRect(x + wI * 12 + 2, H - bh + hI * 16 + 2, 7, 11);
        }
      }
      ctx.fillStyle = rgba(pal[0], 0.5);
    }
    x += bw * (1 + rnd());
  }
};

const drawForest = (ctx, rnd, W, H, pal) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(pal[0], 1));
  g.addColorStop(1, rgba(pal[1], 1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const sx = rnd() * W;
    const sy = H * (0.1 + rnd() * 0.8);
    const r = 2 + rnd() * 9;
    ctx.fillStyle = rgba(pal[2 + Math.floor(rnd() * 3)], 0.24 + rnd() * 0.5);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 18; i++) {
    const tx = rnd() * W;
    const ty = H * (0.4 + rnd() * 0.55);
    const tw = 10 + rnd() * 40;
    ctx.fillStyle = rgba(pal[3], 0.8);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - tw / 2, ty + tw * 0.8);
    ctx.lineTo(tx + tw / 2, ty + tw * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(pal[4], 0.9);
    ctx.fillRect(tx, ty + tw * 0.8, tw / 6, tw * 0.4);
  }
};

const drawOcean = (ctx, rnd, W, H, pal) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#fe8d6b');
  g.addColorStop(0.4, pal[1]);
  g.addColorStop(1, pal[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,200,120,0.9)';
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.28, W * 0.1, 0, Math.PI * 2);
  ctx.fill();
  for (let l = 0; l < 7; l++) {
    const y = H * (0.35 + (l * 0.1) * (rnd() * 0.5 + 0.5));
    ctx.strokeStyle = rgba(pal[(l % 3) + 2], 0.35 + l * 0.06);
    ctx.lineWidth = 2 + l;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 14) {
      const yy = y + Math.sin(x * 0.02 + l * 1.7 + rnd()) * 8;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
};

const drawFractal = (ctx, rnd, W, H, pal) => {
  ctx.fillStyle = '#05030a';
  ctx.fillRect(0, 0, W, H);
  const spokes = 5 + Math.floor(rnd() * 5);
  const arcs = 6;
  ctx.globalCompositeOperation = 'lighter';
  for (let s = 0; s < spokes; s++) {
    const cx = W / 2 + (rnd() - 0.5) * W * 0.3;
    const cy = H / 2 + (rnd() - 0.5) * H * 0.3;
    for (let a = 0; a < arcs; a++) {
      ctx.strokeStyle = rgba(pick(rnd, pal.slice(2)), 0.05 + a * 0.05);
      ctx.lineWidth = 1 + a * 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 30 + a * (12 + rnd() * 40) + s * 4, (s * 0.7) % (Math.PI * 2), (s * 0.7) % (Math.PI * 2) + Math.PI * (0.7 + rnd() * 0.5));
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
};

const drawSpace = (ctx, rnd, W, H, pal) => {
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H / 2, W * 0.8);
  g.addColorStop(0, pal[1]);
  g.addColorStop(1, '#020024');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 320; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.8})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd(), 1 + rnd());
  }
  ctx.fillStyle = rgba(pal[2], 0.9);
  ctx.beginPath();
  ctx.arc(W * (0.25 + rnd() * 0.5), H * (0.3 + rnd() * 0.3), W * (0.06 + rnd() * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(pal[3], 0.7);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(pal[3], 0.35);
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.3, 0.4, Math.PI * 1.6);
  ctx.stroke();
};

const drawPortrait = (ctx, rnd, W, H, pal) => {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal[1]);
  g.addColorStop(1, pal[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.42;
  ctx.fillStyle = rgba(pal[2], 0.92);
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.22, cy + W * 0.15);
  ctx.quadraticCurveTo(cx, cy + W * 0.5, cx + W * 0.22, cy + W * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(pal[0], 1);
  ctx.beginPath();
  ctx.arc(cx - W * 0.06, cy, W * 0.022, 0, Math.PI * 2);
  ctx.arc(cx + W * 0.06, cy, W * 0.022, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(pal[3], 0.9);
  ctx.beginPath();
  ctx.arc(cx, cy + W * 0.04, W * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(pal[4], 0.8);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.17 - 10, -Math.PI * 0.75, -Math.PI * 0.25);
  ctx.stroke();
};

const drawProduct = (ctx, rnd, W, H, pal) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, paletteFor('#d8dde4'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(150,160,180,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72);
  ctx.lineTo(W, H * 0.72);
  ctx.stroke();
  reqAnim(ctx, 0, 0, W, W - H * 0.78, 0.06);
  const bw = W * 0.3;
  const bh = H * 0.33;
  ctx.fillStyle = rgba(pal[1], 1);
  ctx.beginPath();
  ctx.roundRect(W / 2 - bw / 2, H * 0.3, bw, bh, 14);
  ctx.fill();
  ctx.fillStyle = rgba(pal[2], 1);
  ctx.beginPath();
  ctx.roundRect(W / 2 - bw / 2 + bw * 0.15, H * 0.3 - bh * 0.06, bw * 0.7, 12, 6);
  ctx.fill();
  ctx.strokeStyle = rgba(pal[3], 0.95);
  ctx.lineWidth = 4;
  ctx.strokeRect(W * 0.08, H * 0.06, W * 0.2, W * 0.2);
  ctx.fillStyle = rgba(pal[3], 0.9);
  ctx.beginPath();
  ctx.arc(W * 0.18, H * 0.16, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = rgba(pal[0], 0.9);
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.88, bw * 0.7, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

const drawFlowers = (ctx, rnd, W, H, pal) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal[4]);
  g.addColorStop(1, pal[3]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const r = 8 + rnd() * 30;
    ctx.strokeStyle = rgba(pal[1], 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + r * 2);
    ctx.stroke();
    for (let p = 0; p < 6; p++) {
      ctx.fillStyle = rgba(pick(rnd, [pal[0], pal[2], '#ff6b9d', '#ffd27a']), 0.85);
      ctx.beginPath();
      ctx.arc(cx + Math.cos((p / 6) * Math.PI * 2) * r * 0.6, cy + Math.sin((p / 6) * Math.PI * 2) * r * 0.6, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawWindow = (ctx, rnd, W, H, pal) => {
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, W, H);
  const lhs = W * 0.08;
  const lw = W * 0.3;
  const lh = H * 0.5;
  ctx.fillStyle = '#20202a';
  ctx.beginPath();
  ctx.roundRect(lhs, H / 2 - lh, lw, lh, 12);
  ctx.fill();
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = pick(rnd, ['#3a3a4a', '#4a4a5a']);
      ctx.beginPath();
      ctx.roundRect(lhs + 8 + x * ((lw - 24) / 3), H / 2 - lh + 8 + y * ((lh - 24) / 4), (lw - 24) / 3 - 6, (lh - 24) / 4 - 6, 4);
      ctx.fill();
      if (rnd() > 0.5) {
        ctx.fillStyle = rgba(pal[1], 0.8);
        ctx.beginPath();
        ctx.roundRect(lhs + 8 + x * ((lw - 24) / 3), H / 2 - lh + 8 + y * ((lh - 24) / 4), (lw - 24) / 3 - 6, 6, 3);
        ctx.fill();
      }
    }
  }
  const bz = ctx.createLinearGradient(W * 0.6, 0, W - W * 0.05, H);
  bz.addColorStop(0, pal[2]);
  bz.addColorStop(1, pal[0]);
  ctx.fillStyle = bz;
  ctx.beginPath();
  ctx.moveTo(W * 0.55, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W * 0.43, H);
  ctx.quadraticCurveTo(W * 0.62, H * 0.5, W * 0.55, 0);
  ctx.closePath();
  ctx.fill();
};

const drawAbstract = (ctx, rnd, W, H, pal) => {
  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rgba(pick(rnd, pal.slice(1)), 0.08 + rnd() * 0.2);
    ctx.beginPath();
    const r = 30 + rnd() * 160;
    ctx.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    ctx.strokeStyle = rgba(pal[2 + Math.floor(rnd() * 2)], 0.5);
    ctx.lineWidth = 1 + rnd() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * W * 0.4, y + (rnd() - 0.5) * H * 0.4);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
};

const reqAnim = (ctx, x, y, w, h, dt) => {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 60; i += 6) {
    ctx.beginPath();
    ctx.arc(x + (i / 60) * w + Math.sin(i * 2) * 6, y + h / 2 + Math.sin(i * 0.8 + dt) * h * 0.25, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const paletteFor = (hex) => hex;

const STYLE_PROC = {
  photorealistic: (ctx, rnd) => { addGrain(ctx, rnd, 0.5); addVignette(ctx, 0.25); },
  cinematic: (ctx, rnd) => { addGrain(ctx, rnd, 0.6); ctx.fillStyle = 'rgba(10,30,25,0.28)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, ctx.canvas.height * 0.86, ctx.canvas.width, ctx.canvas.height * 0.14); },
  anime: (ctx, rnd) => { ctx.save(); ctx.filter = 'saturate(1.35) contrast(1.08)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); },
  threeD: (ctx, rnd) => { ctx.save(); ctx.filter = 'saturate(1.15)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); },
  illustration: (ctx, rnd) => { sharpen(ctx); },
  digitalart: (ctx, rnd) => { ctx.save(); ctx.filter = 'saturate(1.25) contrast(1.05)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); addGrain(ctx, rnd, 0.35); },
  productShot: (ctx, rnd) => { soften(ctx); addVignette(ctx, 0.15); },
  portrait: (ctx, rnd) => { soften(ctx); ctx.save(); ctx.filter = 'sepia(0.06)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); addVignette(ctx, 0.3); },
  fashion: (ctx, rnd) => { ctx.save(); ctx.filter = 'contrast(1.12) saturate(1.2)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); addVignette(ctx, 0.2); },
  fantasy: (ctx, rnd) => { ctx.save(); ctx.filter = 'saturate(1.5)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); addVignette(ctx, 0.4); },
  scifi: (ctx, rnd) => { ctx.save(); ctx.filter = 'contrast(1.2)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); addScanlines(ctx); },
  minimalist: (ctx, rnd) => { ctx.save(); ctx.filter = 'contrast(1.1) saturate(0.6)'; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); },
};

const addGrain = (ctx, rnd, amount) => {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount * 70;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
};

const addVignette = (ctx, amount) => {
  const { width: w, height: h } = ctx.canvas;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

const addScanlines = (ctx) => {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
};

const soften = (ctx) => {
  ctx.save();
  ctx.filter = 'blur(0.5px)';
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();
};

const sharpen = (ctx) => {
  const { width, height } = ctx.canvas;
  const src = ctx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const d = src.data;
  const o = out.data;
  const w = width;
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            acc += d[((y + ky) * w + (x + kx)) * 4 + c] * k[(ky + 1) * 3 + (kx + 1)];
          }
        }
        o[(y * w + x) * 4 + c] = clamp(acc, 0, 255);
      }
      o[(y * w + x) * 4 + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
};

const DRAWS = {
  mountain: drawMountain,
  city: drawCity,
  forest: drawForest,
  ocean: drawOcean,
  sky: drawOcean,
  abstract: drawAbstract,
  'portrait-shadow': drawPortrait,
  product: drawProduct,
  space: drawSpace,
  flowers: drawFlowers,
  fractal: drawFractal,
  window: drawWindow,
};

export const generateImage = ({ prompt, style = 'cinematic', seed = '', width = 1024, height = 1024, lighting = 'Golden Hour', camera = 50, color = 55, composition = 55, lightingSeed = '' }) => {
  const fullSeed = hashString(`${seed || prompt}|${style}|${lighting}|${lightingSeed}`);
  const rnd = mulberry32(fullSeed);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const lowPrompt = prompt.toLowerCase();
  let pal;
  if (/sunset|golden|warm|dusk/.test(lowPrompt)) pal = PALETTES.sunset;
  else if (/ocean|sea|beach|cool|blue|lake|river|water/.test(lowPrompt)) pal = PALETTES.ocean;
  else if (/forest|garden|tree|nature|green/.test(lowPrompt)) pal = PALETTES.forest;
  else if (/neon|cyber|pink|purple/.test(lowPrompt)) pal = PALETTES.neon;
  else if (/pastel|soft|cotton/.test(lowPrompt)) pal = PALETTES.pastel;
  else if (/desert|sand|gold/.test(lowPrompt)) pal = PALETTES.desert;
  else if (/mono|black|white|bw/.test(lowPrompt)) pal = PALETTES.mono;
  else pal = PALETTES[['sunset', 'ocean', 'forest', 'neon', 'pastel', 'desert', 'mono'][Math.floor(rnd() * 7)]];

  const scene = detectScene(prompt);
  const draw = DRAWS[scene] || drawAbstract;
  draw(ctx, rnd, width, height, pal);
  const proc = STYLE_PROC[style];
  if (proc) proc(ctx, rnd);
  else addGrain(ctx, rnd, 0.5);
  addLabel(ctx, width, height, style, rnd);
  return canvas.toDataURL('image/png');
};

const addLabel = (ctx, w, h, style, rnd) => {
  if (rnd() > 0.25) return;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `${Math.round(w * 0.012)}px 'Segoe UI'`;
  ctx.textAlign = 'right';
  ctx.fillText(`✦ ${style}`, w - 22, h - 18);
};

export const upscaleImage = (dataUrl, factor = 2) => {
  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width * factor;
      c.height = img.height * factor;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
};