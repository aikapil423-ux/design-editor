import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { runMerge } from '../lib/videoUtils';
import { ensureFFmpeg, toUint8 } from '../lib/ffmpeg';
import { Chip, EmptyState } from './common';

const PRESETS = [
  { id: 'cinematic', label: 'Cinematic', transition: 'fade', filter: 'cinematic', camp: ['#111', '#222'] },
  { id: 'travel', label: 'Travel', transition: 'dissolve', filter: 'cool', camp: ['#0a2a3a', '#1a5a7a'] },
  { id: 'wedding', label: 'Wedding', transition: 'dissolve', filter: 'warm', camp: ['#f6d365', '#fda085'] },
  { id: 'birthday', label: 'Birthday', transition: 'spin', filter: 'bright', camp: ['#ff9a9e', '#fecfef'] },
  { id: 'business', label: 'Business', transition: 'fade', filter: 'none', camp: ['#0f2027', '#2c5364'] },
  { id: 'product', label: 'Product', transition: 'slide', filter: 'bright', camp: ['#1b1b2f', '#3a3a5f'] },
  { id: 'youtube', label: 'YouTube', transition: 'smooth', filter: 'contrast', camp: ['#ff0000', '#3b0a45'] },
  { id: 'reel', label: 'Reel', transition: 'glitch', filter: 'saturate', camp: ['#3033', '#0ff'] },
  { id: 'tiktok', label: 'TikTok', transition: 'zoom', filter: 'vibrant', camp: ['#25f4ee', '#fe2c55'] },
  { id: 'shortfilm', label: 'Short Film', transition: 'fade', filter: 'cinematic', camp: ['#0b0b12', '#1e1e32'] },
];

const FILTER_ID = {
  cinematic: 'cinematic', cool: 'cool', warm: 'warm', bright: 'bright', none: 'none', contrast: 'cinematic', saturate: 'vintage', vibrant: 'vintage',
};

export default function AutoEdit() {
  const { notify, navigate, upsertProject } = useApp();
  const [photos, setPhotos] = useState([]);
  const [preset, setPreset] = useState('cinematic');
  const [presetObj, setPresetObj] = useState(PRESETS[0]);
  const [dur, setDur] = useState(2.5);
  const [music, setMusic] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState('');
  const [analyzed, setAnalyzed] = useState(false);
  const mRef = useRef(null);

  const addFiles = (e) => {
    const files = Array.from(e.target.files);
    setPhotos((prev) => [...prev, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f), name: f.name }))]);
    notify(`${files.length} media added`);
  };

  const analyze = () => {
    setAnalyzed(true);
    notify('AI analyzed timing, transitions & color (auto profile active)');
  };

  const pickPreset = (p) => {
    setPreset(p.id);
    setPresetObj(p);
    setAnalyzed(false);
  };

  const run = async () => {
    if (photos.length < 2) { notify('Add at least 2 photos', 'warn'); return; }
    setBusy(true);
    setStage('analyzing');
    notify('✨ AI auto-edit started…', 'info');
    await new Promise((r) => setTimeout(r, 500));
    try {
      await ensureFFmpeg();
      setStage('arranging timeline');
      await new Promise((r) => setTimeout(r, 400));
      const pool = [...photos];
      // simulate "best clip selection": keep order shuffled lightly
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      setStage('adding transitions & music');
      await new Promise((r) => setTimeout(r, 400));
      const clips = [];
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        const bytes = await toUint8(p.file);
        const path = `auto_${i}.png`;
        clips.push({ name: path, kind: 'image', fileBinary: bytes, duration: dur, start: 0, filter: FILTER_ID[presetObj.filter] });
      }
      setStage('color grading + rendering');
      const url = await runMerge(clips, {
        width: 1080, height: 1920, fps: 30,
        transition: presetObj.transition, transitionDuration: 0.5,
        music: music ? { bytes: await toUint8(music), ext: music.name.split('.').pop() } : null,
      });
      setResult(url);
      upsertProject({ id: Date.now().toString(36), name: `Auto Edit · ${presetObj.label}`, type: 'video', res: '1080x1920', duration: `${Math.round(pool.length * dur)}s`, thumbnail: '', createdAt: Date.now(), modifiedAt: Date.now(), favorite: false, inTrash: false });
      notify('Auto edit complete 🎬');
    } catch (err) {
      console.error(err);
      notify('Auto edit failed: ' + err.message, 'error');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>🤖 AI Auto Edit</h1><p>Drop media, pick a vibe — the AI builds the whole edit</p></div>
        <button className="btn btn-ai" onClick={run} disabled={busy || photos.length < 2}>{busy ? `${stage}…` : '✨ Auto Edit Now'}</button>
      </div>

      <div className="toolbar-row wrap">
        <label className="btn btn-ghost drop-trigger">+ Add media<input type="file" accept="image/*,video/*" multiple hidden onChange={addFiles} /></label>
        <label className="btn btn-ghost drop-trigger">🎵 Music<input type="file" accept="audio/*" hidden onChange={(e) => { setMusic(e.target.files[0]); notify('Music attached'); }} /></label>
        <select value={dur} onChange={(e) => setDur(+e.target.value)}><option value={1.5}>1.5s / photo</option><option value={2.5}>2.5s / photo</option><option value={4}>4s / photo</option></select>
      </div>

      <div className="panel-head"><h3>Choose a vibe</h3></div>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.id} className={`preset-card ${preset === p.id ? 'on' : ''}`} style={{ background: `linear-gradient(135deg, ${p.camp[0]}, ${p.camp[1]})` }} onClick={() => pickPreset(p)}>
            <strong>{p.label}</strong>
            <small>{p.transition} · {p.filter}</small>
          </button>
        ))}
      </div>

      {busy && (
        <div className="gen-progress"><div className="shimmer-bar animating" /><p>∑ AI is editing: {stage}…</p></div>
      )}

      {photos.length > 0 && (
        <div className="thumb-strip">
          {photos.map((p, i) => <div key={i} className="thumb-chip"><img src={p.url} alt={p.name} /><button className="remove-x" onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}>✕</button></div>)}
        </div>
      )}

      <div className="auto-timeline">
        <p className="muted">AI pipeline</p>
        <div className="pipe">
          {['Analyze media', 'Select best clips', 'Build timeline', 'Transitions', 'Music sync', 'Captions', 'Color grade', 'Export'].map((s, i) => (
            <span key={s} className={analyzed && i <= 2 ? 'done' : ''} style={{ animationDelay: `${i * 60}ms` }}>{s}</span>
          ))}
        </div>
      </div>

      {result && (
        <div className="panel out-panel">
          <video src={result} controls autoPlay muted style={{ width: '100%', borderRadius: 12 }} />
          <div className="gen-actions" style={{ marginTop: 12 }}>
            <a className="btn btn-primary" href={result} download="auto-edit.mp4">⬇ Download</a>
            <button className="btn" onClick={() => navigate('video', {})}>🎥 Open in Editor</button>
          </div>
        </div>
      )}
      {!photos.length && <EmptyState icon="🎞️" title="Nothing to auto-edit" sub="Add photos or clips above and press Auto Edit" />}
    </div>
  );
}