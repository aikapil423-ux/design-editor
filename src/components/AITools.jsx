import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { Btn, EmptyState, Field } from './common';
import { upscaleImage } from '../lib/procedural';

const TOOLS = [
  { id: 'bg', icon: '🧹', name: 'Background Removal', desc: 'One-click subject cutout' },
  { id: 'bgrep', icon: '🖼️', name: 'Background Replace', desc: 'Swap the backdrop to a prompt' },
  { id: 'object', icon: '🧽', name: 'Object Removal', desc: 'Erase unwanted items with a brush' },
  { id: 'sky', icon: '🌤️', name: 'Sky Replacement', desc: 'Instant dramatic skies' },
  { id: 'expand', icon: '🔲', name: 'AI Expand', desc: 'Extend beyond the canvas' },
  { id: 'relight', icon: '💡', name: 'AI Relight', desc: 'Recast light from a description' },
  { id: 'enhance', icon: '✨', name: 'Auto Enhance', desc: 'One-tap color correction' },
  { id: 'upscale', icon: '🚀', name: 'AI Upscale', desc: '2× super resolution' },
  { id: 'restore', icon: '🕰️', name: 'Old Photo Restore', desc: 'Revive vintage photos' },
  { id: 'retouch', icon: '💆', name: 'Face Retouch', desc: 'Subtle skin smoothing' },
];

const hashColor = (str, i) => {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(h + i * 60) % 360;
  return `hsl(${hue} 70% ${[62, 48, 55][i % 3]}%)`;
};

export default function AITools() {
  const { navigate, notify, addAI } = useApp();
  const [imgEl, setImgEl] = useState(null);
  const [src, setSrc] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastTool, setLastTool] = useState('');
  const [prompt, setPrompt] = useState('Replace the background with a luxury modern office');
  const fileRef = useRef(null);

  const loadImage = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(reader.result);
      setBefore(reader.result);
      setAfter('');
      setImgEl(new Image());
      const img = new Image();
      img.onload = () => setImgEl(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const pick = (e) => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
    else if (before) setImgEl(new Image());
  };

  const process = async (tool) => {
    if (!imgEl || !imgEl.width) { notify('Upload an image first', 'warn'); return; }
    setBusy(true);
    setLastTool(tool);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const c = document.createElement('canvas');
      c.width = imgEl.width;
      c.height = imgEl.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(imgEl, 0, 0);

      if (tool === 'bg' || tool === 'bgrep') {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const data = d.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const bri = (r + g + b) / 3;
          if (bri > 205 || (bri > 152 && r > g && r > b)) data[i + 3] = 0;
        }
        ctx.putImageData(d, 0, 0);
        if (tool === 'bgrep') {
          const cg = ctx.createLinearGradient(0, 0, 0, c.height);
          cg.addColorStop(0, hashColor(prompt, 0));
          cg.addColorStop(1, hashColor(prompt + '2', 1));
          ctx.fillStyle = cg;
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(c, 0, 0);
        }
      }
      if (tool === 'sky') {
        const horizon = c.height * 0.5;
        ctx.save();
        const g = ctx.createLinearGradient(0, 0, 0, horizon + 40);
        g.addColorStop(0, hashColor(prompt, 0));
        g.addColorStop(1, hashColor(prompt + 's', 2));
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, horizon + 40);
        ctx.restore();
      }
      if (tool === 'expand') {
        const pad = Math.round(c.width * 0.16);
        const c2 = document.createElement('canvas');
        c2.width = c.width + pad * 2;
        c2.height = c.height + pad * 2;
        const x2 = c2.getContext('2d');
        x2.filter = 'blur(24px)';
        x2.drawImage(c, 0, 0, c2.width, c2.height);
        x2.filter = 'none';
        x2.drawImage(c, pad, pad);
        const d = c2.getContext('2d');
        return d.canvas.toDataURL('image/png');
      }
      if (tool === 'relight') {
        const g = ctx.createRadialGradient(c.width * 0.3, c.height * 0.2, 0, c.width * 0.3, c.height * 0.2, c.width * 0.9);
        g.addColorStop(0, 'rgba(255,180,90,0.45)');
        g.addColorStop(1, 'rgba(15,10,40,0.5)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
      }
      if (tool === 'restore') {
        ctx.filter = 'blur(0.6px)';
        ctx.drawImage(c, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const data = d.data;
        let rS = 0, gS = 0, bS = 0;
        const n = c.width * c.height;
        for (let i = 0; i < data.length; i += 4) { rS += data[i]; gS += data[i + 1]; bS += data[i + 2]; }
        const rf = 255 / (rS / n) + 0.05, gf = 255 / (gS / n) + 0.05, bf = 255 / (bS / n) + 0.05;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * rf);
          data[i + 1] = Math.min(255, data[i + 1] * gf);
          data[i + 2] = Math.min(255, data[i + 2] * bf);
        }
        ctx.putImageData(d, 0, 0);
      }
      if (tool === 'enhance') {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const data = d.data;
        let rS = 0, gS = 0, bS = 0;
        const n = c.width * c.height;
        for (let i = 0; i < data.length; i += 4) { rS += data[i]; gS += data[i + 1]; bS += data[i + 2]; }
        const rf = 135 / (rS / n), gf = 135 / (gS / n), bf = 135 / (bS / n);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * rf);
          data[i + 1] = Math.min(255, data[i + 1] * gf);
          data[i + 2] = Math.min(255, data[i + 2] * bf);
        }
        ctx.putImageData(d, 0, 0);
      }
      if (tool === 'upscale') {
        const url = await upscaleImage(c.toDataURL('image/png'), 2);
        setAfter(url);
        setBusy(false);
        addAI({ kind: 'image', prompt: `↑ Upscale of "${lastTool}"`, output: url, settings: {} });
        notify('Upscaled 2× 🚀');
        return;
      }
      if (tool === 'retouch') {
        ctx.save();
        ctx.filter = 'blur(1.4px)';
        ctx.globalAlpha = 0.35;
        ctx.drawImage(c, 0, 0);
        ctx.restore();
      }

      const url = c.toDataURL('image/png');
      setAfter(url);
      setBusy(false);
      addAI({ kind: 'image', prompt: `${TOOLS.find((t) => t.id === tool)?.name} → ${prompt}`, output: url, settings: {} });
      notify(`${TOOLS.find((t) => t.id === tool)?.name} applied ✨`);
    } catch (err) {
      console.error(err);
      setBusy(false);
      notify('Processing failed', 'error');
    }
  };

  const openEditor = (tool) => {
    if (tool === 'object') navigate('photo', { src: before || '', tool: 'erase', name: 'Object removal' });
    else navigate('photo', { src: after || before || '', action: tool, name: `${TOOLS.find((t) => t.id === tool)?.name}` });
  };

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>🪄 AI Tools</h1><p>Professional photo operations powered by in-browser AI</p></div>
        {before && <Btn className="btn" onClick={() => navigate('photo', { src: after || before, name: 'AI Processed' })}>🎛 Continue in Editor</Btn>}
      </div>

      <div className="ws-grid split">
        <div className="ai-tools-grid">
          {TOOLS.map((t) => (
            <button key={t.id} className={`ai-tool-card ${after && lastTool === t.id ? 'on' : ''}`}
              onClick={() => (t.id === 'bg' || t.id === 'object' || t.id === 'enhance' || t.id === 'upscale' ? process(t.id) : process(t.id))}>
              <span className="ai-tool-icon">{t.icon}</span>
              <strong>{t.name}</strong>
              <small>{t.desc}</small>
            </button>
          ))}
        </div>

        <div className="panel prompt-panel">
          <div className="panel-head"><h3>Image</h3></div>
          <label className="btn btn-ghost drop-trigger">
            📂 Upload image
            <input type="file" accept="image/*" hidden onChange={pick} />
          </label>
          {before && (
            <div className="compare">
              <figure><figcaption>Before</figcaption><img src={before} alt="before" /></figure>
              <figure><figcaption>After · {TOOLS.find((t) => t.id === lastTool)?.name || 'original'}</figcaption><img src={after || before} alt="after" /></figure>
            </div>
          )}
          {!before && <EmptyState icon="🖼️" title="No image" sub="Upload an image to start applying AI tools" />}

          <div className="panel-head"><h3>Prompt & Controls</h3></div>
          <Field label="Direction prompt">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the effect…" />
          </Field>
          <div className="gen-actions" style={{ marginTop: 12 }}>
            <Btn className="btn-ai" onClick={() => process('bg')} disabled={busy}>{busy ? 'Working…' : '🧹 Remove BG'}</Btn>
            <Btn className="btn-ai" onClick={() => process('bgrep')} disabled={busy}>🖼️ Replace BG</Btn>
            <Btn className="btn-ai" onClick={() => process('sky')} disabled={busy}>🌤️ Sky</Btn>
            <Btn className="btn-ai" onClick={() => process('relight')} disabled={busy}>💡 Relight</Btn>
            <Btn className="btn-ai" onClick={() => process('restore')} disabled={busy}>🕰️ Restore</Btn>
            <Btn className="btn" onClick={() => process('expand')} disabled={busy}>🔲 Expand</Btn>
            <Btn className="btn" onClick={() => process('retouch')} disabled={busy}>💆 Retouch</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}