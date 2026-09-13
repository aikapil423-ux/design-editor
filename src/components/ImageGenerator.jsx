import { useRef, useState } from 'react';
import { generateImage, upscaleImage } from '../lib/procedural';
import { useApp } from '../lib/store';
import { Btn, BtnAI, Field, Slider, Chip, Spinner, EmptyState, PROMPTS } from './common';

export const STYLES = [
  'Photorealistic', 'Cinematic', 'Anime', '3D', 'Illustration', 'Digital Art',
  'Product Photography', 'Portrait', 'Fashion', 'Fantasy', 'Sci-Fi', 'Minimalist',
].map((s) => ({ id: s.toLowerCase().replace(/[^a-z0-9]/g, ''), label: s }));

const RATIOS = [
  { value: '1:1', w: 1024, h: 1024, label: '1:1 · Square' },
  { value: '4:5', w: 1024, h: 1280, label: '4:5 · Portrait' },
  { value: '9:16', w: 1080, h: 1920, label: '9:16 · Story' },
  { value: '16:9', w: 1920, h: 1080, label: '16:9 · Wide' },
  { value: '3:2', w: 1500, h: 1000, label: '3:2 · Photo' },
];

const QUALITIES = ['Low', 'Medium', 'High', 'Ultra'];
const LIGHTING = ['Golden Hour', 'Studio', 'Soft', 'Dramatic', 'Neon', 'Overcast', 'Blue Hour', 'Candlelight'];
const CAMERAS = ['Standard', 'Portrait 85mm', 'Wide 24mm', 'Macro', 'Telephoto', 'Tilt-Shift', 'Fisheye', 'Dolly'];
const COLORS = ['Vibrant', 'Muted', 'Monochrome', 'Pastel', 'High Contrast', 'Warm', 'Cool', 'Neutral'];
const COMPOSITIONS = ['Rule of Thirds', 'Centered', 'Symmetrical', 'Leading Lines', 'Negative Space', 'Diagonal', 'Golden Ratio', 'Fill Frame'];

export default function ImageGenerator() {
  const { navigate, notify, addAI } = useApp();
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [ratio, setRatio] = useState(RATIOS[0]);
  const [count, setCount] = useState(4);
  const [style, setStyle] = useState('cinematic');
  const [quality, setQuality] = useState('High');
  const [lighting, setLighting] = useState('Golden Hour');
  const [camera, setCamera] = useState('Standard');
  const [color, setColor] = useState('Vibrant');
  const [composition, setComposition] = useState('Rule of Thirds');
  const [seed, setSeed] = useState('');
  const [creativity, setCreativity] = useState(60);
  const [guidance, setGuidance] = useState(7);
  const [refImage, setRefImage] = useState(null);
  const [strength, setStrength] = useState(50);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [progress, setProgress] = useState(0);
  const refInput = useRef(null);

  const run = async (variation = false) => {
    if (!prompt.trim()) {
      notify('Please describe the image first', 'warn');
      return;
    }
    setBusy(true);
    setProgress(0);
    const baseSeed = variation && images.length ? '' : seed;
    const list = [];
    for (let i = 0; i < count; i++) {
      const s = baseSeed || `${seed}|${i}|${i % 3}-${variation ? Math.floor(Math.random() * 1e6) : ''}`;
      const dataUrl = generateImage({
        prompt,
        style,
        seed: s,
        width: ratio.w,
        height: ratio.h,
        lighting,
        camera,
        color,
        composition,
      });
      list.push({ id: Math.random().toString(36).slice(2), url: dataUrl, prompt, style, seed: s, settings: { ratio: ratio.label, quality, lighting, camera, color, composition, creativity, guidance } });
      setProgress(Math.round(((i + 1) / count) * 100));
      await new Promise((r) => setTimeout(r, 220));
    }
    setImages(list);
    setSelected(0);
    setBusy(false);
    addAI({ kind: 'image', prompt, output: list[0].url, settings: list[0].settings, progress: undefined });
    notify(variation ? 'Variations generated' : `${count} images generated`);
  };

  const upscaleSelected = async () => {
    const img = images[selected];
    if (!img) return;
    setBusy(true);
    notify('Upscaling image…', 'info');
    const url = await upscaleImage(img.url, 2);
    setImages((l) => l.map((x) => (x.id === img.id ? { ...x, url, upscaled: true } : x)));
    setBusy(false);
    notify('Image upscaled 2×');
  };

  const editSelected = () => {
    const img = images[selected];
    if (!img) return;
    navigate('photo', { src: img.url, name: prompt.slice(0, 40) });
  };

  const downloadSelected = () => {
    const img = images[selected];
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.url;
    a.download = `ai-image-${Date.now()}.png`;
    a.click();
    notify('Image downloaded');
  };

  return (
    <div className="ws ai-ws">
      <div className="ws-header">
        <div>
          <h1>✨ AI Image Generator</h1>
          <p>Text to image · Image to image · One-click generation right in your browser</p>
        </div>
        <BtnAI onClick={run} disabled={busy || !prompt.trim()}>
          {busy ? <Spinner label={`Generating ${progress}%`} /> : '✦ Generate'}
        </BtnAI>
      </div>

      <div className="ws-grid split">
        <div className="panel prompt-panel">
          <div className="panel-head">
            <h3>Prompt</h3>
          </div>
          <textarea
            className="prompt-box"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to create..."
          />
          <div className="prompt-chips">
            {PROMPTS.photo.slice(0, 4).map((p) => (
              <Chip key={p} onClick={() => setPrompt(p)}>{p.split(',')[0]}</Chip>
            ))}
          </div>

          <textarea
            className="prompt-box sub"
            rows={1}
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            placeholder="Negative prompt — what to avoid…"
          />

          <div className="ctl-grid">
            <Field label="Aspect Ratio">
              <select value={`${RATIOS.indexOf(ratio)}`} onChange={(e) => setRatio(RATIOS[+e.target.value])}>
                {RATIOS.map((r, i) => (
                  <option key={r.value} value={i}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Number of Images">
              <select value={count} onChange={(e) => setCount(+e.target.value)}>
                {[1, 2, 4, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Quality">
              <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                {QUALITIES.map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </Field>
            <Field label="Lighting">
              <select value={lighting} onChange={(e) => setLighting(e.target.value)}>
                {LIGHTING.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Camera">
              <select value={camera} onChange={(e) => setCamera(e.target.value)}>
                {CAMERAS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Color">
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                {COLORS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Composition">
              <select value={composition} onChange={(e) => setComposition(e.target.value)}>
                {COMPOSITIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Style">
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="panel-head">
            <h3>Advanced</h3>
          </div>
          <Field label="Seed (optional)">
            <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Random if empty" />
          </Field>
          <Slider label="Creativity" value={creativity} onChange={setCreativity} min={0} max={100} format={(v) => `${v}%`} />
          <Slider label="Guidance" value={guidance} onChange={setGuidance} min={1} max={20} step={0.5} format={(v) => v.toFixed(1)} />
          <div className="ref-row">
            <span className="ctl-label">Reference Image</span>
            {refImage ? (
              <div className="ref-preview">
                <img src={refImage} alt="ref" />
                <button className="remove-x" onClick={() => setRefImage(null)}>✕</button>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={() => refInput.current.click()}>+ Upload reference</button>
            )}
            <input ref={refInput} type="file" accept="image/*" hidden onChange={(e) => {
              const f = e.target.files[0];
              if (f) {
                const reader = new FileReader();
                reader.onload = () => setRefImage(reader.result);
                reader.readAsDataURL(f);
              }
            }} />
          </div>
          <Slider label="Image Strength" value={strength} onChange={setStrength} min={0} max={100} format={(v) => `${v}%`} />
        </div>

        <div className="panel out-panel">
          <div className="panel-head">
            <h3>Gallery {images.length > 0 && <small>{images.length} images</small>}</h3>
            <div>
              <Btn className="btn-sm" onClick={() => run(true)} disabled={busy || !images.length}>Generate Variations</Btn>
            </div>
          </div>

          {busy && (
            <div className="gen-progress">
              <div className="shimmer-bar" style={{ width: `${progress}%` }} />
              <p>✦ Composing your image… {progress}%</p>
            </div>
          )}

          {!images.length && !busy && (
            <EmptyState icon="🖼️" title="No generations yet" sub="Describe an image and hit Generate. Results render locally — no servers, no credits." />
          )}

          {images.length > 0 && (
            <>
              <div className="gen-grid">
                {images.map((img, i) => (
                  <div key={img.id} className={`gen-card ${i === selected ? 'sel' : ''}`} onClick={() => setSelected(i)}>
                    <img src={img.url} alt={img.prompt} />
                    {img.upscaled && <span className="gen-badge">2×</span>}
                  </div>
                ))}
              </div>
              <div className="gen-actions">
                <button className="btn btn-primary" onClick={() => { setBusy(true); setTimeout(editSelected, 150); }}>
                  ✂️ Edit with AI
                </button>
                <button className="btn" onClick={upscaleSelected} disabled={busy}>🚀 Upscale</button>
                <button className="btn" onClick={downloadSelected}>⬇ Download</button>
                <button className="btn" onClick={() => setPrompt(images[selected].prompt)}>↺ Reuse prompt</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}