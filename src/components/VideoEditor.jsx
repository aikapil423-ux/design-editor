import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { loadMediaMeta, runMerge, filterFor } from '../lib/videoUtils';
import { ensureFFmpeg, ffLoaded, toUint8 } from '../lib/ffmpeg';
import { Btn, Chip, Field, Modal, Slider } from './common';

const TRANSITIONS = [
  { id: 'none', label: 'None' }, { id: 'fade', label: 'Fade' }, { id: 'dissolve', label: 'Dissolve' },
  { id: 'slide', label: 'Slide' }, { id: 'zoom', label: 'Zoom' }, { id: 'spin', label: 'Spin' },
  { id: 'flash', label: 'Flash' }, { id: 'wipe', label: 'Wipe' }, { id: 'glitch', label: 'Glitch' }, { id: 'smooth', label: 'Smooth' },
];

const PRESET_FILTERS = [
  { id: 'none', label: 'None' }, { id: 'grayscale', label: 'B&W' }, { id: 'sepia', label: 'Sepia' },
  { id: 'vintage', label: 'Vintage' }, { id: 'cinematic', label: 'Cinematic' }, { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' }, { id: 'bright', label: 'Bright' }, { id: 'dark', label: 'Dark' },
];

const CSS_FILTER = {
  grayscale: 'grayscale(1)', sepia: 'sepia(0.8)', vintage: 'sepia(0.4) contrast(1.1)', cinematic: 'contrast(1.12) saturate(1.1) brightness(0.96)',
  warm: 'sepia(0.25) saturate(1.3)', cool: 'hue-rotate(15deg) saturate(1.2)', bright: 'brightness(1.15)', dark: 'brightness(0.85)',
};

const uid = () => Math.random().toString(36).slice(2, 9);

export default function VideoEditor({ params }) {
  const { notify, upsertProject, navigate } = useApp();
  const [clips, setClips] = useState([]);
  const [transition, setTransition] = useState('fade');
  const [tDuration, setTDuration] = useState(0.5);
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState('1080p');
  const [music, setMusic] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [volume, setVolume] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [engine, setEngine] = useState(ffLoaded());
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [texts, setTexts] = useState([]);
  const timer = useRef(null);
  const playPosRef = useRef(0);
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const audioDemoRef = useRef(null);
  const seqRef = useRef([]);
  const startRef = useRef(0);
  const curSeg = useRef(0);

  const segments = useMemo(() => {
    const arr = [];
    let t = 0;
    clips.forEach((c, i) => {
      const seg = { ...c, index: i, abs: t, dur: c.duration };
      arr.push(seg);
      t += c.duration;
      if (i < clips.length - 1) t -= tDuration;
    });
    return arr;
  }, [clips, tDuration]);

  const totalDuration = Math.max(0, segments.length ? segments[segments.length - 1].abs + segments[segments.length - 1].dur : 0);

  const musicURL = useMemo(() => (music ? URL.createObjectURL(music) : null), [music]);

  const loadWaveform = (file, cb) => {
    const actx = new (window.AudioContext || (window).webkitAudioContext)();
    file.arrayBuffer()
      .then((buf) => actx.decodeAudioData(buf))
      .then((audio) => {
        const data = audio.getChannelData(0);
        const bars = 96;
        const step = Math.floor(data.length / bars);
        const out = [];
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = i * step; j < (i + 1) * step; j++) sum += Math.abs(data[j]);
          out.push(Math.min(1, (sum / step) * 3));
        }
        cb(out);
      })
      .catch(() => cb(Array.from({ length: 96 }, () => 0.5)));
  };

  const addFiles = async (e) => {
    const files = Array.from(e.target.files);
    const news = [];
    for (const f of files) {
      const meta = await loadMediaMeta(f);
      news.push({
        id: uid(), file: f, url: URL.createObjectURL(f), name: f.name, kind: meta.kind,
        meta, in: 0, duration: Math.min(meta.duration, 6), speed: 1, filter: 'none', volume: 1,
      });
    }
    setClips((c) => [...c, ...news]);
    notify(`${news.length} clip(s) added to timeline`);
  };

  const onMusic = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    loadWaveform(f, setWaveform);
    setMusic(f);
    notify('Music added');
  };

  const updateTime = () => {};

  const setClip = (id, patch) => setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  void updateTime;

  const moveClip = (id, dir) => {
    setClips((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const splitAt = () => {
    const t = playPosRef.current;
    if (t <= 0 || t >= totalDuration) return;
    const seg = segments.find((s) => t >= s.abs && t < s.abs + s.dur);
    if (!seg) return;
    const local = t - seg.abs;
    const A = { ...seg, id: uid(), duration: local, in: seg.in, dir: 1 };
    const B = { ...seg, id: uid(), duration: seg.dur - local, in: seg.in + local };
    setClips((cs) => {
      const i = cs.findIndex((c) => c.id === seg.id);
      return [...cs.slice(0, i), A, B, ...cs.slice(i + 1)];
    });
    setPlayPos(0);
    notify('Clip split ✂️');
  };

  const dupeClip = (c) => setClips((cs) => {
    const i = cs.findIndex((x) => x.id === c.id);
    return [...cs.slice(0, i + 1), { ...c, id: uid(), name: c.name + ' (copy)' }, ...cs.slice(i + 1)];
  });

  const removeClip = (id) => { setClips((cs) => cs.filter((c) => c.id !== id)); notify('Clip removed'); };

  const reverseClip = (c) => setClip(c.id, { reversed: !c.reversed });

  // ---- playback ----
  useEffect(() => {
    seqRef.current = segments;
    playPosRef.current = playPos;
  }, [segments, playPos]);

  const stopPlay = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
    if (videoRef.current) videoRef.current.pause();
  }, []);

  useEffect(() => () => stopPlay(), [stopPlay]);

  const seekTo = (t) => {
    const segs = seqRef.current;
    if (!segs.length) return;
    const clamped = Math.min(t, totalDuration);
    const idx = segs.findIndex((s) => clamped >= s.abs && clamped < s.abs + s.dur);
    if (idx === -1) return;
    const local = clamped - segs[idx].abs;
    curSeg.current = idx;
    setPlayPos(clamped);
    if (segs[idx].kind === 'video') {
      if (imgRef.current) imgRef.current.style.display = 'none';
      if (videoRef.current) {
        videoRef.current.style.display = 'block';
        videoRef.current.src = segs[idx].url;
        videoRef.current.currentTime = (segs[idx].in + local / segs[idx].speed);
      }
    } else {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.style.display = 'none'; }
      if (imgRef.current) {
        imgRef.current.style.display = 'block';
        imgRef.current.src = segs[idx].url;
      }
    }
  };

  useEffect(() => {
    if (playing && segments.length) {
      startRef.current = performance.now() - playPosRef.current * 1000;
      timer.current = setInterval(() => {
        const t = (performance.now() - startRef.current) / 1000;
        if (t >= totalDuration) { stopPlay(); setPlayPos(0); return; }
        setPlayPos(t);
        playPosRef.current = t;
        const segs = seqRef.current;
        const idx = segs.findIndex((s) => t >= s.abs && t < s.abs + s.dur);
        if (idx !== curSeg.current && idx !== -1) seekTo(t);
      }, 33);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);

  const togglePlay = () => {
    if (playing) { stopPlay(); return; }
    if (clips.length === 0) return;
    setPlaying(true);
  };

  // ---- export ----
  const exportVideo = async () => {
    if (clips.length === 0) { notify('Add clips first', 'warn'); return; }
    setBusy(true);
    setExportOpen(false);
    setLog([]);
    notify('Building video…', 'info');
    try {
      await ensureFFmpeg();
      setEngine(true);
      const [W, H] = resolution === '720p' ? [1280, 720] : resolution === '2K' ? [2560, 1440] : [1920, 1080];
      const prepared = [];
      for (const c of clips) {
        const f = c.file;
        const bytes = await toUint8(f);
        const ext = c.kind === 'image' ? 'png' : 'mp4';
        const path = `c_${c.id}.${ext}`;
        let dur = c.duration / (c.speed || 1);
        prepared.push({
          name: path, kind: c.kind, fileBinary: bytes, duration: dur, start: c.in,
          filter: c.reversed ? `${filterFor(c.filter) ? filterFor(c.filter) + ',' : ''}reverse` : c.filter,
        });
      }
      setLog((l) => [...l, `✓ ${clips.length} clips staged`]);
      const url = await runMerge(prepared, {
        width: W, height: H, fps, transition: transition === 'none' ? 'none' : transition,
        transitionDuration: tDuration, music: music ? { bytes: await toUint8(music), ext: music.name.split('.').pop() } : null,
      });
      upsertProject({ id: Date.now().toString(36), name: `Video ${Date.now() % 10000}`, type: 'video', res: `${W}x${H}`, duration: `${Math.round(totalDuration)}s`, thumbnail: '', createdAt: Date.now(), modifiedAt: Date.now(), favorite: false, inTrash: false });
      setLog((l) => [...l, '✓ Export finished']);
      notify('Video exported ✨');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'design-master.mp4';
      a.click();
    } catch (err) {
      console.error(err);
      notify('Export failed: ' + err.message, 'error');
      setLog((l) => [...l, '✗ ' + err.message]);
    } finally {
      setBusy(false);
    }
  };

  // ---- timeline visuals ----
  const pps = zoomed ? 26 : 10;

  return (
    <div className="ws video-ws">
      <div className="ws-header">
        <div>
          <h1>🎬 Video Editor</h1>
          <p>{clips.length} clips · {Math.round(totalDuration * 10) / 10}s · {fps} fps · {resolution}</p>
        </div>
        <div className="ws-actions">
          <button className="btn" onClick={togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
          <button className="btn" onClick={splitAt} disabled={!clips.length}>✂️ Split</button>
          <button className="btn" onClick={() => { setZoomed(!zoomed); }}>🔍 Zoom {zoomed ? 'Out' : 'In'}</button>
          <Btn className="btn-primary" onClick={() => setExportOpen(true)} disabled={!clips.length} title="Export with engine">⬇ Export</Btn>
        </div>
      </div>

      {!engine && (
        <div className="engine-note">
          <span>⚙️ FFmpeg engine not loaded.</span>
          <button className="btn btn-sm btn-primary" onClick={async () => { setEngine(await ensureFFmpeg().then(() => true).catch(() => false)); notify(engine ? 'Engine ready' : 'Engine load failed', engine ? 'success' : 'error'); }}>Load Engine</button>
        </div>
      )}

      <div className="editor-layout video-layout">
        <aside className="panel tool-col">
          <div className="panel-head"><h3>Media</h3></div>
          <label className="btn btn-ghost drop-trigger">
            + Add Videos & Images
            <input type="file" accept="video/*,image/*" multiple hidden onChange={addFiles} />
          </label>
          <label className="btn btn-ghost drop-trigger" style={{ marginTop: 8 }}>
            🎵 Add Music
            <input type="file" accept="audio/*" hidden onChange={onMusic} />
          </label>

          <div className="panel-head"><h3>Transition</h3></div>
          <div className="chip-wrap">
            {TRANSITIONS.map((t) => (
              <Chip key={t.id} active={transition === t.id} onClick={() => setTransition(t.id)}>{t.label}</Chip>
            ))}
          </div>
          <Slider label="Transition Length" min={0.1} max={2} step={0.1} value={tDuration} onChange={setTDuration} format={(v) => `${v}s`} />

          <div className="panel-head"><h3>Filter (all clips)</h3></div>
          <div className="chip-wrap">
            {PRESET_FILTERS.map((f) => (
              <Chip key={f.id} active={clips.filter((c) => c.filter === f.id).length === clips.length && clips.length > 0} onClick={() => setClips((cs) => cs.map((c) => ({ ...c, filter: f.id })))}>{f.label}</Chip>
            ))}
          </div>

          <div className="panel-head"><h3>Export</h3></div>
          <Field label="Resolution">
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option>720p</option><option>1080p</option><option>2K</option>
            </select>
          </Field>
          <Field label="FPS">
            <select value={fps} onChange={(e) => setFps(+e.target.value)}>
              <option value={24}>24</option><option value={30}>30</option><option value={60}>60</option>
            </select>
          </Field>
          <Slider label="Music Volume" min={0} max={2} step={0.1} value={volume} onChange={setVolume} />

          <div className="panel-head"><h3>Text Overlays</h3></div>
          <Btn className="btn-ghost" onClick={() => { setTexts((t) => [...t, { id: uid(), text: 'New Text', at: 0, dur: npn() }]); notify('Text overlay added'); }}>+ Add Text</Btn>
        </aside>

        <div className="video-stage-col">
          <div className="preview-area">
            <div className="preview-inner">
              <video ref={videoRef} muted controls={false} style={{ width: '100%', maxHeight: 420, display: 'none', filter: curFilter() }} />
              <img ref={imgRef} alt="" style={{ width: '100%', maxHeight: 420, display: 'none', filter: curFilter() }} />
              {!clips.length && <EmptyStateTxt />}
            </div>
            <div className="preview-bar">
              <input className="playhead" type="range" min="0" max={totalDuration || 1} step="0.05" value={playPos} onChange={(e) => seekTo(+e.target.value)} />
              <span>{fmtTime(playPos)} / {fmtTime(totalDuration)}</span>
            </div>
          </div>

          <div className="track-stack">
            {texts.map((t, i) => (
              <div key={t.id} className="overlay-chip" style={{ left: t.at * pps, width: Math.max(60, t.dur * pps) }} onClick={() => setTexts((ts) => ts.map((x) => x.id === t.id ? { ...x, text: prompt(x.text) } : x))}>
                <span>➤ {t.text}</span>
              </div>
            ))}
            <div className="track-row">
              <div className="track-label">🎞</div>
              <div className="track">
                {segments.map((c) => (
                  <div
                    key={c.id}
                    className={`clip-blk ${c.kind} ${c.reversed ? 'rev' : ''}`}
                    style={{ width: Math.max(34, c.dur * pps * c.speed), filter: CSS_FILTER[c.filter] }}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text', c.id)}
                    onDrop={(e) => { const id = e.dataTransfer.getData('text'); if (id && id !== c.id) moveClip(id, segments.findIndex((s) => s.id === c.id) > segments.findIndex((s) => s.id === id) ? -1 : 1); }}
                    onDragOver={(e) => e.preventDefault()}
                    title={`${c.name} · ${fmtTime(c.duration)}`}
                  >
                    {c.kind === 'image' ? '🖼 ' : '🎬 '}{c.name.replace(/\.[^.]+$/, '').slice(0, 10)}
                  </div>
                ))}
              </div>
            </div>
            <div className="track-row">
              <div className="track-label">🔊</div>
              <div className="track audio">
                {music ? (
                  <div className="wave-wrap" onClick={() => { if (audioDemoRef.current) audioDemoRef.current.play(); }}>
                    <audio ref={audioDemoRef} src={musicURL} />
                    {waveform.map((v, i) => <i key={i} style={{ height: `${Math.max(8, v * 100)}%` }} />)}
                  </div>
                ) : <small className="track-hint">Drop music to add a soundtrack</small>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="clip-panel">
        <div className="panel-head"><h3>Clips</h3></div>
        <div className="clip-list">
          {clips.map((c, i) => (
            <div key={c.id} className="clip-card">
              <div className="clip-thumb" style={{ filter: CSS_FILTER[c.filter] }}>
                {c.kind === 'video' ? <video src={c.url} muted /> : <img src={c.url} alt="" />}
              </div>
              <div className="clip-info">
                <strong>{c.name.replace(/\.[^.]+$/, '').slice(0, 18)}</strong>
                <div className="clip-edits">
                  <Field label="In"><input type="number" step="0.1" min="0" value={c.in} onChange={(e) => setClip(c.id, { in: Math.min(+e.target.value, c.meta.duration - 0.2) })} /></Field>
                  <Field label="Dur"><input type="number" step="0.1" min="0.2" value={Math.round(c.duration * 10) / 10} onChange={(e) => setClip(c.id, { duration: Math.max(0.2, Math.min(+e.target.value, c.meta.duration)) })} /></Field>
                  <Field label="Speed">
                    <select value={c.speed} onChange={(e) => setClip(c.id, { speed: +e.target.value })}>
                      {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
                    </select>
                  </Field>
                  <Field label="Filter">
                    <select value={c.filter} onChange={(e) => setClip(c.id, { filter: e.target.value })}>
                      {PRESET_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </Field>
                  <button className="btn btn-sm" onClick={() => reverseClip(c)}>{c.reversed ? '↩ Unreverse' : '↪ Reverse'}</button>
                </div>
              </div>
              <div className="clip-ops">
                <button title="Move left" onClick={() => moveClip(c.id, -1)}>←</button>
                <button title="Move right" onClick={() => moveClip(c.id, 1)}>→</button>
                <button title="Duplicate" onClick={() => dupeClip(c)}>⧉</button>
                <button title="Delete" onClick={() => removeClip(c.id)}>🗑</button>
              </div>
            </div>
          ))}
          {!clips.length && <small className="track-hint">No clips — add media above, reorder, trim, filter, then export.</small>}
        </div>
      </div>

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Export Video" width={500}>
        <div className="ctl-grid">
          <Field label="Resolution"><select value={resolution} onChange={(e) => setResolution(e.target.value)}><option>720p</option><option>1080p</option><option>2K</option></select></Field>
          <Field label="FPS"><select value={fps} onChange={(e) => setFps(+e.target.value)}><option value={24}>24</option><option value={30}>30</option><option value={60}>60</option></select></Field>
          <Field label="Codec"><select defaultValue="libx264"><option value="libx264">H.264 MP4</option></select></Field>
          <Field label="Transition"><select value={transition} onChange={(e) => setTransition(e.target.value)}>{TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
        </div>
        <p className="est-size">Estimated size: <strong>{(totalDuration * (resolution === '1080p' ? 6 : 3.5)).toFixed(1)} MB</strong> (variable)</p>
        <div className="gen-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={exportVideo} disabled={busy}>🚀 Export now {busy && '(rendering…)'}</button>
          <button className="btn" onClick={() => setExportOpen(false)}>Cancel</button>
        </div>
      </Modal>

      {busy && (
        <div className="export-overlay">
          <div className="export-card">
            <div className="shimmer-bar animating" />
            <h3>Rendering your video…</h3>
            {log.map((l, i) => <small key={i}>{l}</small>)}
          </div>
        </div>
      )}
    </div>
  );

  function EmptyStateTxt() {
    return <div className="empty"><div className="empty-icon">🎞️</div><h3>Timeline empty</h3><p>Add videos or images to build your edit</p></div>;
  }
  function npn() { return 3; }
  function prompt(x) {
    const v = window.prompt('Text overlay content', x);
    return v == null ? x : v;
  }
  function curFilter() {
    const s = segments.find((seg) => playPos >= seg.abs && playPos < seg.abs + seg.dur);
    return s ? CSS_FILTER[s.filter] : 'none';
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}