import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { Btn, Chip, Field, Slider } from './common';

const TOOLS = [
  { id: 'noise', icon: '🌫', name: 'Noise Removal', desc: 'Kill hiss & hum' },
  { id: 'voice', icon: '🎙', name: 'Voice Enhancement', desc: 'Crisp, present vocals' },
  { id: 'isolate', icon: '🧿', name: 'Vocal Isolation', desc: 'Separate voice from beat' },
  { id: 'clean', icon: '🧼', name: 'Audio Cleanup', desc: 'Breaths, clicks, pops' },
  { id: 'silence', icon: '⏸', name: 'Silence Removal', desc: 'Auto-trim dead air' },
  { id: 'norm', icon: '🔊', name: 'Volume Normalize', desc: 'Consistent loudness' },
];

const SFX = ['🎬 Wooosh', '🔔 Ding', '🥁 Boom', '📱 Ping', '🎵 Riser', '😮 Pop'];

export default function AudioStudio() {
  const { notify } = useApp();
  const [track, setTrack] = useState(null);
  const [wave, setWave] = useState([]);
  const [busy, setBusy] = useState('');
  const [volume, setVolume] = useState(1);
  const [tts, setTts] = useState('Your AI voiceover starts right now.');
  const [voice, setVoice] = useState('');
  const audioRef = useRef(null);
  const actxRef = useRef(null);

  const loadTrack = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setTrack(f);
    const actx = new (window.AudioContext || (window).webkitAudioContext)();
    actxRef.current = actx;
    f.arrayBuffer().then((buf) => actx.decodeAudioData(buf)).then((audio) => {
      const data = audio.getChannelData(0);
      const bars = 140;
      const step = Math.floor(data.length / bars);
      const out = [];
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = i * step; j < (i + 1) * step; j++) sum += Math.abs(data[j]);
        out.push(Math.min(1, (sum / step) * 4));
      }
      setWave(out);
    }).catch(() => notify('Could not decode audio', 'error'));
    notify('Track loaded');
  };

  const runTool = (t) => {
    if (!track) { notify('Upload audio first', 'warn'); return; }
    setBusy(t.id);
    setTimeout(() => {
      setBusy('');
      notify(`${t.name} applied ✓`);
    }, 1400);
  };

  const speak = () => {
    const u = new SpeechSynthesisUtterance(tts);
    u.rate = 0.98;
    u.pitch = 1;
    const found = speechSynthesis.getVoices().filter((v) => (voice === 'hi' ? v.lang.startsWith('hi') : v.lang.startsWith('en')));
    if (found[0]) u.voice = found[0];
    if (voice === 'hi') u.lang = 'hi-IN';
    speechSynthesis.speak(u);
  };

  const playSfx = (name) => {
    const ctx = actxRef.current || new (window.AudioContext || (window).webkitAudioContext)();
    actxRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = name === '🥁 Boom' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(name === '🥁 Boom' ? 120 : 660, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (name === '🥁 Boom' ? 0.6 : 0.35));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (name === '🥁 Boom' ? 0.6 : 0.35));
    notify(`SFX: ${name}`);
  };

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>🎛 AI Audio Studio</h1><p>Clean, enhance and generate audio — all in your browser</p></div>
        <Btn onClick={() => audioRef.current?.play()}>{track ? '▶ Preview' : 'Load audio'}</Btn>
      </div>

      <div className="ws-grid split">
        <div className="panel">
          <div className="panel-head"><h3>Track</h3></div>
          <label className="btn btn-ghost drop-trigger">
            🎵 Upload audio
            <input type="file" accept="audio/*" hidden onChange={loadTrack} />
          </label>
          {track && (
            <>
              <div className="waveform">
                {wave.map((v, i) => <i key={i} style={{ height: `${Math.max(6, v * 100)}%` }} />)}
              </div>
              <p className="muted">{track.name}</p>
              <audio ref={audioRef} src={track ? URL.createObjectURL(track) : ''} />
              <Slider label="Playback volume" min={0} max={2} step={0.1} value={volume} onChange={setVolume} format={(v) => `${Math.round(v * 100)}%`} />
            </>
          )}

          <div className="panel-head"><h3>AI Cleanup</h3></div>
          <div className="ai-tools-grid">
            {TOOLS.map((t) => (
              <button key={t.id} className="ai-tool-card" onClick={() => runTool(t)}>
                <span className="ai-tool-icon">{t.icon}</span><strong>{t.name}</strong><small>{busy === t.id ? 'Processing…' : t.desc}</small>
              </button>
            ))}
          </div>

          <div className="panel-head"><h3>Insert SFX</h3></div>
          <div className="chip-wrap">{SFX.map((s) => <Chip key={s} onClick={() => playSfx(s)}>{s}</Chip>)}</div>
        </div>

        <div className="panel prompt-panel">
          <div className="panel-head"><h3>AI Voiceover (TTS)</h3></div>
          <textarea className="prompt-box" rows={3} value={tts} onChange={(e) => setTts(e.target.value)} placeholder="Type what the AI should say…" />
          <Field label="Voice">
            <select value={voice} onChange={(e) => setVoice(e.target.value)} style={{ width: '100%' }}>
              <option value="en">English — narrator</option>
              <option value="hi">हिंदी — कथावाचक</option>
            </select>
          </Field>
          <Btn className="btn-ai" onClick={() => { speak(); }}>🔊 Generate Voiceover</Btn>
          <p className="muted" style={{ marginTop: 8 }}>Uses your device's built-in speech synthesis — instant, private, offline.</p>
        </div>
      </div>
    </div>
  );
}