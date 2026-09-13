import { useState } from 'react';
import { useApp } from '../lib/store';
import { EmptyState } from './common';

export default function AIHistory() {
  const { aiHistory, removeAI, navigate, notify } = useApp();
  const [kind, setKind] = useState('all');
  const list = aiHistory.filter((h) => kind === 'all' || h.kind === kind);

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>🤖 AI Generation History</h1><p>Your private archive of generations — stored locally</p></div>
      </div>
      <div className="toolbar-row">
        {['all', 'image', 'video'].map((k) => (
          <button key={k} className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'image' ? 'Images' : 'Videos'}</button>
        ))}
      </div>
      {list.length ? (
        <div className="history-list">
          {list.map((h) => (
            <div key={h.id} className="history-row glass">
              <div className="history-thumb">
                {h.kind === 'video'
                  ? <video src={h.output} muted />
                  : <img src={h.output} alt={h.prompt} />}
              </div>
              <div className="history-meta">
                <strong>{h.prompt || 'Untitled generation'}</strong>
                <small>
                  {new Date(h.date).toLocaleString()} · {h.kind} · {h.settings ? Object.entries(h.settings).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}
                </small>
                {h.outputEnds && <small className="muted">Model: DesignMaster 1.0 (browser-local)</small>}
              </div>
              <div className="history-ops">
                <button onClick={() => { navigate('photo', { src: h.output, name: h.prompt || 'Generation' }); }}>✏️ Edit</button>
                <button onClick={() => { navigate('aigen', {}); notify('Open the generator to reuse this prompt'); }}>↺ Reuse</button>
                <button onClick={() => { const a = document.createElement('a'); a.href = h.output; a.download = 'generation.png'; a.click(); notify('Downloaded'); }}>⬇</button>
                <button onClick={() => { removeAI(h.id); notify('Deleted'); }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon="🤖" title="No generations yet" sub="Create an image or video with AI and it will appear here" action={<button className="btn btn-ai" onClick={() => navigate('aigen')}>✨ Create now</button>} />
      )}
    </div>
  );
}