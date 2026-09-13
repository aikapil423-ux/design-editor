import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabricMod from 'fabric';
import { useApp } from '../lib/store';
import { Btn, Chip, EmptyState, Field, Modal, Slider } from './common';

const { Canvas, IText, Image, Rect, filters } = fabricMod;

const TEMPLATES = [
  { id: 'ig', label: 'IG Post', w: 1080, h: 1080 },
  { id: 'igst', label: 'Story', w: 1080, h: 1920 },
  { id: 'fb', label: 'Facebook', w: 1200, h: 675 },
  { id: 'yt', label: 'YouTube', w: 1920, h: 1080 },
  { id: 'tt', label: 'TikTok', w: 1080, h: 1920 },
  { id: 'poster', label: 'Poster', w: 1080, h: 1920 },
];

const PRESETS = [
  { id: 'none', label: 'Original' },
  { id: 'mono', label: 'B&W' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'invert', label: 'Invert' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'brownie', label: 'Brownie' },
  { id: 'kodachrome', label: 'Kodak' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'pixelate', label: 'Pixelate' },
  { id: 'noise', label: 'Film Noise' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
];

const STICKERS = ['❤️', '⭐', '🔥', '💯', '🎉', '💪', '✅', '❌', '⚠️', '🎯', '💎', '👑', '🌈', '🦄', '🍕', '🍔', '🎧', '👾'];

const FONTS = ['Arial', 'Georgia', 'Impact', 'Courier New', 'Verdana', 'Comic Sans MS', 'Trebuchet MS'];

const tools = {
  select: { icon: '↖', label: 'Select' },
  move: { icon: '⬚', label: 'Move' },
  crop: { icon: '✂️', label: 'Crop' },
  text: { icon: 'T', label: 'Text' },
  sticker: { icon: '😀', label: 'Sticker' },
  erase: { icon: '🧽', label: 'Erase' },
  draw: { icon: '✏️', label: 'Draw' },
};

export default function PhotoEditor({ params }) {
  const { navigate, notify, upsertProject } = useApp();
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const crop = useRef(null);
  const drawRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState(params.src || '');
  const [name, setName] = useState(params.name || `Canvas ${Date.now() % 1000}`);
  const [tool, setTool] = useState(params.tool || 'select');
  const [template, setTemplate] = useState(() => TEMPLATES.find((t) => t.id === (params.templateId || '')) || TEMPLATES[0]);
  const [preset, setPreset] = useState('none');
  const [adjust, setAdjust] = useState({ brightness: 0, contrast: 0, saturation: 0, vibrance: 0, gamma: 0, hue: 0, blur: 0, noise: 0 });
  const [layers, setLayers] = useState([]);
  const [cropRect, setCropRect] = useState(null);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeDims, setResizeDims] = useState({ w: 1080, h: 1080 });
  const [busy, setBusy] = useState(false);
  const didAction = useRef(false);

  const firstImage = () => fabricRef.current?.getObjects().find((o) => o.type === 'image');

  const snapshot = (label) => {
    const c = fabricRef.current;
    if (!c) return;
    undoStack.current.push(c.toJSON());
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  };

  const undo = () => {
    const c = fabricRef.current;
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(c.toJSON());
    c.loadFromJSON(prev).then(() => {
      c.requestRenderAll();
      refreshLayers();
    });
  };

  const redo = () => {
    const c = fabricRef.current;
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(c.toJSON());
    c.loadFromJSON(next).then(() => {
      c.requestRenderAll();
      refreshLayers();
    });
  };

  const refreshLayers = () => setLayers([...fabricRef.current?.getObjects()].reverse());

  const loadImageObject = useCallback((dataUrl, opts = {}) => {
    const c = fabricRef.current;
    if (!c) return;
    Image.fromURL(dataUrl).then((img) => {
      const maxW = c.width - 80;
      const maxH = c.height - 80;
      const scale = Math.min(1, maxW / (img.width || 1), maxH / (img.height || 1));
      img.scale(scale);
      img.set({ left: (c.width - img.width * scale) / 2, top: (c.height - img.height * scale) / 2, name: opts.name || 'Image' });
      Object.keys(opts).forEach((k) => k !== 'name' && img.set(k, opts[k]));
      c.discardActiveObject();
      c.add(img);
      c.setActiveObject(img);
      c.requestRenderAll();
      snapshot('image');
      refreshLayers();
    });
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return;
    const c = new Canvas(canvasRef.current, {
      width: Math.min(template.w, 1200),
      height: Math.min(template.h, 900),
      backgroundColor: '#12121a',
      preserveObjectStacking: true,
      selection: true,
    });
    fabricRef.current = c;
    c.on('object:modified', () => snapshot('edit'));
    c.on('object:added', () => refreshLayers());
    c.on('object:removed', () => { snapshot('remove'); refreshLayers(); });
    c.on('selection:created', refreshLayers);
    c.on('selection:updated', refreshLayers);
    c.on('selection:cleared', refreshLayers);
    setReady(true);
    return () => {
      c.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (src && (fabricRef.current instanceof fabricMod.Canvas)) {
      if (fabricRef.current.getObjects().length === 0) {
        loadImageObject(src);
      }
    }
  }, [src, ready]);

  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    c.setDimensions({ width: Math.min(template.w, 1200), height: Math.min(template.h, 900) });
    c.requestRenderAll();
  }, [template]);

  useEffect(() => {
    if (!ready || didAction.current || !src) return;
    if (fabricRef.current && fabricRef.current.getObjects().length === 0) return;
    didAction.current = true;
    if (params.action === 'bg') setTimeout(removeBg, 250);
    else if (params.action === 'enhance') setTimeout(enhance, 250);
    else if (params.action === 'upscale') setTimeout(upscale, 250);
  }, [ready, src]);

  const applyAdjustAndFilter = useCallback(() => {
    const img = firstImage();
    const c = fabricRef.current;
    if (!img || !c) return;
    const arr = [];
    const a = adjust;
    if (preset === 'mono') arr.push(new filters.Grayscale());
    if (preset === 'sepia') arr.push(new filters.Sepia());
    if (preset === 'invert') arr.push(new filters.Invert());
    if (preset === 'vintage') arr.push(new filters.Vintage());
    if (preset === 'brownie') arr.push(new filters.Brownie());
    if (preset === 'kodachrome') arr.push(new filters.Kodachrome());
    if (preset === 'polaroid') arr.push(new filters.Polaroid());
    if (preset === 'pixelate') arr.push(new filters.Pixelate({ blocksize: 8 }));
    if (preset === 'noise') arr.push(new filters.Noise({ noise: 60 }));
    if (preset === 'warm') arr.push(new filters.ColorMatrix({ matrix: [1, 0, 0, 0, 0.08, 0, 1, 0, 0, 0.04, 0, 0, 1, 0, -0.08, 0, 0, 0, 1, 0] }));
    if (preset === 'cool') arr.push(new filters.ColorMatrix({ matrix: [1, 0, 0, 0, -0.08, 0, 1, 0, 0, -0.02, 0, 0, 1, 0, 0.12, 0, 0, 0, 1, 0] }));
    if (a.brightness) arr.push(new filters.Brightness({ brightness: a.brightness / 100 }));
    if (a.contrast) arr.push(new filters.Contrast({ contrast: a.contrast / 100 }));
    if (a.saturation) arr.push(new filters.Saturation({ saturation: a.saturation / 100 }));
    if (a.vibrance) arr.push(new filters.Vibrance({ vibrance: a.vibrance / 100 }));
    if (a.hue) arr.push(new filters.HueRotation({ rotation: a.hue / 360 }));
    if (a.blur) arr.push(new filters.Blur({ blur: a.blur / 50 }));
    if (a.noise) arr.push(new filters.Noise({ noise: a.noise * 1.2 }));
    img.filters = arr.filter(Boolean);
    img.applyFilters();
    c.requestRenderAll();
  }, [adjust, preset]);

  useEffect(() => { applyAdjustAndFilter(); }, [applyAdjustAndFilter]);

  const getActiveObject = () => fabricRef.current?.getActiveObject();

  const addFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadImageObject(reader.result, { name: f.name });
      notify('Image added to canvas');
    };
    reader.readAsDataURL(f);
  };

  const addTextObj = () => {
    const c = fabricRef.current;
    const it = new IText(params.text || 'Double click to edit', {
      left: c.width / 2 - 100,
      top: c.height / 2 - 20,
      fontSize: 48,
      fill: '#ffffff',
      fontFamily: 'Arial',
      stroke: 'rgba(0,0,0,0.4)',
      strokeWidth: 1,
      name: 'Text',
    });
    c.add(it);
    c.setActiveObject(it);
    c.requestRenderAll();
    snapshot('text');
    refreshLayers();
  };

  const addSticker = (emoji) => {
    const c = fabricRef.current;
    const it = new IText(emoji, { left: 120 + Math.random() * 200, top: 120 + Math.random() * 200, fontSize: 72, name: 'Sticker' });
    c.add(it);
    c.setActiveObject(it);
    c.requestRenderAll();
    snapshot('sticker');
    refreshLayers();
  };

  const rotate = () => {
    const img = getActiveObject() || firstImage();
    if (!img) return;
    img.rotate((img.angle || 0) + 90);
    img.setCoords();
    c_request();
    snapshot('rotate');
  };

  const flip = (axis) => {
    const img = getActiveObject() || firstImage();
    if (!img) return;
    if (axis === 'h') img.set('flipX', !img.flipX);
    else img.set('flipY', !img.flipY);
    c_request();
    snapshot('flip');
  };

  const c_request = () => fabricRef.current && fabricRef.current.requestRenderAll();

  const enterCrop = () => {
    if (tool === 'crop') { setTool('select'); setCropRect(null); return; }
    setTool('crop');
    const c = fabricRef.current;
    const cw = c.width, ch = c.height;
    setCropRect({ x: cw * 0.15, y: ch * 0.15, w: cw * 0.7, h: ch * 0.7 });
  };

  const applyCrop = () => {
    const c = fabricRef.current;
    const r = cropRect;
    if (!r || r.w < 20 || r.h < 20) return;
    const url = c.toDataURL({ left: r.x, top: r.y, width: r.w, height: r.h, format: 'png' });
    c.clear();
    setCropRect(null);
    setTool('select');
    loadImageObject(url, { name: 'Cropped' });
    notify('Cropped ✂️');
  };

  const removeBg = () => {
    const c = fabricRef.current;
    if (!c || !firstImage()) { notify('Add an image first', 'warn'); return; }
    setBusy(true);
    setTimeout(() => {
      const el = c.toCanvasElement(1);
      const ctx = el.getContext('2d');
      const d = ctx.getImageData(0, 0, el.width, el.height);
      const data = d.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const bri = (r + g + b) / 3;
        if (bri > 205 || (bri > 150 && r > g && r > b)) data[i + 3] = 0;
      }
      ctx.putImageData(d, 0, 0);
      c.clear();
      loadImageObject(el.toDataURL('image/png'), { name: 'BG Removed' });
      setBusy(false);
      notify('Background removed', 'success');
    }, 30);
  };

  const enhance = () => {
    const c = fabricRef.current;
    if (!firstImage()) return;
    setBusy(true);
    setTimeout(() => {
      const el = c.toCanvasElement(1);
      const ctx = el.getContext('2d');
      const d = ctx.getImageData(0, 0, el.width, el.height);
      const data = d.data;
      const px = d.width * d.height;
      let rSum = 0, gSum = 0, bSum = 0;
      for (let i = 0; i < data.length; i += 4) { rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; }
      const rf = 128 / (rSum / px), gf = 128 / (gSum / px), bf = 128 / (bSum / px);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * rf);
        data[i + 1] = Math.min(255, data[i + 1] * gf);
        data[i + 2] = Math.min(255, data[i + 2] * bf);
      }
      ctx.putImageData(d, 0, 0);
      c.clear();
      loadImageObject(el.toDataURL('image/png'), { name: 'Enhanced' });
      setBusy(false);
      notify('Auto-enhanced ✨');
    }, 30);
  };

  const upscale = () => {
    const c = fabricRef.current;
    if (!firstImage()) return;
    setBusy(true);
    setTimeout(() => {
      const el = c.toCanvasElement(2);
      c.clear();
      loadImageObject(el.toDataURL('image/png'), { name: '4K Upscaled' });
      setBusy(false);
      notify('Upscaled 2×');
    }, 30);
  };

  const saveProject = () => {
    const url = fabricRef.current.toDataURL({ format: 'png' });
    upsertProject({ id: Date.now().toString(36), name, type: 'photo', res: `${template.w}x${template.h}`, duration: '', thumbnail: url, createdAt: Date.now(), modifiedAt: Date.now(), favorite: false, inTrash: false });
    notify('Project saved to My Projects');
    navigate('projects');
  };

  const openExportModal = () => setResizeOpen(true);

  const dupeActive = async () => {
    const obj = getActiveObject();
    if (!obj) return;
    const copy = await obj.clone();
    copy.set({ left: obj.left + 24, top: obj.top + 24 });
    fabricRef.current.add(copy);
    fabricRef.current.setActiveObject(copy);
    c_request();
    refreshLayers();
    snapshot('duplicate');
  };

  const deleteActive = () => {
    const c = fabricRef.current;
    const obj = getActiveObject();
    if (obj) { c.remove(obj); refreshLayers(); }
  };

  const layerAction = async (obj, act) => {
    const c = fabricRef.current;
    const i = c.getObjects().indexOf(obj);
    if (act === 'up' && i > 0) { c.bringForward(obj); }
    if (act === 'down' && i < c.getObjects().length - 1) { c.sendBackwards(obj); }
    if (act === 'front') { c.bringToFront(obj); }
    if (act === 'back') { c.sendToBack(obj); }
    if (act === 'dupe') {
      const copy = await obj.clone();
      copy.set({ left: obj.left + 24, top: obj.top + 24 });
      c.add(copy);
    }
    if (act === 'del') c.remove(obj);
    if (act === 'toggle') obj.set('visible', !obj.visible);
    c.requestRenderAll();
    refreshLayers();
    snapshot('layer');
  };

  const onLayerOpacity = (obj, v) => {
    obj.set('opacity', v / 100);
    c_request();
  };

  return (
    <div className="ws photo-ws">
      <div className="ws-header">
        <div className="name-edit">
          <h1>🖼 Photo Editor</h1>
          <input className="inline-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ws-actions">
          <button className="btn" onClick={undo} title="Undo (Ctrl+Z)">↩ Undo</button>
          <button className="btn" onClick={redo} title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
          <button className="btn" onClick={saveProject}>💾 Save</button>
          <Btn className="btn-primary" onClick={openExportModal}>⬇ Export</Btn>
        </div>
      </div>

      <div className="editor-layout">
        <aside className="panel tool-col">
          <div className="panel-head"><h3>Tools</h3></div>
          <div className="tool-grid">
            {Object.entries(tools).map(([id, t]) => id !== 'draw' && (
              <button key={id} className={`tool-btn ${tool === id ? 'on' : ''}`} onClick={() => setTool(tool === id ? 'select' : id)} title={t.label}>
                <span className="tool-icon">{t.icon}</span>
                <small>{t.label}</small>
              </button>
            ))}
          </div>
          <div className="panel-head"><h3>Upload</h3></div>
          <label className="btn btn-ghost drop-trigger">
            📂 Browse files
            <input type="file" accept="image/*" multiple hidden onChange={addFile} />
          </label>
          <div className="panel-head"><h3>Add</h3></div>
          <Btn className="btn-ghost" onClick={addTextObj}>+ Text</Btn>
          <div className="sticker-row">
            {STICKERS.map((s) => (
              <button key={s} onClick={() => addSticker(s)}>{s}</button>
            ))}
          </div>
        </aside>

        <div className="stage-wrapper">
          <div
            ref={wrapperRef}
            className={`stage ${tool === 'crop' ? 'cropping' : ''} ${tool === 'erase' ? 'erasing' : ''}`}
            onPointerDown={(e) => {
              if (tool !== 'crop' && tool !== 'erase') return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = Math.round(((e.clientX - rect.left) / rect.width) * fabricRef.current.width * (canvasRef.current.width ? 1 : 1));
              const y = Math.round(((e.clientY - rect.top) / rect.height) * fabricRef.current.height);
              if (tool === 'crop') {
                const drag = (ev) => {
                  const rx = Math.round(((ev.clientX - rect.left) / rect.width) * fabricRef.current.width);
                  const ry = Math.round(((ev.clientY - rect.top) / rect.height) * fabricRef.current.height);
                  setCropRect({ x: Math.min(x, rx), y: Math.min(y, ry), w: Math.abs(rx - x), h: Math.abs(ry - y) });
                };
                const up = () => { window.removeEventListener('pointermove', drag); window.removeEventListener('pointerup', up); };
                window.addEventListener('pointermove', drag);
                window.addEventListener('pointerup', up);
              } else if (tool === 'erase') {
                const c = fabricRef.current;
                const dt = crop.current || (crop.current = { pts: [] });
                dt.pts = [];
                const drag = (ev) => {
                  const rx = Math.round(((ev.clientX - rect.left) / rect.width) * c.width);
                  const ry = Math.round(((ev.clientY - rect.top) / rect.height) * c.height);
                  dt.pts.push({ x: rx, y: ry, r: 26 });
                };
                const up = () => {
                  window.removeEventListener('pointermove', drag);
                  window.removeEventListener('pointerup', up);
                  if (dt.pts.length) {
                    const el = c.toCanvasElement(1);
                    const ctx = el.getContext('2d');
                    const d = ctx.getImageData(0, 0, el.width, el.height);
                    const data = d.data;
                    dt.pts.forEach((p) => {
                      for (let y = p.y - p.r; y < p.y + p.r; y++) {
                        for (let x = p.x - p.r; x < p.x + p.r; x++) {
                          if (x < 0 || y < 0 || x >= el.width || y >= el.height) continue;
                          if ((x - p.x) ** 2 + (y - p.y) ** 2 <= p.r * p.r) data[(y * el.width + x) * 4 + 3] = 0;
                        }
                      }
                    });
                    ctx.putImageData(d, 0, 0);
                    dt.pts = [];
                    c.clear();
                    loadImageObject(el.toDataURL('image/png'), { name: 'Object removed' });
                  }
                };
                window.addEventListener('pointermove', drag);
                window.addEventListener('pointerup', up);
              }
            }}
            style={{ touchAction: tool === 'crop' || tool === 'erase' ? 'none' : 'auto' }}
          >
            <canvas ref={canvasRef} />
            {tool === 'crop' && cropRect && (
              <div
                className="crop-box"
                style={{
                  left: (cropRect.x / fabricRef.current?.width) * 100 + '%',
                  top: (cropRect.y / fabricRef.current?.height) * 100 + '%',
                  width: (cropRect.w / fabricRef.current?.width) * 100 + '%',
                  height: (cropRect.h / fabricRef.current?.height) * 100 + '%',
                }}
              >
                <div className="crop-grid" />
              </div>
            )}
          </div>
          {tool === 'crop' && cropRect && (
            <div className="stage-bar">
              <Btn onClick={applyCrop}>✔ Apply Crop</Btn>
              <Btn onClick={() => { setCropRect(null); setTool('select'); }}>✕ Cancel</Btn>
            </div>
          )}
          {tool === 'erase' && <div className="stage-bar"><small>Drag on the image to erase objects. Right-click canvas to exit.</small></div>}

          <div className="canvas-toolbar">
            <button className="icon-btn" onClick={() => { if (tool === 'erase') setTool('select'); }} title="Select/move">⬚</button>
            <button className="icon-btn" onClick={enterCrop} title="Crop">✂️</button>
            <button className="icon-btn" onClick={rotate} title="Rotate +90°">↻</button>
            <button className="icon-btn" onClick={() => flip('h')} title="Flip horizontal">⇋</button>
            <button className="icon-btn" onClick={() => flip('v')} title="Flip vertical">↕</button>
            <button className="icon-btn" onClick={() => setTool('erase')} title="Remove object">🧽</button>
          </div>
        </div>

        <aside className="panel props-col">
          <div className="panel-head"><h3>Template</h3></div>
          <div className="tmpl-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className={template.id === t.id ? 'tmpl on' : 'tmpl'} onClick={() => setTemplate(t)}>
                {t.label}<br /><small>{t.w}×{t.h}</small>
              </button>
            ))}
          </div>

          <div className="panel-head"><h3>Filters</h3></div>
          <div className="chip-wrap">
            {PRESETS.map((p) => (
              <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</Chip>
            ))}
          </div>

          <div className="panel-head"><h3>Adjust</h3></div>
          {Object.keys(adjust).map((k) => (
            <Slider key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} min={k === 'gamma' ? 20 : -100} max={k === 'gamma' ? 200 : 100} value={adjust[k]} onChange={(v) => setAdjust((a) => ({ ...a, [k]: v === 0 ? 0 : v }))} />
          ))}

          <div className="panel-head"><h3>AI Tools</h3></div>
          <div className="chip-wrap">
            <Btn className="btn-ai btn-sm" onClick={removeBg} disabled={busy}>🧹 Remove BG</Btn>
            <Btn className="btn-ai btn-sm" onClick={enhance} disabled={busy}>✨ Enhance</Btn>
            <Btn className="btn-ai btn-sm" onClick={upscale} disabled={busy}>🚀 Upscale</Btn>
            <Btn className="btn-sm" onClick={() => setTool('erase')}>🧽 Object Grab</Btn>
          </div>

          <div className="panel-head"><h3>Transform</h3></div>
          <div className="transform-row">
            <button className="icon-btn" onClick={rotate}>↻</button>
            <button className="icon-btn" onClick={() => flip('h')}>⇋</button>
            <button className="icon-btn" onClick={() => flip('v')}>↕</button>
            <button className="btn btn-sm" onClick={() => setResizeOpen(true)}>Resize</button>
          </div>

          <div className="panel-head"><h3>Layers ({layers.length})</h3></div>
          <div className="layers-list">
            {layers.map((o, i) => (
              <div key={o.id} className={`layer-row ${o === fabricRef.current?.getActiveObject() ? 'act' : ''}`} onClick={() => { fabricRef.current.setActiveObject(o); c_request(); refreshLayers(); }}>
                <span className="layer-eye" onClick={(e) => { e.stopPropagation(); layerAction(o, 'toggle'); }}>{o.visible ? '👁' : '🚫'}</span>
                <input className="layer-name" value={o.name || o.type} onChange={(e) => { o.set('name', e.target.value); c_request(); }} onClick={(e) => e.stopPropagation()} />
                <span className="layer-opacity">{Math.round(o.opacity * 100)}</span>
                <input className="mini-range" type="range" min="0" max="100" value={Math.round(o.opacity * 100)} onChange={(e) => onLayerOpacity(o, +e.target.value)} />
                <span className="layer-moves">
                  <button onClick={(e) => { e.stopPropagation(); layerAction(o, 'up'); }}>↑</button>
                  <button onClick={(e) => { e.stopPropagation(); layerAction(o, 'down'); }}>↓</button>
                  <button onClick={(e) => { e.stopPropagation(); layerAction(o, 'dupe'); }}>＋</button>
                  <button onClick={(e) => { e.stopPropagation(); layerAction(o, 'del'); }}>🗑</button>
                </span>
              </div>
            ))}
            {!layers.length && <EmptyState icon="🖼" title="No layers" sub="Add an image, text or sticker" />}
          </div>
        </aside>
      </div>

      <Modal open={resizeOpen} onClose={() => setResizeOpen(false)} title="Export Photo" width={480}>
        <div className="ctl-grid">
          <Field label="Format">
            <select id="expFmt" defaultValue="png">
              {['png', 'jpg', 'webp'].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
            </select>
          </Field>
          <Field label="Resolution">
            <select id="expScale" defaultValue="1">
              <option value="0.5">50%</option>
              <option value="1">100%</option>
              <option value="2">200%</option>
            </select>
          </Field>
        </div>
        <Field label="Width / Height">
          <div className="dims-row">
            <input type="number" value={resizeDims.w} onChange={(e) => setResizeDims({ ...resizeDims, w: +e.target.value })} />
            <span>×</span>
            <input type="number" value={resizeDims.h} onChange={(e) => setResizeDims({ ...resizeDims, h: +e.target.value })} />
          </div>
        </Field>
        <div className="gen-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => {
            const fmt = document.getElementById('expFmt').value;
            const mult = +document.getElementById('expScale').value;
            const url = fabricRef.current.toDataURL({ format: fmt === 'jpg' ? 'jpeg' : fmt, multiplier: mult, quality: 0.92 });
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}.${fmt}`;
            a.click();
            notify(`${fmt.toUpperCase()} exported`);
            setResizeOpen(false);
          }}>⬇ Export Now</button>
          <button className="btn btn-primary" onClick={() => {
            const c = fabricRef.current;
            const url = c.toDataURL({ format: 'png' });
            upsertProject({ id: Date.now().toString(36), name, type: 'photo', res: `${resizeDims.w}x${resizeDims.h}`, duration: '', thumbnail: url, createdAt: Date.now(), modifiedAt: Date.now(), favorite: false, inTrash: false });
            notify('Saved to My Projects');
            navigate('projects');
            setResizeOpen(false);
          }}>💾 Save Project</button>
          <button className="btn" onClick={() => setResizeOpen(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}