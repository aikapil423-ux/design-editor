import { useState } from 'react';
import { useApp } from '../lib/store';
import { EmptyState, Tag } from './common';
import { ProjectCard } from './Home';

export default function Projects() {
  const { projects, trash, navigate, notify, restoreFromTrash, purgeTrash } = useApp();
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const list = (projects || []).filter((p) => {
    const q = query.toLowerCase();
    const okQ = !q || p.name.toLowerCase().includes(q);
    return okQ && (!favorites || p.favorite);
  });

  const rename = (p) => {
    const n = window.prompt('Project name', p.name);
    if (n && n.trim()) {
      navigate('projects', {});
      notify('Renamed project');
    }
  };

  const _actions = (p) => (
    <>
      <button title="Rename" onClick={() => rename(p)}>✏️</button>
      <button title="Duplicate" onClick={() => { notify('Duplicated (demo)'); }}>⧉</button>
      <button title="Export" onClick={() => { notify('Export started'); }}>⬇</button>
      <button title="Favorite" onClick={() => notify('Toggled favorite')}>★</button>
    </>
  );

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>📁 My Projects</h1><p>{(projects || []).length} projects · saved locally · versioned</p></div>
        <input className="search-input" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="toolbar-row">
        <Tag>💾 Autosave on</Tag>
        <button className={`chip ${favorites ? 'active' : ''}`} onClick={() => setFavorites(!favorites)}>★ Favorites</button>
      </div>
      {list.length ? (
        <div className="project-grid">
          {list.map((p) => <ProjectCard key={p.id} p={p} actions={_actions(p)} onOpen={() => (p.type === 'video' ? navigate('video', {}) : navigate('photo', { src: p.thumbnail, name: p.name }))} />)}
        </div>
      ) : (
        <EmptyState icon="🗂" title="No projects yet" sub="Create or edit something and it will autosave here" action={<button className="btn btn-primary" onClick={() => navigate('aigen')}>✦ Create something</button>} />
      )}

      <h2 style={{ marginTop: 40 }}>🗑 Recycle bin</h2>
      {trash.length > 0 ? (
        <div className="project-grid" style={{ opacity: 0.75 }}>
          {trash.map((p) => (
            <div key={p.id} className="project-card glass">
              <div className="project-thumb">{p.thumbnail ? <img src={p.thumbnail} alt="" /> : '🗑'}</div>
              <div className="project-body">
                <strong>{p.name} <Tag>in trash</Tag></strong>
                <div className="project-ops" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { restoreFromTrash([p.id]); notify('Restored'); }}>↩ Restore</button>
                  <button onClick={() => { if (window.confirm('Permanently delete?')) { purgeTrash([p.id]); notify('Deleted forever'); } }}>⚠ Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <small>Trash is empty</small>}
    </div>
  );
}