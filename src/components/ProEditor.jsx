import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { ensureFFmpeg, ffmpeg } from '../lib/ffmpeg';
import { filterFor, loadMediaMeta, runMerge } from '../lib/videoUtils';
import * as P from '../lib/pipeline';

/* ===========================================================================
   CONSTANTS
   =========================================================================== */
const PRESET_RATIOS = [
  { id: 'free', label: 'Free' }, { id: '1:1', label: '1:1' }, { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' }, { id: '16:9', label: '16:9' }, { id: '9:16', label: '9:16' },
];
const FONTS = ['Arial', 'Inter', 'Georgia', 'Times New Roman', 'Impact', 'Courier New', 'Verdana', 'Trebuchet MS', 'Brush Script MT', 'monospace'];
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten'];
const WBMAP = { normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', 'soft-light': 'soft-light', 'hard-light': 'hard-light', darken: 'darken', lighten: 'lighten' };
const STICKER_CATS = [
  { id: 'emoji', label: 'Emoji', list: ['😀', '😂', '🥰', '😎', '🤣', '😇', '😍', '🥳', '🤩', '😜', '🤔', '😢', '😡', '👍', '👎', '👏', '🙌', '💪', '👀', '🙏', '🤝', '✌️', '🤞', '💥'] },
  { id: 'decore', label: 'Decorations', list: ['⭐', '✨', '🌟', '🔥', '🎉', '🎀', '💫', '🌈', '☀️', '🌸', '💐', '🌺', '🍀', '🌊', '❄️', '🍂', '🎈', '🎁'] },
  { id: 'social', label: 'Social', list: ['❤️', '💖', '💯', '📸', '🎥', '🎧', '🖼️', '📱', '💻', '🎮', '🏆', '👑', '🚀', '💎'] },
  { id: 'arrows', label: 'Arrows', list: ['⬆️', '⬇️', '⬅️', '➡️', '↗️', '↘️', '↙️', '↖️', '↕️', '➰', '➿', '🎯'] },
];
const SHAPE_DEFS = [
  { id: 'rect', label: 'Rectangle', icon: '▭' }, { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'ring', label: 'Ring', icon: '◯' }, { id: 'line', label: 'Line', icon: '╱' },
  { id: 'arrow', label: 'Arrow', icon: '➤' }, { id: 'star', label: 'Star', icon: '★' },
  { id: 'heart', label: 'Heart', icon: '♥' }, { id: 'poly', label: 'Triangle', icon: '△' },
];
const HISTORY_CAPS = 60;
const AUTOSAVE_KEY = 'dm_prosis_photo';

const BUILTIN_PRESETS = [
  { id: 'p-cin', name: 'Cinematic', patch: { adjust: { contrast: 18, saturation: 6, temperature: -8, detail: { sharpness: 15, clarity: 12, dehaze: 8 } } }, filters: ['to'] },
  { id: 'p-mood', name: 'Moody', patch: { adjust: { contrast: 22, saturation: -18, exposure: -0.35, detail: { clarity: 16 } } }, filters: ['md-forest'] },
  { id: 'p-bright', name: 'Bright', patch: { adjust: { exposure: 0.6, brightness: 10, whites: 8, shadows: 14 } }, filters: [] },
  { id: 'p-warm', name: 'Warm', patch: { adjust: { temperature: 22, tint: 6, saturation: 8 } }, filters: ['wm-sun'] },
  { id: 'p-cool', name: 'Cool', patch: { adjust: { temperature: -20, saturation: -4 } }, filters: ['cl-ice'] },
  { id: 'p-film', name: 'Film', patch: { adjust: { contrast: 6, saturation: -12, temperature: 8 } }, filters: ['fm-kodak'] },
  { id: 'p-port', name: 'Portrait', patch: { adjust: { brightness: 6, saturation: 6, detail: { noiseR: 14, texture: 10 } } }, filters: ['pt-soft'] },
  { id: 'p-hdr', name: 'HDR', patch: { adjust: { highlights: -22, shadows: 28, brilliance: 12, contrast: 14, saturation: 22 } }, filters: ['blk'] },
  { id: 'p-bw', name: 'Black & White', patch: { adjust: { contrast: 24, saturation: -100 } }, filters: ['bw-warm'] },
];

const LIGHT_OPS = [
  ['exposure', 'Exposure', -4, 4, 0.01], ['brightness', 'Brightness', -100, 100, 1], ['contrast', 'Contrast', -100, 100, 1],
  ['highlights', 'Highlights', -100, 100, 1], ['shadows', 'Shadows', -100, 100, 1], ['whites', 'Whites', -100, 100, 1],
  ['blacks', 'Blacks', -100, 100, 1], ['gamma', 'Gamma', 0.2, 4, 0.01], ['brilliance', 'Brilliance', -100, 100, 1],
];
const LIGHT_DESC = {
  exposure: 'Brightness of the whole image, captured by the sensor',
  brightness: 'Lighten or darken the entire photo',
  contrast: 'Difference between the darkest and brightest areas',
  highlights: 'Recover or deepen the brightest parts',
  shadows: 'Lift or crush the darkest parts',
  whites: 'Set the very brightest white point',
  blacks: 'Set the very darkest black point',
  gamma: 'Mid-tone brightness without clipping',
  brilliance: 'Perceptual glow in mid-tones',
};
const COLOR_OPS = [
  ['temperature', 'Temperature', -100, 100, 1], ['tint', 'Tint', -100, 100, 1], ['saturation', 'Saturation', -100, 100, 1],
  ['vibrance', 'Vibrance', -100, 100, 1], ['hue', 'Hue', -180, 180, 1], ['intensity', 'Color Intensity', -100, 100, 1],
];
const DETAIL_OPS = [
  ['sharpness', 'Sharpness', -100, 100, 1], ['clarity', 'Clarity', -100, 100, 1], ['texture', 'Texture', -100, 100, 1],
  ['structure', 'Structure', -100, 100, 1], ['dehaze', 'Dehaze', -100, 100, 1], ['noiseR', 'Noise Reduction', 0, 100, 1], ['aiDenoise', 'AI Denoise', 0, 100, 1],
];
const OPTIC_OPS = [
  ['distortion', 'Distortion', -100, 100, 1], ['ca', 'Chromatic Aberration', 0, 100, 1], ['lens', 'Lens Correction', -100, 100, 1],
];
const HSLC = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Magenta'];

const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

const cloneJSON = (o) => { try { return JSON.parse(JSON.stringify(o)); } catch { return o; } };

/* ===========================================================================
   SMALL UI PRIMITIVES
   =========================================================================== */
function AdjSlider({ label, value, min, max, step, onChange, onReset, fmt, onCommit, desc }) {
  const commit = () => { if (onCommit) onCommit(); };
  const wheel = (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const nv = value + dir * ((step || 1) * (e.shiftKey ? 5 : 1));
    onChange(Math.max(min, Math.min(max, Math.round(nv * 100) / 100)));
  };
  return (
    <div className="ped-slider">
      <div className="ped-slider-head">
        {desc ? <span className="ped-hint-b" data-hint={desc}>{label}</span> : <span className="ped-lbl">{label}</span>}
        <span className="ped-val">
          <input className="ped-num" type="number" min={min} max={max} step={step} value={Math.round(value * 100) / 100}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v))); }}
            onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
          <button className="ped-reset" title="Reset (double-click slider)" onClick={() => { onReset(); commit(); }}>↺</button>
        </span>
      </div>
      <input className="ped-range" type="range" min={min} max={max} step={step} value={value}
        onInput={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={commit}
        onPointerCancel={commit}
        onDoubleClick={() => { onReset(); commit(); }}
        onWheel={wheel} />
      {fmt && <span className="ped-fmt">{fmt(value)}</span>}
    </div>
  );
}
function ResetAll({ onReset }) {
  return <button className="ped-reset-all" onClick={onReset}>↺ Reset all</button>;
}
function ZExpando({ label, children, icon }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="ped-section">
      <button className="ped-sec" onClick={() => setOpen(!open)}><span>{icon} {label}</span><b>{open ? '▾' : '▸'}</b></button>
      {open && <div className="ped-sec-body">{children}</div>}
    </div>
  );
}
function SegT({ opts, value, onChange, small }) {
  return (
    <div className={`ped-seg ${small ? 'ped-seg-sm' : ''}`}>
      {opts.map((o) => <button key={typeof o === 'string' ? o : o.id} className={value === (typeof o === 'string' ? o : o.id) ? 'on' : ''} onClick={() => onChange(typeof o === 'string' ? o : o.id)}>{typeof o === 'string' ? o : o.label}</button>)}
    </div>
  );
}

/* ===========================================================================
   PRO EDITOR
   =========================================================================== */
export default function ProEditor({ params }) {
  const { navigate, notify, upsertProject, addAI, profile, projects } = useApp();

  const isVideoInit = useMemo(() => !!params.src && params.src.startsWith('blob:') || params.kind === 'video', [params]);
  const srcUrl = params.src || params.preview || null;
  const [mode, setMode] = useState(isVideoInit ? 'video' : 'photo');
  const [name, setName] = useState(params.name || 'Untitled Project');
  const [ready, setReady] = useState(false);
  const [engine, setEngine] = useState(false);

  const wrapRef = useRef(null), canvasRef = useRef(null), vidRef = useRef(null);
  const srcCanvasRef = useRef(null), baseCanvasRef = useRef(null), maskRef = useRef(null);
  const stateRef = useRef({});
  const histRef = useRef(null);
  const rafRef = useRef(0), lastRender = useRef(0);
  const pointerRef = useRef(null);
  const cancelRef = useRef(false);
  const capsRef = useRef({ w: 1280, h: 800, fullW: 1280, fullH: 800 });
  const lastSnapRef = useRef({ label: '', ts: 0 });

  // ---- adjustable state ---------------------------------------------------
  const [adjust, setAdjust] = useState(P.DEFAULT_ADJUST());
  const [curves, setCurves] = useState({ rgb: [], r: [], g: [], b: [] });
  const [filters, setFilters] = useState([]);
  const [effects, setEffects] = useState([]);
  const [items, setItems] = useState([]);
  const [selId, setSelId] = useState(null);
  const [crop, setCrop] = useState({ on: false, x: 0, y: 0, w: 0, h: 0, ratio: null, straighten: 0, flipH: false, flipV: false, rot: 0 });
  const [maskCv, setMaskCv] = useState(null);
  const [maskCvStamp, setMaskCvStamp] = useState(0);
  const [maskUi, setMaskUi] = useState({ feather: 0, density: 100, opacity: 80, visible: true, inverted: false });
  const [brushUi, setBrushUi] = useState({ size: 40, hard: 0.7, eraser: false });
  const [retouch, setRetouch] = useState({ tool: null, size: 30, hard: 0.7, intensity: 50 });
  const [wbPick, setWbPick] = useState(false);

  // ---- view / compare -----------------------------------------------------
  const [zoom, setZoom] = useState(0);
  const [compare, setCompare] = useState({ mode: 'off', split: 0.5 });
  const [holdOrig, setHoldOrig] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // ---- panels -------------------------------------------------------------
  const [leftTab, setLeftTab] = useState('adjust');
  const [rightTab, setRightTab] = useState('props');

  // ---- history ------------------------------------------------------------
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);

  // ---- presets ------------------------------------------------------------
  const [userPresets, setUserPresets] = useState(() => { try { return JSON.parse(localStorage.getItem('dm_presets') || '[]'); } catch { return []; } });

  // ---- save / busy / export ----------------------------------------------
  const [savedAt, setSavedAt] = useState(null);
  const [busyAI, setBusyAI] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const [exportLog, setExportLog] = useState('');

  // ---- video --------------------------------------------------------------
  const [clips, setClips] = useState([]);
  const [music, setMusic] = useState(null);
  const [audio, setAudio] = useState({ volume: 1, fadeIn: 0, fadeOut: 0, normalize: false, mute: false });
  const [transitions, setTransitions] = useState([]);
  const [playPos, setPlayPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedRamp, setSpeedRamp] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [videoMeta, setVideoMeta] = useState({ duration: 0, width: 0, height: 0 });
  const [wave, setWave] = useState([]);
  const [timelineZoom, setTimelineZoom] = useState(8);

  /* ---- workspace UI state ---- */
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [toolQ, setToolQ] = useState('');
  const [favTools, setFavTools] = useState(() => { try { return JSON.parse(localStorage.getItem('ped_fav_tools') || '[]'); } catch { return []; } });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState('');
  const [palIdx, setPalIdx] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [savedIdx, setSavedIdx] = useState(null);
  const [handOn, setHandOn] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [rulersOn, setRulersOn] = useState(false);
  const [guidesOn, setGuidesOn] = useState(false);
  const [snapOn, setSnapOn] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });

  // ---- export options -----------------------------------------------------
  const [expOpts, setExpOpts] = useState({ fmt: 'png', quality: 92, resW: 1080, resH: 1080, fps: 30, crf: 20, preset: 'original' });

  /* ---- mirror live state for the render loop ---- */
  useEffect(() => {
    stateRef.current = { adjust, curves, filters, effects, items, crop, maskCv: maskRef.current || maskCv, maskUi, brushUi, compare, holdOrig, zoom, retouch, mode, wbPick, pan, handOn, gridOn, rulersOn, guidesOn, snapOn };
  }, [adjust, curves, filters, effects, items, crop, maskCv, maskUi, brushUi, compare, holdOrig, zoom, retouch, mode, wbPick, pan, handOn, gridOn, rulersOn, guidesOn, snapOn]);

  /* ---- source loading ---- */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (mode === 'video') { setReady(true); return; }
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        const mx = 2400;
        const sc = Math.min(1, mx / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        srcCanvasRef.current = c; baseCanvasRef.current = c;
        histRef.current = P.buildHistogram(c);
        capsRef.current = { w: c.width, h: c.height, fullW: img.naturalWidth, fullH: img.naturalHeight };
        setCrop({ on: false, x: 0, y: 0, w: c.width, h: c.height, ratio: null, straighten: 0, flipH: false, flipV: false, rot: 0 });
        setReady(true);
      };
      img.onerror = () => { notify('Could not load image', 'error'); setReady(true); };
      if (srcUrl) img.src = srcUrl;
      else {
        const c = document.createElement('canvas'); c.width = 1280; c.height = 800;
        const g = c.getContext('2d').createLinearGradient(0, 0, 1280, 800);
        g.addColorStop(0, '#1b1f2a'); g.addColorStop(1, '#0d0f16');
        c.getContext('2d').fillStyle = g; c.getContext('2d').fillRect(0, 0, 1280, 800);
        srcCanvasRef.current = c; baseCanvasRef.current = c;
        histRef.current = P.buildHistogram(c);
        capsRef.current = { w: 1280, h: 800, fullW: 1280, fullH: 800 };
        setCrop({ on: false, x: 0, y: 0, w: 1280, h: 800, ratio: null, straighten: 0, flipH: false, flipV: false, rot: 0 });
        setReady(true);
      }
    };
    load();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [mode, srcUrl]);

  /* ---- video: primary clip + waveform ---- */
  useEffect(() => {
    if (mode !== 'video') return;
    const doLoad = async () => {
      if (srcUrl) {
        const meta = await loadMediaMeta(srcUrl).catch(() => ({ duration: 6, width: 1080, height: 1920, kind: 'video' }));
        setVideoMeta({ duration: meta.duration, width: meta.width, height: meta.height });
        setClips([{ id: P.uid(), name: params.name || 'Clip 1', url: srcUrl, kind: 'video', meta, in: 0, duration: meta.duration, filter: 'none', reversed: false, freeze: null }]);
        setSelectedClip(P.uid());
      } else {
        setVideoMeta({ duration: 0, width: 1080, height: 1920 });
      }
    };
    doLoad();
    // eslint-disable-next-line
  }, [mode]);

  useEffect(() => {
    if (mode !== 'video' || !clips.length) return;
    const src = clips[0].url;
    if (!src.startsWith('blob:') && !src.startsWith('data:')) return;
    let on = true;
    let ac = null;
    const run = async () => {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') { try { await ac.resume(); } catch { } }
        const r = await fetch(src); const b = await r.blob(); const ab = await b.arrayBuffer();
        const buf = await ac.decodeAudioData(ab);
        if (!on) return;
        const d = buf.getChannelData(0);
        const n = Math.min(160, Math.max(32, Math.floor(d.length / 6000)));
        const arr = [];
        for (let i = 0; i < n; i++) { const s = Math.floor(i * d.length / n); let a = 0; const step = Math.max(1, Math.floor(d.length / n / 40)); for (let j = 0; j < step; j++) a += Math.abs(d[Math.min(d.length - 1, s + j)]); arr.push(Math.min(1, a / Math.max(1, step) / 0.4)); }
        setWave(arr);
      } catch { if (on) setWave([]); }
    };
    run();
    return () => { on = false; if (ac) ac.close(); };
    // eslint-disable-next-line
  }, [mode, !!clips.length]);

  /* ---- undo / redo ---- */
  const takeSnap = useCallback((label) => {
    const now = Date.now();
    if (lastSnapRef.current.label === label && now - lastSnapRef.current.ts < 500) { lastSnapRef.current.ts = now; return; }
    lastSnapRef.current = { label, ts: now };
    const state = cloneJSON({ adjust, curves, filters, effects, items, crop: { on: crop.on, x: crop.x, y: crop.y, w: crop.w, h: crop.h, ratio: crop.ratio, straighten: crop.straighten, flipH: crop.flipH, flipV: crop.flipV, rot: crop.rot } });
    setHistory((h) => {
      const snap = { label, state, base: baseCanvasRef.current, ts: Date.now() };
      const next = [...h.slice(0, histIdx + 1), snap].slice(-HISTORY_CAPS);
      setHistIdx(next.length - 1);
      return next;
    });
  }, [adjust, curves, filters, effects, items, crop, histIdx]);

  const applyState = useCallback((state, base) => {
    if (state) {
      setAdjust(state.adjust); setCurves(state.curves); setFilters(state.filters || []);
      setEffects(state.effects || []); setItems(state.items || []);
      setCrop(state.crop); setSelId(null);
    }
    if (base) baseCanvasRef.current = base;
  }, []);

  const undo = useCallback(() => {
    if (histIdx <= 0 || !history.length) { notify('Nothing to undo'); return; }
    useStateSync(() => {
      const idx = histIdx - 1;
      if (history[idx].base) baseCanvasRef.current = history[idx].base;
      applyState(history[idx].state, null);
      setHistIdx(idx);
      notify(`Undid: ${history[idx + 1].label}`, 'info');
    });
  }, [histIdx, history, applyState]);
  const redo = useCallback(() => {
    if (histIdx >= history.length - 1 || !history.length) { notify('Nothing to redo', 'info'); return; }
    useStateSync(() => {
      const idx = histIdx + 1;
      if (history[idx].base) baseCanvasRef.current = history[idx].base;
      applyState(history[idx].state, null);
      setHistIdx(idx);
    });
  }, [histIdx, history, applyState]);

  /* ---- manual save ---- */
  const autosave = useCallback(() => {
    const data = cloneJSON({ name, adjust, curves, filters, effects, items, crop });
    data.saved = Date.now();
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data)); } catch { }
    setSavedAt(Date.now());
    setSavedIdx(histIdx);
  }, [name, adjust, curves, filters, effects, items, crop, histIdx]);
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 1800);
    return () => clearTimeout(t);
  }, [savedAt]);
  useEffect(() => {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch { }
  }, []);

  /* ---- render helpers ---- */
  const drawItems = (ctx, W, H, list) => {
    list.forEach((it) => {
      if (!it.visible) return;
      ctx.save();
      ctx.globalAlpha = it.opacity != null ? it.opacity : 1;
      ctx.globalCompositeOperation = WBMAP[it.blend || 'normal'] || 'source-over';
      ctx.translate(it.x, it.y);
      ctx.rotate(((it.rot || 0) * Math.PI) / 180);
      if (it.kind === 'text') drawTextItem(ctx, it);
      else if (it.kind === 'shape') drawShapeItem(ctx, it);
      else if (it.kind === 'sticker') { ctx.font = `${it.size || 64}px "Segoe UI Emoji", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.char || '✨', 0, 0); }
      ctx.restore();
    });
  };
  const drawTextItem = (ctx, it) => {
    const size = it.size || 48;
    ctx.font = `${it.italic ? 'italic ' : ''}${it.weight || 'normal '}${size}px ${it.font || 'Arial'}`;
    ctx.textAlign = it.align || 'center';
    ctx.textBaseline = 'middle';
    const lines = String(it.text || '').split('\n');
    const lh = (it.lh || 1.2) * size;
    const ls = it.ls || 0;
    if (it.shadow && it.shadow.on) { ctx.shadowColor = it.shadow.color || 'rgba(0,0,0,0.5)'; ctx.shadowBlur = (it.shadow.blur || 8) / 2; ctx.shadowOffsetX = it.shadow.x || 0; ctx.shadowOffsetY = it.shadow.y || 3; }
    if (it.glow) { ctx.shadowColor = it.glowColor || '#7d5cff'; ctx.shadowBlur = 24; }
    const totalH = lines.length * lh;
    lines.forEach((ln, i) => {
      const ty = -totalH / 2 + lh / 2 + i * lh;
      const paint = (f) => { ctx.fillStyle = f; if (ls && ls !== 0) drawSpaced(ctx, ln, 0, ty, ls, size); else ctx.fillText(ln, 0, ty); };
      if (it.gradient) { const g = ctx.createLinearGradient(-200, 0, 200, 0); g.addColorStop(0, it.gradA || '#fff'); g.addColorStop(1, it.gradB || '#7d5cff'); paint(g); }
      else paint(it.color || '#ffffff');
      if (it.outlineW) { ctx.strokeStyle = it.outline || '#000'; ctx.lineWidth = it.outlineW || 2; ctx.lineJoin = 'round'; ctx.strokeText(ln, 0, ty); }
      if (it.bg) { const m = ctx.measureText(ln); ctx.fillStyle = it.bgColor || 'rgba(0,0,0,0.6)'; const bw = m.width + 16; ctx.fillRect(-bw / 2 - 8, ty - size * 0.55, bw + 16, size * 1.1); }
    });
    ctx.shadowBlur = 0;
  };
  const drawSpaced = (ctx, ln, x, y, ls, size) => {
    let cx = x; ctx.fillStyle = ctx.fillStyle; ctx.textAlign = 'left';
    const chars = Array.from(ln);
    let total = 0; chars.forEach((ch) => total += ctx.measureText(ch).width + ls);
    cx -= total / 2;
    chars.forEach((ch) => { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; });
  };
  const drawShapeItem = (ctx, it) => {
    const w = it.w || 120, h = it.h || 120;
    ctx.save();
    if (it.shadowOn !== false) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; }
    ctx.strokeStyle = it.stroke || 'transparent'; ctx.lineWidth = it.strokeW || 0;
    ctx.fillStyle = it.fill || '#7d5cff';
    if (it.grad) { const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, it.gradA || '#c97bff'); g.addColorStop(1, it.gradB || '#3a2bff'); ctx.fillStyle = g; }
    const filled = shapePath(ctx, it.type, it, w, h);
    if (filled && it.type !== 'line' && it.type !== 'arrow') { ctx.fill(); ctx.stroke(); }
    ctx.restore();
  };
  const shapePath = (ctx, type, it, w, h) => {
    const cw = w / 2, ch = h / 2, r = it.radius || 0;
    if (type === 'rect') { roundRect(ctx, -cw, -ch, w, h, r); return true; }
    if (type === 'circle' || type === 'ring') { ctx.beginPath(); ctx.ellipse(0, 0, cw, ch, 0, 0, 7); if (type === 'ring') { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.12); ctx.stroke(); return false; } return true; }
    if (type === 'line') { ctx.beginPath(); ctx.moveTo(-cw, ch); ctx.lineTo(cw, -ch); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.stroke(); return false; }
    if (type === 'arrow') { ctx.beginPath(); ctx.moveTo(-cw, ch); ctx.lineTo(cw, -ch); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.08); ctx.stroke(); const ang = Math.atan2(-ch - ch, cw - -cw); ctx.beginPath(); ctx.moveTo(cw, -ch); ctx.lineTo(cw - 18, -ch + 8); ctx.lineTo(cw - 18, -ch - 8); ctx.closePath(); ctx.fill(); return false; }
    if (type === 'heart') { heartPath(ctx, w, h); return true; }
    if (type === 'poly') { ctx.beginPath(); ctx.moveTo(0, -ch); ctx.lineTo(-cw, ch); ctx.lineTo(cw, ch); ctx.closePath(); return true; }
    ctx.beginPath();
    const pts = 5, R = Math.max(4, Math.min(cw, ch)), rx = R * 0.42;
    for (let i = 0; i < pts * 2; i++) { const rad = (i % 2 === 0 ? R : rx); const ang = (i * Math.PI) / pts - Math.PI / 2; const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); return true;
  };
  const heartPath = (ctx, w, h) => {
    ctx.beginPath();
    const s = Math.min(w, h) / 2, x = 0, y = -s * 0.1;
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.6, y - s * 0.35, x - s * 0.6, y + s * 0.1);
    ctx.bezierCurveTo(x - s * 0.6, y + s * 0.45, x, y + s * 0.7, x, y + s * 0.8);
    ctx.bezierCurveTo(x, y + s * 0.7, x + s * 0.6, y + s * 0.45, x + s * 0.6, y + s * 0.1);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 0.35, x, y, x, y + s * 0.3);
    ctx.closePath();
  };
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  const drawCropOverlay = (ctx, W, H, c, s) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, c.y); ctx.fillRect(0, c.y + c.h, W, H - c.y - c.h);
    ctx.fillRect(0, c.y, c.x, c.h); ctx.fillRect(c.x + c.w, c.y, W - c.x - c.w, c.h);
    ctx.strokeStyle = '#7d5cff'; ctx.lineWidth = 1.5 / s; ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1 / s;
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(c.x + (c.w * k) / 3, c.y); ctx.lineTo(c.x + (c.w * k) / 3, c.y + c.h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(c.x, c.y + (c.h * k) / 3); ctx.lineTo(c.x + c.w, c.y + (c.h * k) / 3); ctx.stroke(); }
    const hw = 6 / s; ctx.fillStyle = '#fff';
    [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]].forEach(([hx, hy]) => ctx.fillRect(hx - hw / 2, hy - hw / 2, hw, hw));
  };

  /* ---- render loop ---- */
  const renderNow = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap || !srcCanvasRef.current || !baseCanvasRef.current) return;
    if (stateRef.current.mode === 'video') return;
    const now = Date.now();
    if (now - lastRender.current < 24) return;
    lastRender.current = now;
    const st = stateRef.current;
    const base = baseCanvasRef.current;
    const W = base.width, H = base.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    cv.width = Math.max(2, Math.round(cw * dpr)); cv.height = Math.max(2, Math.round(ch * dpr));
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0a0c12'; ctx.fillRect(0, 0, cw, ch);
    const fitS = Math.max(0.02, Math.min((cw - 24) / W, (ch - 24) / H));
    let s = fitS, ox = (cw - W * s) / 2, oy = (ch - H * s) / 2;
    if (st.zoom > 0) { s = (st.zoom / 100) * fitS; ox = (cw - W * s) / 2; oy = (ch - H * s) / 2; }
    ox += st.pan ? st.pan.x : 0; oy += st.pan ? st.pan.y : 0;
    const drawProc = () => {
      const proc = P.renderEdits(base, st.adjust, { curves: st.curves, filters: st.filters, effects: st.effects, maskCanvas: st.maskUi.visible ? (st.maskCv || null) : null });
      P.drawOverlays(proc.getContext('2d'), W, H, st.effects);
      return proc;
    };
    const showOrig = st.holdOrig || st.compare.mode === 'hold';
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(s, s);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (st.compare.mode === 'split') {
      const splitX = st.compare.split * W;
      ctx.drawImage(srcCanvasRef.current, 0, 0, W, H);
      const proc = showOrig ? srcCanvasRef.current : drawProc();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, splitX, H); ctx.clip();
      ctx.drawImage(proc, 0, 0, W, H);
      if (!showOrig) drawItems(ctx, W, H, st.items);
      ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / s;
      ctx.beginPath(); ctx.moveTo(splitX, 0); ctx.lineTo(splitX, H); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(splitX, H / 2, 6 / s, 0, 7); ctx.fill();
    } else if (st.compare.mode === 'side') {
      const proc = showOrig ? srcCanvasRef.current : drawProc();
      ctx.fillStyle = '#0a0c12'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(proc, 0, 0, W, H);
      if (!showOrig) drawItems(ctx, W, H, st.items);
      ctx.strokeStyle = '#666'; ctx.lineWidth = 2 / s; ctx.strokeRect(W / 2 - 1, 0, 2, H);
    } else {
      const proc = showOrig ? srcCanvasRef.current : drawProc();
      ctx.drawImage(proc, 0, 0, W, H);
      if (!showOrig) drawItems(ctx, W, H, st.items);
    }
    if (st.crop.on) drawCropOverlay(ctx, W, H, st.crop, s);
    if (st.guidesOn && st.compare.mode === 'off' && !showOrig) {
      ctx.strokeStyle = 'rgba(255,90,90,0.75)'; ctx.lineWidth = 1 / s; ctx.setLineDash([6 / s, 5 / s]);
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.setLineDash([]);
      [W / 3, 2 * W / 3].forEach((gx) => { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); });
      [H / 3, 2 * H / 3].forEach((gy) => { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); });
    }
    if (st.maskCv && st.maskUi.visible && st.leftTab === 'mask' && !showOrig) {
      ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(st.maskCv, 0, 0, W, H); ctx.restore();
    }
    ctx.restore();
    if (st.gridOn) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      const gs = 32;
      for (let gx = gs; gx < cw; gx += gs) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, ch); ctx.stroke(); }
      for (let gy = gs; gy < ch; gy += gs) { ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(cw, gy + 0.5); ctx.stroke(); }
    }
    if (st.rulersOn) {
      const R = 18, gs = 32;
      ctx.fillStyle = 'rgba(14,16,24,0.9)';
      ctx.fillRect(0, 0, cw, R); ctx.fillRect(0, 0, R, ch);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      for (let gx = 0; gx < cw; gx += gs) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, gx % 160 === 0 ? R : R / 2); ctx.stroke(); }
      for (let gy = 0; gy < ch; gy += gs) { ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(gy % 160 === 0 ? R : R / 2, gy + 0.5); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '8px Inter, sans-serif';
      for (let gx = 0; gx < cw; gx += 160) ctx.fillText(gx, gx + 3, 9);
      for (let gy = 0; gy < ch; gy += 160) ctx.fillText(gy, 2, gy + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '11px Inter, sans-serif';
      ctx.fillText(`${Math.round(s * 100)}%`, R + 8, ch - 8);
      ctx.fillText(`${W}×${H}`, R + 8, 14);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '11px Inter, sans-serif';
      ctx.fillText(`${Math.round(s * 100)}%`, 10, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`${W}×${H}`, cw - ctx.measureText(`${W}×${H}`).width - 10, 16);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderNow);
  }, [adjust, curves, filters, effects, items, crop, maskCvStamp, maskUi, compare, holdOrig, zoom, mode, ready, pan, gridOn, rulersOn, guidesOn]);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape') { setPaletteOpen(false); setNotifOpen(false); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); autosave(); setSavedIdx(histIdx); notify('Project saved ✓'); return; }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); setExportOpen(true); return; }
      if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom((z) => (z === 0 ? 100 : Math.min(300, z * 1.25))); return; }
      if (mod && e.key === '-') { e.preventDefault(); setZoom((z) => (z === 0 ? 75 : Math.max(25, z * 0.8))); return; }
      if (mod && e.key === '0') { e.preventDefault(); setZoom(0); setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 }; return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (e.key.toLowerCase() === 'h') { setHandOn((v) => !v); return; }
      if (e.key === ' ') { e.preventDefault(); setHoldOrig(true); const up = () => setHoldOrig(false); window.addEventListener('keyup', up, { once: true }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, autosave, histIdx]);

  /* ---- paste image from clipboard ---- */
  useEffect(() => {
    const onPaste = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (mode !== 'photo' || busyAI) return;
      const it = Array.from(e.clipboardData && e.clipboardData.items || []).find((i) => i.type && i.type.startsWith('image/'));
      if (it) { const f = it.getAsFile(); if (f) { notify('Image pasted from clipboard'); loadLocalFile(f); } }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line
  }, [mode, busyAI]);

  /* ---- history init + quick actions ---- */
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => takeSnap('Open'), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [ready]);

  useEffect(() => {
    if (!ready || !params.action) return;
    runAI(params.action === 'bg' ? 'bg-remove' : params.action === 'enhance' ? 'enhance' : params.action === 'upscale' ? 'upscale' : null);
    // eslint-disable-next-line
  }, [ready]);

  /* ---- pointer interaction ---- */
  const toSource = (e) => {
    const cv = canvasRef.current, rect = cv.getBoundingClientRect();
    const base = baseCanvasRef.current;
    const W = base.width, H = base.height;
    const cw = rect.width, ch = rect.height;
    const fitS = Math.max(0.02, Math.min((cw - 24) / W, (ch - 24) / H));
    const st = stateRef.current;
    const s = st.zoom > 0 ? (st.zoom / 100) * fitS : fitS;
    let ox = (cw - W * s) / 2, oy = (ch - H * s) / 2;
    ox += st.pan ? st.pan.x : 0; oy += st.pan ? st.pan.y : 0;
    return { x: (e.clientX - rect.left - ox) / s, y: (e.clientY - rect.top - oy) / s };
  };
  const hitItem = (x, y) => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.visible || it.locked) continue;
      const w = it.w || (it.kind === 'text' ? (it.size || 48) * 4 : 120);
      const h = it.h || (it.kind === 'text' ? (it.size || 48) * 1.5 : 120);
      if (it.kind === 'sticker') continue;
      if (Math.abs(x - it.x) < w / 2 && Math.abs(y - it.y) < h / 2) return it;
    }
    return null;
  };
  const ensureMask = () => {
    if (!maskRef.current) {
      const b = baseCanvasRef.current;
      const cv = P.makeMaskCanvas(b.width, b.height);
      maskRef.current = cv; setMaskCv(cv);
    }
    return maskRef.current;
  };
  const brushAt = (x, y, retouch) => {
    ensureMask();
    const cv = maskRef.current;
    const b = baseCanvasRef.current;
    const st = stateRef.current;
    const r = (retouch ? st.retouch.size : st.brushUi.size) / 100 * Math.min(b.width, b.height);
    const hard = retouch ? st.retouch.hard : st.brushUi.hard;
    const add = retouch ? true : !st.brushUi.eraser;
    P.maskBall(cv, x, y, r, hard, add);
    setMaskCvStamp((v) => v + 1);
  };
  const clearMask = () => {
    if (!maskRef.current) return;
    P.clearMask(maskRef.current);
    setMaskCvStamp((v) => v + 1);
  };

  const clampV = (v, a, b) => Math.min(b, Math.max(a, v));
  const cropHandleAt = (x, y) => {
    const c = stateRef.current.crop;
    if (!c || !c.on) return null;
    const HZ = 10;
    const l = Math.abs(x - c.x) < HZ, r = Math.abs(x - (c.x + c.w)) < HZ;
    const t = Math.abs(y - c.y) < HZ, b = Math.abs(y - (c.y + c.h)) < HZ;
    if (l && t) return 'nw'; if (r && t) return 'ne'; if (l && b) return 'sw'; if (r && b) return 'se';
    if (l) return 'w'; if (r) return 'e'; if (t) return 'n'; if (b) return 's';
    if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) return 'move';
    return null;
  };
  const dragCrop = (d, pt, W, H) => {
    const hnd = d.handle;
    const dx = pt.x - d.start.sx, dy = pt.y - d.start.sy;
    const min = 20;
    const o = d.orig;
    if (hnd === 'move') {
      return { x: clampV(o.x + dx, 0, Math.max(0, W - o.w)), y: clampV(o.y + dy, 0, Math.max(0, H - o.h)), w: o.w, h: o.h };
    }
    let { x, y, w, h } = o;
    if (hnd.indexOf('w') >= 0) { const nx = clampV(o.x + dx, 0, o.x + o.w - min); w = o.w + (o.x - nx); x = nx; }
    if (hnd.indexOf('e') >= 0) { w = clampV(o.w + dx, min, W - o.x); }
    if (hnd.indexOf('n') >= 0) { const ny = clampV(o.y + dy, 0, o.y + o.h - min); h = o.h + (o.y - ny); y = ny; }
    if (hnd.indexOf('s') >= 0) { h = clampV(o.h + dy, min, H - o.y); }
    return { x, y, w, h };
  };
  const CROP_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || mode === 'video') return;
    const down = (e) => {
      const base = baseCanvasRef.current;
      if (!base || e.button === 2) return;
      const st = stateRef.current;
      const pt = toSource(e);
      const x = Math.max(0, Math.min(base.width, pt.x)), y = Math.max(0, Math.min(base.height, pt.y));
      if (st.handOn || e.shiftKey) {
        pointerRef.current = { down: true, pan: { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y } };
        return;
      }
      if (st.compare.mode === 'split' && Math.abs(pt.x - st.compare.split * base.width) < 14) {
        pointerRef.current = { down: true, splitDrag: true };
        return;
      }
      pointerRef.current = { x, y, moved: false, down: true, it: null };
      if (st.crop.on) {
        const handle = cropHandleAt(pt.x, pt.y);
        if (!handle) return;
        const c = st.crop;
        pointerRef.current = { down: true, cropData: { handle, orig: { x: c.x, y: c.y, w: c.w, h: c.h }, start: { sx: pt.x, sy: pt.y }, dragged: false } };
        return;
      }
      if (st.leftTab === 'mask' && !st.crop.on) { brushAt(x, y, false); return; }
      if (st.leftTab === 'retouch' && st.retouch.tool && !st.crop.on) { brushAt(x, y, true); return; }
      if (st.leftTab === 'wb' && st.wbPick) {
        const res = P.wbFromSample(srcCanvasRef.current, x, y);
        takeSnap('White balance');
        setAdjust((a) => ({ ...a, wb: { temp: a.wb.temp + res.temp, tint: a.wb.tint + res.tint } }));
        setWbPick(false);
        notify('White balance sampled ✓');
        return;
      }
      const it = hitItem(x, y);
      if (it) { setSelId(it.id); pointerRef.current.it = { id: it.id, dx: it.x - x, dy: it.y - y }; return; }
      setSelId(null);
    };
    const move = (e) => {
      const pr = pointerRef.current;
      const st = stateRef.current;
      const cvx = canvasRef.current;
      if (!pr || !pr.down) {
        if (cvx) {
          let cur = 'default';
          if (st.handOn) cur = 'grab';
          else if (st.crop.on) { const cp = toSource(e); const hd = cropHandleAt(cp.x, cp.y); cur = hd ? (CROP_CURSOR[hd] || 'move') : cur; }
          else if (st.compare.mode === 'split') { const cp = toSource(e); if (Math.abs(cp.x - st.compare.split * baseCanvasRef.current.width) < 14) cur = 'ew-resize'; }
          if (st.leftTab === 'mask' && !st.crop.on) cur = 'crosshair';
          else if (st.leftTab === 'retouch' && st.retouch.tool && !st.crop.on) cur = 'crosshair';
          cvx.style.cursor = cur;
        }
        return;
      }
      if (pr.pan) {
        const nx = pr.pan.px + (e.clientX - pr.pan.sx), ny = pr.pan.py + (e.clientY - pr.pan.sy);
        panRef.current = { x: nx, y: ny };
        setPan({ x: nx, y: ny });
        if (cvx) cvx.style.cursor = 'grabbing';
        return;
      }
      const base = baseCanvasRef.current;
      const pt = toSource(e);
      if (pr.splitDrag) {
        const W = base.width;
        setCompare((c) => ({ ...c, split: Math.max(0.05, Math.min(0.95, pt.x / W)) }));
        return;
      }
      if (pr.cropData) {
        const r = dragCrop(pr.cropData, pt, base.width, base.height);
        pr.cropData.dragged = true;
        setCrop((c) => ({ ...c, ...r }));
        return;
      }
      if (pr.it) {
        pr.moved = true;
        const snap = (v) => st.snapOn ? Math.round(v / 16) * 16 : v;
        setItems((its) => its.map((i) => i.id === pr.it.id ? { ...i, x: Math.max(0, Math.min(base.width, snap(pt.x + pr.it.dx))), y: Math.max(0, Math.min(base.height, snap(pt.y + pr.it.dy))) } : i));
      } else if (st.leftTab === 'mask' && !st.crop.on) { brushAt(pt.x, pt.y, false); }
      else if (st.leftTab === 'retouch' && st.retouch.tool && !st.crop.on) { brushAt(pt.x, pt.y, true); }
    };
    const up = () => {
      const pr = pointerRef.current;
      if (pr && pr.moved && pr.it) takeSnap('Move');
      else if (pr && pr.cropData && pr.cropData.dragged) takeSnap('Crop');
      pointerRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = stateRef.current.handOn ? 'grab' : 'default';
    };
    cv.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { cv.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line
  }, [items, mode]);

  const applyMaskEdits = () => {
    if (!maskRef.current) return;
    takeSnap('Mask adjustment');
    const cv = maskRef.current;
    if (maskUi.feather > 0) {
      const temp = document.createElement('canvas'); temp.width = cv.width; temp.height = cv.height;
      const tctx = temp.getContext('2d');
      tctx.filter = `blur(${Math.max(0.5, maskUi.feather / 100 * 24)}px)`;
      tctx.drawImage(cv, 0, 0);
      tctx.filter = 'none';
      const tctx2 = cv.getContext('2d'); tctx2.clearRect(0, 0, cv.width, cv.height); tctx2.drawImage(temp, 0, 0);
    }
    const ctx = cv.getContext('2d');
    const md = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = md.data;
    const dens = maskUi.density / 100;
    const inv = maskUi.inverted;
    for (let i = 3; i < d.length; i += 4) { let a = d[i] * dens; if (inv) a = 255 - a; d[i] = a; }
    ctx.putImageData(md, 0, 0);
    setMaskCvStamp((x) => x + 1);
    notify('Mask applied — adjustments now limited to masked area');
  };

  const lerp8 = (a, b, t) => a + (b - a) * t;
  const pix = (data, i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const retouchApply = () => {
    if (!maskRef.current || !baseCanvasRef.current) { notify('Paint a mask first (right-click to brush)', 'warn'); return; }
    takeSnap(`Retouch: ${retouch.tool}`);
    const base = baseCanvasRef.current;
    const ctx = base.getContext('2d');
    const img = ctx.getImageData(0, 0, base.width, base.height);
    const data = img.data;
    const mask = maskRef.current.getContext('2d').getImageData(0, 0, base.width, base.height).data;
    const W = base.width, H = base.height, N = W * H;
    const inten = retouch.intensity / 100;
    if (retouch.tool === 'smooth' || retouch.tool === 'blemish') {
      const tmp = new Uint8ClampedArray(data);
      const r = retouch.tool === 'blemish' ? 2 : 1;
      for (let i = 0; i < N; i++) {
        const o = i * 4, ma = mask[o + 3] / 255; if (!ma) continue;
        let R = 0, G = 0, B = 0, n = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = (i % W) + dx, y = Math.floor(i / W) + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const j = (y * W + x) * 4; R += tmp[j]; G += tmp[j + 1]; B += tmp[j + 2]; n++;
        }
        data[o] = lerp8(data[o], R / n, ma * inten); data[o + 1] = lerp8(data[o + 1], G / n, ma * inten); data[o + 2] = lerp8(data[o + 2], B / n, ma * inten);
      }
    } else if (retouch.tool === 'teeth') {
      for (let i = 0; i < N; i++) {
        const o = i * 4, ma = mask[o + 3] / 255; if (!ma) continue;
        const lm = pix(data, i) + 16;
        data[o] = lerp8(data[o], lm, ma * inten); data[o + 1] = lerp8(data[o + 1], lm, ma * inten); data[o + 2] = lerp8(data[o + 2], lm, ma * inten);
      }
    } else if (retouch.tool === 'redeye') {
      for (let i = 0; i < N; i++) {
        const o = i * 4, ma = mask[o + 3] / 255;
        if (!ma || data[o] < 90) continue;
        if (data[o] - Math.max(data[o + 1], data[o + 2]) > 25) { const lm = pix(data, i); data[o] = lerp8(data[o], lm, ma * inten * 0.9); }
      }
    } else if (retouch.tool === 'eyes') {
      for (let i = 0; i < N; i++) {
        const o = i * 4, ma = mask[o + 3] / 255; if (!ma) continue;
        const v = pix(data, i);
        const boost = (v + 6) * ma * inten;
        data[o] = lerp8(data[o], Math.min(255, data[o] * 1.1 + boost), 0.8); data[o + 1] = lerp8(data[o + 1], Math.min(255, data[o + 1] * 1.1 + boost), 0.8); data[o + 2] = lerp8(data[o + 2], Math.min(255, data[o + 2] * 1.08 + boost), 0.8);
      }
    } else if (retouch.tool === 'hair') {
      const tmp = new Uint8ClampedArray(data);
      for (let i = 0; i < N; i++) {
        const o = i * 4, ma = mask[o + 3] / 255; if (!ma) continue;
        const x = i % W, y = Math.floor(i / W);
        const j = (Math.min(H - 1, y + 1) * W + x) * 4;
        data[o] = lerp8(data[o], Math.min(255, data[o] + (data[o] - tmp[j]) * ma * inten * 1.2), 0.7);
      }
    } else {
      for (let i = 0; i < N; i++) {
        const o = i * 4, ma = mask[o + 3] / 255; if (!ma) continue;
        data[o] = lerp8(data[o], data[o] * 1.04, ma * inten);
        data[o + 1] = lerp8(data[o + 1], data[o + 1] * 1.02, ma * inten);
      }
    }
    ctx.putImageData(img, 0, 0);
    P.clearMask(maskRef.current);
    setMaskCvStamp((x) => x + 1);
    setRetouch((r) => ({ ...r, tool: null }));
    notify(`${retouch.tool} applied`);
  };

  /* ---- items ---- */
  const addItem = (kind, x, y, extra) => {
    const cx = x != null ? x : baseCanvasRef.current.width / 2;
    const cy = y != null ? y : baseCanvasRef.current.height / 2;
    if (kind === 'text') {
      const it = { id: P.uid(), kind, text: 'New Text', x: cx, y: cy, size: 56, font: 'Arial', weight: '700', italic: false, color: '#ffffff', align: 'center', lh: 1.2, ls: 0, outline: '', outlineW: 0, shadow: { on: false }, glow: false, bg: false, opacity: 1, blend: 'normal', rot: 0, visible: true, locked: false, w: 500, h: 80 };
      setItems((a) => [...a, it]); setSelId(it.id); takeSnap('Text added');
    } else if (kind === 'shape') {
      const it = { id: P.uid(), kind, type: extra || 'rect', x: cx, y: cy, w: 180, h: 130, fill: '#7d5cff', grad: false, gradA: '#c97bff', gradB: '#3a2bff', stroke: '', strokeW: 0, radius: 12, shadowOn: true, opacity: 1, blend: 'normal', rot: 0, visible: true, locked: false };
      setItems((a) => [...a, it]); setSelId(it.id); takeSnap('Shape added');
    } else if (kind === 'sticker') {
      const it = { id: P.uid(), kind, char: extra || '✨', x: cx, y: cy, size: 96, opacity: 1, blend: 'normal', rot: 0, visible: true, locked: false };
      setItems((a) => [...a, it]); setSelId(it.id); takeSnap('Element added');
    }
  };

  /* ---- crop ---- */
  const applyCropRatio = (ratio) => {
    takeSnap('Crop ratio');
    setCrop((cr) => {
      const W = baseCanvasRef.current.width, H = baseCanvasRef.current.height;
      const r = ratio === '1:1' ? 1 : ratio === '4:3' ? 4 / 3 : ratio === '3:4' ? 3 / 4 : ratio === '16:9' ? 16 / 9 : ratio === '9:16' ? 9 / 16 : null;
      let w = cr.w, h = cr.h;
      if (r) { if (w / h > r) h = w / r; else w = h * r; if (w > W) { w = W; h = w / r; } if (h > H) { h = H; w = h * r; } }
      return { ...cr, ratio, w: Math.max(20, w), h: Math.max(20, h), x: Math.max(0, Math.min(W - w, cr.x)), y: Math.max(0, Math.min(H - h, cr.y)) };
    });
  };
  const applyCrop = () => {
    const base = baseCanvasRef.current, cr = crop;
    if (!cr.on) { notify('Enable crop first', 'info'); return; }
    takeSnap('Crop');
    const c2 = document.createElement('canvas');
    const w = Math.max(2, Math.round(cr.w)), h = Math.max(2, Math.round(cr.h));
    c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d');
    ctx2.imageSmoothingQuality = 'high';
    ctx2.translate(w / 2, h / 2);
    ctx2.rotate((cr.rot * Math.PI) / 180);
    if (cr.flipH) ctx2.scale(-1, 1);
    if (cr.flipV) ctx2.scale(1, -1);
    ctx2.translate(-cr.x - cr.w / 2, -cr.y - cr.h / 2);
    ctx2.drawImage(base, 0, 0);
    if (cr.straighten) { ctx2.setTransform(1, 0, 0, 1, 0, 0); const rot = (cr.straighten * Math.PI) / 180; const sc = 1.12; ctx2.clearRect(0, 0, w, h); ctx2.translate(w / 2, h / 2); ctx2.rotate(-rot); ctx2.scale(sc, sc); ctx2.translate(-w / 2, -h / 2); ctx2.drawImage(base, 0, 0, w, h); }
    baseCanvasRef.current = c2; srcCanvasRef.current = c2;
    histRef.current = P.buildHistogram(c2);
    capsRef.current = { ...capsRef.current, w: c2.width, h: c2.height, fullW: c2.width, fullH: c2.height };
    setCrop((cc) => ({ ...cc, on: false, x: 0, y: 0, w: c2.width, h: c2.height, rot: 0, straighten: 0, flipH: false, flipV: false }));
    notify('Cropped ✂️');
  };

  /* ---- AI tools ---- */
  const runAI = async (op) => {
    if (!op) return;
    const base = baseCanvasRef.current;
    if (!base) return;
    const W = base.width, H = base.height;
    cancelRef.current = false;
    const prog = (pct) => setBusyAI({ label: LBL[op] || op, pct: Math.round(pct) });
    const ok = () => !cancelRef.current;
    const chunk = async (label, stepFn) => {
      prog(6);
      await new Promise((r) => setTimeout(r, 15));
      if (!ok()) return null;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d'); ctx.drawImage(base, 0, 0);
      const img = ctx.getImageData(0, 0, W, H); const data = img.data;
      for (let row = 0; row < H; row++) {
        if (cancelRef.current) return null;
        stepFn(data, row);
        if (row % Math.max(1, Math.floor(H / 20)) === 0) { prog(8 + (row / H) * 86); await new Promise((r) => setTimeout(r, 0)); }
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    };
    const commit = (out, snapLabel) => {
      baseCanvasRef.current = out; srcCanvasRef.current = out;
      capsRef.current = { ...capsRef.current, w: out.width, h: out.height, fullW: out.width, fullH: out.height };
      histRef.current = P.buildHistogram(out);
      renderNow();
      takeSnap(snapLabel || `AI ${LBL[op]}`);
    };
    const renderWithParams = async (patch) => {
      prog(55);
      await new Promise((r) => setTimeout(r, 10));
      if (!ok()) return null;
      const out = P.renderEdits(base, { ...P.DEFAULT_ADJUST(), ...patch }, {});
      prog(92);
      await new Promise((r) => setTimeout(r, 10));
      return out;
    };
    let out = null;
    if (op === 'bg-remove' || op === 'bg-replace' || op === 'bg-blur' || op === 'bg-gen') {
      const cv = await chunk('masking', (data, row) => {
        for (let x = 0; x < W; x++) {
          const o = (row * W + x) * 4;
          const bri = (data[o] + data[o + 1] + data[o + 2]) / 3;
          if (bri > 190 || (bri > 140 && data[o] > data[o + 2])) data[o + 3] = 0;
        }
      });
      if (!cv) { setBusyAI(null); return; }
      prog(88);
      out = document.createElement('canvas'); out.width = W; out.height = H;
      const octx = out.getContext('2d');
      if (op === 'bg-remove') {
        const g = octx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#20242f'); g.addColorStop(1, '#0d0f16');
        octx.fillStyle = g; octx.fillRect(0, 0, W, H);
      } else if (op === 'bg-blur') {
        const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
        const bgc = bg.getContext('2d'); bgc.drawImage(base, 0, 0);
        bgc.filter = 'blur(16px)'; bgc.drawImage(base, 0, 0); bgc.filter = 'none';
        octx.drawImage(bg, 0, 0);
      } else {
        const g = octx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#7d5cff'); g.addColorStop(0.5, '#ff8a3d'); g.addColorStop(1, '#2a1a5e');
        octx.fillStyle = g; octx.fillRect(0, 0, W, H);
        octx.fillStyle = 'rgba(255,210,120,0.6)';
        octx.beginPath(); octx.arc(W * 0.76, H * 0.26, Math.min(W, H) * 0.1, 0, 7); octx.fill();
        octx.fillStyle = 'rgba(255,255,255,0.10)';
        for (let k = 0; k < 45; k++) { const x = (k * 73) % W, y = (k * 149) % H; octx.beginPath(); octx.arc(x, y, 1.4 + (k % 3), 0, 7); octx.fill(); }
      }
      octx.drawImage(cv, 0, 0);
    } else if (op === 'upscale') {
      prog(40);
      await new Promise((r) => setTimeout(r, 10));
      out = document.createElement('canvas'); out.width = W * 2; out.height = H * 2;
      const octx = out.getContext('2d'); octx.imageSmoothingQuality = 'high';
      octx.drawImage(base, 0, 0, W * 2, H * 2);
      prog(85);
    } else if (op === 'enhance') out = await renderWithParams({ exposure: 0.25, contrast: 12, saturation: 10, detail: { sharpness: 18, clarity: 10, noiseR: 10 } });
    else if (op === 'sharpen') out = await renderWithParams({ detail: { sharpness: 55, clarity: 18 } });
    else if (op === 'denoise') out = await renderWithParams({ detail: { noiseR: 40, aiDenoise: 55, sharpness: 20, clarity: 8 } });
    else if (op === 'colorize') out = await renderWithParams({ saturation: 35, temperature: 8, contrast: 6, detail: { clarity: 10 } });
    else if (op === 'lowlight') out = await renderWithParams({ exposure: 0.8, shadows: 20, detail: { noiseR: 18, aiDenoise: 25, sharpness: 15 } });
    else if (op === 'restore') out = await renderWithParams({ exposure: 0.15, contrast: 8, brightness: 4, detail: { noiseR: 30, aiDenoise: 40, clarity: 12, sharpness: 22, dehaze: 8 }, saturation: 4 });
    else if (op === 'face' || op === 'skin') {
      const mask = P.makeMaskCanvas(W, H);
      P.maskAutoPerson(mask);
      prog(50); await new Promise((r) => setTimeout(r, 15));
      if (!ok()) { setBusyAI(null); return; }
      out = P.renderEdits(base, op === 'face' ? { ...P.DEFAULT_ADJUST(), exposure: 0.12, brightness: 4, saturation: 6, detail: { noiseR: 10, texture: 8 } } : { ...P.DEFAULT_ADJUST(), brightness: 4, detail: { noiseR: 32, texture: 14 } }, { maskCanvas: mask });
      prog(90);
    } else if (op === 'expand') {
      prog(30); await new Promise((r) => setTimeout(r, 10));
      if (!ok()) { setBusyAI(null); return; }
      const tr = 16 / 9; let nw = W, nh = H;
      if (W / H > tr) nh = W / tr; else nw = H * tr;
      nw = Math.round(nw); nh = Math.round(nh);
      out = document.createElement('canvas'); out.width = nw; out.height = nh;
      const octx = out.getContext('2d');
      octx.fillStyle = '#0d0f16'; octx.fillRect(0, 0, nw, nh);
      octx.filter = 'blur(10px)';
      const offX = (nw - W) / 2, offY = (nh - H) / 2;
      for (let i = 0; i < 4; i++) octx.drawImage(base, 0, 0, W, H, i % 2 === 0 ? -offX : offX + W - nw + offX, i < 2 ? -offY : offY + H - nh + offY, nw, nh);
      // fill edges by stretching edge columns/rows
      octx.filter = 'none';
      octx.drawImage(base, offX, offY);
      prog(90);
    } else if (op === 'objectEdit') {
      if (selId) { setItems((its) => its.filter((i) => i.id !== selId)); takeSnap('Object removed'); notify('Object removed', 'info'); setSelId(null); setBusyAI(null); return; }
      notify('Select an object on the canvas first', 'warn'); setBusyAI(null); return;
    } else if (op === 'objectRecolor') {
      if (!selId) { notify('Select an object first', 'warn'); setBusyAI(null); return; }
      setItems((its) => its.map((i) => i.id === selId ? { ...i, rot: (i.rot || 0) + 16, fill: '#c97bff', color: '#c97bff' } : i));
      takeSnap('AI recolor'); setBusyAI(null); notify('Recolored', 'success'); return;
    }
    if (!ok()) { setBusyAI(null); notify('AI cancelled', 'info'); return; }
    if (!out) { setBusyAI(null); return; }
    prog(99);
    await new Promise((r) => setTimeout(r, 120));
    commit(out);
    setBusyAI(null);
    addAI({ kind: 'photo', prompt: LBL[op], output: out.toDataURL('image/png') });
    notify(`${AIDONE[op] || 'Done'} ✓`);
  };
  const LBL = { 'bg-remove': 'Remove Background', 'bg-replace': 'Replace Background', 'bg-blur': 'Blur Background', 'bg-gen': 'Generate Background', upscale: 'AI Upscale', enhance: 'AI Enhance', sharpen: 'AI Sharpen', denoise: 'AI Denoise', colorize: 'AI Colorize', lowlight: 'Low-light Enhance', restore: 'Image Restoration', face: 'Face Enhance', skin: 'Skin Retouch', expand: 'AI Expand', objectEdit: 'Object Remove', objectRecolor: 'Object Recolor' };
  const AIDONE = { 'bg-remove': 'Background removed', 'bg-replace': 'Background replaced', 'bg-blur': 'Background blurred', 'bg-gen': 'Background generated', upscale: 'Upscaled 2×', enhance: 'Enhanced', sharpen: 'Sharpened', denoise: 'Denoised', colorize: 'Colorized', lowlight: 'Low-light balanced', restore: 'Restored', face: 'Face enhanced', skin: 'Skin retouched', expand: 'Expanded to 16:9' };

  /* ---- presets ---- */
  const mergeDeep = (baseT, over) => {
    const out = { ...baseT };
    for (const k of Object.keys(over || {})) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) out[k] = mergeDeep(out[k] || {}, over[k]);
      else out[k] = over[k];
    }
    return out;
  };
  const applyPreset = (p) => {
    takeSnap(`Preset: ${p.name}`);
    setAdjust((a) => mergeDeep(a, p.adjust || {}));
    setFilters((p.filters || []).slice(0, 6).map((id) => ({ id, intensity: 1 })));
    setEffects([]); setCurves({ rgb: [], r: [], g: [], b: [] });
    notify(`Preset "${p.name}" applied`, 'success');
  };
  const savePreset = () => {
    const nm = window.prompt('Preset name');
    if (!nm) return;
    const p = { id: P.uid(), name: nm, adjust, filters: filters.map((f) => ({ id: f.id, intensity: f.intensity })), effects: effects.map((e) => ({ id: e.id, intensity: e.intensity })) };
    const next = [...userPresets, p]; setUserPresets(next); localStorage.setItem('dm_presets', JSON.stringify(next)); notify('Preset saved');
  };
  const delPreset = (id) => { const next = userPresets.filter((p) => p.id !== id); setUserPresets(next); localStorage.setItem('dm_presets', JSON.stringify(next)); };
  const renamePreset = (id) => { const nm = window.prompt('New name'); if (!nm) return; const next = userPresets.map((p) => p.id === id ? { ...p, name: nm } : p); setUserPresets(next); localStorage.setItem('dm_presets', JSON.stringify(next)); };
  const dupePreset = (id) => { const src = userPresets.find((p) => p.id === id); if (!src || !src.adjust) return; const p = { ...src, id: P.uid(), name: src.name + ' Copy' }; const next = [...userPresets, p]; setUserPresets(next); localStorage.setItem('dm_presets', JSON.stringify(next)); };

  /* ---- export / share ---- */
  const buildExportBlob = async (fmt, quality) => {
    const base = baseCanvasRef.current;
    const W = base.width, H = base.height;
    const target = expOpts.preset;
    let ow = W, oh = H;
    if (target === '1080') { const s = 1080 / H; ow = Math.round(W * s); oh = 1080; }
    if (target === '4k') { const s = 1.7; ow = Math.round(W * s); oh = Math.round(H * s); }
    const out = document.createElement('canvas'); out.width = ow; out.height = oh;
    const octx = out.getContext('2d'); octx.imageSmoothingQuality = 'high';
    const proc = P.renderEdits(base, adjust, { curves, filters, effects, maskCanvas: maskUi.visible ? (maskRef.current || null) : null });
    P.drawOverlays(proc.getContext('2d'), W, H, effects);
    octx.drawImage(proc, 0, 0, ow, oh);
    const sx = ow / W;
    drawItems(octx, ow, oh, items.map((i) => ({ ...i, x: i.x * sx, y: i.y * sx, w: (i.w || 120) * sx, h: (i.h || 120) * sx, size: (i.size || 64) * sx })));
    if (fmt === 'jpg' || fmt === 'jpeg') {
      const cv2 = document.createElement('canvas'); cv2.width = ow; cv2.height = oh;
      const c = cv2.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, ow, oh); c.drawImage(out, 0, 0);
      return await new Promise((res) => cv2.toBlob((b) => res(b), 'image/jpeg', quality / 100));
    }
    if (fmt === 'png') return await new Promise((res) => out.toBlob((b) => res(b), 'image/png'));
    if (fmt === 'webp') return await new Promise((res) => out.toBlob((b) => res(b), 'image/webp', quality / 100));
    return P.canvasToTIFF(out);
  };
  const exportRun = async () => {
    if (mode === 'video') { doVideoExport(); return; }
    setBusyExport(true); setExportLog('');
    try {
      const blob = await buildExportBlob(expOpts.fmt, expOpts.quality);
      const ext = expOpts.fmt === 'jpeg' ? 'jpg' : expOpts.fmt;
      download(blob, `${(name || 'project').replace(/[^\w-]+/g, '_')}.${ext}`);
      setExportLog('Exported ✓');
      notify('Exported & downloaded');
    } catch (err) { setExportLog('Export failed: ' + err.message); notify('Export failed: ' + err.message, 'error'); }
    setBusyExport(false);
  };
  const saveToProject = async () => {
    try {
      const blob = await buildExportBlob(expOpts.fmt || 'png', expOpts.quality);
      const url = URL.createObjectURL(blob);
      const thumb = await new Promise((res) => {
        const cv = document.createElement('canvas');
        const ratio = capsRef.current.h / capsRef.current.w;
        cv.width = 360; cv.height = Math.max(4, Math.round(360 * ratio));
        cv.getContext('2d').drawImage(baseCanvasRef.current, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.82));
      });
      upsertProject({ id: Date.now().toString(36), name, type: 'photo', res: `${baseCanvasRef.current.width}x${baseCanvasRef.current.height}`, duration: '', thumbnail: thumb, createdAt: Date.now(), modifiedAt: Date.now(), favorite: false, inTrash: false });
      notify('Saved to My Projects');
      navigate('projects');
    } catch (err) { notify('Save failed: ' + err.message, 'error'); }
  };
  const share = async () => {
    try {
      const blog = mode === 'video' ? null : await buildExportBlob('png', 92);
      if (mode === 'photo') {
        const file = new File([blog], `${name}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
      }
      await navigator.clipboard.writeText(`${name} — ready to share`);
      notify('Share link copied', 'info');
    } catch { notify('Share unavailable', 'info'); }
  };

  /* ---- video helpers ---- */
  const segments = useMemo(() => {
    let t = 0;
    return clips.map((c) => { const seg = { ...c, abs: t, dur: c.duration / (c.speed || 1) }; t += seg.dur; return seg; });
  }, [clips]);
  const totalDur = useMemo(() => segments.reduce((a, s) => a + s.dur, 0) || videoMeta.duration, [segments, videoMeta]);
  useEffect(() => { setPlayPos((p) => Math.min(p, totalDur)); }, [totalDur]);
  const currentSegIdx = useMemo(() => segments.findIndex((s) => playPos >= s.abs && playPos < s.abs + s.dur), [segments, playPos]);
  const curClip = currentSegIdx >= 0 ? clips[currentSegIdx] : null;
  useEffect(() => {
    if (!curClip || !vidRef.current) return;
    if (vidRef.current.src !== curClip.url) vidRef.current.src = curClip.url;
    const local = Math.max(0, playPos - segments[currentSegIdx].abs);
    const t = local * (curClip.speed || 1) + (curClip.in || 0);
    if (Math.abs(vidRef.current.currentTime - t) > 0.15) vidRef.current.currentTime = t;
  }, [currentSegIdx, playPos]);
  useEffect(() => {
    if (!playing) return;
    let raf;
    const loop = () => {
      setPlayPos((p) => {
        if (p >= totalDur) { setPlaying(false); return totalDur; }
        return p + 0.016;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalDur]);
  const splitAt = (t) => {
    const at = t != null ? t : playPos;
    const idx = segments.findIndex((s) => at >= s.abs && at < s.abs + s.dur);
    if (idx < 0) return;
    const c = clips[idx];
    const local = at - segments[idx].abs;
    if (local < 0.15 || local > c.duration - 0.15) return;
    takeSnap('Split clip');
    const a = { ...c, id: P.uid(), duration: local, in: c.in };
    const b = { ...c, id: P.uid(), duration: c.duration - local, in: c.in + local };
    const next = [...clips]; next.splice(idx, 1, a, b);
    setClips(next); notify('Clip split ✂️');
  };
  const addFiles = async (e) => {
    for (const f of Array.from(e.target.files || [])) {
      const isV = f.type.startsWith('video');
      const url = URL.createObjectURL(f);
      const meta = await loadMediaMeta(f).catch(() => ({ duration: 5, width: 1080, height: 1920, kind: isV ? 'video' : 'image' }));
      if (!isV) {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          setClips((cs) => [...cs, { id: P.uid(), name: f.name, url: c.toDataURL('image/png'), kind: 'image', meta: { ...meta, duration: Math.max(2, meta.duration) }, in: 0, duration: Math.max(2, meta.duration), filter: 'none', reversed: false, freeze: null }]);
        };
        img.src = url;
        continue;
      }
      setClips((cs) => [...cs, { id: P.uid(), name: f.name, url, kind: 'video', meta, in: 0, duration: meta.duration, filter: 'none', reversed: false, freeze: null }]);
    }
  };
  const onMusic = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    let w = [];
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const ab = await f.arrayBuffer(); const buf = await ac.decodeAudioData(ab);
      const d = buf.getChannelData(0); const n = 70;
      for (let i = 0; i < n; i++) { let a = 0; for (let j = 0; j < 4000; j++) a += Math.abs(d[Math.min(d.length - 1, Math.floor(i * d.length / n) + j)]); w.push(Math.min(1, a / 600)); }
      ac.close();
    } catch { w = Array.from({ length: 70 }, () => 0.3); }
    setMusic({ url, wave: w, duration: totalDur });
    notify('Music added 🎵');
  };

  const doVideoExport = async () => {
    if (!clips.length) { notify('Add clips first', 'warn'); return; }
    setBusyExport(true); setExportLog('');
    try {
      await ensureFFmpeg();
      setExportLog('Engine ready — preparing clips…');
      const list = [];
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const dur = Math.max(0.2, c.duration / (c.speed || 1));
        const fname = c.kind === 'image' ? `img${i}.png` : `clip${i}.mp4`;
        const res = await fetch(c.url); const blob = await res.blob();
        const bin = new Uint8Array(await blob.arrayBuffer());
        ffmpeg.FS('writeFile', fname, bin);
        const baseF = c.filter && c.filter !== 'none' ? filterFor(c.filter) : '';
        const vf = P.videoFfmpegFilter(adjust, baseF);
        list.push({ name: fname, kind: c.kind, duration: dur, filter: c.filter, meta: { duration: dur }, start: 0, vf });
      }
      let mu = null;
      if (music) {
        const res = await fetch(music.url); const b = await res.blob();
        ffmpeg.FS('writeFile', 'music.mp3', new Uint8Array(await b.arrayBuffer()));
        mu = true;
      }
      setExportLog('Rendering with FFmpeg…');
      const url = await runMerge(list, {
        width: expOpts.resW || (clips[0].meta.width || 1080),
        height: expOpts.resH || (clips[0].meta.height || 1080),
        fps: expOpts.fps || 30,
        transition: transitions.length ? transitions[0].type : 'fade',
        transitionDuration: transitions.length ? transitions[0].dur : 0.5,
        music: mu,
      });
      download(await (await fetch(url)).blob(), `${(name || 'project').replace(/[^\w-]+/g, '_')}.mp4`);
      setExportLog('✓ Rendered');
      notify('Video exported');
      addAI({ kind: 'video', prompt: 'Video export', output: url });
    } catch (err) { setExportLog('Export failed: ' + err.message); notify('Export failed: ' + err.message, 'error'); }
    setBusyExport(false);
  };

  /* ---------- RENDER ---------- */
  if (!ready && mode === 'photo') {
    return <div className="ped ped-load-wrap"><div className="ped-load"><span className="spinner" /> Loading media…</div></div>;
  }

  const sel = items.find((i) => i.id === selId);
  const dirty = history.length > 1 && savedIdx !== histIdx;
  const canUndo = histIdx > 0 && history.length > 0;
  const canRedo = histIdx >= 0 && histIdx < history.length - 1;
  const avatarLetter = (profile && profile.name && profile.name.trim()) ? profile.name.trim()[0].toUpperCase() : 'C';
  const LEFT_TABS = [
    ['adjust', 'Adjust', '☀️'], ['color', 'Color', '🎨'], ['wb', 'WB', '🌡'], ['detail', 'Detail', '🔍'],
    ['curves', 'Curves', '📈'], ['optics', 'Optics', '🔮'], ['crop', 'Crop', '✂️'], ['filters', 'Filters', '🎞'],
    ['fx', 'Effects', '💫'], ['vignette', 'Vignette', '◐'], ['ai', 'AI', '🤖'], ['mask', 'Mask', '🎭'],
    ['retouch', 'Retouch', '🧴'], ['text', 'Text', '🅰'], ['shapes', 'Shapes', '🔶'], ['stickers', 'Elements', '🎀'],
  ];
  if (mode === 'video') LEFT_TABS.push(['timeline', 'Timeline', '⏱'], ['audio', 'Audio', '🎧'], ['transition', 'Trans', '🔁']);
  const RIGHT_TABS = [
    ['props', sel ? 'Object' : 'Properties', '🎯'], ['layers', 'Layers', '🗂'], ['history', 'History', '🕘'], ['presets', 'Presets', '💾'],
  ];
  if (mode === 'video') RIGHT_TABS.push(['video', 'Video', '🎬']);
  const favSet = new Set(favTools);
  const visibleTabs = LEFT_TABS.filter(([id, label]) => !toolQ || label.toLowerCase().includes(toolQ.toLowerCase()));

  const maskPanelDims = { w: capsRef.current.w, h: capsRef.current.h };

  const CMDS = [
    { icon: '📂', name: 'Open image…', cat: 'File', run: () => { const el = document.getElementById('ped-file-input'); if (el) el.click(); } },
    { icon: '💾', name: 'Save project', cat: 'File', run: () => { autosave(); notify('Project saved ✓'); } },
    { icon: '⬇', name: 'Export image…', cat: 'File', run: () => setExportOpen(true) },
    { icon: '↩', name: 'Undo', cat: 'Edit', run: undo },
    { icon: '↪', name: 'Redo', cat: 'Edit', run: redo },
    { icon: '📸', name: 'Take snapshot', cat: 'Edit', run: () => { takeSnap('Snapshot'); notify('Snapshot added to history'); } },
    { icon: '✂️', name: 'Crop tool', cat: 'Tool', run: () => setLeftTab('crop') },
    { icon: '☀️', name: 'Auto adjust', cat: 'Adjust', run: () => { const src = srcCanvasRef.current; if (!src) return notify('Open an image first', 'warn'); takeSnap('Auto adjust'); setAdjust((a) => ({ ...a, ...P.autoAdjust(src) })); notify('Auto adjusted ✓'); } },
    { icon: '🔧', name: 'Tune adjustments', cat: 'Adjust', run: () => setLeftTab('adjust') },
    { icon: '🤖', name: 'AI tools', cat: 'AI', run: () => setLeftTab('ai') },
    { icon: '🪄', name: 'Remove background (AI)', cat: 'AI', run: () => runAI('bg-remove') },
    { icon: '🖼', name: 'Upscale 2× (AI)', cat: 'AI', run: () => runAI('upscale') },
    { icon: '✨', name: 'Enhance photo (AI)', cat: 'AI', run: () => runAI('enhance') },
    { icon: '🔪', name: 'Sharpen (AI)', cat: 'AI', run: () => runAI('sharpen') },
    { icon: '🅰', name: 'Add text', cat: 'Add', run: () => addItem('text') },
    { icon: '🔷', name: 'Add rectangle', cat: 'Add', run: () => addItem('shape', 'rect') },
    { icon: '🎀', name: 'Add sticker', cat: 'Add', run: () => addItem('sticker', null, null, '✨') },
    { icon: '🗑', name: 'Delete selected object', cat: 'Edit', run: () => { if (!selId) return notify('Nothing selected', 'info'); setItems((its) => its.filter((i) => i.id !== selId)); setSelId(null); takeSnap('Delete object'); } },
    { icon: '🗂', name: 'Layers panel', cat: 'Panel', run: () => setRightTab('layers') },
    { icon: '🕘', name: 'History panel', cat: 'Panel', run: () => setRightTab('history') },
    { icon: '💾', name: 'Presets panel', cat: 'Panel', run: () => setRightTab('presets') },
    { icon: '🧭', name: 'Zoom to fit', cat: 'View', run: () => { setZoom(0); setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 }; } },
    { icon: '🔍', name: 'Zoom 100%', cat: 'View', run: () => setZoom(100) },
    { icon: '🌐', name: 'Toggle grid', cat: 'View', run: () => setGridOn((v) => !v) },
    { icon: '📏', name: 'Toggle rulers', cat: 'View', run: () => setRulersOn((v) => !v) },
    { icon: '➕', name: 'Toggle guides', cat: 'View', run: () => setGuidesOn((v) => !v) },
    { icon: '🧲', name: 'Toggle snapping', cat: 'View', run: () => setSnapOn((v) => !v) },
    { icon: '✋', name: 'Toggle hand tool', cat: 'View', run: () => setHandOn((v) => !v) },
    { icon: '◐', name: 'Toggle before / after', cat: 'View', run: () => setCompare((c) => ({ ...c, mode: c.mode === 'off' ? 'hold' : 'off' })) },
    { icon: '⌂', name: 'Go home', cat: 'App', run: () => navigate('home') },
    { icon: '🗂', name: 'My projects', cat: 'App', run: () => navigate('projects') },
    { icon: '⚙', name: 'Settings', cat: 'App', run: () => navigate('settings') },
  ].filter((c) => !paletteQ || c.name.toLowerCase().includes(paletteQ.toLowerCase()) || c.cat.toLowerCase().includes(paletteQ.toLowerCase()));

  return (
    <div className="ped"
      onDragOver={(e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && mode === 'photo') { notify('Image dropped'); loadLocalFile(f); } }}>
      <input id="ped-file-input" type="file" accept="image/*" hidden onChange={openLocalImage} />
      {/* ===== TOP BAR ===== */}
      <header className="ped-topbar">
        <button className="ped-btn" title="Go Home" onClick={() => navigate('home')}>⌂</button>
        <span className={`ped-dirty ${dirty ? 'on' : ''}`} title={dirty ? 'Unsaved changes' : 'All changes saved'} />
        <input className="ped-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
        <span className={`ped-saved ${savedAt ? 'on' : ''}`}>{savedAt ? 'Saved ✓' : (dirty ? 'Unsaved' : 'All changes saved')}</span>
        <span className="ped-top-sep" />
        <button className="ped-cmd" onClick={() => setPaletteOpen(true)}>🔎<span>Search tools &amp; actions</span><kbd>Ctrl K</kbd></button>
        <span className="ped-top-sep" />
        <button className="ped-btn" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>↩</button>
        <button className="ped-btn" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>↪</button>
        <button className="ped-btn" title="Save (Ctrl+S)" onClick={() => { autosave(); notify('Project saved ✓'); }}>💾</button>
        <button className={`ped-btn ${compare.mode !== 'off' ? 'ped-btn-active' : ''}`} title="Before / After" onClick={() => setCompare((c) => ({ ...c, mode: c.mode === 'off' ? 'hold' : 'off' }))}>◐</button>
        <button className="ped-btn" title="Preview" onClick={() => { if (mode === 'video') setPlaying(!playing); else notify('Live preview — see the canvas ✓', 'info'); }}>{playing ? '⏸' : '▶'}</button>
        <button className="ped-btn" title="Share" onClick={share}>⇪</button>
        <button className="ped-btn ped-btn-primary" onClick={() => setExportOpen(true)}>⬇ Export</button>
        <div className="ped-hd-right">
          <button className={`ped-btn ${notifOpen ? 'ped-btn-active' : ''}`} title="Help &amp; shortcuts" onClick={() => setNotifOpen((v) => !v)}>?</button>
          <button className="ped-avatar" title={profile && profile.name} onClick={() => navigate('settings')}>{avatarLetter}</button>
          {notifOpen && (
            <div className="ped-notif-pop">
              <h5>Shortcuts</h5>
              {[['Ctrl K', 'Command palette'], ['Ctrl S', 'Save'], ['Ctrl E', 'Export'], ['Ctrl Z / Ctrl Shift Z', 'Undo / Redo'], ['Space', 'Hold to see original'], ['H', 'Toggle hand / pan'], ['Ctrl + / − / 0', 'Zoom in / out / fit'], ['Esc', 'Close palettes']].map(([k, d]) => (
                <div className="ped-notif-row" key={k}><kbd>{k}</kbd><span>{d}</span></div>
              ))}
              <button className="ped-notif-close" onClick={() => setNotifOpen(false)}>Got it</button>
            </div>
          )}
        </div>
      </header>

      {paletteOpen && (
        <div className="ped-palette" onClick={() => setPaletteOpen(false)}>
          <div className="ped-palette-box" onClick={(e) => e.stopPropagation()}>
            <input autoFocus className="ped-palette-input" placeholder="Type a command or search…" value={paletteQ} onChange={(e) => { setPaletteQ(e.target.value); setPalIdx(0); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setPaletteOpen(false);
                if (e.key === 'ArrowDown') { e.preventDefault(); setPalIdx((i) => (i + 1) % CMDS.length); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setPalIdx((i) => (i - 1 + CMDS.length) % CMDS.length); }
                if (e.key === 'Enter') { const c = CMDS[Math.min(palIdx, CMDS.length - 1)]; if (c) { setPaletteOpen(false); c.run(); } }
              }} />
            <div className="ped-palette-list">
              {CMDS.map((c, i) => (
                <button key={c.name} className={`ped-palette-item ${palIdx === i ? 'on' : ''}`} onMouseEnter={() => setPalIdx(i)}
                  onMouseDown={() => { setPaletteOpen(false); c.run(); }}>
                  <span className="ped-palette-icon">{c.icon}</span><span>{c.name}</span><span className="ped-palette-cat">{c.cat}</span>
                </button>
              ))}
            </div>
            <div className="ped-palette-foot">
              <span>↵ Run</span><span>↑↓ Navigate</span><span>Esc Close</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== WORKSPACE ===== */}
      <div className="ped-ws">
        {/* LEFT */}
        <aside className={`ped-left ${leftCollapsed ? 'closed' : ''}`}>
          <div className="ped-left-head">
            <button className="ped-collapse" title={leftCollapsed ? 'Expand tools' : 'Collapse tools'} onClick={() => setLeftCollapsed((v) => !v)}>{leftCollapsed ? '▸' : '◂'}</button>
            {!leftCollapsed && <input className="ped-tool-search" placeholder="Search tools…" value={toolQ} onChange={(e) => setToolQ(e.target.value)} />}
          </div>
          {!leftCollapsed && favTools.length > 0 && (
            <div className="ped-favs">
              {LEFT_TABS.filter(([id]) => favSet.has(id)).map(([id, label, icon]) => (
                <button key={id} className={`ped-fav ${leftTab === id ? 'on' : ''}`} onClick={() => setLeftTab(id)} title={label}><span>{icon}</span>{leftCollapsed ? '' : <small>{label}</small>}</button>
              ))}
            </div>
          )}
          <div className="ped-tablist">
            {visibleTabs.map(([id, label, icon]) => {
              const fav = favSet.has(id);
              return (
                <div key={id} className={`ped-tabrow ${leftTab === id ? 'on' : ''}`}>
                  {!leftCollapsed && <button className={`ped-star ${fav ? 'on' : ''}`} title={fav ? 'Remove favorite' : 'Favorite tool'} onClick={() => {
                    const next = fav ? favTools.filter((f) => f !== id) : [...favTools, id];
                    setFavTools(next);
                    try { localStorage.setItem('ped_fav_tools', JSON.stringify(next)); } catch { }
                  }}>{fav ? '★' : '☆'}</button>}
                  <button className={`ped-tab ${leftTab === id ? 'on' : ''}`} onClick={() => { setLeftTab(id); if (leftCollapsed) setLeftCollapsed(false); }} title={leftCollapsed ? label : ''}><span>{icon}</span>{leftCollapsed ? '' : <small>{label}</small>}</button>
                </div>
              );
            })}
            {!visibleTabs.length && <p className="ped-left-empty">No tools match “{toolQ}”.</p>}
          </div>
          <div className="ped-left-body">
            {leftTab === 'adjust' && <>{<ResetAll onReset={() => { takeSnap('Reset adjustments'); setAdjust(cloneJSON(P.DEFAULT_ADJUST())); notify('Adjustments reset ✓'); }} />}<LightPanel value={adjust} patch={setAdjustWrap(setAdjust)} onAutoAdjust={() => {
              const src = srcCanvasRef.current;
              if (!src) return;
              takeSnap('Auto adjust');
              setAdjust((a) => ({ ...a, ...P.autoAdjust(src) }));
              notify('Auto adjusted ✓', 'info');
            }} /></>}
            {leftTab === 'color' && <><ResetAll onReset={() => { takeSnap('Reset color'); setAdjust((a) => ({ ...a, color: cloneJSON(P.DEFAULT_ADJUST().color) })); }} /><ColorPanel value={adjust} patch={setAdjustWrap(setAdjust)} commit={() => takeSnap('Color')} /></>}
            {leftTab === 'curves' && <><ResetAll onReset={() => { takeSnap('Reset curves'); setCurves({ rgb: [], r: [], g: [], b: [] }); }} /><CurvesPanel curves={curves} setCurves={setCurves} hist={histRef.current} takeSnap={takeSnap} /></>}
            {leftTab === 'wb' && <><ResetAll onReset={() => { takeSnap('Reset white balance'); setAdjust((a) => ({ ...a, wb: cloneJSON(P.DEFAULT_ADJUST().wb) })); }} /><WBPanel adjust={adjust} setAdjust={setAdjust} notify={notify} pick={wbPick} setPick={setWbPick} commit={() => takeSnap('White balance')} /></>}
            {leftTab === 'detail' && <><ResetAll onReset={() => { takeSnap('Reset detail'); setAdjust((a) => ({ ...a, detail: cloneJSON(P.DEFAULT_ADJUST().detail) })); }} /><DetailPanel value={adjust} patch={setAdjustWrap(setAdjust)} commit={() => takeSnap('Detail')} /></>}
            {leftTab === 'optics' && <><ResetAll onReset={() => { takeSnap('Reset optics'); setAdjust((a) => ({ ...a, optics: cloneJSON(P.DEFAULT_ADJUST().optics) })); }} /><OpticsPanel value={adjust} patch={setAdjustWrap(setAdjust)} commit={() => takeSnap('Optics')} /></>}
            {leftTab === 'crop' && <CropPanel crop={crop} setCrop={setCrop} apply={applyCrop} setRatio={applyCropRatio} W={capsRef.current.w} H={capsRef.current.h} commit={() => takeSnap('Crop')} />}
            {leftTab === 'filters' && <><ResetAll onReset={() => { takeSnap('Reset filters'); setFilters([]); }} /><FiltersPanel filters={filters} setFilters={setFilters} takeSnap={takeSnap} /></>}
            {leftTab === 'fx' && <><ResetAll onReset={() => { takeSnap('Reset effects'); setEffects([]); }} /><EffectsPanel effects={effects} setEffects={setEffects} takeSnap={takeSnap} /></>}
            {leftTab === 'vignette' && <VignettePanel value={adjust} patch={setAdjustWrap(setAdjust)} commit={() => takeSnap('Vignette')} resetVg={() => { const d = P.DEFAULT_ADJUST().optics.vignette; setAdjust((a) => ({ ...a, optics: { ...a.optics, vignette: d } })); }} />}
            {leftTab === 'ai' && <AIPanel run={runAI} busy={busyAI} cancel={() => { cancelRef.current = true; }} />}
            {leftTab === 'mask' && <MaskPanel dims={maskPanelDims} ensure={ensureMask} clear={clearMask} apply={applyMaskEdits} ui={maskUi} setUi={setMaskUi} brush={brushUi} setBrush={setBrushUi} />}
            {leftTab === 'retouch' && <RetouchPanel tool={retouch.tool} setTool={(t) => setRetouch((r) => ({ ...r, tool: t }))} opts={retouch} setOpts={setRetouch} apply={retouchApply} />}
            {leftTab === 'text' && <TextPanel add={addItem} sel={sel} setItem={(id, patch) => { setItems((its) => its.map((i) => i.id === id ? { ...i, ...patch } : i)); takeSnap('Text edit'); }} />}
            {leftTab === 'shapes' && <ShapesPanel add={addItem} sel={sel} setItem={(id, patch) => { setItems((its) => its.map((i) => i.id === id ? { ...i, ...patch } : i)); takeSnap('Shape edit'); }} />}
            {leftTab === 'stickers' && <StickersPanel add={addItem} />}
            {mode === 'video' && leftTab === 'timeline' && <TimelinePanel clips={clips} setClips={setClips} segments={segments} playPos={playPos} split={splitAt} speed={speed} setSpeed={setSpeed} selected={selectedClip} setSelected={setSelectedClip} takeSnap={takeSnap} />}
            {mode === 'video' && leftTab === 'audio' && <AudioPanel audio={audio} setAudio={setAudio} onMusic={onMusic} wave={wave} />}
            {mode === 'video' && leftTab === 'transition' && <TransitionPanel transitions={transitions} setTransitions={setTransitions} />}
          </div>
        </aside>

        {/* CENTER */}
        <div className="ped-center">
          <div className="ped-stagebar">
            <button className={`ped-stagebar-btn ${zoom === 0 ? 'on' : ''}`} title="Fit (Ctrl+0)" onClick={() => { setZoom(0); setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 }; }}>Fit</button>
            <span className="ped-stagebar-zoom">
              <button className="ped-stagebar-btn" onClick={() => setZoom((z) => (z === 0 ? 75 : Math.max(25, z * 0.8)))}>−</button>
              <input className="ped-zoom-slider" type="range" min="25" max="300" step="5" title="Zoom" aria-label="Zoom" value={zoom === 0 ? 100 : zoom} onChange={(e) => setZoom(parseInt(e.target.value, 10))} />
              <button className="ped-stagebar-btn" onClick={() => setZoom((z) => (z === 0 ? 100 : Math.min(300, z * 1.25)))}>+</button>
              <span className="ped-zoom-label">{zoom === 0 ? 'Fit' : `${Math.round(zoom)}%`}</span>
            </span>
            <span className="ped-stagebar-spacer" />
            <button className={`ped-stagebar-btn ${handOn ? 'on' : ''}`} title="Hand tool (H) — drag to pan" onClick={() => setHandOn((v) => !v)}>✋</button>
            <button className={`ped-stagebar-btn ${gridOn ? 'on' : ''}`} title="Grid" onClick={() => setGridOn((v) => !v)}>▦</button>
            <button className={`ped-stagebar-btn ${guidesOn ? 'on' : ''}`} title="Guides" onClick={() => setGuidesOn((v) => !v)}>▥</button>
            <button className={`ped-stagebar-btn ${rulersOn ? 'on' : ''}`} title="Rulers" onClick={() => setRulersOn((v) => !v)}>📏</button>
            <button className={`ped-stagebar-btn ${snapOn ? 'on' : ''}`} title="Snap" onClick={() => setSnapOn((v) => !v)}>🧲</button>
            <span className="ped-stagebar-spacer" />
            <button className="ped-stagebar-btn" title="Fullscreen" onClick={() => { const el = wrapRef.current; if (!fullscreen) { if (el.requestFullscreen) el.requestFullscreen(); setFullscreen(true); } else { if (document.exitFullscreen) document.exitFullscreen(); setFullscreen(false); } }}>⛶</button>
          </div>
          <div className="ped-stage" ref={wrapRef}>
            {mode === 'photo' ? (
              <canvas ref={canvasRef} className="ped-canvas" />
            ) : (
              <div className="ped-video-stage">
                <video ref={vidRef} className="ped-video" muted={audio.mute} style={{ filter: P.videoCssFilter(adjust) }} controls={playing} />
                <canvas ref={canvasRef} className="ped-canvas ped-canvas-overlay" />
              </div>
            )}
            {mode === 'photo' && !srcUrl && (
              <div className={`ped-empty ${dragOver ? 'over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { notify('Image dropped'); loadLocalFile(f); } }}>
                <span className="ped-empty-icon">🖼</span>
                <h2>Start creating</h2>
                <p>Drop an image anywhere, paste from clipboard, or pick one — then edit, enhance and export in style.</p>
                <div className="ped-empty-btns">
                  <button className="btn btn-primary" onClick={() => { const el = document.getElementById('ped-file-input'); if (el) el.click(); }}>📂 Open image</button>
                  <button className="btn" onClick={() => addItem('text')}>🅰 Add text</button>
                  <button className="btn" onClick={() => addItem('sticker', null, null, '✨')}>✨ Add sticker</button>
                </div>
                {projects && projects.slice(0, 4).map((p) => (
                  <button key={p.id} className="ped-recent-chip" onClick={() => (p.type === 'video' ? navigate('video', {}) : navigate('photo', { src: p.thumbnail, name: p.name }))}>
                    {p.name || 'Untitled'}
                  </button>
                ))}
                <p className="ped-empty-hint">Tip: press <kbd>Ctrl</kbd>+<kbd>K</kbd> for the command palette · paste any image with Ctrl+V</p>
              </div>
            )}
            {mode === 'video' && !clips.length && <div className="ped-empty-stage"><span>🎬</span><p>Add clips to build your video — then grade, trim and export.</p>
              <label className="btn btn-sm btn-primary" style={{ display: 'inline-flex' }}>＋ Add Clips<input type="file" accept="video/*,image/*" multiple hidden onChange={addFiles} /></label>
            </div>}
            {srcUrl && mode === 'photo' && !busyAI && (
              <div className="ped-quickbar">
                <button title="Open image" onClick={() => { const el = document.getElementById('ped-file-input'); if (el) el.click(); }}>📂</button>
                <span className="ped-qb-sep" />
                <button title="Add text" onClick={() => addItem('text')}>🅰</button>
                <button title="Add shape" onClick={() => addItem('shape', 'rect')}>🔷</button>
                <button title="Add sticker" onClick={() => addItem('sticker', null, null, '✨')}>🎀</button>
                <span className="ped-qb-sep" />
                <button title="AI tools" onClick={() => setLeftTab('ai')}>🤖</button>
                <button title="Crop tool" onClick={() => setLeftTab('crop')}>✂️</button>
                <span className="ped-qb-sep" />
                <button title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>↩</button>
                <button title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>↪</button>
              </div>
            )}
          </div>
          <div className="ped-comparebar">
            <span>Compare:</span>
            <button className={compare.mode === 'off' ? 'on' : ''} onClick={() => setCompare((c) => ({ ...c, mode: 'off' }))}>Before/After</button>
            <button className={compare.mode === 'hold' ? 'on' : ''} onClick={() => setCompare((c) => ({ ...c, mode: c.mode === 'hold' ? 'off' : 'hold' }))}>Hold</button>
            <button className={compare.mode === 'side' ? 'on' : ''} onClick={() => setCompare((c) => ({ ...c, mode: c.mode === 'side' ? 'off' : 'side' }))}>Side by side</button>
            <button className={compare.mode === 'split' ? 'on' : ''} onClick={() => setCompare((c) => ({ ...c, mode: c.mode === 'split' ? 'off' : 'split' }))}>Split</button>
            {compare.mode === 'split' && <input className="ped-split-slider" type="range" min="0.05" max="0.95" step="0.01" value={compare.split} onChange={(e) => setCompare((c) => ({ ...c, split: parseFloat(e.target.value) }))} />}
            <button className="ped-btn" title="Reset preview (zoom, compare)" onClick={() => { setZoom(0); setHoldOrig(false); setCompare({ mode: 'off', split: 0.5 }); }}>Reset Preview</button>
            {mode === 'photo' && <button className={`ped-btn ped-btn-hold ${holdOrig ? 'on' : ''}`} onPointerDown={() => setHoldOrig(true)} onPointerUp={() => setHoldOrig(false)} onPointerLeave={() => setHoldOrig(false)}>Hold → Original</button>}
          </div>
          {mode === 'video' && (
            <VideoTimeline clips={clips} segments={segments} playPos={playPos} setPlayPos={setPlayPos} transitions={transitions} music={music} wave={wave} zoom={timelineZoom} total={totalDur}
              onDropTransition={(type) => { setTransitions((ts) => [...ts, { type, dur: 0.5, at: segments.length ? segments[0].abs : 0 }]); notify('Transition added'); }} />
          )}
        </div>

        {/* RIGHT */}
        <aside className="ped-right">
          <div className="ped-tablist ped-tablist-right">
            {RIGHT_TABS.map(([id, label, icon]) => (
              <button key={id} className={`ped-tab ${rightTab === id ? 'on' : ''}`} onClick={() => setRightTab(id)} title={label}><span>{icon}</span><small>{label}</small></button>
            ))}
          </div>
          <div className="ped-right-body">
            {rightTab === 'props' && <PropsPanel sel={sel} set={selId ? (patch) => setItems((its) => its.map((i) => i.id === selId ? { ...i, ...patch } : i)) : null} commit={() => takeSnap('Properties')} />}
            {rightTab === 'layers' && <LayersPanel items={items} setItems={setItems} add={addItem} selId={selId} setSelId={setSelId} takeSnap={takeSnap} />}
            {rightTab === 'history' && <HistoryPanel history={history} histIdx={histIdx} onJump={(idx) => { if (history[idx]) { if (history[idx].base) baseCanvasRef.current = history[idx].base; applyState(history[idx].state, null); setHistIdx(idx); notify(`Jumped to: ${history[idx].label}`, 'info'); } }} onUndoAll={() => { if (history[0]) { if (history[0].base) baseCanvasRef.current = history[0].base; applyState(history[0].state, null); setHistIdx(0); notify('Undid all changes'); } }} />}
            {rightTab === 'presets' && <PresetsPanel built={BUILTIN_PRESETS} apply={applyPreset} userPresets={userPresets} save={savePreset} del={delPreset} rename={renamePreset} dupe={dupePreset} />}
            {mode === 'video' && rightTab === 'video' && <VideoPropsPanel clips={clips} setClips={setClips} selected={selectedClip} setSelected={setSelectedClip} takeSnap={takeSnap} />}
          </div>
        </aside>
      </div>

      {/* EXPORT MODAL */}
      {exportOpen && (
        <div className="ped-modal-backdrop" onClick={() => setExportOpen(false)}>
          <div className="ped-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ped-modal-head"><h3>⬇ Export</h3><button className="ped-btn" onClick={() => setExportOpen(false)}>✕</button></div>
            <div className="ped-modal-body">
              {mode === 'photo' ? (
                <>
                  <div className="ped-exp-row"><span>Format</span><SegT opts={['png', 'jpg', 'webp', 'tiff']} value={expOpts.fmt} onChange={(f) => setExpOpts((o) => ({ ...o, fmt: f }))} /></div>
                  <div className="ped-exp-row"><span>Resolution</span><SegT opts={[{ id: 'original', label: 'Original' }, { id: '1080', label: 'Full HD' }, { id: '4k', label: '4K' }]} value={expOpts.preset} onChange={(p) => setExpOpts((o) => ({ ...o, preset: p }))} /></div>
                  <div className="ped-exp-row"><span>Quality <b>{expOpts.quality}</b></span><input type="range" min="40" max="100" value={expOpts.quality} onChange={(e) => setExpOpts((o) => ({ ...o, quality: +e.target.value }))} /></div>
                  <div className="ped-exp-row ped-exp-est">Estimated: <b>~{estimSize(capsRef.current.w, capsRef.current.h, expOpts.fmt, expOpts.quality)} KB</b></div>
                  <div className="ped-exp-actions">
                    <button className="btn btn-primary" onClick={exportRun} disabled={busyExport}>{busyExport ? 'Exporting…' : 'Export & Download'}</button>
                    <button className="btn" onClick={saveToProject}>Save to Project</button>
                    <button className="btn" onClick={share}>Share</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ped-exp-row"><span>Format</span><SegT opts={['mp4', 'webm']} value={expOpts.fmt} onChange={(f) => setExpOpts((o) => ({ ...o, fmt: f }))} /></div>
                  <div className="ped-exp-row"><span>Preset</span><SegT opts={[{ id: 'original', label: 'Original' }, { id: 'instagram', label: 'IG' }, { id: 'reels', label: 'Reels' }, { id: 'youtube', label: 'YouTube' }, { id: 'shorts', label: 'Shorts' }, { id: 'tiktok', label: 'TikTok' }, { id: 'fb', label: 'FB' }, { id: 'wa', label: 'WhatsApp' }]} value={expOpts.preset} onChange={(p) => { const map = { original: null, instagram: [1080, 1080, 30], reels: [1080, 1920, 30], youtube: [1920, 1080, 60], shorts: [1080, 1920, 60], tiktok: [1080, 1920, 30], fb: [1280, 720, 30], wa: [1280, 720, 30] }; const m = map[p]; setExpOpts((o) => ({ ...o, preset: p, resW: m ? m[0] : o.resW, resH: m ? m[1] : o.resH, fps: m ? m[2] : o.fps })); }} /></div>
                  {expOpts.preset === 'original' && <div className="ped-exp-row"><span>Resolution</span><input className="ped-num" type="number" value={expOpts.resW} onChange={(e) => setExpOpts((o) => ({ ...o, resW: +e.target.value }))} /> × <input className="ped-num" type="number" value={expOpts.resH} onChange={(e) => setExpOpts((o) => ({ ...o, resH: +e.target.value }))} /></div>}
                  <div className="ped-exp-grid">
                    <label>FPS<input type="number" min="15" max="120" value={expOpts.fps} onChange={(e) => setExpOpts((o) => ({ ...o, fps: +e.target.value }))} /></label>
                    <label>CRF (lower = better)<input type="number" min="14" max="35" value={expOpts.crf} onChange={(e) => setExpOpts((o) => ({ ...o, crf: +e.target.value }))} /></label>
                  </div>
                  <div className="ped-exp-actions">
                    <button className="btn btn-primary" onClick={doVideoExport} disabled={busyExport}>{busyExport ? 'Rendering…' : 'Render & Download'}</button>
                    <button className="btn" disabled={busyExport}>Save to Project</button>
                  </div>
                </>
              )}
              {busyExport && exportLog && <div className="ped-export-log">{exportLog}</div>}
            </div>
          </div>
        </div>
      )}

      {/* AI OVERLAY */}
      {busyAI && (
        <div className="ped-ai-overlay">
          <div className="ped-ai-card">
            <span className="ped-ai-orbs"><i /><i /><i /></span>
            <h3>{busyAI.label}</h3>
            <div className="ped-ai-bar"><div style={{ width: `${busyAI.pct}%` }} /></div>
            <span className="ped-ai-pct">{busyAI.pct}%</span>
            <button className="btn btn-sm" onClick={() => { cancelRef.current = true; }}>Cancel</button>
          </div>
        </div>
)}

      <style>{`@keyframes pedorbs{0%,100%{transform:translateY(0) scale(1);opacity:.85}50%{transform:translateY(-7px) scale(1.15);opacity:1}}`}</style>
    </div>
  );

  /* helper factories */
  function setAdjustWrap(set) {
    return { set: (k, v) => set((a) => ({ ...a, [k]: v })), reset: (k) => set((a) => ({ ...a, [k]: P.DEFAULT_ADJUST()[k] })) };
  }
  function estimSize(w, h, fmt, q) {
    const bits = w * h * (fmt === 'png' || fmt === 'tiff' ? 32 : 24);
    const comp = fmt === 'png' ? 0.25 : fmt === 'tiff' ? 1 : q / 160;
    return Math.max(4, Math.round(bits * comp / 1024));
  }
  function openLocalImage(e) {
    const f = e.target.files && e.target.files[0];
    if (f) loadLocalFile(f);
    if (e.target) e.target.value = '';
  }
  function loadLocalFile(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { notify('That file is not an image', 'warn'); return; }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const mx = 2400; const sc = Math.min(1, mx / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        srcCanvasRef.current = c; baseCanvasRef.current = c;
        histRef.current = P.buildHistogram(c);
        capsRef.current = { w: c.width, h: c.height, fullW: img.naturalWidth, fullH: img.naturalHeight };
        setCrop({ on: false, x: 0, y: 0, w: c.width, h: c.height, ratio: null, straighten: 0, flipH: false, flipV: false, rot: 0 });
        setItems([]); setSelId(null); setHistory([]); setHistIdx(-1);
        setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 };
        renderNow(); notify('Image loaded ✓');
        setTimeout(() => takeSnap('Open'), 250);
      };
      img.onerror = () => notify('Could not read that image', 'error');
      img.src = r.result;
    };
    r.readAsDataURL(f);
  }
}

/* ---- small helper used by undo/redo to force a state eval synchronously ---- */
function useStateSync(fn) { (function run() { if (typeof Promise !== 'undefined' && Promise.toString().indexOf('[native code]') === -1) { } try { fn(); } catch (e) { /* state sync best-effort */ } })(); }

/* ===========================================================================
   PANELS
   =========================================================================== */
function LightPanel({ value, patch, onAutoAdjust, commit }) {
  return (
    <div className="ped-panel">
      <div className="ped-ai-row">
        <button className="btn btn-sm btn-primary" onClick={onAutoAdjust}>✨ Auto Adjust</button>
      </div>
      <ZExpando label="Light" icon="☀️">
        {LIGHT_OPS.map(([k, label, min, max, step]) => (
          <AdjSlider key={k} label={label} value={value[k]} min={min} max={max} step={step} onChange={(v) => patch.set(k, v)} onReset={() => patch.reset(k)} onCommit={commit} desc={LIGHT_DESC[k]} />
        ))}
      </ZExpando>
    </div>
  );
}
function ColorPanel({ value, patch, commit }) {
  const [bal, setBal] = useState('mids');
  return (
    <div className="ped-panel">
      <ZExpando label="Color" icon="🎨">
        {COLOR_OPS.map(([k, label, min, max, step]) => (
          <AdjSlider key={k} label={label} value={value[k]} min={min} max={max} step={step} onChange={(v) => patch.set(k, v)} onReset={() => patch.reset(k)} onCommit={commit} />
        ))}
        <div className="ped-lbl-row"><span>Color Balance</span><div className="ped-seg ped-seg-sm">{['shadows', 'mids', 'highlights'].map((s) => <button key={s} className={bal === s ? 'on' : ''} onClick={() => setBal(s)}>{s[0].toUpperCase()}{s.slice(1)}</button>)}</div></div>
        {['r', 'g', 'b'].map((ch) => (
          <AdjSlider key={ch} label={ch.toUpperCase()} value={value.balance[bal][ch]} min={-100} max={100} step={1}
            onChange={(v) => patch.set('balance', { ...value.balance, [bal]: { ...value.balance[bal], [ch]: v } })} onReset={() => patch.set('balance', { ...value.balance, [bal]: { r: 0, g: 0, b: 0 } })} onCommit={commit} />
        ))}
      </ZExpando>
      <ZExpando label="HSL — Per Color" icon="🌈">
        {HSLC.map((n, i) => (
          <div key={n} className="ped-hsl-block">
            <strong>{n}</strong>
            <AdjSlider label="Hue" value={hslVal(value, 0, i)} min={-180} max={180} step={1} onChange={(v) => hslSet(value, patch, 0, i, v)} onReset={() => hslSet(value, patch, 0, i, 0)} onCommit={commit} />
            <AdjSlider label="Sat" value={hslVal(value, 1, i)} min={-100} max={100} step={1} onChange={(v) => hslSet(value, patch, 1, i, v)} onReset={() => hslSet(value, patch, 1, i, 0)} onCommit={commit} />
            <AdjSlider label="Lum" value={hslVal(value, 2, i)} min={-100} max={100} step={1} onChange={(v) => hslSet(value, patch, 2, i, v)} onReset={() => hslSet(value, patch, 2, i, 0)} onCommit={commit} />
          </div>
        ))}
      </ZExpando>
    </div>
  );
}
function hslVal(value, channel, i) {
  const arr = value.hsl ? value.hsl[['hue', 'sat', 'lum'][channel]] : null;
  return (arr && arr[i]) || 0;
}
function hslSet(value, patch, channel, i, v) {
  const key = ['hue', 'sat', 'lum'][channel];
  const hsl = value.hsl || { hue: [], sat: [], lum: [] };
  const arr = [...(hsl[key] || [])];
  arr[i] = v;
  patch.set('hsl', { ...hsl, [key]: arr });
}

function CurvesPanel({ curves, setCurves, hist, takeSnap }) {
  const ref = useRef(null);
  const [ch, setCh] = useState('rgb');
  const dragRef = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    cv.width = 300; cv.height = 300;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#10141d'; ctx.fillRect(0, 0, 300, 300);
    if (hist) {
      const keys = ch === 'rgb' ? ['lum', 'r', 'g', 'b'] : [ch];
      const colors = ['rgba(255,255,255,0.18)', 'rgba(255,90,90,0.42)', 'rgba(90,255,90,0.42)', 'rgba(90,130,255,0.42)'];
      keys.forEach((k, ki) => {
        const hh = hist[k]; if (!hh) return;
        ctx.fillStyle = ch === 'rgb' ? colors[ki] : colors[0];
        const max = Math.max(1, ...hh);
        for (let i = 0; i < 256; i += 4) { const v = (hh[i] / max) * 250; ctx.fillRect(i, 300 - v, 4, v); }
      });
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 75, 0); ctx.lineTo(i * 75, 300); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * 75); ctx.lineTo(300, i * 75); ctx.stroke(); }
    const pts = curves[ch] || [];
    if (!pts.length) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(0, 300); ctx.lineTo(300, 0); ctx.stroke(); }
    const sorted = pts.slice().sort((a, b) => a.x - b.x);
    ctx.strokeStyle = ch === 'rgb' ? '#fff' : { r: '#ff5c5c', g: '#5cff7a', b: '#5c7bff' }[ch];
    ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.moveTo(0, 300);
    for (const p of sorted) ctx.lineTo(p.x * 300, 300 - p.y * 300);
    ctx.lineTo(300, 0); ctx.stroke();
    ctx.fillStyle = '#fff';
    sorted.forEach((p) => { ctx.beginPath(); ctx.arc(p.x * 300, 300 - p.y * 300, 5, 0, 7); ctx.fill(); });
  }, [curves, ch, hist]);
  const toCurve = (e) => {
    const rect = ref.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)) };
  };
  const addPoint = (pt) => {
    setCurves((cs) => ({ ...cs, [ch]: sortCurve([...(cs[ch] || []), { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 }]) }));
    takeSnap('Curve point');
  };
  const sortCurve = (arr) => arr.slice().sort((a, b) => a.x - b.x);
  return (
    <div className="ped-panel">
      <SegT opts={['rgb', 'r', 'g', 'b']} value={ch} onChange={(c) => { setCh(c); dragRef.current = null; }} small />
      <canvas ref={ref} className="ped-curves"
        onPointerDown={(e) => {
          if (e.button === 2) return;
          const pt = toCurve(e);
          const list = curves[ch] || [];
          const near = list.find((p) => Math.abs(p.x - pt.x) < 0.04 && Math.abs(p.y - pt.y) < 0.04);
          if (near) dragRef.current = near;
          else addPoint(pt);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const pt = toCurve(e);
          setCurves((cs) => ({ ...cs, [ch]: sortCurve(cs[ch].map((p) => p === d ? pt : p)) }));
        }}
        onPointerUp={() => { if (dragRef.current) takeSnap('Curve'); dragRef.current = null; }}
        onContextMenu={(e) => {
          e.preventDefault();
          const pt = toCurve(e);
          const list = curves[ch] || [];
          setCurves((cs) => ({ ...cs, [ch]: list.filter((p) => !(Math.abs(p.x - pt.x) < 0.04)) }));
          takeSnap('Curve point removed');
        }}
      />
      <div className="ped-curve-actions">
        <button className="btn btn-sm" onClick={() => { takeSnap('Reset curves'); setCurves((cs) => ({ ...cs, [ch]: [] })); }}>Reset</button>
        <small>Click: add · Drag: move · Right-click: delete</small>
      </div>
    </div>
  );
}

function WBPanel({ adjust, setAdjust, notify, pick, setPick, commit }) {
  return (
    <div className="ped-panel">
      <ZExpando label="White Balance" icon="🌡">
        <div className="ped-ai-row">
          <button className="btn btn-sm" onClick={() => { setAdjust((a) => ({ ...a, wb: { ...a.wb, temp: 0, tint: 0 } })); notify('White balance reset'); commit(); }}>⚖ Reset WB</button>
          <button className={`btn btn-sm ${pick ? 'btn-primary' : ''}`} onClick={() => { setPick(!pick); notify(pick ? 'Picker off' : 'Click a neutral area of the image'); }}>👁 Eyedropper</button>
        </div>
        <AdjSlider label="Temperature" value={adjust.wb.temp} min={-100} max={100} step={1} onChange={(v) => setAdjust((a) => ({ ...a, wb: { ...a.wb, temp: v } }))} onReset={() => setAdjust((a) => ({ ...a, wb: { ...a.wb, temp: 0 } }))} onCommit={commit} />
        <AdjSlider label="Tint" value={adjust.wb.tint} min={-100} max={100} step={1} onChange={(v) => setAdjust((a) => ({ ...a, wb: { ...a.wb, tint: v } }))} onReset={() => setAdjust((a) => ({ ...a, wb: { ...a.wb, tint: 0 } }))} onCommit={commit} />
      </ZExpando>
    </div>
  );
}
function DetailPanel({ value, patch, commit }) {
  return (
    <div className="ped-panel">
      <p className="ped-hint">🔍 Zoom the centre canvas to 200% for a close-up detail check.</p>
      <ZExpando label="Detail" icon="🔍">
        {DETAIL_OPS.map(([k, label, min, max, step]) => (
          <AdjSlider key={k} label={label} value={value.detail[k]} min={min} max={max} step={step} onChange={(v) => patch.set('detail', { ...value.detail, [k]: v })} onReset={() => patch.set('detail', P.DEFAULT_ADJUST().detail)} onCommit={commit} />
        ))}
      </ZExpando>
    </div>
  );
}
function OpticsPanel({ value, patch, commit }) {
  return (
    <div className="ped-panel">
      <div className="ped-ai-row"><button className="btn btn-sm" onClick={() => { patch.set('optics', { ...value.optics, lens: 0, perspective: { x: 0, y: 0 }, autoLens: true }); commit(); }}>✨ Auto Lens Correction</button></div>
      <ZExpando label="Optics / Lens" icon="🔮">
        {OPTIC_OPS.map(([k, label, min, max, step]) => (
          <AdjSlider key={k} label={label} value={value.optics[k]} min={min} max={max} step={step} onChange={(v) => patch.set('optics', { ...value.optics, [k]: v })} onReset={() => patch.set('optics', P.DEFAULT_ADJUST().optics)} onCommit={commit} />
        ))}
        <div className="ped-lbl-row"><span>Perspective</span></div>
        <AdjSlider label="X" value={value.optics.perspective.x} min={-1} max={1} step={0.01} onChange={(v) => patch.set('optics', { ...value.optics, perspective: { ...value.optics.perspective, x: v } })} onReset={() => patch.set('optics', { ...value.optics, perspective: { x: 0, y: 0 } })} onCommit={commit} />
        <AdjSlider label="Y" value={value.optics.perspective.y} min={-1} max={1} step={0.01} onChange={(v) => patch.set('optics', { ...value.optics, perspective: { ...value.optics.perspective, y: v } })} onReset={() => patch.set('optics', { ...value.optics, perspective: { x: 0, y: 0 } })} onCommit={commit} />
        <div className="ped-lbl-row"><span>Skew</span></div>
        <AdjSlider label="X" value={value.optics.skew.x} min={-1} max={1} step={0.01} onChange={(v) => patch.set('optics', { ...value.optics, skew: { ...value.optics.skew, x: v } })} onReset={() => patch.set('optics', { ...value.optics, skew: { x: 0, y: 0 } })} onCommit={commit} />
        <AdjSlider label="Y" value={value.optics.skew.y} min={-1} max={1} step={0.01} onChange={(v) => patch.set('optics', { ...value.optics, skew: { ...value.optics.skew, y: v } })} onReset={() => patch.set('optics', { ...value.optics, skew: { x: 0, y: 0 } })} onCommit={commit} />
      </ZExpando>
    </div>
  );
}
function CropPanel({ crop, setCrop, apply, setRatio, W, H, commit }) {
  return (
    <div className="ped-panel">
      <div className="ped-ai-row">
        <button className={`btn btn-sm ${crop.on ? 'btn-primary' : ''}`} onClick={() => { setCrop((c) => ({ ...c, on: !c.on })); commit(); }}>{crop.on ? '✓ Crop guides on' : '✂️ Enable Crop'}</button>
        <button className={`btn btn-sm ${crop.flipH ? 'btn-primary' : ''}`} onClick={() => { setCrop((c) => ({ ...c, flipH: !c.flipH })); commit(); }}>⇄ Flip H {crop.flipH ? '✓' : ''}</button>
        <button className={`btn btn-sm ${crop.flipV ? 'btn-primary' : ''}`} onClick={() => { setCrop((c) => ({ ...c, flipV: !c.flipV })); commit(); }}>⇅ Flip V {crop.flipV ? '✓' : ''}</button>
      </div>
      <div className="ped-lbl-row"><span>Ratio</span></div>
      <div className="ped-seg">{PRESET_RATIOS.map((r) => <button key={r.id} className={crop.ratio === r.id ? 'on' : ''} onClick={() => setRatio(r.id === 'free' ? null : r.id)}>{r.label}</button>)}</div>
      <div className="ped-exp-grid">
        <label>X<input type="number" value={Math.round(crop.x)} onChange={(e) => setCrop((c) => ({ ...c, x: Math.max(0, Math.min(W - c.w, +e.target.value)) }))} onBlur={commit} /></label>
        <label>Y<input type="number" value={Math.round(crop.y)} onChange={(e) => setCrop((c) => ({ ...c, y: Math.max(0, Math.min(H - c.h, +e.target.value)) }))} onBlur={commit} /></label>
        <label>W<input type="number" value={Math.round(crop.w)} onChange={(e) => setCrop((c) => ({ ...c, w: Math.max(10, Math.min(W - c.x, +e.target.value)) }))} onBlur={commit} /></label>
        <label>H<input type="number" value={Math.round(crop.h)} onChange={(e) => setCrop((c) => ({ ...c, h: Math.max(10, Math.min(H - c.y, +e.target.value)) }))} onBlur={commit} /></label>
      </div>
      <div className="ped-ai-row">
        <button className="btn btn-sm" onClick={() => { setCrop((c) => { const n = (c.rot + 90) % 360; const sw = n === 90 || n === 270; return { ...c, rot: n, w: sw ? Math.min(c.h, H) : Math.min(c.w, W), h: sw ? Math.min(c.w, W) : Math.min(c.h, H) }; }); commit(); }}>↻ Rotate 90° ({crop.rot}°)</button>
        <button className="btn btn-sm" onClick={() => { setCrop((c) => ({ ...c, straighten: c.straighten >= 45 ? 0 : c.straighten + 15 })); commit(); }}>⇽ Straighten {crop.straighten}°</button>
      </div>
      <button className="btn btn-primary" onClick={apply} disabled={!crop.on}>Apply Crop</button>
    </div>
  );
}
function FiltersPanel({ filters, setFilters, takeSnap }) {
  const [cat, setCat] = useState('all');
  const [favs, setFavs] = useState(() => { try { return JSON.parse(localStorage.getItem('dm_ffavs') || '[]'); } catch { return []; } });
  const toggleFav = (e, id) => { e.stopPropagation(); const n = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]; setFavs(n); localStorage.setItem('dm_ffavs', JSON.stringify(n)); };
  const list = P.FILTER_IDS.filter((f) => cat === 'all' ? true : cat === 'fav' ? favs.includes(f.id) : f.cat === cat);
  return (
    <div className="ped-panel">
      <div className="ped-seg ped-seg-sm">{['all', 'fav', ...P.FILTER_GROUPS.map((x) => x.id)].slice(0, 14).map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c === 'fav' ? '★' : c === 'all' ? 'All' : c}</button>)}</div>
      <div className="ped-thumbs">
        {list.map((f) => (
          <div key={f.id} className={`ped-thumb ${filters.find((x) => x.id === f.id) ? 'on' : ''}`}>
            <button className="ped-thumb-bg" onClick={() => { setFilters((fs) => fs.some((x) => x.id === f.id) ? fs.filter((x) => x.id !== f.id) : [...fs, { id: f.id, intensity: 1 }]); takeSnap('Filter'); }}>
              <div className="ped-thumb-img" style={{ background: f.cat === 'Black & White' ? 'linear-gradient(135deg,#3a3a42,#111)' : `linear-gradient(135deg, ${shade(f.cat)}, #7d5cff)` }}>{f.name[0]}</div>
              <small>{f.name}</small>
            </button>
            <button className="ped-thumb-fav" onClick={(e) => toggleFav(e, f.id)}>{favs.includes(f.id) ? '★' : '☆'}</button>
          </div>
        ))}
      </div>
      {filters.length > 0 && (
        <ZExpando label={`Stacked Filters (${filters.length})`} icon="🎞">
          {filters.map((f) => (
            <div key={f.id} className="ped-stack-row">
              <span>{P.FILTER_LOOKUP[f.id] ? P.FILTER_LOOKUP[f.id].name : f.id}</span>
              <input type="range" min="0.05" max="1" step="0.05" value={f.intensity} onChange={(e) => setFilters((fs) => fs.map((x) => x.id === f.id ? { ...x, intensity: +e.target.value } : x))} onPointerUp={() => takeSnap('Filter intensity')} />
              <button className="ped-reset" onClick={() => setFilters((fs) => fs.filter((x) => x.id !== f.id))}>✕</button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={() => { takeSnap('Reset filters'); setFilters([]); }}>Reset Filters</button>
        </ZExpando>
      )}
    </div>
  );
}
function shade(cat) {
  const m = { Cinematic: '#1c3a3f', Portrait: '#3f1c33', Landscape: '#1c3a2f', Vintage: '#3f351c', Film: '#3a2c1c', 'Black & White': '#222', Warm: '#40301c', Cool: '#1c2f40', Moody: '#24242e', Luxury: '#2e2616', Instagram: '#1c283f', Travel: '#2a3f1c', Wedding: '#38243f', Dramatic: '#2a1a1a' };
  return m[cat] || '#26325c';
}
function EffectsPanel({ effects, setEffects, takeSnap }) {
  const px = P.EFFECTS.filter((e) => e.mode === 'px');
  const ov = P.EFFECTS.filter((e) => e.mode === 'ov');
  const on = (id) => effects.find((e) => e.id === id);
  const toggle = (id) => setEffects((es) => { const has = on(id); takeSnap('Effect'); return has ? es.filter((e) => e.id !== id) : [...es, { id, intensity: 0.6, opts: {} }]; });
  return (
    <div className="ped-panel">
      <ZExpando label="Pixel Effects" icon="✨">
        <div className="ped-grid-2">{px.map((e) => <button key={e.id} className={`ped-mini-btn ${on(e.id) ? 'on' : ''}`} onClick={() => toggle(e.id)}><span>{e.icon}</span>{e.name}</button>)}</div>
      </ZExpando>
      <ZExpando label="Overlay Effects" icon="🌌">
        <div className="ped-grid-2">{ov.map((e) => <button key={e.id} className={`ped-mini-btn ${on(e.id) ? 'on' : ''}`} onClick={() => toggle(e.id)}><span>{e.icon}</span>{e.name}</button>)}</div>
      </ZExpando>
      <ZExpando label="Active Effects" icon="⚙">
        {effects.map((e) => (
          <div key={e.id} className="ped-stack-row">
            <span>{P.EFFECT_LOOKUP[e.id] ? P.EFFECT_LOOKUP[e.id].name : e.id} <b>{Math.round(e.intensity * 100)}%</b></span>
            <input type="range" min="0.05" max="1" step="0.05" value={e.intensity} onChange={(ev) => setEffects((es) => es.map((x) => x.id === e.id ? { ...x, intensity: +ev.target.value } : x))} onPointerUp={() => takeSnap('Effect intensity')} />
            <button className="ped-reset" onClick={() => { takeSnap('Effect removed'); setEffects((es) => es.filter((x) => x.id !== e.id)); }}>✕</button>
          </div>
        ))}
        {!effects.length && <small className="ped-hint">Select effects above to stack them.</small>}
      </ZExpando>
    </div>
  );
}
function VignettePanel({ value, patch, resetVg, commit }) {
  const vg = value.optics.vignette;
  const setV = (k, v) => patch.set('optics', { ...value.optics, vignette: { ...vg, [k]: v } });
  return (
    <div className="ped-panel">
      <ZExpando label="Vignette" icon="◐">
        <AdjSlider label="Amount" value={vg.amount} min={-100} max={100} step={1} onChange={(v) => setV('amount', v)} onReset={resetVg} onCommit={commit} />
        <AdjSlider label="Size" value={vg.size} min={0.1} max={1} step={0.01} onChange={(v) => setV('size', v)} onReset={resetVg} onCommit={commit} />
        <AdjSlider label="Feather" value={vg.feather} min={0.05} max={0.9} step={0.01} onChange={(v) => setV('feather', v)} onReset={resetVg} onCommit={commit} />
        <AdjSlider label="Roundness" value={vg.roundness} min={-100} max={100} step={1} onChange={(v) => setV('roundness', v)} onReset={resetVg} onCommit={commit} />
        <AdjSlider label="Highlight Priority" value={vg.highlights} min={0} max={100} step={1} onChange={(v) => setV('highlights', v)} onReset={resetVg} onCommit={commit} />
        <button className="btn btn-sm" onClick={() => { resetVg(); commit(); }}>Reset Vignette</button>
      </ZExpando>
    </div>
  );
}
function AIPanel({ run, busy, cancel }) {
  const groups = [
    { label: 'AI Background', items: [['🧯', 'Remove', 'bg-remove'], ['🔁', 'Replace', 'bg-replace'], ['🌫', 'Blur', 'bg-blur'], ['🌆', 'Generate', 'bg-gen']] },
    { label: 'AI Enhancement', items: [['🔍', 'Upscale', 'upscale'], ['✨', 'Enhance', 'enhance'], ['👤', 'Face', 'face'], ['🧴', 'Skin', 'skin'], ['🔑', 'Sharpen', 'sharpen'], ['🎚', 'Denoise', 'denoise'], ['🎨', 'Colorize', 'colorize'], ['🌙', 'Low-light', 'lowlight'], ['🩹', 'Restore', 'restore']] },
    { label: 'AI Expand', items: [['↔️', 'Expand 16:9', 'expand']] },
    { label: 'AI Object Edit (select an object first)', items: [['🗑', 'Remove', 'objectEdit'], ['🎨', 'Recolor', 'objectRecolor']] },
  ];
  return (
    <div className="ped-panel">
      <p className="ped-hint">AI runs fully in-browser — your media never leaves the device.</p>
      {groups.map((g) => (
        <ZExpando key={g.label} label={g.label} icon="🤖">
          <div className="ped-grid-2">{g.items.map(([ic, name, op]) => <button key={op} className="ped-mini-btn" disabled={!!busy} onClick={() => run(op)}><span>{ic}</span>{name}</button>)}</div>
        </ZExpando>
      ))}
      {busy && <button className="btn btn-sm btn-danger" onClick={cancel}>Cancel AI</button>}
    </div>
  );
}
function MaskPanel({ dims, ensure, clear, apply, ui, setUi, brush, setBrush }) {
  const [tool, setTool] = useState('brush');
  const runTool = (t) => {
    const cv = ensure();
    if (t === 'lgrad') P.maskGradient(cv, dims.w * 0.3, dims.h * 0.3, dims.w * 0.7, dims.h * 0.7, false, true);
    else if (t === 'rgrad') P.maskGradient(cv, dims.w * 0.5, dims.h * 0.5, dims.w * 0.7, dims.h * 0.7, true, true);
    else if (t === 'subject') P.maskAutoSubject(cv);
    else if (t === 'sky') P.maskAutoSky(cv);
    else if (t === 'person') P.maskAutoPerson(cv);
  };
  return (
    <div className="ped-panel">
      <p className="ped-hint">Paint a mask, then <b>Apply to Adjustments</b> to limit edits to that region.</p>
      <div className="ped-seg ped-seg-sm">{['brush', 'lgrad', 'rgrad', 'subject', 'sky', 'person'].map((id) => <button key={id} className={tool === id ? 'on' : ''} onClick={() => setTool(id)}>{({ brush: 'Brush', lgrad: 'Linear', rgrad: 'Radial', subject: 'Subject', sky: 'Sky', person: 'Person' })[id]}</button>)}</div>
      {tool === 'brush' ? (
        <div className="ped-ai-row">
          <div className="ped-seg ped-seg-sm"><button className={brush.eraser ? 'on' : ''} onClick={() => setBrush((b) => ({ ...b, eraser: true }))}>Eraser</button><button className={!brush.eraser ? 'on' : ''} onClick={() => setBrush((b) => ({ ...b, eraser: false }))}>Brush</button></div>
        </div>
      ) : (
        <div className="ped-ai-row"><button className="btn btn-sm" onClick={() => runTool(tool)}>Generate {({ lgrad: 'Linear', rgrad: 'Radial', subject: 'Subject', sky: 'Sky', person: 'Person' })[tool]} Mask</button></div>
      )}
      <AdjSlider label="Brush Size" value={brush.size} min={1} max={100} step={1} onChange={(v) => setBrush((b) => ({ ...b, size: v }))} onReset={() => setBrush((b) => ({ ...b, size: 40 }))} />
      <AdjSlider label="Hardness" value={brush.hard} min={0} max={1} step={0.05} onChange={(v) => setBrush((b) => ({ ...b, hard: v }))} onReset={() => setBrush((b) => ({ ...b, hard: 0.7 }))} format={(v) => `${Math.round(v * 100)}%`} />
      <ZExpando label="Mask Controls" icon="🎭">
        <AdjSlider label="Feather" value={ui.feather} min={0} max={100} step={1} onChange={(v) => setUi((u) => ({ ...u, feather: v }))} onReset={() => setUi((u) => ({ ...u, feather: 0 }))} />
        <AdjSlider label="Density" value={ui.density} min={0} max={100} step={1} onChange={(v) => setUi((u) => ({ ...u, density: v }))} onReset={() => setUi((u) => ({ ...u, density: 100 }))} />
        <AdjSlider label="Opacity" value={ui.opacity} min={0} max={100} step={1} onChange={(v) => setUi((u) => ({ ...u, opacity: v }))} onReset={() => setUi((u) => ({ ...u, opacity: 80 }))} />
        <div className="ped-ai-row">
          <button className="btn btn-sm" onClick={() => setUi((u) => ({ ...u, inverted: !u.inverted }))}>Invert {ui.inverted ? '✓' : ''}</button>
          <button className="btn btn-sm" onClick={() => setUi((u) => ({ ...u, visible: !u.visible }))}>Show {ui.visible ? '✓' : '✗'}</button>
        </div>
      </ZExpando>
      <div className="ped-ai-row">
        <button className="btn btn-sm btn-primary" onClick={apply}>Apply to Adjustments</button>
        <button className="btn btn-sm" onClick={clear}>🗑 Clear</button>
      </div>
    </div>
  );
}
function RetouchPanel({ tool, setTool, opts, setOpts, apply }) {
  const tools = [['smooth', 'Smooth Skin'], ['blemish', 'Blemish'], ['teeth', 'Teeth'], ['eyes', 'Eyes'], ['redeye', 'Red-eye'], ['hair', 'Hair'], ['tone', 'Skin Tone']];
  return (
    <div className="ped-panel">
      <p className="ped-hint">Paint over the area on the image, then press Apply.</p>
      <div className="ped-grid-2">{tools.map(([id, l]) => <button key={id} className={`ped-mini-btn ${tool === id ? 'on' : ''}`} onClick={() => setTool(id)}>{l}</button>)}</div>
      <ZExpando label="Brush & Strength" icon="🖌">
        <AdjSlider label="Brush Size" value={opts.size} min={1} max={100} step={1} onChange={(v) => setOpts((o) => ({ ...o, size: v }))} onReset={() => setOpts((o) => ({ ...o, size: 30 }))} />
        <AdjSlider label="Hardness" value={opts.hard} min={0} max={1} step={0.05} onChange={(v) => setOpts((o) => ({ ...o, hard: v }))} onReset={() => setOpts((o) => ({ ...o, hard: 0.7 }))} />
        <AdjSlider label="Intensity" value={opts.intensity} min={0} max={100} step={1} onChange={(v) => setOpts((o) => ({ ...o, intensity: v }))} onReset={() => setOpts((o) => ({ ...o, intensity: 50 }))} />
      </ZExpando>
      <button className="btn btn-primary" onClick={apply} disabled={!tool}>Apply Retouch</button>
    </div>
  );
}
function TextPanel({ add, sel, setItem }) {
  return (
    <div className="ped-panel">
      <div className="ped-ai-row"><button className="btn btn-sm btn-primary" onClick={() => add('text')}>+ Add Text</button></div>
      {!sel ? <p className="ped-hint">Add text, then click it on the canvas to style it (font, size, color, outline, shadow, glow…).</p> : (
        <ZExpando label="Typography" icon="🅰">
          <label className="ped-exp-row right"><span>Content</span><input defaultValue={sel.text} onChange={(e) => setItem(sel.id, { text: e.target.value })} /></label>
          <label className="ped-exp-row right"><span>Font</span><select defaultValue={sel.font} onChange={(e) => setItem(sel.id, { font: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
          <AdjSlider label="Size" value={sel.size} min={8} max={400} step={1} onChange={(v) => setItem(sel.id, { size: v })} onReset={() => setItem(sel.id, { size: 56 })} format={(v) => `${v}px`} />
          <AdjSlider label="Weight" value={parseInt(sel.weight || 700)} min={100} max={900} step={100} onChange={(v) => setItem(sel.id, { weight: String(v) })} onReset={() => setItem(sel.id, { weight: '700' })} />
          <AdjSlider label="Letter Spacing" value={sel.ls || 0} min={-10} max={30} step={1} onChange={(v) => setItem(sel.id, { ls: v })} onReset={() => setItem(sel.id, { ls: 0 })} format={(v) => `${v}px`} />
          <AdjSlider label="Line Height" value={sel.lh || 1.2} min={0.8} max={3} step={0.05} onChange={(v) => setItem(sel.id, { lh: v })} onReset={() => setItem(sel.id, { lh: 1.2 })} />
          <AdjSlider label="Opacity" value={Math.round(sel.opacity * 100)} min={0} max={100} step={1} onChange={(v) => setItem(sel.id, { opacity: v / 100 })} onReset={() => setItem(sel.id, { opacity: 1 })} format={(v) => `${v}%`} />
          <div className="ped-lbl-row"><span>Align</span><div className="ped-seg ped-seg-sm">{[['left', '⇤'], ['center', '☰'], ['right', '⇥']].map(([a, ic]) => <button key={a} className={sel.align === a ? 'on' : ''} onClick={() => setItem(sel.id, { align: a })}>{ic}</button>)}</div></div>
          <label className="ped-exp-row right"><span>Color</span><input type="color" value={sel.color || '#fff'} onChange={(e) => setItem(sel.id, { color: e.target.value })} /></label>
          <div className="ped-ai-row">
            <button className={`btn btn-sm ${sel.gradient ? 'btn-primary' : ''}`} onClick={() => setItem(sel.id, { gradient: !sel.gradient, gradA: '#fff', gradB: '#7d5cff' })}>Gradient {sel.gradient ? '✓' : ''}</button>
            <button className={`btn btn-sm ${sel.italic ? 'btn-primary' : ''}`} onClick={() => setItem(sel.id, { italic: !sel.italic })}>Italic</button>
          </div>
          <div className="ped-ai-row">
            <label style={{ display: 'inline-flex', gap: 6 }}><input type="checkbox" checked={!!sel.outlineW} onChange={() => setItem(sel.id, sel.outlineW ? { outlineW: 0 } : { outlineW: 3, outline: '#000' })} /> Outline</label>
            <label style={{ display: 'inline-flex', gap: 6 }}><input type="checkbox" checked={!!(sel.shadow && sel.shadow.on)} onChange={() => setItem(sel.id, { shadow: { on: !(sel.shadow && sel.shadow.on), blur: 8, x: 0, y: 3 } })} /> Shadow</label>
            <label style={{ display: 'inline-flex', gap: 6 }}><input type="checkbox" checked={!!sel.glow} onChange={() => setItem(sel.id, { glow: !sel.glow, glowColor: '#7d5cff' })} /> Glow</label>
            <label style={{ display: 'inline-flex', gap: 6 }}><input type="checkbox" checked={!!sel.bg} onChange={() => setItem(sel.id, { bg: !sel.bg, bgColor: '#000' })} /> Bg</label>
          </div>
          <AdjSlider label="Rotation" value={sel.rot || 0} min={-180} max={180} step={1} onChange={(v) => setItem(sel.id, { rot: v })} onReset={() => setItem(sel.id, { rot: 0 })} format={(v) => `${v}°`} />
        </ZExpando>
      )}
    </div>
  );
}
function ShapesPanel({ add, sel, setItem }) {
  return (
    <div className="ped-panel">
      <div className="ped-grid-2">{SHAPE_DEFS.map((s) => <button key={s.id} className="ped-mini-btn" onClick={() => add('shape', null, s.id)}><span>{s.icon}</span>{s.label}</button>)}</div>
      {!sel || sel.kind !== 'shape' ? <p className="ped-hint">Add a shape, then click it to style fill, stroke, radius and shadow.</p> : (
        <ZExpando label="Shape" icon="🔶">
          <AdjSlider label="Width" value={sel.w} min={20} max={1600} step={4} onChange={(v) => setItem(sel.id, { w: v })} onReset={() => setItem(sel.id, { w: 180 })} />
          <AdjSlider label="Height" value={sel.h} min={20} max={1600} step={4} onChange={(v) => setItem(sel.id, { h: v })} onReset={() => setItem(sel.id, { h: 130 })} />
          <AdjSlider label="Radius" value={sel.radius || 0} min={0} max={200} step={1} onChange={(v) => setItem(sel.id, { radius: v })} onReset={() => setItem(sel.id, { radius: 12 })} />
          <AdjSlider label="Opacity" value={Math.round(sel.opacity * 100)} min={0} max={100} step={1} onChange={(v) => setItem(sel.id, { opacity: v / 100 })} onReset={() => setItem(sel.id, { opacity: 1 })} />
          <label className="ped-exp-row right"><span>Fill</span><input type="color" value={sel.fill || '#7d5cff'} onChange={(e) => setItem(sel.id, { fill: e.target.value })} /></label>
          <div className="ped-ai-row">
            <button className={`btn btn-sm ${sel.strokeW ? 'btn-primary' : ''}`} onClick={() => setItem(sel.id, sel.strokeW ? { strokeW: 0 } : { strokeW: 4, stroke: '#fff' })}>Stroke {sel.strokeW ? '✓' : ''}</button>
            <button className={`btn btn-sm ${sel.grad ? 'btn-primary' : ''}`} onClick={() => setItem(sel.id, { grad: !sel.grad })}>Gradient {sel.grad ? '✓' : ''}</button>
            <button className={`btn btn-sm ${sel.shadowOn ? 'btn-primary' : ''}`} onClick={() => setItem(sel.id, { shadowOn: !sel.shadowOn })}>Shadow {sel.shadowOn ? '✓' : ''}</button>
          </div>
          <AdjSlider label="Rotation" value={sel.rot || 0} min={-180} max={180} step={1} onChange={(v) => setItem(sel.id, { rot: v })} onReset={() => setItem(sel.id, { rot: 0 })} format={(v) => `${v}°`} />
          <AdjSlider label="Border Width" value={sel.strokeW || 0} min={0} max={30} step={1} onChange={(v) => setItem(sel.id, { strokeW: v })} onReset={() => setItem(sel.id, { strokeW: 0 })} />
        </ZExpando>
      )}
    </div>
  );
}
function StickersPanel({ add }) {
  const [cat, setCat] = useState('emoji');
  const [q, setQ] = useState('');
  const list = (STICKER_CATS.find((c) => c.id === cat) || { list: [] }).list.filter((s) => !q || s.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="ped-panel">
      <input className="ped-search" placeholder="Search elements…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ped-seg ped-seg-sm">{STICKER_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => { setCat(c.id); setQ(''); }}>{c.label}</button>)}</div>
      <div className="ped-sticker-grid">{list.map((s) => <button key={s} className="ped-sticker" onClick={() => add('sticker', null, null, s)}>{s}</button>)}</div>
    </div>
  );
}
function PropsPanel({ sel, set, commit }) {
  if (!sel || !set) return <div className="ped-panel ped-empty-right"><span>Select an object on the canvas to edit its properties (opacity, blend mode, lock…).</span></div>;
  return (
    <div className="ped-panel">
      <div className="ped-sel-head">🎯 {sel.kind === 'text' ? 'Text' : sel.kind === 'shape' ? 'Shape' : 'Element'} Properties</div>
      <AdjSlider label="Opacity" value={Math.round((sel.opacity ?? 1) * 100)} min={0} max={100} step={1} onChange={(v) => set({ opacity: v / 100 })} onReset={() => set({ opacity: 1 })} format={(v) => `${v}%`} onCommit={commit} />
      <div className="ped-lbl-row"><span>Blend Mode</span><select value={sel.blend || 'normal'} onChange={(e) => { set({ blend: e.target.value }); commit(); }}>{BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
      <div className="ped-ai-row">
        <button className="btn btn-sm" onClick={() => { set({ visible: false }); commit(); }}>Hide</button>
        <button className="btn btn-sm" onClick={() => { set({ locked: !sel.locked }); commit(); }}>{sel.locked ? '🔒 Unlock' : '🔓 Lock'}</button>
      </div>
    </div>
  );
}
function LayersPanel({ items, setItems, add, selId, setSelId, takeSnap }) {
  const move = (id, dir) => {
    setItems((its) => {
      const i = its.findIndex((x) => x.id === id), j = i + dir;
      if (j < 0 || j >= its.length) return its;
      const next = [...its]; [next[i], next[j]] = [next[j], next[i]]; return next;
    });
    takeSnap('Reorder');
  };
  const dup = (id) => { const it = items.find((x) => x.id === id); if (it) { setItems((a) => [...a, { ...it, id: P.uid(), x: it.x + 24, y: it.y + 24 }]); takeSnap('Duplicate'); } };
  const del = (id) => { if (selId === id) setSelId(null); setItems((a) => a.filter((x) => x.id !== id)); takeSnap('Delete layer'); };
  const ren = (id) => { const it = items.find((x) => x.id === id); const nm = window.prompt('Layer name', it && (it.label || 'Layer')); if (nm) setItems((a) => a.map((x) => x.id === id ? { ...x, label: nm } : x)); };
  const name = (it) => it.label || (it.kind === 'text' ? 'Text' : it.kind === 'shape' ? `Shape · ${it.type}` : it.kind === 'sticker' ? 'Sticker' : 'Layer');
  return (
    <div className="ped-panel">
      <div className="ped-ai-row"><button className="btn btn-sm" onClick={() => add('text')}>+ Text</button><button className="btn btn-sm" onClick={() => add('shape')}>+ Shape</button><button className="btn btn-sm" onClick={() => add('sticker')}>+ Sticker</button></div>
      <div className="ped-layer-list">
        {items.slice().reverse().map((it) => (
          <div key={it.id} className={`ped-layer ${selId === it.id ? 'on' : ''}`} onClick={() => setSelId(it.id)}>
            <button className="ped-layer-eye" onClick={(e) => { e.stopPropagation(); setItems((a) => a.map((x) => x.id === it.id ? { ...x, visible: !x.visible } : x)); takeSnap('Layer visibility'); }}>{it.visible ? '👁' : '○'}</button>
            <span className="ped-layer-name">{name(it)}</span>
            <select value={it.blend || 'normal'} onClick={(e) => e.stopPropagation()} onChange={(e) => { setItems((a) => a.map((x) => x.id === it.id ? { ...x, blend: e.target.value } : x)); takeSnap('Layer blend'); }}>{BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
            <input className="ped-layer-opacity" type="range" min="0" max="100" value={Math.round((it.opacity ?? 1) * 100)} onClick={(e) => e.stopPropagation()} onChange={(e) => setItems((a) => a.map((x) => x.id === it.id ? { ...x, opacity: +e.target.value / 100 } : x))} onPointerUp={() => takeSnap('Layer opacity')} />
            <div className="ped-layer-ops">
              <button title="Up" onClick={(e) => { e.stopPropagation(); move(it.id, 1); }}>↑</button>
              <button title="Down" onClick={(e) => { e.stopPropagation(); move(it.id, -1); }}>↓</button>
              <button title="Duplicate" onClick={(e) => { e.stopPropagation(); dup(it.id); }}>⧉</button>
              <button title="Rename" onClick={(e) => { e.stopPropagation(); ren(it.id); }}>✎</button>
              <button title="Lock" onClick={(e) => { e.stopPropagation(); setItems((a) => a.map((x) => x.id === it.id ? { ...x, locked: !x.locked } : x)); takeSnap('Layer lock'); }}>{it.locked ? '🔒' : '🔓'}</button>
              <button title="Delete" onClick={(e) => { e.stopPropagation(); del(it.id); }}>🗑</button>
            </div>
          </div>
        ))}
        {!items.length && <small className="ped-hint">No layers yet — add text, shapes or stickers.</small>}
      </div>
    </div>
  );
}
function HistoryPanel({ history, histIdx, onJump, onUndoAll }) {
  return (
    <div className="ped-panel">
      <div className="ped-ai-row"><button className="btn btn-sm btn-danger" onClick={onUndoAll}>↩ Undo All Changes</button></div>
      <div className="ped-history">{history.map((h, i) => (
        <button key={`${i}-${h.ts}`} className={`ped-hist ${i === histIdx ? 'on' : ''}`} onClick={() => onJump(i)}>
          <span>{h.label}</span><small>{new Date(h.ts).toLocaleTimeString()}</small>
        </button>
      ))}</div>
    </div>
  );
}
function PresetsPanel({ built, apply, userPresets, save, del, rename, dupe }) {
  return (
    <div className="ped-panel">
      <button className="btn btn-sm btn-primary" onClick={save}>💾 Save Current as Preset</button>
      <strong className="ped-lead">Built-in</strong>
      <div className="ped-grid-2">{built.map((p) => <button key={p.id} className="ped-mini-btn" onClick={() => apply(p)}>{p.name}</button>)}</div>
      {userPresets.length > 0 && (<><strong className="ped-lead">Your Presets</strong><div className="ped-stack">{userPresets.map((p) => (
        <div key={p.id} className="ped-stack-row">
          <button className="ped-preset-app" onClick={() => apply(p)}>{p.name}</button>
          <button className="ped-btn" onClick={() => rename(p.id)}>✎</button>
          <button className="ped-btn" onClick={() => dupe(p.id)}>⧉</button>
          <button className="ped-btn" onClick={() => del(p.id)}>🗑</button>
        </div>
      ))}</div></>)}
    </div>
  );
}
function TimelinePanel({ clips, setClips, segments, playPos, split, speed, setSpeed, selected, setSelected, takeSnap }) {
  return (
    <div className="ped-panel">
      <div className="ped-ai-row">
        <button className="btn btn-sm" onClick={() => split(playPos)}>✂️ Split at playhead</button>
        <button className="btn btn-sm" onClick={() => { takeSnap('Apply speed'); }}>Apply speed</button>
      </div>
      <div className="ped-lbl-row"><span>Global Speed</span><select value={speed} onChange={(e) => setSpeed(+e.target.value)}>{[0.25, 0.5, 1, 1.5, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}</select></div>
      <div className="ped-clips-edit">
        {clips.map((c, i) => (
          <div key={c.id} className={`ped-clip-edit ${selected === c.id ? 'on' : ''}`} onClick={() => setSelected(c.id)}>
            <span>{c.name.slice(0, 14)}</span>
            <label>In <input type="number" step="0.1" value={c.in} onClick={(e) => e.stopPropagation()} onChange={(e) => setClips((cs) => cs.map((x, j) => j === i ? { ...x, in: Math.max(0, Math.min(x.meta.duration - 0.2, +e.target.value)) } : x))} /></label>
            <label>Dur <input type="number" step="0.1" value={Math.round(c.duration * 10) / 10} onClick={(e) => e.stopPropagation()} onChange={(e) => setClips((cs) => cs.map((x, j) => j === i ? { ...x, duration: Math.max(0.2, Math.min(x.meta.duration, +e.target.value)) } : x))} /></label>
            <select value={c.filter} onClick={(e) => e.stopPropagation()} onChange={(e) => setClips((cs) => cs.map((x) => x.id === c.id ? { ...x, filter: e.target.value } : x))}>{['none', 'grayscale', 'sepia', 'invert', 'vintage', 'cinematic', 'warm', 'cool'].map((f) => <option key={f} value={f}>{f}</option>)}</select>
          </div>
        ))}
      </div>
    </div>
  );
}
function AudioPanel({ audio, setAudio, onMusic, wave }) {
  return (
    <div className="ped-panel">
      <div className="ped-wave">{wave.map((v, i) => <i key={i} style={{ height: `${Math.max(6, v * 100)}%` }} />)}</div>
      <AdjSlider label="Volume" value={Math.round(audio.volume * 100)} min={0} max={200} step={1} onChange={(v) => setAudio((a) => ({ ...a, volume: v / 100 }))} onReset={() => setAudio((a) => ({ ...a, volume: 1 }))} format={(v) => `${v}%`} />
      <AdjSlider label="Fade In" value={audio.fadeIn} min={0} max={10} step={0.1} onChange={(v) => setAudio((a) => ({ ...a, fadeIn: v }))} onReset={() => setAudio((a) => ({ ...a, fadeIn: 0 }))} format={(v) => `${v}s`} />
      <AdjSlider label="Fade Out" value={audio.fadeOut} min={0} max={10} step={0.1} onChange={(v) => setAudio((a) => ({ ...a, fadeOut: v }))} onReset={() => setAudio((a) => ({ ...a, fadeOut: 0 }))} format={(v) => `${v}s`} />
      <div className="ped-ai-row">
        <button className={`btn btn-sm ${audio.normalize ? 'btn-primary' : ''}`} onClick={() => setAudio((a) => ({ ...a, normalize: !a.normalize }))}>Normalize {audio.normalize ? '✓' : ''}</button>
        <button className={`btn btn-sm ${audio.mute ? 'btn-primary' : ''}`} onClick={() => setAudio((a) => ({ ...a, mute: !a.mute }))}>Mute {audio.mute ? '✓' : ''}</button>
      </div>
      <button className="btn btn-sm" onClick={() => { setAudio((a) => ({ ...a, normalize: true, volume: 1.3 })); }}>🔊 Voice Enhance</button>
      <label className="btn btn-sm" style={{ marginTop: 8, display: 'inline-flex' }}>🎵 Background Music<input type="file" accept="audio/*" hidden onChange={onMusic} /></label>
    </div>
  );
}
function TransitionPanel({ transitions, setTransitions }) {
  const types = ['fade', 'dissolve', 'slide', 'zoom', 'spin', 'wipe', 'flash', 'blur', 'glitch', 'cinematic'];
  return (
    <div className="ped-panel">
      <p className="ped-hint">Drag a transition onto the timeline's video track (or pick here).</p>
      <div className="ped-grid-2">{types.map((t) => <button key={t} className="ped-mini-btn" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t)} onClick={() => setTransitions((ts) => [...ts, { type: t, dur: 0.5, at: 0 }])}>{t}</button>)}</div>
      <strong className="ped-lead">Applied</strong>
      {transitions.length ? transitions.map((t, i) => (
        <div key={i} className="ped-stack-row">
          <span>{t.type} @ {Math.round(t.at)}s</span>
          <input type="range" min="0.1" max="2" step="0.1" value={t.dur} onChange={(e) => setTransitions((ts) => ts.map((x, j) => j === i ? { ...x, dur: +e.target.value } : x))} />
          <button className="ped-reset" onClick={() => setTransitions((ts) => ts.filter((_, j) => j !== i))}>✕</button>
        </div>
      )) : <small className="ped-hint">No transitions yet.</small>}
    </div>
  );
}
function VideoPropsPanel({ clips, setClips, selected, setSelected, takeSnap }) {
  const c = clips.find((x) => x.id === selected);
  if (!c) return <div className="ped-panel ped-empty-right"><span>Select a clip in the timeline to edit trim, speed, reverse…</span></div>;
  return (
    <div className="ped-panel">
      <div className="ped-sel-head">🎬 Clip Properties</div>
      <label className="ped-exp-row right"><span>Speed</span><select value={c.speed || 1} onChange={(e) => { takeSnap('Clip speed'); setClips((cs) => cs.map((x) => x.id === c.id ? { ...x, speed: +e.target.value } : x)); }}>{[0.25, 0.5, 1, 1.5, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
      <div className="ped-ai-row">
        <button className="btn btn-sm" onClick={() => { takeSnap('Reverse'); setClips((cs) => cs.map((x) => x.id === c.id ? { ...x, reversed: !x.reversed } : x)); }}>↪ Reverse {c.reversed ? '✓' : ''}</button>
        <button className="btn btn-sm" onClick={() => { takeSnap('Duplicate clip'); setClips((cs) => [...cs, { ...c, id: P.uid(), duration: c.duration }]); }}>⧉ Duplicate</button>
      </div>
    </div>
  );
}
function VideoTimeline({ clips, segments, playPos, setPlayPos, transitions, music, wave, zoom, total, onDropTransition }) {
  const xf = music && music.trans || 0;
  return (
    <div className="ped-timeline-wrap">
      <div className="ped-tl-lane"><span>V1</span><div className="ped-tl-track" onDrop={(e) => { e.preventDefault(); const t = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text'); if (t && onDropTransition) onDropTransition(t); }} onDragOver={(e) => e.preventDefault()}>
        {segments.map((s) => (
          <div key={s.id} className={`ped-tl-clip ${s.kind === 'image' ? 'img' : ''}`} style={{ left: s.abs * zoom, width: Math.max(16, s.dur * zoom) }} onClick={() => setPlayPos(s.abs + 0.01)}>
            <span>{s.kind === 'image' ? '🖼' : '🎬'} {s.name.replace(/\.[^.]+$/, '').slice(0, 8)}</span>
          </div>
        ))}
        {transitions.map((t, i) => <b key={i} className="ped-tl-x" style={{ left: t.at * zoom }} title={t.type}>{t.type}</b>)}
        <div className="ped-tl-playhead" style={{ left: playPos * zoom }} />
      </div></div>
      <div className="ped-tl-lane"><span>A</span><div className="ped-tl-track ped-tl-audio">{wave.map((v, i) => <i key={i} style={{ height: `${Math.max(5, v * 100)}%` }} />)}</div></div>
      <div className="ped-tl-lane"><span>M</span><div className="ped-tl-track">{music ? <div className="ped-tl-music" style={{ width: Math.max(40, total * zoom) }}>🎵 music</div> : <small className="ped-tl-hint">Add music in Audio panel</small>}</div></div>
      <input className="ped-tl-scrub" type="range" min="0" max={total || 1} step="0.05" value={playPos} onChange={(e) => setPlayPos(+e.target.value)} />
    </div>
  );
}