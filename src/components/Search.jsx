import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, SEARCH_TEMPLATES } from '../lib/store';

export default function Search() {
  const { projects, aiHistory, navigate, closeSearch, searchOpen } = useApp();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('all');
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    if (searchOpen) { setQ(''); setHi(0); setTimeout(() => boxRef.current?.focus(), 30); }
  }, [searchOpen]);

  const prjs = (projects || []).map((p) => ({
    id: 'p' + p.id, title: p.name, type: p.type, icon: { video: '🎬', photo: '🖼️', collage: '🧩', ai: '✨' }[p.type] || '📄', sub: `${p.type} · ${p.res}${p.duration ? ' · ' + p.duration : ''}`, go: () => { closeSearch(); p.type === 'video' ? navigate('video', {}) : navigate('photo', { src: p.thumbnail, name: p.name }); },
  }));
  const gens = aiHistory.map((h) => ({
    id: 'g' + h.id, title: h.prompt || 'Generation', type: 'generation', icon: h.kind === 'video' ? '🎬' : '🖼', sub: new Date(h.date).toLocaleString(), src: h.output, go: () => { closeSearch(); navigate('photo', { src: h.output }); },
  }));
  const tpls = SEARCH_TEMPLATES.map((t) => ({
    id: 't' + t.id, title: t.name, type: 'template', icon: '🎨', sub: 'Template · starts with this canvas', go: () => { closeSearch(); navigate('photo', { templateId: t.id }); },
  }));
  const results = useMemo(() => {
    const all = [...prjs, ...gens, ...tpls];
    const filter = tag === 'all' ? all : all.filter((r) => r.type === tag);
    const qq = q.toLowerCase();
    return qq ? filter.filter((r) => (r.title || '').toLowerCase().includes(qq)) : filter.slice(0, 12);
  }, [q, tag, prjs, gens, tpls]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
      if (e.key === 'Enter' && results[hi]) { results[hi].go(); }
      if (e.key === 'Escape') closeSearch();
    };
    if (searchOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, results, hi]);

  return (
    <div className="search-overlay" onClick={closeSearch}>
      <div className="search-pop glass" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrap">
          <span>🔍</span>
          <input ref={boxRef} placeholder="Search projects, templates, generations…  (⌫ to clear)" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>Esc</kbd>
        </div>
        <div className="toolbar-row">
          {['all', 'project', 'generation', 'template'].map((t) => (
            <button key={t} className={`chip ${tag === t ? 'active' : ''}`} onClick={() => { setTag(t); setHi(0); }}>{t[0].toUpperCase() + t.slice(1) + (t === 'all' ? '' : 's')}</button>
          ))}
        </div>
        <div className="search-results">
          {results.length === 0 && <p className="muted">No matches for "{q}"</p>}
          {results.map((r, i) => (
            <div key={r.id} className={`search-row ${i === hi ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={r.go}>
              <span className="search-icon">{r.icon}</span>
              <div className="search-meta"><strong>{r.title}</strong><small>{r.sub}</small></div>
              {r.src && <img className="search-thumb" src={r.src} alt="" />}
              <span className="search-go">↵</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}