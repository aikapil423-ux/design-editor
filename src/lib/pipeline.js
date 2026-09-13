// ============================================================================
// ProEditor pixel pipeline — non-destructive image processing engine.
// All operations work on a Float32 RGBA buffer derived from an immutable
// source canvas. The source is never modified (non-destructive editing).
// ============================================================================

export const uid = () => Math.random().toString(36).slice(2, 9);
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const c = (v) => clamp255(v);

// ---- color space helpers ----------------------------------------------------
export const rgb2hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
};
export const hsv2rgb = (h, s, v) => {
  const i = Math.floor(h / 60) % 6, f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return [r * 255, g * 255, b * 255];
};
const rgb2luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---- curves -----------------------------------------------------------------
export const curveLUT = (points) => {
  const lut = new Uint8Array(256);
  const pts = (points || []).slice().sort((a, b) => a.x - b.x);
  if (!pts.length) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
  let last = pts[0];
  let idx = 0, next = pts[0];
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    while (next && v > next.x) { last = next; next = pts[++idx]; }
    if (!next) { lut[i] = clamp255(last.y * 255 + (v - last.x) * 255); }
    else if (last.x === next.x) lut[i] = clamp255(next.y * 255);
    else lut[i] = clamp255(lerp(last.y, next.y, (v - last.x) / (next.x - last.x)) * 255);
  }
  return lut;
};

// ---- default param set ------------------------------------------------------
export const DEFAULT_ADJUST = () => ({
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, gamma: 1, brilliance: 0,
  temperature: 0, tint: 0, saturation: 0, vibrance: 0, hue: 0, intensity: 0,
  balance: { shadows: { r: 0, g: 0, b: 0 }, mids: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 } },
  wb: { temp: 0, tint: 0 },
  detail: { sharpness: 0, clarity: 0, texture: 0, structure: 0, dehaze: 0, noiseR: 0, aiDenoise: 0 },
  optics: {
    lens: 0, distortion: 0, ca: 0,
    vignette: { amount: 0, size: 0.5, feather: 0.5, roundness: 0, highlights: 0 },
    perspective: { x: 0, y: 0 }, skew: { x: 0, y: 0 }, autoLens: false,
  },
});

// ---- histogram --------------------------------------------------------------
export const buildHistogram = (srcCanvas) => {
  const W = srcCanvas.width, H = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d');
  const d = ctx.getImageData(0, 0, W, H).data;
  const lum = new Float64Array(256), r = new Float64Array(256), g = new Float64Array(256), b = new Float64Array(256);
  for (let i = 0; i < d.length; i += 4) {
    r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++;
    lum[Math.round(rgb2luma(d[i], d[i + 1], d[i + 2]))]++;
  }
  return { lum, r, g, b, W, H };
};

// ---- white balance from a sampled neutral pixel ------------------------------
export const wbFromSample = (srcCanvas, sx, sy) => {
  const ctx = srcCanvas.getContext('2d');
  const d = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
  const x = Math.max(0, Math.min(srcCanvas.width - 1, Math.floor(sx)));
  const y = Math.max(0, Math.min(srcCanvas.height - 1, Math.floor(sy)));
  const i = (y * srcCanvas.width + x) * 4;
  const R = d[i], G = d[i + 1], B = d[i + 2];
  const gainR = 255 / Math.max(1, R), gainB = 255 / Math.max(1, B);
  const temp = Math.max(-100, Math.min(100, (gainR - 1) * 900));
  const tint = Math.max(-100, Math.min(100, ((R + B) / 2 - G) * 3));
  return { temp, tint };
};

// ---- auto adjust -------------------------------------------------------------
export const autoAdjust = (srcCanvas) => {
  const hist = buildHistogram(srcCanvas);
  const tot = hist.lum.reduce((a, x) => a + x, 0) || 1;
  const pct = (p) => {
    const target = tot * p; let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist.lum[i]; if (acc >= target) return i; }
    return 0;
  };
  const lo = pct(0.025), hi = pct(0.975), mid = pct(0.5);
  const spread = Math.max(30, hi - lo);
  const exposure = Math.max(-3, Math.min(3, (128 - mid) / 60));
  const contrast = Math.max(-60, Math.min(100, (spread - 135) * 0.9));
  const brightness = lo < 10 ? 8 : 0;
  const saturation = hi - lo > 200 ? 8 : 0;
  const gamma = mid < 100 ? 1.18 : mid > 160 ? 0.85 : 1;
  return { exposure: +exposure.toFixed(2), contrast: +contrast.toFixed(1), brightness, saturation, gamma };
};

// ---- separable box blur (used by detail/effect passes) -----------------------
const boxBlur = (px, w, h, r) => {
  const src = new Float32Array(px);
  const out = new Float32Array(px.length);
  const n = 2 * r + 1, nrm = 1 / (n * n);
  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k)) * 4 + y * w * 4;
        sr += src[xx]; sg += src[xx + 1]; sb += src[xx + 2];
      }
      const o = (y * w + x) * 4;
      out[o] = sr * nrm; out[o + 1] = sg * nrm; out[o + 2] = sb * nrm;
    }
  }
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k)) * w + x;
        const o = yy * 4;
        sr += out[o]; sg += out[o + 1]; sb += out[o + 2];
      }
      const o = (y * w + x) * 4;
      px[o] = sr * nrm; px[o + 1] = sg * nrm; px[o + 2] = sb * nrm;
    }
  }
};

const boxBlurRgba = (px, w, h, r) => {
  const src = new Float32Array(px.length);
  const n = 2 * r + 1, nrm = 1 / n;
  let o = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; src[i] = px[i]; src[i + 1] = px[i + 1]; src[i + 2] = px[i + 2]; src[i + 3] = px[i + 3]; o = i; }
  for (let pass = 0; pass < 2; pass++) {
    const vert = pass === 1;
    const tmp = new Float32Array(px.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let k = -r; k <= r; k++) {
          const xx = vert ? x : Math.min(w - 1, Math.max(0, x + k));
          const yy = vert ? Math.min(h - 1, Math.max(0, y + k)) : y;
          const i = (yy * w + xx) * 4;
          sr += src[i]; sg += src[i + 1]; sb += src[i + 2]; sa += src[i + 3];
        }
        const i2 = (y * w + x) * 4;
        tmp[i2] = sr * nrm; tmp[i2 + 1] = sg * nrm; tmp[i2 + 2] = sb * nrm; tmp[i2 + 3] = sa * nrm;
      }
    }
    src.set(tmp);
  }
  // merge
  for (let i = 0; i < px.length; i++) { const m = src[i]; px[i] = m; }
};

// ---- tone helpers ------------------------------------------------------------
const boostSat = (px, i, amt) => {
  const lm = rgb2luma(px[i], px[i + 1], px[i + 2]);
  px[i] = lerp(lm, px[i], 1 + amt);
  px[i + 1] = lerp(lm, px[i + 1], 1 + amt);
  px[i + 2] = lerp(lm, px[i + 2], 1 + amt);
};

const FILTER_HUES = [
  { id: 'red', c: 40, w: 40, s: 200, l: 120 },       // hue "center" ~ 0
  { id: 'orange', c: 25, w: 30, s: 200, l: 145 },
  { id: 'yellow', c: 55, w: 35, s: 200, l: 195 },
  { id: 'green', c: 120, w: 35, s: 200, l: 110 },
  { id: 'cyan', c: 180, w: 35, s: 200, l: 120 },
  { id: 'blue', c: 225, w: 35, s: 200, l: 70 },
  { id: 'purple', c: 275, w: 35, s: 200, l: 95 },
  { id: 'magenta', c: 320, w: 35, s: 200, l: 130 },
];

// =============================================================================
// The big render. srcCanvas is the immutable original.
//  p   : adjust params (see DEFAULT_ADJUST)
//  ext : { filters, effects, curves, maskCanvas, crop, flipH, flipV, rotate }
// Returns a canvas with the processed image at srcCanvas resolution (capped).
// =============================================================================
let SCRATCH = null;
export const renderEdits = (srcCanvas, p, ext = {}) => {
  const W = srcCanvas.width, H = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, W, H).data;
  const px = new Float32Array(srcData.length);
  const N = px.length;
  for (let i = 0; i < N; i++) px[i] = srcData[i];

  const a = p;
  const det = a.detail, opt = a.optics, bal = a.balance;
  const wb = a.wb;
  const curves = ext.curves || {};

  // ---- light ---------------------------------------------------------------
  if (a.exposure) {
    const f = Math.pow(2, a.exposure);
    for (let i = 0; i < N; i++) px[i] *= f;
  }
  if (a.brightness) {
    const f = a.brightness * 1.25;
    for (let i = 0; i < N; i++) px[i] += f;
  }
  if (a.gamma !== 1) {
    const g = 1 / Math.max(0.1, a.gamma);
    for (let i = 0; i < N; i++) px[i] = 255 * Math.pow(Math.max(0, px[i] / 255), g);
  }
  if (a.contrast) {
    const f = 1 + a.contrast / 100;
    for (let i = 0; i < N; i++) px[i] = (px[i] - 127.5) * f + 127.5;
  }
  if (a.whites) {
    const f = a.whites / 100;
    for (let i = 0; i < N; i += 4) {
      const t = smoothstep(0.55, 1, px[i] / 255);
      px[i] += t * f * 90; px[i + 1] += t * f * 90; px[i + 2] += t * f * 90;
    }
  }
  if (a.blacks) {
    const f = a.blacks / 100;
    for (let i = 0; i < N; i += 4) {
      const t = 1 - smoothstep(0.42, 0.05, px[i] / 255);
      px[i] -= t * f * 70; px[i + 1] -= t * f * 70; px[i + 2] -= t * f * 70;
    }
  }
  if (a.highlights) {
    const f = a.highlights / 100 * 1.2;
    for (let i = 0; i < N; i += 4) {
      const t = smoothstep(0.45, 1, px[i] / 255);
      px[i] -= t * f * 90; px[i + 1] -= t * f * 90; px[i + 2] -= t * f * 90;
    }
  }
  if (a.shadows) {
    const f = a.shadows / 100 * 1.2;
    for (let i = 0; i < N; i += 4) {
      const t = clamp255(1 - smoothstep(0.5, 0.05, px[i] / 255));
      px[i] += t * f * 80; px[i + 1] += t * f * 80; px[i + 2] += t * f * 80;
    }
  }
  if (a.brilliance) {
    const f = a.brilliance / 100;
    for (let i = 0; i < N; i += 4) {
      const v = px[i] / 255;
      const s = v * (1 - v) * 4;
      px[i] += (1 - v) * s * f * 60; px[i + 1] += (1 - v) * s * f * 60; px[i + 2] += (1 - v) * s * f * 60;
    }
  }

  // ---- color ---------------------------------------------------------------
  if (a.temperature + wb.temp) {
    const t = (a.temperature + wb.temp) / 100;
    const warm = t > 0 ? 1 + t * 0.24 : 1 + t * 0.22;
    const cool = t > 0 ? 1 - t * 0.18 : 1 + t * 0.24;
    for (let i = 0; i < N; i += 4) { px[i] *= warm; px[i + 2] *= cool; }
  }
  if (a.tint + wb.tint) {
    const t = (a.tint + wb.tint) / 100;
    const g = 1 + t * 0.15;
    for (let i = 0; i < N; i += 4) { px[i + 1] *= g; }
  }
  if (a.saturation || a.vibrance || a.intensity) {
    const sat = a.saturation / 100, vib = a.vibrance / 100, inten = a.intensity / 100;
    for (let i = 0; i < N; i += 4) {
      const lm = rgb2luma(px[i], px[i + 1], px[i + 2]);
      let amt = sat;
      if (vib) {
        const [h, s, v] = rgb2hsv(px[i], px[i + 1], px[i + 2]);
        amt += vib * (1 - s) * 0.8;
        amt += inten * 0.5;
      }
      amt = Math.min(1.5, amt);
      if (amt) { px[i] = lerp(lm, px[i], 1 + amt); px[i + 1] = lerp(lm, px[i + 1], 1 + amt); px[i + 2] = lerp(lm, px[i + 2], 1 + amt); }
    }
  }
  if (a.saturation === 0 && a.vibrance) {
    // pure vibrance path already handled above
  }
  if (a.hue) {
    const deg = a.hue;
    const rad = (deg * Math.PI) / 180;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    const m = [
      0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928,
      0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.14, 0.072 - cosA * 0.072 - sinA * 0.283,
      0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072,
    ];
    for (let i = 0; i < N; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      px[i] = r * m[0] + g * m[1] + b * m[2];
      px[i + 1] = r * m[3] + g * m[4] + b * m[5];
      px[i + 2] = r * m[6] + g * m[7] + b * m[8];
    }
  }
  if (a.balance) {
    applyBalance(px, W, H, bal);
  }

  // ---- HSL per color ---------------------------------------------------------
  const hsl = p.hsl;
  if (hsl) {
    const dH = hsl.hue, dS = hsl.sat, dL = hsl.lum;
    for (let i = 0; i < N; i += 4) {
      let [h, s, v] = rgb2hsv(px[i], px[i + 1], px[i + 2]);
      for (let k = 0; k < 8; k++) {
        const band = FILTER_HUES[k];
        let diff = Math.abs(h - band.c);
        if (diff > 180) diff = 360 - diff;
        if (diff < band.w) {
          const wgt = 1 - diff / band.w;
          if (dH[k] !== 0) h = (h + dH[k] * wgt + 360) % 360;
          if (dS[k] !== 0) s = Math.min(1, Math.max(0, s + dS[k] / 100 * wgt));
          if (dL[k] !== 0) v = Math.min(1, Math.max(0, v + dL[k] / 100 * wgt));
        }
      }
      const [r2, g2, b2] = hsv2rgb(h, s, v);
      px[i] = r2; px[i + 1] = g2; px[i + 2] = b2;
    }
  }

  // ---- curves ---------------------------------------------------------------
  if (curves.rgb?.length) {
    const lut = curveLUT(curves.rgb);
    for (let i = 0; i < N; i++) px[i] = lut[c(px[i])];
  }
  const lr = curves.r, lg = curves.g, lb = curves.b;
  if ((lr && lr.length) || (lg && lg.length) || (lb && lb.length)) {
    const lrL = curveLUT(lr || []), lgL = curveLUT(lg || []), lbL = curveLUT(lb || []);
    for (let i = 0; i < N; i += 4) {
      if (lr) px[i] = lrL[c(px[i])];
      if (lg) px[i + 1] = lgL[c(px[i + 1])];
      if (lb) px[i + 2] = lbL[c(px[i + 2])];
    }
  }

  // ---- optics: distortion + chromatic aberration ------------------------------
  if (opt.distortion || opt.ca || opt.lens) {
    applyOptics(px, W, H, opt);
  }

  // ---- detail ---------------------------------------------------------------
  if (det.sharpness || det.clarity || det.texture || det.structure || det.noiseR || det.aiDenoise || det.dehaze) {
    applyDetail(px, W, H, det);
  }

  // ---- filters (stacked, mixed by intensity) ----------------------------------
  const filters = ext.filters || [];
  for (const f of filters) {
    const def = FILTER_LOOKUP[f.id];
    if (!def) continue;
    const copy = new Float32Array(px);
    def.run(px, W, H, f.intensity);
    const t = Math.max(0, Math.min(1, f.intensity || 1));
    for (let i = 0; i < N; i++) px[i] = lerp(copy[i], px[i], t);
  }

  // ---- effects (stacked) ------------------------------------------------------
  const effects = ext.effects || [];
  for (const e of effects) {
    const def = EFFECT_LOOKUP[e.id];
    if (!def) continue;
    const copy = new Float32Array(px);
    def.run(px, W, H, e.intensity, e.opts || {});
    const t = Math.max(0, Math.min(1, e.intensity || 1));
    for (let i = 0; i < N; i++) px[i] = lerp(copy[i], px[i], t);
  }

  // ---- vignette ---------------------------------------------------------------
  const vg = opt.vignette;
  if (vg.amount) applyVignette(px, W, H, vg);

  // ---- mask blending -----------------------------------------------------------
  let outData = null;
  if (ext.maskCanvas) {
    const mctx = ext.maskCanvas.getContext('2d');
    const md = mctx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < N; i += 4) {
      const ma = (md[i + 3] || 0) / 255 * 0.85;
      if (ma < 1) {
        const inv = 1 - ma;
        px[i] = srcData[i] * inv + px[i] * ma;
        px[i + 1] = srcData[i + 1] * inv + px[i + 1] * ma;
        px[i + 2] = srcData[i + 2] * inv + px[i + 2] * ma;
      }
    }
  }

  // ---- write out ---------------------------------------------------------------
  const out = getScratch(W, H);
  const octx = out.getContext('2d');
  outData = octx.createImageData(W, H);
  for (let i = 0; i < N; i++) outData.data[i] = c(px[i]);
  octx.putImageData(outData, 0, 0);
  return out;
};

const getScratch = (W, H) => {
  if (!SCRATCH || SCRATCH.width !== W || SCRATCH.height !== H) {
    SCRATCH = document.createElement('canvas');
    SCRATCH.width = W; SCRATCH.height = H;
  }
  return SCRATCH;
};

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function applyBalance(px, W, H, bal) {
  const { shadows, mids, highlights } = bal;
  const total = W * H;
  for (let i = 0; i < total; i++) {
    const o = i * 4, v = rgb2luma(px[o], px[o + 1], px[o + 2]) / 255;
    const sh = 1 - smoothstep(0, 0.5, v), hi = smoothstep(0.5, 1, v), mi = 1 - (sh + hi);
    let r = px[o], g = px[o + 1], b = px[o + 2];
    r += (sh * shadows.r + mi * mids.r + hi * highlights.r) / 100 * 120;
    g += (sh * shadows.g + mi * mids.g + hi * highlights.g) / 100 * 120;
    b += (sh * shadows.b + mi * mids.b + hi * highlights.b) / 100 * 120;
    px[o] = c(r); px[o + 1] = c(g); px[o + 2] = c(b);
  }
}

function applyOptics(px, W, H, opt) {
  const { distortion, ca, lens } = opt;
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const rx = 1 / cx, ry = 1 / cy;
  const f = distortion / 100 * 0.5 + lens / 100 * 0.4;
  const src = new Float32Array(px);
  const cw = ca / 100 * 4;
  const rMap = new Float32Array(px.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - cx) * rx, ny = (y - cy) * ry;
      const rr = Math.sqrt(nx * nx + ny * ny);
      let k = 1;
      if (f) k = 1 + f * (rr * rr);
      let sx = (nx * k + 1) * cx, sy = (ny * k + 1) * cy;
      if (sx < 0 || sx > W - 1 || sy < 0 || sy > H - 1) continue;
      const sx0 = Math.floor(sx), sy0 = Math.floor(sy);
      const fx = sx - sx0, fy = sy - sy0;
      const o = (y * W + x) * 4;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const xi = Math.min(W - 1, sx0 + ox), yi = Math.min(H - 1, sy0 + oy);
        const w8 = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
        const i = (yi * W + xi) * 4;
        rMap[o] += src[i] * w8; rMap[o + 1] += src[i + 1] * w8; rMap[o + 2] += src[i + 2] * w8;
      }
      // chromatic aberration
      if (cw) {
        const sr = (Math.min(H - 1, Math.max(0, sy - cw * (sy - y))) * W + Math.min(W - 1, Math.max(0, sx - cw * (sx - x)))) * 4;
        const sb = (Math.min(H - 1, Math.max(0, sy + cw * (sy - y))) * W + Math.min(W - 1, Math.max(0, sx + cw * (sx - x)))) * 4 + 2;
        rMap[o] = rMap[o] * 0.5 + src[sr] * 0.5;
        rMap[o + 2] = rMap[o + 2] * 0.5 + src[sb] * 0.5;
      }
    }
  }
  px.set(rMap);
}

function applyDetail(px, W, H, det) {
  const blurPx = new Float32Array(px.length);
  blurPx.set(px);
  let radius = Math.max(1, Math.round(1 + Math.abs(det.clarity) / 100 * 3));
  if (radius > 1) boxBlur(blurPx, W, H, Math.min(5, radius));
  const NR = det.noiseR / 100, AI = det.aiDenoise / 100, DH = det.dehaze / 100;
  const SH = det.sharpness / 100, CL = det.clarity / 100;
  const TX = det.texture / 100, ST = det.structure / 100;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const lm = rgb2luma(px[o], px[o + 1], px[o + 2]) / 255;
    // noise reduction (bilateral-lite)
    if (NR || AI) {
      const strong = NR + AI * 1.4;
      const avg = rgb2luma(blurPx[o], blurPx[o + 1], blurPx[o + 2]);
      const edge = Math.abs(lm * 255 - avg) / 255;
      const wgt = Math.max(0, 1 - edge * strong * 2.4) * strong;
      px[o] = lerp(px[o], blurPx[o], wgt);
      px[o + 1] = lerp(px[o + 1], blurPx[o + 1], wgt);
      px[o + 2] = lerp(px[o + 2], blurPx[o + 2], wgt);
    }
    // clarity / texture (mid-tone local contrast)
    const local = rgb2luma(blurPx[o], blurPx[o + 1], blurPx[o + 2]);
    let amt = 0;
    if (CL) amt += CL * (1 - Math.abs(lm - 0.5) * 2);
    if (TX) amt += TX * smoothstep(0.4, 0.8, 1 - Math.abs(lm - 0.5) * 2);
    if (ST) amt += ST * 0.6;
    if (DH) amt += DH * Math.abs(lm - 0.5) * 2;
    if (amt) {
      const d = (lm * 255 - local) * 0.8;
      px[o] = c(px[o] + d * amt * 2);
      px[o + 1] = c(px[o + 1] + d * amt * 2);
      px[o + 2] = c(px[o + 2] + d * amt * 2);
    }
    // unsharp sharpen
    if (SH) {
      const d = (lm * 255 - local) * SH;
      px[o] = c(px[o] + d); px[o + 1] = c(px[o + 1] + d); px[o + 2] = c(px[o + 2] + d);
    }
  }
}

function applyVignette(px, W, H, vg) {
  const amount = vg.amount / 100, cx = (W - 1) / 2, cy = (H - 1) / 2;
  const size = Math.max(0.1, vg.size), feather = Math.max(0.02, vg.feather);
  const roundA = vg.roundness / 100;
  const aspect = roundA > 0 ? (W / H - 1) * -roundA : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const dx = (x - cx) / (W / 2 * size), dy = (y - cy) / (H / 2 * size);
      let rr = Math.sqrt(dx * dx + dy * dy);
      if (aspect) rr *= 1 + aspect * 0.5 * (0.5 + Math.cos(2 * Math.atan2(dy, dx)) * 0.5);
      let a = 1 - smoothstep(1 - feather, 1, rr);
      a = Math.pow(a, 0.9) * amount;
      if (vg.highlights > 0) {
        const lm = rgb2luma(px[o], px[o + 1], px[o + 2]) / 255;
        a *= 1 - lm * (vg.highlights / 100);
      }
      if (a < 0) { px[o] = c(px[o] * (1 + a)); px[o + 1] = c(px[o + 1] * (1 + a)); px[o + 2] = c(px[o + 2] * (1 + a)); }
      else { px[o] = c(px[o] * (1 - a)); px[o + 1] = c(px[o + 1] * (1 - a)); px[o + 2] = c(px[o + 2] * (1 - a)); }
    }
  }
}

// =============================================================================
// Overlay-type effects (drawn on top with canvas 2D) — lens flare, light leak,
// bokeh, scanlines (VHS), glowing border etc.
// =============================================================================
export const drawOverlays = (ctx, W, H, effects) => {
  if (!effects) return;
  for (const e of effects) {
    const def = OVERLAY_LOOKUP[e.id];
    if (def) def.draw(ctx, W, H, e.intensity, e.opts || {});
  }
};

// =============================================================================
// FILTER DEFINITIONS — applied per-pixel; intensity 0..1.
// =============================================================================
const F = {
  grayscale: (px, N) => { for (let i = 0; i < N; i += 4) { const v = rgb2luma(px[i], px[i + 1], px[i + 2]); px[i] = px[i + 1] = px[i + 2] = v; } },
  contrast: (px, N, amt) => { const f = 1 + amt; for (let i = 0; i < N; i++) px[i] = (px[i] - 127.5) * f + 127.5; },
  brightness: (px, N, amt) => { const f = amt * 50; for (let i = 0; i < N; i++) px[i] += f; },
  sat: (px, N, amt) => { for (let i = 0; i < N; i += 4) boostSat(px, i, amt); },
  gamma: (px, N, amt) => { const g = 1 / (1 + amt * 0.6); for (let i = 0; i < N; i++) px[i] = 255 * Math.pow(px[i] / 255, g); },
  tint: (px, N, amt, r, g, bl) => { for (let i = 0; i < N; i += 4) { px[i] = lerp(px[i], r, amt); px[i + 1] = lerp(px[i + 1], g, amt); px[i + 2] = lerp(px[i + 2], bl, amt); } },
  tealOrange: (px, N, amt) => {
    for (let i = 0; i < N; i += 4) {
      const lm = rgb2luma(px[i], px[i + 1], px[i + 2]);
      const t = smoothstep(0.25, 0.85, lm / 255);
      const o = amt * 0.7;
      px[i] = lerp(px[i], 232, t * o);
      px[i + 1] = lerp(px[i + 1], 120, t * o);
      px[i + 2] = lerp(px[i + 2], 60, t * o);
      px[i] = lerp(px[i], 0, (1 - t) * o * 0.8);
      px[i + 1] = lerp(px[i + 1], 120, (1 - t) * o * 0.8);
      px[i + 2] = lerp(px[i + 2], 140, (1 - t) * o * 0.8);
    }
  },
  warm: (px, N, amt) => F.tint(px, N, amt * 0.7, 246, 178, 107),
  cool: (px, N, amt) => F.tint(px, N, amt * 0.7, 107, 178, 246),
  warmSoft: (px, N, amt) => F.tint(px, N, amt * 0.5, 250, 205, 170),
  pinkish: (px, N, amt) => F.tint(px, N, amt * 0.5, 255, 190, 205),
  greenish: (px, N, amt) => F.tint(px, N, amt * 0.5, 170, 235, 175),
  fade: (px, N, amt) => { F.contrast(px, N, -0.08 * amt); for (let i = 0; i < N; i += 4) { px[i] = lerp(px[i], 235, 0.12 * amt); px[i + 1] = lerp(px[i + 1], 235, 0.12 * amt); px[i + 2] = lerp(px[i + 2], 235, 0.12 * amt); } },
  hardContrast: (px, N, amt) => { const f = 1 + 0.45 * amt; for (let i = 0; i < N; i++) px[i] = Math.tanh((px[i] - 127.5) / 110) * 90 + 127.5 + (px[i] - 127.5) * (f - 1); },
  grainLight: null, // handled via noise effect
};

export const FILTER_GROUPS = [
  {
    id: 'cinematic', label: 'Cinematic',
    items: [
      { id: 'to', name: 'Teal & Orange', run: F.tealOrange },
      { id: 'blk', name: 'Blockbuster', run: (px, N, amt) => { F.contrast(px, N, 0.22 * amt); F.sat(px, N, -0.1 * amt); F.tealOrange(px, N, amt * 0.5); } },
      { id: 'cine', name: 'Theater', run: (px, N, amt) => { F.hardContrast(px, N, amt); F.gamma(px, N, -0.1 * amt); } },
      { id: 'scorc', name: 'Noir Edge', run: (px, N, amt) => { F.grayscale(px, N); F.contrast(px, N, 0.4 * amt); } },
    ],
  },
  {
    id: 'portrait', label: 'Portrait',
    items: [
      { id: 'pt-soft', name: 'Soft Glow', run: (px, N, amt) => { F.warmSoft(px, N, amt); F.brightness(px, N, 0.05 * amt); } },
      { id: 'pt-clear', name: 'Clear Skin', run: (px, N, amt) => { F.sat(px, N, 0.15 * amt); F.brightness(px, N, 0.08 * amt); } },
      { id: 'pt-blush', name: 'Rosy', run: (px, N, amt) => F.pinkish(px, N, amt) },
    ],
  },
  {
    id: 'landscape', label: 'Landscape',
    items: [
      { id: 'ls-forest', name: 'Emerald', run: (px, N, amt) => { F.greenish(px, N, amt); F.contrast(px, N, 0.15 * amt); } },
      { id: 'ls-sun', name: 'Golden Hour', run: (px, N, amt) => { F.warm(px, N, amt); F.brightness(px, N, 0.05 * amt); } },
      { id: 'ls-haze', name: 'Misty', run: (px, N, amt) => { F.fade(px, N, amt); F.sat(px, N, -0.15 * amt); } },
    ],
  },
  {
    id: 'vintage', label: 'Vintage',
    items: [
      { id: 'vt-70s', name: 'Retro 70s', run: (px, N, amt) => { F.tint(px, N, amt, 242, 205, 168); F.fade(px, N, amt * 0.4); } },
      { id: 'vt-film', name: 'Old Film', run: (px, N, amt) => { F.fade(px, N, amt); F.tint(px, N, amt * 0.4, 200, 180, 150); } },
      { id: 'vt-polar', name: 'Polaroid', run: (px, N, amt) => { F.brightness(px, N, 0.12 * amt); F.contrast(px, N, -0.05 * amt); F.pinkish(px, N, amt * 0.6); } },
    ],
  },
  {
    id: 'film', label: 'Film',
    items: [
      { id: 'fm-kodak', name: 'Kodak Gold', run: (px, N, amt) => { F.warm(px, N, amt); F.fade(px, N, amt * 0.3); F.contrast(px, N, 0.1 * amt); } },
      { id: 'fm-muted', name: 'Muted Paper', run: (px, N, amt) => { F.fade(px, N, amt * 0.7); F.sat(px, N, -0.3 * amt); } },
    ],
  },
  {
    id: 'bw', label: 'Black & White',
    items: [
      { id: 'bw-warm', name: 'Silver', run: (px, N, amt) => { F.grayscale(px, N); F.contrast(px, N, 0.1 * amt); } },
      { id: 'bw-high', name: 'High Key', run: (px, N, amt) => { F.grayscale(px, N); F.brightness(px, N, 0.15 * amt); } },
      { id: 'bw-dark', name: 'Darkroom', run: (px, N, amt) => { F.grayscale(px, N); F.contrast(px, N, 0.35 * amt); } },
      { id: 'bw-cyan', name: 'Cyanotype', run: (px, N, amt) => { F.grayscale(px, N); for (let i = 0; i < N; i += 4) { const v = px[i] / 255 * amt; px[i] = v * 60; px[i + 1] = v * 120; px[i + 2] = v * 200; } } },
    ],
  },
  {
    id: 'warm', label: 'Warm',
    items: [{ id: 'wm-amber', name: 'Amber', run: (px, N, amt) => F.warm(px, N, amt) }, { id: 'wm-sun', name: 'Sunset', run: (px, N, amt) => { F.tint(px, N, amt * 0.85, 250, 120, 60); } }],
  },
  {
    id: 'cool', label: 'Cool',
    items: [{ id: 'cl-ice', name: 'Arctic', run: (px, N, amt) => F.cool(px, N, amt) }, { id: 'cl-azure', name: 'Azure', run: (px, N, amt) => { F.tint(px, N, amt * 0.8, 90, 170, 250); } }],
  },
  {
    id: 'moody', label: 'Moody',
    items: [
      { id: 'md-forest', name: 'Forest', run: (px, N, amt) => { F.tint(px, N, amt * 0.6, 60, 120, 90); F.contrast(px, N, 0.2 * amt); } },
      { id: 'md-storm', name: 'Storm', run: (px, N, amt) => { F.cool(px, N, amt * 0.7); F.contrast(px, N, 0.15 * amt); } },
    ],
  },
  {
    id: 'luxury', label: 'Luxury',
    items: [{ id: 'lx-gold', name: 'Champagne', run: (px, N, amt) => F.tint(px, N, amt * 0.7, 232, 202, 148) }, { id: 'lx-onyx', name: 'Onyx', run: (px, N, amt) => { F.contrast(px, N, 0.3 * amt); F.sat(px, N, 0.1 * amt); } }],
  },
  {
    id: 'instagram', label: 'Instagram',
    items: [
      { id: 'ig-clarendon', name: 'Clarendon', run: (px, N, amt) => { F.contrast(px, N, 0.2 * amt); F.sat(px, N, 0.15 * amt); } },
      { id: 'ig-gingham', name: 'Gingham', run: (px, N, amt) => { F.brightness(px, N, 0.06 * amt); F.warm(px, N, amt * 0.5); } },
      { id: 'ig-lark', name: 'Lark', run: (px, N, amt) => { F.brightness(px, N, 0.04 * amt); F.cool(px, N, amt * 0.6); } },
    ],
  },
  {
    id: 'travel', label: 'Travel',
    items: [{ id: 'tr-sunny', name: 'Sunkissed', run: (px, N, amt) => { F.warm(px, N, amt * 0.8); F.contrast(px, N, 0.1 * amt); } }, { id: 'tr-tropics', name: 'Tropics', run: (px, N, amt) => { F.sat(px, N, 0.4 * amt); F.greenish(px, N, amt * 0.5); } }],
  },
  {
    id: 'wedding', label: 'Wedding',
    items: [{ id: 'wd-ethereal', name: 'Ethereal', run: (px, N, amt) => { F.brightness(px, N, 0.1 * amt); F.fade(px, N, amt * 0.5); F.pinkish(px, N, amt * 0.5); } }, { id: 'wd-blush', name: 'Blush', run: (px, N, amt) => F.pinkish(px, N, amt) }],
  },
  {
    id: 'dramatic', label: 'Dramatic',
    items: [{ id: 'dr-hdr', name: 'Dusk Rock', run: (px, N, amt) => { F.contrast(px, N, 0.3 * amt); F.cool(px, N, amt * 0.4); } }, { id: 'dr-silhouette', name: 'Silhouette', run: (px, N, amt) => { F.contrast(px, N, 0.5 * amt); F.grayscale(px, N); } }],
  },
];

export const FILTER_LOOKUP = {};
FILTER_GROUPS.forEach((g) => g.items.forEach((f) => { FILTER_LOOKUP[f.id] = f; }));

export const FILTER_IDS = FILTER_GROUPS.flatMap((g) => g.items.map((f) => ({ ...f, cat: g.label })));

// =============================================================================
// EFFECT DEFINITIONS — some pixel, some overlay.
// =============================================================================
const pixelBlur = (px, W, H, amt, r) => { const copy = new Float32Array(px); boxBlurRgba(copy, W, H, Math.max(1, Math.round(r))); for (let i = 0; i < px.length; i++) px[i] = lerp(px[i], copy[i], amt); };

export const EFFECTS = [
  { id: 'blur', name: 'Blur', icon: '💠', mode: 'px', run: (px, W, H, a) => pixelBlur(px, W, H, a, 2 + 10 * a) },
  { id: 'gaussian', name: 'Gaussian Blur', icon: '🌫', mode: 'px', run: (px, W, H, a) => pixelBlur(px, W, H, a, 3 + 18 * a) },
  { id: 'motion', name: 'Motion Blur', icon: '💨', mode: 'px', run: (px, W, H, a) => { const src = new Float32Array(px); const r = Math.round(4 + 16 * a); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let R = 0, G = 0, B = 0; for (let k = -r; k <= r; k++) { const xx = Math.min(W - 1, Math.max(0, x + k * 0.6)); const o = (y * W + Math.round(xx)) * 4; R += src[o]; G += src[o + 1]; B += src[o + 2]; } const o = (y * W + x) * 4; px[o] = R / (2 * r + 1); px[o + 1] = G / (2 * r + 1); px[o + 2] = B / (2 * r + 1); } } },
  { id: 'radial', name: 'Radial Blur', icon: '🌀', mode: 'px', run: (px, W, H, a) => { const src = new Float32Array(px); const cx = W / 2, cy = H / 2, r = Math.round(6 + 14 * a); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let R = 0, G = 0, B = 0; const dx = x - cx, dy = y - cy; const d = Math.sqrt(dx * dx + dy * dy) || 1; for (let k = 0; k < 6; k++) { const s = k / 5 * r * a; const xx = Math.min(W - 1, Math.max(0, x - dx / d * s)); const yy = Math.min(H - 1, Math.max(0, y - dy / d * s)); const o = (Math.round(yy) * W + Math.round(xx)) * 4; R += src[o]; G += src[o + 1]; B += src[o + 2]; } const o = (y * W + x) * 4; px[o] = R / 6; px[o + 1] = G / 6; px[o + 2] = B / 6; } } },
  { id: 'glow', name: 'Glow', icon: '✨', mode: 'px', run: (px, W, H, a) => { const src = new Float32Array(px); boxBlurRgba(src, W, H, Math.round(4 + 10 * a)); for (let i = 0; i < px.length; i += 4) { px[i] = lerp(px[i], src[i] + src[i] * a, a * 0.7); } } },
  { id: 'bloom', name: 'Bloom', icon: '🌕', mode: 'px', run: (px, W, H, a) => { const src = new Float32Array(px); boxBlurRgba(src, W, H, Math.round(5 + 12 * a)); for (let i = 0; i < px.length; i += 4) { const boost = rgb2luma(px[i], px[i + 1], px[i + 2]) > 170 ? a : 0; px[i] = lerp(px[i], src[i] + 30 * boost, boost); } } },
  { id: 'grain', name: 'Grain', icon: '🌾', mode: 'px', run: (px, W, H, a) => { for (let i = 0; i < px.length; i++) px[i] += (Math.random() - 0.5) * a * 60; } },
  { id: 'noise', name: 'Noise', icon: '📻', mode: 'px', run: (px, W, H, a) => { for (let i = 0; i < px.length; i += 4) { const n = (Math.random() - 0.5) * a * 90; px[i] += n; px[i + 1] += n; px[i + 2] += n; } } },
  { id: 'film-grain', name: 'Film Grain', icon: '🎞', mode: 'px', run: (px, W, H, a) => { for (let i = 0; i < px.length; i++) px[i] += (Math.random() - 0.5) * a * 34; F.contrast(px, W * H * 4, 0.08 * a); } },
  { id: 'glitch', name: 'Glitch', icon: '📺', mode: 'px', run: (px, W, H, a) => { const src = new Float32Array(px); for (let y = 0; y < H; y += Math.max(2, Math.round((1 - a) * 20))) { const off = (Math.random() - 0.5) * W * 0.2 * a; const row = y * W * 4; for (let x = 0; x < W; x++) { const xx = Math.min(W - 1, Math.max(0, x + off)); const o = (y * W + x) * 4; const s = row + Math.round(xx) * 4; px[o] = src[s]; px[o + 2] = src[s + 2]; px[o + 1] = src[s + 1]; } } } },
  { id: 'vhs', name: 'VHS', icon: '📼', mode: 'px', run: (px, W, H, a) => { F.contrast(px, W * H * 4, 0.2 * a); for (let y = 0; y < H; y++) { if (Math.random() < 0.08 * a) { const o = (y * W) * 4; for (let x = 0; x < W; x++) { const i = o + x * 4; px[i] -= 40 * a; px[i + 2] += 60 * a; } } } } },
  { id: 'ca-effect', name: 'Chromatic Aberration', icon: '🟣', mode: 'px', run: (px, W, H, a) => { const src = new Float32Array(px); const cw = Math.round(2 + 8 * a); const pos = (x, y, dx) => (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x + dx))) * 4; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const o = (y * W + x) * 4; const d = cw * (0.5 - (y / H)); px[o] = src[pos(x, y, d) ]; px[o + 2] = src[pos(x, y, -d) + 2]; } } },
  { id: 'pixelate', name: 'Pixelate', icon: '🟪', mode: 'px', run: (px, W, H, a) => { const bs = Math.max(2, Math.round((1 - a) * 24)); const src = new Float32Array(px); for (let y = 0; y < H; y += bs) for (let x = 0; x < W; x += bs) { let R = 0, G = 0, B = 0, n = 0; for (let yy = 0; yy < bs; yy++) for (let xx = 0; xx < bs; xx++) { const o = (Math.min(H - 1, y + yy) * W + Math.min(W - 1, x + xx)) * 4; R += src[o]; G += src[o + 1]; B += src[o + 2]; n++; } for (let yy = 0; yy < bs; yy++) for (let xx = 0; xx < bs; xx++) { const o = (Math.min(H - 1, y + yy) * W + Math.min(W - 1, x + xx)) * 4; px[o] = R / n; px[o + 1] = G / n; px[o + 2] = B / n; } } } },
  { id: 'sharpen', name: 'Sharpen', icon: '🔪', mode: 'px', run: (px, W, H, a) => { const copy = new Float32Array(px); boxBlurRgba(copy, W, H, 1); const amt = a * 1.4; for (let i = 0; i < px.length; i++) px[i] = lerp(copy[i], px[i] * (1 + amt) - copy[i] * amt, 1); } },
  { id: 'shadow', name: 'Shadow', icon: '🌑', mode: 'px', run: (px, W, H, a) => { applyVignette(px, W, H, { amount: a * 80, size: 0.5, feather: 0.6, roundness: 0, highlights: 0 }); } },
  // overlays --
  { id: 'flare', name: 'Lens Flare', icon: '🌞', mode: 'ov', draw: (ctx, W, H, a) => { const g = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.5); g.addColorStop(0, `rgba(255,240,200,${0.5 * a})`); g.addColorStop(0.18, `rgba(255,220,150,${0.14 * a})`); g.addColorStop(0.5, `rgba(200,120,60,${0.05 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } },
  { id: 'lightleak', name: 'Light Leak', icon: '🌅', mode: 'ov', draw: (ctx, W, H, a) => { const g = ctx.createLinearGradient(0, 0, W * 0.7, H); g.addColorStop(0, `rgba(255,120,60,${0.35 * a})`); g.addColorStop(0.5, `rgba(255,60,140,${0.12 * a})`); g.addColorStop(1, 'rgba(255,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); } },
  { id: 'bokeh', name: 'Bokeh', icon: '🫧', mode: 'ov', draw: (ctx, W, H, a) => { for (let k = 0; k < 24 * a; k++) { ctx.beginPath(); ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05 * a})`; const x = Math.abs((Math.sin(k * 127.1 + 311.7) * 43758.5453) % 1) * W; const y = Math.abs((Math.cos(k * 269.5 + 183.3) * 28001.8387) % 1) * H; ctx.arc(x, y, 6 + Math.random() * 40 * a, 0, 7); ctx.fill(); } } },
  { id: 'scan', name: 'Scanlines', icon: '📺', mode: 'ov', draw: (ctx, W, H, a) => { ctx.fillStyle = `rgba(0,0,0,${0.12 * a})`; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1); } },
];

export const EFFECT_LOOKUP = {};
EFFECTS.forEach((e) => { EFFECT_LOOKUP[e.id] = e; });
export const OVERLAY_LOOKUP = {};
EFFECTS.filter((e) => e.mode === 'ov').forEach((e) => { OVERLAY_LOOKUP[e.id] = e; });

// =============================================================================
// Mask helpers
// =============================================================================
export const makeMaskCanvas = (W, H) => {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  return cv;
};
export const clearMask = (cv) => {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
};
export const maskBall = (cv, x, y, r, hard, add) => {
  const g = cv.getContext('2d');
  if (hard > 0.99) {
    g.globalCompositeOperation = add ? 'source-over' : 'destination-out';
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  } else {
    const grad = g.createRadialGradient(x, y, r * (1 - hard), x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = add ? 'source-over' : 'destination-out';
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r + 1, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
};
export const maskGradient = (cv, x0, y0, x1, y1, radial, add) => {
  const ctx = cv.getContext('2d');
  ctx.globalCompositeOperation = add ? 'source-over' : 'destination-out';
  const g = radial
    ? ctx.createRadialGradient(x0, y0, 0, x0, y0, Math.max(1, Math.hypot(x1 - x0, y1 - y0)))
    : ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'source-over';
};
export const maskAutoSubject = (cv) => {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const d = ctx.getImageData(0, 0, W, H);
  const data = d.data;
  // crude subject detection: central-weighted luminance difference from edge average
  const edges = [0, 0, 0];
  let n = 0;
  const inset = Math.round(Math.min(W, H) * 0.06);
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    const onEdge = x < inset || y < inset || x > W - inset || y > H - inset;
    const o = (y * W + x) * 4;
    edges[0] += onEdge ? data[o] : 0; edges[1] += onEdge ? data[o + 1] : 0; edges[2] += onEdge ? data[o + 2] : 0;
    n += onEdge ? 1 : 0;
  }
  const er = edges[0] / (n || 1), eg = edges[1] / (n || 1), eb = edges[2] / (n || 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    const diff = Math.abs(data[o] - er) + Math.abs(data[o + 1] - eg) + Math.abs(data[o + 2] - eb);
    data[o + 3] = Math.max(0, Math.min(255, (140 - diff) * 3));
    data[o] = 255; data[o + 1] = 255; data[o + 2] = 255;
  }
  ctx.putImageData(d, 0, 0);
};
export const maskAutoSky = (cv) => {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const d = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const t = 1 - smoothstep(0, 0.5, y / H);
    const o = (y * W) * 4;
    for (let x = 0; x < W; x++) {
      const i = o + x * 4;
      const blue = d.data[i + 2] > d.data[i] * 1.05 && d.data[i + 2] > d.data[i + 1];
      d.data[i + 3] = blue ? 255 * t : 255 * t * 0.4;
      d.data[i] = 255; d.data[i + 1] = 255; d.data[i + 2] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
};
export const maskAutoPerson = (cv) => {
  // skin-tone biased subject mask
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const d = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2];
    const skin = r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15;
    d.data[i + 3] = skin ? 255 : 0;
    d.data[i] = 255; d.data[i + 1] = 255; d.data[i + 2] = 255;
  }
  ctx.putImageData(d, 0, 0);
};

// =============================================================================
// Tiny uncompressed TIFF encoder (chunky RGB, 8-bit/sample) — real export.
// =============================================================================
export const canvasToTIFF = (canvas) => {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const d = ctx.getImageData(0, 0, W, H).data;
  const row = W * 3;
  const dataSize = row * H;
  const nb = 8 + 2 + 13 * 12 + 4; // header(8) + count(2) + 13 entries + next-IFD(4)
  const stripOff = nb;
  const total = stripOff + dataSize;
  const buf = new ArrayBuffer(total);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const le = true;
  let o = 0;
  const w16 = (v) => { dv.setUint16(o, v, le); o += 2; };
  const w32 = (v) => { dv.setUint32(o, v, le); o += 4; };
  w16(0x4949); w16(42); w32(8);           // TIFF header, IFD at offset 8
  w16(13);                                  // entry count
  const entries = [
    [256, 4, W], [257, 4, H], [258, 3, 8], [259, 3, 1], [262, 3, 2], [273, 4, stripOff],
    [277, 3, 3], [278, 4, H], [279, 4, dataSize], [282, 4, 72], [283, 4, 72], [296, 3, 2], [284, 3, 1],
  ];
  for (const [tag, type, val] of entries) {
    w16(tag); w16(type); w32(1);
    if (type === 3) { w16(val); w16(0); } else w32(val);
  }
  w32(0); // next IFD = none
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o2 = stripOff + y * row + x * 3;
    const s = (y * W + x) * 4;
    u8[o2] = d[s]; u8[o2 + 1] = d[s + 1]; u8[o2 + 2] = d[s + 2];
  }
  return new Blob([buf], { type: 'image/tiff' });
};

// =============================================================================
// Video CSS filter string + minimal ffmpeg -vf mapping from the same params.
// =============================================================================
export const videoCssFilter = (p) => {
  const parts = [];
  if (p.exposure) parts.push(`brightness(${Math.min(3, Math.pow(2, p.exposure)).toFixed(3)})`);
  else if (p.brightness) parts.push(`brightness(${Math.max(0, Math.min(2, 1 + p.brightness / 160)).toFixed(3)})`);
  if (p.contrast) parts.push(`contrast(${Math.max(0, Math.min(3, 1 + p.contrast / 100)).toFixed(3)})`);
  if (p.saturation) parts.push(`saturate(${Math.max(0, Math.min(3, 1 + p.saturation / 100)).toFixed(3)})`);
  if (p.hue) parts.push(`hue-rotate(${p.hue}deg)`);
  if (p.temperature) parts.push(`sepia(${Math.max(0, Math.min(1, Math.abs(p.temperature) / 220)).toFixed(2)})`);
  return parts.length ? parts.join(' ') : 'none';
};

export const videoFfmpegFilter = (p, filter) => {
  const eq = [];
  if (p.exposure) eq.push(`brightness=${p.exposure * 0.35}`);
  if (p.contrast) eq.push(`contrast=${1 + p.contrast / 100}`);
  if (p.gamma !== 1) eq.push(`gamma=${p.gamma}`);
  if (p.saturation) eq.push(`saturation=${1 + p.saturation / 100}`);
  if (p.hue) eq.push(`hue=h=${(-p.hue).toFixed(0)}`);
  const parts = [];
  if (eq.length) parts.push(`eq=${eq.join(':')}`);
  if (filter) parts.push(filter);
  return parts.length ? parts.join(',') : '';
};