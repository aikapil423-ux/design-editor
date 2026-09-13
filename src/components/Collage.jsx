import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { Btn, Chip, EmptyState, Field, Slider } from './common';

const LAYOUTS = [
  { id: 'grid', label: 'Grid' },
  { id: 'masonry', label: 'Masonry' },
  { id: 'freeform', label: 'Freeform' },
  { id: 'pair', label: 'Before/After' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'magazine', label: 'Magazine' },
  { id: 'story', label: 'Story' },
  { id: 'pinterest', label: 'Pinterest' },
];

const BGS = ['#0d0d1a', '#1b1b2f', '#2b2b3f', '#101018', 'linear-gradient(135deg,#e94560,#0f3460)', 'linear-gradient(135deg,#11998e,#38ef7d)', 'linear-gradient(135deg,#8a2be2,#ff6a00)'];

const RATIOS = [
  { id: '1:1', w: 1200, h: 1200 }, { id: '4:5', w: 1200, h: 1500 }, { id: '9:16', w: 1080, h: 1920 }, { id: '16:9', w: 1920, h: 1080 },
];

export default function Collage({ params }) {
  const { notify, upsertProject, navigate } = useApp();
  const [images, setImages] = useState([]);
  const [layout, setLayout] = useState('grid');
  const [ratio, setRatio] = useState(RATIOS[0]);
  const [bg, setBg] = useState(BGS[0]);
  const [border, setBorder] = useState(8);
  const [radius, setRadius] = useState(16);
  const [spacing, setSpacing] = useState(14);
  const [shadow, setShadow] = useState(true);
  const [text, setText] = useState('');
  const [sticker, setSticker] = useState('');
  const renderRef = useRef(null);
  const [rendered, setRendered] = useState('');

  const onFiles = (e) => {
    const files = Array.from(e.target.files);
    const list = files.map((f, i) => ({ id: i + Math.random(), file: f, name: f.name, img: null }));
    setImages((prev) => [...prev, ...list]);
    files.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => setImages((prev) => prev.map((x) => (x.file === f ? { ...x, img } : x)));
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  };

  const cells = useMemo(() => {
    const n = images.length;
    if (!n) return [];
    const g = (list) => list.map((c) => ({ ...c }));
    switch (layout) {
      case 'pair':
        return g([{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }]);
      case 'story':
        return g(n === 1 ? [{ x: 0, y: 0, w: 1, h: 1 }] : n === 2 ? [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] : [{ x: 0, y: 0, w: 1, h: 0.6 }, { x: 0, y: 0.6, w: 0.5, h: 0.4 }, { x: 0.5, y: 0.6, w: 0.5, h: 0.4 }]);
      case 'magazine':
        return g([{ x: 0, y: 0, w: 0.6, h: 1 }, { x: 0.6, y: 0, w: 0.4, h: 0.5 }, { x: 0.6, y: 0.5, w: 0.4, h: 0.5 }]);
      case 'freeform':
        return images.map((_, i) => {
          const cols = i % 3;
          const rowsL = Math.floor(i / 3);
          return { x: cols * 0.34, y: rowsL * 0.34, w: 0.32, h: 0.32 };
        });
      case 'masonry':
        return images.map((_, i) => ({ x: (i % 2) * 0.5, y: Math.floor(i / 2) * 0.5, w: 0.5, h: 0.5 }));
      case 'pinterest':
        return images.map((_, i) => ({ x: (i % 3) / 3, y: Math.floor(i / 3) / 2, w: 1 / 3 - 0.005, h: 0.5 - 0.005 }));
      case 'polaroid':
        return images.map((_, i) => ({ x: 0.06 + (i % 2) * 0.42, y: 0.08 + Math.floor(i / 2) * 0.44, w: 0.36, h: 0.36 }));
      default:
        return images.map((_, i) => {
          const cols = n === 2 ? 2 : n === 3 || n === 6 ? 3 : n === 4 || n === 8 ? 4 : n === 5 ? 3 : 4;
          const rows = Math.ceil(n / cols);
          return { x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows };
        });
    }
  }, [images, layout]);

  const draw = () => {
    const canvas = document.createElement('canvas');
    canvas.width = ratio.w;
    canvas.height = ratio.h;
    const ctx = canvas.getContext('2d');
    if (bg.startsWith('linear')) {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, bg.match(/#[0-9a-f]{6}/gi)[0]);
      g.addColorStop(1, bg.match(/#[0-9a-f]{6}/gi)[1] || bg.match(/#[0-9a-f]{6}/gi)[0]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 10;
    }
    const cellBox = { x: spacing, y: spacing, w: canvas.width - spacing * 2, h: canvas.height - spacing * 2 };
    cells.forEach((cell, i) => {
      const img = images[i]?.img;
      if (!img) return;
      const cx = cellBox.x + cell.x * cellBox.w;
      const cy = cellBox.y + cell.y * cellBox.h;
      const cw = cell.w * cellBox.w - spacing / 2;
      const ch = cell.h * cellBox.h - spacing / 2;
      const rad = Math.min(radius, cw / 2, ch / 2);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, rad);
      ctx.clip();
      const scale = Math.max(cw / img.width, ch / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, cx - (dw - cw) / 2, cy - (dh - ch) / 2, dw, dh);
      ctx.restore();
    });
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (shadow) {
      cells.forEach((cell, i) => {
        const img = images[i]?.img;
        if (!img) return;
        const cx = cellBox.x + cell.x * cellBox.w;
        const cy = cellBox.y + cell.y * cellBox.h;
        const cw = cell.w * cellBox.w - spacing / 2;
        const ch = cell.h * cellBox.h - spacing / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = border / 3;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, ch, Math.min(radius, cw / 2, ch / 2));
        ctx.stroke();
      });
    }
    if (text) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(canvas.width * 0.045)}px 'Segoe UI'`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 12;
      ctx.fillText(text, canvas.width / 2, canvas.height - 48);
      ctx.shadowBlur = 0;
    }
    if (sticker) {
      ctx.font = `${Math.round(canvas.width * 0.08)}px serif`;
      ctx.textAlign = 'right';
      ctx.fillText(sticker, canvas.width - 40, 80);
    }
    setRendered(canvas.toDataURL('image/png'));
    return canvas;
  };

  useEffect(() => { if (images.length) draw(); }, [images, layout, ratio, bg, border, radius, spacing, shadow, text, sticker]);

  const exportPng = () => {
    if (!images.length) return;
    const canvas = draw();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'collage.png';
    a.click();
    notify('Collage exported PNG');
  };

  const saveAsVideo = async () => {
    if (!images.length) return;
    notify('Building collage video…', 'info');
    const canvas = draw();
    const dataUrl = canvas.toDataURL('image/png');
    const { imageToVideo, filterFor } = await import('../lib/videoUtils');
    const url = await imageToVideo({ dataUrl, width: ratio.w, height: ratio.h, duration: 6 });
    notify('Collage video ready ✨');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'collage.mp4';
    a.click();
  };

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>🧩 Collage Studio</h1><p>Combine multiple images into a polished design</p></div>
        <div className="ws-actions">
          <Btn className="btn" onClick={() => { if (!images.length) return; upsertProject({ id: Date.now().toString(36), name: `Collage ${Date.now() % 1000}`, type: 'collage', res: `${ratio.w}x${ratio.h}`, duration: '', thumbnail: rendered, createdAt: Date.now(), modifiedAt: Date.now(), favorite: false, inTrash: false }); notify('Collage saved'); navigate('projects'); }}>💾 Save</Btn>
          <Btn className="btn-primary" onClick={exportPng} disabled={!images.length}>⬇ Export</Btn>
          <Btn className="btn-ai" onClick={saveAsVideo} disabled={!images.length}>🎬 To Video</Btn>
        </div>
      </div>

      <div className="ws-grid split">
        <div className="collage-controls panel">
          <div className="panel-head"><h3>Photos</h3></div>
          <label className="btn btn-ghost drop-trigger">
            + Add photos
            <input type="file" accept="image/*" multiple hidden onChange={onFiles} />
          </label>
          <div className="thumb-strip">
            {images.map((x, i) => (
              <div key={x.id} className="thumb-chip">
                {x.img && <img src={x.img.src} alt={x.name} />}
                <button className="remove-x" onClick={(e) => { e.stopPropagation(); setImages((im) => im.filter((_, j) => j !== i)); }}>✕</button>
              </div>
            ))}
          </div>

          <div className="panel-head"><h3>Layout</h3></div>
          <div className="chip-wrap">{LAYOUTS.map((l) => <Chip key={l.id} active={layout === l.id} onClick={() => setLayout(l.id)}>{l.label}</Chip>)}</div>

          <div className="panel-head"><h3>Spacing & Corners</h3></div>
          <Slider label="Border" min={0} max={40} value={border} onChange={setBorder} />
          <Slider label="Radius" min={0} max={80} value={radius} onChange={setRadius} />
          <Slider label="Spacing" min={0} max={60} value={spacing} onChange={setSpacing} />
          <label className="toggle-row"><input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} /> Shadows</label>

          <div className="panel-head"><h3>Background</h3></div>
          <div className="bg-row">{BGS.map((b) => <button key={b} className={bg === b ? 'on' : ''} style={{ background: b }} onClick={() => { if (b.startsWith('linear')) setBg(b); else setBg(b); }} />)}</div>

          <Field label="Caption"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a caption…" /></Field>
          <Field label="Sticker"><input value={sticker} onChange={(e) => setSticker(e.target.value)} placeholder="Any emoji" maxLength={2} /></Field>
        </div>

        <div className="collage-stage">
          <div className="tmpl-row">
            {RATIOS.map((r) => <Chip key={r.id} active={ratio.id === r.id} onClick={() => setRatio(r)}>{r.id}</Chip>)}
          </div>
          <div className="collage-frame" style={{ background: bg.startsWith('linear') ? bg : undefined }}>
            {rendered ? <img src={rendered} alt="collage preview" /> : (
              <img ref={renderRef} alt="" style={{ display: 'none' }} />
            )}
            {!images.length && <EmptyState icon="🖼️" title="Start a collage" sub="Add photos to build a layout. Reorder by removing and re-adding, or drag chips above." />}
          </div>
        </div>
      </div>
    </div>
  );
}