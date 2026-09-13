import { useMemo, useRef, useState } from 'react';
import { generateImage } from '../lib/procedural';
import { ensureFFmpeg, ffmpeg, makeBlobURL, readFF, onFFLog } from '../lib/ffmpeg';
import { useApp } from '../lib/store';
import { Btn, BtnAI, Chip, Field, Slider, Spinner, EmptyState, PROMPTS } from './common';
import { STYLES } from './ImageGenerator';

const RATIOS = [
  { id: '16:9', w: 1920, h: 1080, label: '16:9' },
  { id: '9:16', w: 1080, h: 1920, label: '9:16' },
  { id: '1:1', w: 1080, h: 1080, label: '1:1' },
  { id: '4:3', w: 1440, h: 1080, label: '4:3' },
];
const RESOLUTIONS = ['720p', '1080p', '2K'];
const MOVEMENTS = ['Static', 'Pan', 'Tilt', 'Zoom In', 'Zoom Out', 'Dolly', 'Tracking', 'Orbit', 'Handheld', 'Cinematic'];
const MODES = [
  { id: 'text', label: 'Text → Video' },
  { id: 'image', label: 'Image → Video' },
  { id: 'textimage', label: 'Text + Image → Video' },
  { id: 'story', label: 'Story → Video' },
  { id: 'product', label: 'Product → Video' },
  { id: 'character', label: 'Character → Video' },
];

export default function VideoGenerator() {
  const { navigate, notify, addAI } = useApp();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('text');
  const [duration, setDuration] = useState(6);
  const [ratio, setRatio] = useState(RATIOS[0]);
  const [resolution, setResolution] = useState('1080p');
  const [fps, setFps] = useState(30);
  const [movement, setMovement] = useState('Cinematic');
  const [motion, setMotion] = useState(50);
  const [style, setStyle] = useState('cinematic');
  const [seed, setSeed] = useState('');
  const [creativity, setCreativity] = useState(60);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [busyTitle, setBusyTitle] = useState('');
  const [result, setResult] = useState('');
  const fileRef = useRef(null);

  const scale = resolution === '720p' ? 1280 : resolution === '2K' ? 2560 : ratio.w;

  const onImage = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(f);
  };

  const zoomExpr = useMemo(() => {
    const m = motion / 100;
    switch (movement) {
      case 'Static':
        return "z='1.0'";
      case 'Zoom In':
        return `z='min(zoom+${(0.0012 * m).toFixed(4)}+0.0005,1.5)'`;
      case 'Zoom Out':
        return `z='if(lte(zoom,1.0),1.5,max(1.001,zoom-${(0.0012 * m + 0.0005).toFixed(4)}))'`;
      case 'Pan':
        return `z='1.0':x='(iw-iw/zoom)*${(m * 0.5).toFixed(2)}*(on/${duration}fps)'`;
      case 'Tilt':
        return `z='1.08':y='(ih-ih/zoom)*${(m * 0.5).toFixed(2)}*(on/${duration}fps)'`;
      case 'Dolly':
        return `z='min(1+${(0.0006 * m + 0.0002).toFixed(4)}*on,1.25)'`;
      case 'Orbit':
        return `z='1.08':x='iw/2+(iw/2-iw/zoom)*cos(on/${(duration * 0.5).toFixed(1)})':y='ih/2+(ih/2-ih/zoom)*sin(on/${(duration * 0.5).toFixed(1)})'`;
      case 'Handheld':
        return `z='1.05':x='iw/2+(iw/2-iw/zoom)+${(m * 3).toFixed(1)}*sin(on/7)':y='ih/2+(ih/2-ih/zoom)+${(m * 2).toFixed(1)}*cos(on/9)'`;
      case 'Tracking':
        return `z='min(zoom+${(0.0008 * m).toFixed(4)},1.2)':x='(iw-iw/zoom)*(` + (m * 0.5).toFixed(2) + `+0.2)*(on/${duration}fps)'`;
      default:
        return `z='min(zoom+${(0.00035 * m + 0.0002).toFixed(4)},1.18)':x='(iw-iw/zoom)*0.5*(sin(on*0.02)+1)/2':y='(ih-ih/zoom)*0.5*(cos(on*0.02)+1)/2'`;
    }
  }, [movement, motion, duration, fps]);

  const baseFrame = async () => {
    if (mode === 'image' && image) return image;
    const dataUrl = generateImage({
      prompt,
      style,
      seed,
      width: scale,
      height: Math.round((scale * ratio.h) / ratio.w),
      lighting: 'Studio',
      camera: 'Standard',
      color: 'Vibrant',
      composition: 'Cinematic',
    });
    if (image && mode === 'textimage') {
      const c = document.createElement('canvas');
      c.width = scale;
      c.height = Math.round((scale * ratio.h) / ratio.w);
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
      grad.addColorStop(0, '#0f0f1a');
      grad.addColorStop(1, '#1a1030');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = image; });
      const iw = c.width * 0.5;
      const ih = (iw * img.height) / img.width;
      ctx.drawImage(img, (c.width - iw) / 2, c.height * 0.08, iw, ih);
      return c.toDataURL('image/png');
    }
    return dataUrl;
  };

  const run = async () => {
    if (!prompt.trim() && mode !== 'image') {
      notify('Describe your video or upload an image', 'warn');
      return;
    }
    setResult('');
    setBusy(true);
    setStage('loading-engine');
    setBusyTitle('Loading FFmpeg engine…');
    try {
      await ensureFFmpeg();
      setStage('rendering');
      setBusyTitle('Rendering scene…');
      const frame = await baseFrame();

      setStage('writing');
      setBusyTitle('Encoding frames…');
      const b64 = frame.split(',')[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      ffmpeg.FS('writeFile', 'in_frame.png', bytes);

      const outW = ratio.w;
      const outH = ratio.h;
      const frames = Math.round(duration * fps);
      const chain = `scale=3840:-1,zoompan=${zoomExpr}:d=${frames}:s=${outW}x${outH}:fps=${fps},format=yuv420p`;
      const vf = chain;
      await ffmpeg.run('-y', '-loop', '1', '-i', 'in_frame.png', '-t', String(duration), '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', 'vid.mp4');
      const url = makeBlobURL('vid.mp4', 'video/mp4');
      setResult(url);
      addAI({ kind: 'video', prompt, output: url, settings: { mode, duration, ratio: ratio.label, resolution, fps, movement, style } });
      notify('Video generated ✨');
    } catch (e) {
      notify('Generation failed: ' + e.message, 'error');
      console.error(e);
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  return (
    <div className="ws ai-ws">
      <div className="ws-header">
        <div>
          <h1>🎞️ AI Video Generator</h1>
          <p>Text, image or story → cinematic video, rendered locally with FFmpeg</p>
        </div>
        <BtnAI onClick={run} disabled={busy}>
          {busy ? <Spinner label="Working…" /> : '✦ Generate Video'}
        </BtnAI>
      </div>

      <div className="ws-grid split">
        <div className="panel prompt-panel">
          <div className="ctl-grid">
            {MODES.map((m) => (
              <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</Chip>
            ))}
          </div>

          <textarea className="prompt-box" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === 'story' ? 'Tell a short story to turn into video…' : 'Describe the video you want to create...'} />
          <div className="prompt-chips">
            {PROMPTS.video.slice(0, 3).map((p) => (
              <Chip key={p} onClick={() => setPrompt(p)}>{p.split(',')[0]}</Chip>
            ))}
          </div>

          <div className="ref-row">
            <span className="ctl-label">Reference Image</span>
            {image ? (
              <div className="ref-preview"><img src={image} alt="ref" /><button className="remove-x" onClick={() => setImage(null)}>✕</button></div>
            ) : (
              <button className="btn btn-ghost" onClick={() => fileRef.current.click()}>+ Upload image</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImage} />
          </div>

          <div className="ctl-grid">
            <Field label="Duration">
              <select value={duration} onChange={(e) => setDuration(+e.target.value)}>
                {[3, 5, 6, 8, 10, 15, 20].map((d) => <option key={d} value={d}>{d}s</option>)}
              </select>
            </Field>
            <Field label="Aspect Ratio">
              <select value={ratio.id} onChange={(e) => setRatio(RATIOS.find((r) => r.id === e.target.value))}>
                {RATIOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Resolution">
              <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                {RESOLUTIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="FPS">
              <select value={fps} onChange={(e) => setFps(+e.target.value)}>
                {[24, 30, 60].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Style">
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Camera Movement">
              <select value={movement} onChange={(e) => setMovement(e.target.value)}>
                {MOVEMENTS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Slider label="Motion Strength" value={motion} onChange={setMotion} min={0} max={100} format={(v) => `${v}%`} />
          <Slider label="Creativity" value={creativity} onChange={setCreativity} min={0} max={100} format={(v) => `${v}%`} />
          <Field label="Seed (optional)">
            <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Random if empty" />
          </Field>
        </div>

        <div className="panel out-panel">
          <div className="panel-head"><h3>Preview</h3></div>
          {busy && (
            <div className="gen-progress">
              <div className="shimmer-bar animating" />
              <p>{busyTitle}</p>
            </div>
          )}
          {!busy && !result && (
            <EmptyState icon="🎬" title="No video yet" sub="Set your prompt, camera and style, then generate. Videos render with a real FFmpeg pipeline." />
          )}
          {result && (
            <div className="video-preview">
              <video src={result} controls autoPlay muted loop style={{ width: '100%', borderRadius: 12 }} />
              <div className="gen-actions">
                <a className="btn btn-primary" href={result} download="ai-video.mp4">⬇ Download MP4</a>
                <button className="btn" onClick={() => navigate('video', {})}>✂️ Edit in Video Editor</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}