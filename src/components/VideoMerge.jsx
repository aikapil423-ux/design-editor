import { useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { loadMediaMeta, runMerge } from '../lib/videoUtils';
import { ensureFFmpeg, toUint8 } from '../lib/ffmpeg';
import { Btn, Chip, Field, Modal, Slider } from './common';

const RATIOS = [
  { id: '1:1', w: 1080, h: 1080 }, { id: '16:9', w: 1920, h: 1080 }, { id: '9:16', w: 1080, h: 1920 }, { id: '4:5', w: 1080, h: 1350 },
];
const TRANSITIONS = [
  { id: 'none', label: 'Cut' }, { id: 'fade', label: 'Fade' }, { id: 'dissolve', label: 'Dissolve' },
  { id: 'slide', label: 'Slide' }, { id: 'zoom', label: 'Zoom' }, { id: 'glitch', label: 'Glitch' },
];
const uid = () => Math.random().toString(36).slice(2, 9);

export default function VideoMerge() {
  const { notify, upsertProject, navigate } = useApp();
  const [clips, setClips] = useState([]);
  const [transition, setTransition] = useState('fade');
  const [tDur, setTDur] = useState(0.5);
  const [ratio, setRatio] = useState(RATIOS[1]);
  const [music, setMusic] = useState(null);
  const [filter, setFilter] = useState('none');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState('');
  const [preview, setPreview] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const mRef = useRef(null);

  const total = useMemo(() => clips.reduce((a, c) => a + c.duration - (c.i > 0 ? tDur : 0), 0), [clips, tDur]);

  const add = async (e) => {
    const files = Array.from(e.target.files);
    const out = [];
    for (const f of files) {
      const meta = await loadMediaMeta(f);
      out.push({ id: uid(), file: f, url: URL.createObjectURL(f), name: f.name, kind: meta.kind, meta, in: 0, duration: Math.min(meta.duration, 5), i: clips.length + out.length });
    }
    setClips((c) => [...c, ...out]);
    notify(`${out.length} added`);
  };

  const reorder = (i, dir) => setClips((arr) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next.map((c, k) => ({ ...c, i: k }));
  });

  const setClip = (id, patch) => setClips((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const run = async () => {
    if (clips.length < 1) { notify('Add videos first', 'warn'); return; }
    setBusy(true);
    setStage('staging media');
    try {
      await ensureFFmpeg();
      const prepared = [];
      for (const c of clips) {
        const bytes = await toUint8(c.file);
        const path = `m_${c.id}.${c.kind === 'image' ? 'png' : 'mp4'}`;
        prepared.push({ name: path, kind: c.kind, fileBinary: bytes, duration: c.duration, start: c.in, filter });
      }
      setStage('merging with transitions');
      const url = await runMerge(prepared, {
        width: ratio.w, height: ratio.h, fps: 30, transition, transitionDuration: tDur,
        music: music ? { bytes: await toUint8(music), ext: music.name.split('.').pop() } : null,
      });
      setResult(url);
      upsertProject({ id: Date.now().toString(36), name: `Merge ${Date.now() % 1000}`, type: 'video', res: `${ratio.w}x${ratio.h}`, duration: `${Math.round(total)}s`, thumbnail: '', createdAt: Date.now(), modifiedAt: Date.now(), favorite: false, inTrash: false });
      notify('Merge complete 🎬');
    } catch (err) {
      console.error(err);
      notify('Merge failed: ' + err.message, 'error');
    } finally {
      setBusy(false);
      setStage('');
      setExportOpen(false);
    }
  };

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>🎞 Merge Studio</h1><p>Preview → Edit → Merge → Export. Combine clips with transitions & music.</p></div>
        <div className="ws-actions">
          <Btn className="btn" onClick={() => setPreview(preview === 1 ? 0 : 1)}>{preview ? 'Edit' : 'Preview'}</Btn>
          <Btn className="btn-primary" onClick={() => setExportOpen(true)} disabled={!clips.length}>🎬 Merge & Export</Btn>
        </div>
      </div>

      <div className="toolbar-row wrap">
        <label className="btn btn-ghost drop-trigger">+ Add videos / images<input type="file" accept="video/*,image/*" multiple hidden onChange={add} /></label>
        <label className="btn btn-ghost drop-trigger">🎵 Music<input type="file" accept="audio/*" hidden onChange={(e) => { setMusic(e.target.files[0]); notify('Music attached'); }} /></label>
        {music && <span className="tag" style={{ cursor: 'pointer' }} onClick={() => setMusic(null)}>♪ {music.name.slice(0, 20)} ✕</span>}
      </div>

      <div className="ws-grid split merge-grid">
        <div className="panel">
          <div className="panel-head"><h3>Sequence ({clips.length})</h3></div>
          {clips.map((c, i) => (
            <div key={c.id} className="merge-item">
              <div className="merge-thumb">{c.kind === 'video' ? <video src={c.url} muted /> : <img src={c.url} alt="" />}</div>
              <div className="merge-info">
                <strong>{c.name.replace(/\.[^.]+$/, '').slice(0, 16)}</strong>
                <div className="merge-controls">
                  <span>In</span><input type="number" step="0.1" min="0" value={Math.round(c.in * 10) / 10} onChange={(e) => setClip(c.id, { in: Math.min(+e.target.value, c.meta.duration - 0.2) })} />
                  <span>Dur</span><input type="number" step="0.1" min="0.2" value={Math.round(c.duration * 10) / 10} onChange={(e) => setClip(c.id, { duration: Math.max(0.2, +e.target.value) })} />
                  <span>Vol</span><input type="number" step="0.1" min="0" max="2" value={c.volume || 1} onChange={(e) => setClip(c.id, { volume: +e.target.value })} />
                  {i < clips.length - 1 && <span className="xfade-chip">{transition} ›</span>}
                </div>
              </div>
              <div className="clip-ops">
                <button onClick={() => reorder(i, -1)}>←</button>
                <button onClick={() => reorder(i, 1)}>→</button>
                <button onClick={() => setClips((a) => a.filter((x) => x.id !== c.id))}>🗑</button>
              </div>
            </div>
          ))}
          {!clips.length && <p className="muted">Add clips — then drag to reorder, trim and choose transitions.</p>}
        </div>

        <div className="panel prompt-panel">
          {preview === 1 && result && (
            <div className="video-preview"><video src={result} controls autoPlay muted loop style={{ width: '100%', borderRadius: 12 }} /></div>
          )}
          {preview === 1 && !result && <p className="muted">Merge first to see the preview.</p>}
          <div className="panel-head"><h3>Settings</h3></div>
          <Field label="Aspect ratio"><select value={ratio.id} onChange={(e) => setRatio(RATIOS.find((r) => r.id === e.target.value))}>{RATIOS.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.w}×{r.h}</option>)}</select></Field>
          <Field label="Transition"><select value={transition} onChange={(e) => setTransition(e.target.value)}>{TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
          <Slider label="Transition length" min={0.1} max={2} step={0.1} value={tDur} onChange={setTDur} format={(v) => `${v}s`} />
          <Field label="Filter"><select value={filter} onChange={(e) => setFilter(e.target.value)}>{['none', 'grayscale', 'sepia', 'vintage', 'cinematic', 'warm', 'cool'].map((f) => <option key={f}>{f}</option>)}</select></Field>
          <p className="est-size">Estimated: <strong>{(Math.max(0, total) * 4).toFixed(1)} MB</strong> · {ratio.id} · 30fps</p>
        </div>
      </div>

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Merge & Export">
        <p className="muted">This runs a full FFmpeg encode in your browser. {clips.length} clips → 1 MP4 with {transition} transitions{music ? ' + music track' : ''}.</p>
        <div className="gen-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? stage + '…' : '🚀 Start merge'}</button>
          <button className="btn" onClick={() => setExportOpen(false)}>Cancel</button>
        </div>
        {busy && <div className="gen-progress"><div className="shimmer-bar animating" /><p>{stage}…</p></div>}
      </Modal>
    </div>
  );
}