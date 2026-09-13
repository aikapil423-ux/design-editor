import { useState } from 'react';
import { useApp } from '../lib/store';
import { ensureFFmpeg, ffLoaded } from '../lib/ffmpeg';
import { Btn, Field, Slider } from './common';

const ACCENTS = [
  { id: 'duotone', label: 'Aurora', c: 'linear-gradient(135deg,#e94560,#0f3460)' },
  { id: 'violet', label: 'Ultraviolet', c: 'linear-gradient(135deg,#8a2be2,#0ff)' },
  { id: 'emerald', label: 'Emerald', c: 'linear-gradient(135deg,#11998e,#38ef7d)' },
  { id: 'sunset', label: 'Sunset', c: 'linear-gradient(135deg,#fda085,#f6d365)' },
];

export default function Settings() {
  const { settings, updateSettings, notify, projects } = useApp();
  const [engine, setEngine] = useState(ffLoaded());
  const [busy, setBusy] = useState(false);

  const loadEng = async () => {
    setBusy(true);
    try {
      await ensureFFmpeg();
      setEngine(true);
      notify('FFmpeg engine ready');
    } catch (e) {
      notify('Engine failed: ' + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const clearData = () => {
    if (window.confirm('This clears local projects, AI history and settings. Your media library is untouched.')) {
      localStorage.removeItem('dm_projects');
      localStorage.removeItem('dm_history');
      localStorage.removeItem('dm_settings');
      window.location.reload();
    }
  };

  return (
    <div className="ws">
      <div className="ws-header"><div><h1>⚙ Settings</h1></div></div>
      <div className="settings-grid">
        <div className="panel">
          <div className="panel-head"><h3>Appearance</h3></div>
          <Field label="Accent theme">
            <div className="acc-row">
              {ACCENTS.map((a) => (
                <button key={a.id} className={`acc-swatch ${settings.theme === a.id ? 'on' : ''}`} style={{ background: a.c }} onClick={() => updateSettings({ theme: a.id })} title={a.label}>
                  {settings.theme === a.id && '✓'}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Engines</h3></div>
          <p className="muted">Video & audio processing run entirely in your browser using FFmpeg (WebAssembly). Requires ~31 MB of core once per session.</p>
          <Btn className="btn-primary" onClick={loadEng} disabled={engine || busy}>{engine ? '✓ Engine ready' : busy ? 'Loading…' : '⚙️ Load FFmpeg engine'}</Btn>
          <p className="muted" style={{ marginTop: 8 }}>State: <strong>{engine ? 'Loaded' : 'Idle'}</strong></p>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Export defaults</h3></div>
          <Field label="Default FPS">
            <select value={settings.exportFps} onChange={(e) => updateSettings({ exportFps: +e.target.value })}>
              <option value={24}>24</option><option value={30}>30</option><option value={60}>60</option>
            </select>
          </Field>
          <Field label="Quality"><select value={settings.exportQuality} onChange={(e) => updateSettings({ exportQuality: e.target.value })}><option value="low">Low</option><option value="high">High</option><option value="max">Maximum</option></select></Field>
          <Slider label="Default Music Volume" min={0} max={2} step={0.1} value={1} onChange={() => {}} />
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Data & Privacy</h3></div>
          <p className="muted">Everything is stored locally in your browser. Nothing is uploaded. Autosave: {settings.autosave ? 'on' : 'off'}</p>
          <div className="gen-actions" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => updateSettings({ autosave: !settings.autosave })}>Autosave {settings.autosave ? '→ Off' : '→ On'}</button>
            <button className="btn btn-danger" onClick={clearData}>🧹 Clear studio data</button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>{(projects || []).length} local projects · {new Blob([localStorage.getItem('dm_projects') || '']).size} KB</p>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Keyboard shortcuts</h3></div>
          <ul className="kbd-list">
            <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> Undo</li>
            <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> Redo</li>
            <li><kbd>Ctrl</kbd>+<kbd>S</kbd> Save</li>
            <li><kbd>Space</kbd> Play / Pause</li>
            <li><kbd>Delete</kbd> Remove selected</li>
            <li><kbd>Ctrl</kbd>+<kbd>C/V</kbd> Copy / paste objects</li>
          </ul>
        </div>
      </div>
    </div>
  );
}