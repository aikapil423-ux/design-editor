import { useState } from 'react';
import { useApp } from '../lib/store';
import { Btn, Chip, Field, Slider } from './common';

const LANG = { en: 'English', hi: 'हिंदी' };
const LINES = [
  { t: 'Namaste everyone 👋', hi: 'नमस्ते दोस्तों 👋' },
  { t: 'Welcome back to the channel.', hi: 'चैनल पर वापस स्वागत है।' },
  { t: 'Today we explore the wild.', hi: 'आज हम जंगल की सैर करेंगे।' },
  { t: "Let's get started right away!", hi: 'चलो तुरंत शुरू करते हैं!' },
  { t: "That's all for today. See you!", hi: 'आज के लिए बस इतना। फिर मिलेंगे!' },
];
const ANIMS = ['None', 'Fade', 'Typewriter', 'Slide', 'Pop', 'Bounce', 'Zoom', 'Glitch', 'Neon'];

export default function Subtitles() {
  const { notify } = useApp();
  const [subs, setSubs] = useState([]);
  const [auto, setAuto] = useState(false);
  const [font, setFont] = useState('Segoe UI');
  const [size, setSize] = useState(42);
  const [color, setColor] = useState('#ffffff');
  const [bg, setBg] = useState('rgba(0,0,0,0.55)');
  const [pos, setPos] = useState('bottom');
  const [anim, setAnim] = useState('Fade');
  const [highlight, setHighlight] = useState(true);
  const [lang, setLang] = useState('en');

  const generate = (langChoice) => {
    const ready = LINES.map((l, i) => ({ id: i, start: i * 2.2, end: (i + 1) * 2.2, text: langChoice === 'hi' ? l.hi : l.t, raw: l }));
    setSubs(ready);
    setLang(langChoice);
    setAuto(true);
    notify(`Transcribed ${ready.length} lines (${LANG[langChoice]})`);
  };

  const translateTo = (l) => {
    if (l === lang) return;
    setSubs((s) => s.map((x) => ({ ...x, text: (l === 'hi' ? x.raw.hi : x.raw.t) })));
    setLang(l);
    notify(`Translated to ${LANG[l]}`);
  };

  const total = subs.length ? subs[subs.length - 1].end : 8;

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>📝 Subtitles & Captions</h1><p>AI transcription, styling and animations for your videos</p></div>
        <div className="ws-actions">
          <Btn className="btn-ai" onClick={() => generate('en')}>🤖 Auto-generate (EN)</Btn>
          <Btn className="btn-ai" onClick={() => generate('hi')}>🤖 ऑटो-कैप्शन (हिंदी)</Btn>
          {auto && <Btn onClick={() => translateTo(lang === 'en' ? 'hi' : 'en')}>🌐 Translate → {LANG[lang === 'en' ? 'hi' : 'en']}</Btn>}
        </div>
      </div>

      <div className="ws-grid split">
        <div className="panel">
          <div className="panel-head"><h3>Timeline</h3>{auto && <Tagful>{subs.length} cues</Tagful>}</div>
          <div className="cue-line" style={{ height: 8, background: '#20202e', borderRadius: 6 }}>
            {subs.map((s) => (
              <i key={s.id} style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%` }} />
            ))}
          </div>
          <div className="sub-list">
            {subs.map((s, i) => (
              <div key={s.id} className="sub-row">
                <span className="sub-num">{i + 1}</span>
                <input className="w60" type="number" step="0.1" min="0" value={s.start} onChange={(e) => setSubs((arr) => arr.map((x) => x.id === s.id ? { ...x, start: +e.target.value } : x))} />
                <span>→</span>
                <input className="w60" type="number" step="0.1" min="0" value={s.end} onChange={(e) => setSubs((arr) => arr.map((x) => x.id === s.id ? { ...x, end: +e.target.value } : x))} />
                <input className="grow" value={s.text} onChange={(e) => setSubs((arr) => arr.map((x) => x.id === s.id ? { ...x, text: e.target.value } : x))} />
                <button className="remove-x" onClick={() => setSubs((arr) => arr.filter((x) => x.id !== s.id))}>✕</button>
              </div>
            ))}
            {!subs.length && <p className="muted">No cues yet — auto-generate captions above.</p>}
          </div>
        </div>

        <div className="panel prompt-panel">
          <div className="panel-head"><h3>Style & Preview</h3></div>
          <Field label="Font"><select value={font} onChange={(e) => setFont(e.target.value)}>{['Segoe UI', 'Arial', 'Georgia', 'Impact', 'Verdana', 'Courier New'].map((f) => <option key={f}>{f}</option>)}</select></Field>
          <Slider label="Size" min={16} max={96} value={size} onChange={setSize} />
          <div className="ctl-grid">
            <Field label="Color"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
            <Field label="Background"><input type="color" value={bg === 'rgba(0,0,0,0.55)' ? '#000000' : bg} onChange={(e) => setBg(e.target.value + 'cc')} /></Field>
          </div>
          <Field label="Position">
            <select value={pos} onChange={(e) => setPos(e.target.value)}><option value="bottom">Bottom</option><option value="top">Top</option><option value="center">Center</option></select>
          </Field>
          <Field label="Animation">
            <select value={anim} onChange={(e) => setAnim(e.target.value)}>{ANIMS.map((a) => <option key={a}>{a}</option>)}</select>
          </Field>
          <label className="toggle-row"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Highlight keywords</label>

          <div className="sub-preview" style={{ alignItems: pos }}>
            <div className={`cap-preview subtitle-anim-${anim.toLowerCase()}`} style={{ fontFamily: font, fontSize: size, color, background: bg }}>
              {highlight ? subs[0]?.text.split(' ').map((w, i) => <span key={i} className={i === 2 ? 'kw' : ''}>{w} </span>) : (subs[0]?.text || 'Your captions appear here')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Tagful = ({ children }) => <span className="tag" style={{ marginLeft: 8 }}>{children}</span>;