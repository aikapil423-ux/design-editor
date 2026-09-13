import { useState } from 'react';
import { useApp } from '../lib/store';

const QUICK = [
  { id: 'aigen', icon: '✨', title: 'AI Image Generator', desc: 'Text → stunning images', view: 'aigen' },
  { id: 'aivid', icon: '🎬', title: 'AI Video Generator', desc: 'Text → cinematic video', view: 'aivid' },
  { id: 'photo', icon: '🖼️', title: 'Photo Editor', desc: 'Pro canvas editing', view: 'photo' },
  { id: 'video', icon: '🎥', title: 'Video Editor', desc: 'Timeline editing', view: 'video' },
  { id: 'bg', icon: '🧹', title: 'Background Remover', desc: 'One-click cutout', view: 'ai', tool: 'bg' },
  { id: 'obj', icon: '🧽', title: 'Object Remover', desc: 'Erase anything', view: 'ai', tool: 'object' },
  { id: 'enh', icon: '✨', title: 'Image Enhancer', desc: 'Auto color magic', view: 'ai', tool: 'enhance' },
  { id: 'up', icon: '🚀', title: 'Video Enhancer', desc: 'Timeline + effects', view: 'video' },
  { id: 'i2v', icon: '🎞️', title: 'Image to Video', desc: 'Animate a still', view: 'aivid' },
  { id: 't2v', icon: '📽️', title: 'Text to Video', desc: 'Prompt → motion', view: 'aivid' },
  { id: 't2i', icon: '🪄', title: 'Text to Image', desc: 'Prompt → art', view: 'aigen' },
  { id: 'collage', icon: '🧩', title: 'Collage Studio', desc: 'Grids & layouts', view: 'collage' },
];

const TYPE_ICON = { video: '🎬', photo: '🖼️', collage: '🧩', ai: '✨', template: '🎨' };

export default function Home() {
  const { navigate, projects, aiHistory } = useApp();
  const recent = (projects || []).slice(0, 6);
  const [filter, setFilter] = useState('all');

  const open = (p) => {
    if (p.type === 'video' || p.type === 'ai') navigate('video', {});
    else navigate('photo', { src: p.thumbnail, name: p.name });
  };

  return (
    <div className="ws">
      <section className="hero glass">
        <div className="hero-glow" />
        <span className="hero-pill">✦ Design Master Studio</span>
        <h1>Create anything.<br />Edit <em>everything.</em> Powered by AI.</h1>
        <p>Photos, video, collage and AI generation — one premium studio, right in your browser.</p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => navigate('aigen')}>✨ Create Image</button>
          <button className="btn btn-primary" onClick={() => navigate('aivid')}>🎬 Create Video</button>
          <button className="btn btn-ghost" onClick={() => navigate('photo')}>✏️ Start Editing</button>
        </div>
      </section>

      <section>
        <div className="section-title">
          <h2>⚡ Quick Actions</h2>
        </div>
        <div className="quick-grid">
          {QUICK.map((q) => (
            <button key={q.id} className="quick-card glass"
              onClick={() => navigate(q.view, q.tool ? { tool: q.tool } : {})}>
              <span className="quick-icon">{q.icon}</span>
              <strong>{q.title}</strong>
              <small>{q.desc}</small>
              <span className="quick-go">→</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">
          <h2>🗂 Recent Projects</h2>
          <div className="seg">
            {['all', 'video', 'photo'].map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f}</button>
            ))}
          </div>
        </div>
        <div className="project-grid">
          {recent.filter((p) => filter === 'all' || p.type === filter).map((p) => (
            <ProjectCard key={p.id} p={p} onOpen={() => open(p)} />
          ))}
        </div>
      </section>

      {aiHistory.length > 0 && (
        <section>
          <div className="section-title"><h2>🤖 Recent AI Generations</h2><button className="btn btn-sm" onClick={() => navigate('home', {})}>View all</button></div>
          <div className="gen-strip">
            {aiHistory.slice(0, 6).map((h) => h.output && (
              <div key={h.id} className="gen-mini">
                {h.kind === 'video'
                  ? <video src={h.output} muted />
                  : <img src={h.output} alt={h.prompt} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function ProjectCard({ p, onOpen, actions }) {
  const { moveToTrash, notify } = useApp();
  return (
    <div className="project-card glass" onClick={onOpen}>
      <div className="project-thumb">
        {p.thumbnail ? <img src={p.thumbnail} alt={p.name} /> : <div className="thumb-placeholder">{TYPE_ICON[p.type]}</div>}
        <span className="type-badge">{TYPE_ICON[p.type]} {p.type}</span>
        {p.favorite && <span className="fav-badge">★</span>}
      </div>
      <div className="project-body">
        <strong>{p.name}</strong>
        <small>
          {p.res} {p.duration && `· ${p.duration}`} · {new Date(p.modifiedAt).toLocaleDateString()}
        </small>
        <div className="project-ops" onClick={(e) => e.stopPropagation()}>
          {actions || (
            <>
              <button title="More" onClick={() => {}}>•••</button>
              <button title="Delete" onClick={() => { moveToTrash([p.id]); notify('Moved to trash'); }}>🗑</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}