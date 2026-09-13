import { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { makeThumb } from '../lib/store';
import { Btn, Chip, EmptyState } from './common';

const CATEGORIES = [
  { id: 'all', label: 'All' }, { id: 'social', label: 'Social' }, { id: 'video', label: 'Video' },
  { id: 'business', label: 'Business' }, { id: 'event', label: 'Events' }, { id: 'poster', label: 'Posters' },
  { id: 'ads', label: 'Ads' },
];

const CATEGORY_MAP = {
  'IG Post': 'social', 'IG Story': 'social', 'Reel Cover': 'video', 'YouTube': 'video', 'YouTube Short': 'video',
  TikTok: 'video', 'Facebook Post': 'social', 'X Post': 'social', Ad: 'ads', Business: 'business', 'Product Ad': 'ads',
  Presentation: 'business', Wedding: 'event', Birthday: 'event', Poster: 'poster', Flyer: 'poster', Logo: 'business',
};

const TEMPLATES = [
  { name: 'Neon Reel', dims: '1080×1920', icon: '🎬', pal: ['#0d0221', '#8a2be2', '#0ff'], cat: 'video' },
  { name: 'IG Post · Minimal', dims: '1080×1080', icon: '📸', pal: ['#f8f9fa', '#dee2e6', '#212529'], cat: 'social' },
  { name: 'Instagram Story', dims: '1080×1920', icon: '📱', pal: ['#ff9966', '#ff5e62', '#3b0a45'], cat: 'social' },
  { name: 'YouTube Thumbnail', dims: '1280×720', icon: '▶️', pal: ['#ff0000', '#3b0a45', '#ffd866'], cat: 'video' },
  { name: 'Behind-the-Scenes', dims: '1080×1350', icon: '🎥', pal: ['#1f1c2c', '#928dab', '#000'], cat: 'video' },
  { name: 'TikTok Loop', dims: '1080×1920', icon: '🎵', pal: ['#25f4ee', '#fe2c55', '#000'], cat: 'video' },
  { name: 'Wedding Invite', dims: '1080×1350', icon: '💍', pal: ['#f6d365', '#fda085', '#7b2c5f'], cat: 'event' },
  { name: 'Birthday Bash', dims: '1080×1080', icon: '🎂', pal: ['#ffafbd', '#c9ffbf', '#a18cd1'], cat: 'event' },
  { name: 'Business Card', dims: '1050×600', icon: '💼', pal: ['#0f2027', '#2c5364', '#cfd8dc'], cat: 'business' },
  { name: 'Product Ad', dims: '1080×1080', icon: '🛍', pal: ['#3a1c71', '#d76d77', '#ffaf7b'], cat: 'ads' },
  { name: 'Poster · Music', dims: '1080×1920', icon: '🎤', pal: ['#ee0979', '#ff6a00', '#1a1a2e'], cat: 'poster' },
  { name: 'Flyer · Event', dims: '1080×1920', icon: '🎟️', pal: ['#11998e', '#38ef7d', '#0b1713'], cat: 'poster' },
  { name: 'Presentation 16:9', dims: '1920×1080', icon: '📊', pal: ['#134e5e', '#71b280', '#082032'], cat: 'business' },
  { name: 'YouTube Short', dims: '1080×1920', icon: '⏱', pal: ['#2b32b2', '#1488cc', '#0ff'], cat: 'video' },
  { name: 'Aesthetic Quote', dims: '1080×1350', icon: '✨', pal: ['#2e1a47', '#f5d0c5', '#ffcdb2'], cat: 'social' },
  { name: 'Logo Reveal', dims: '1080×1080', icon: '🏷', pal: ['#0f0c29', '#302b63', '#24243e'], cat: 'business' },
];

export default function Templates() {
  const { navigate, notify } = useApp();
  const [cat, setCat] = useState('all');
  const [thumbs, setThumbs] = useState({});
  const [favs, setFavs] = useState({});

  useEffect(() => {
    TEMPLATES.forEach((t) => {
      makeThumb(t.name, t.pal).then((u) => setThumbs((m) => ({ ...m, [t.name]: u })));
    });
  }, []);

  const list = TEMPLATES.filter((t) => cat === 'all' || (CATEGORY_MAP[t.name] || t.cat) === cat);

  const useTemplate = (t) => {
  const [w, h] = t.dims.split('×').map(Number);
  const templateId = w === 1920 && h === 1080 ? 'yt' : w === 1050 ? 'fb' : h === 1920 ? 'igst' : h >= 1350 ? 'tt' : 'ig';
  navigate('photo', { name: t.name, templateId, src: thumbs[t.name] });
  notify(`Template "${t.name}" opened`);
};

  return (
    <div className="ws">
      <div className="ws-header">
        <div><h1>🎨 Template Marketplace</h1><p>Premium presets for every platform — professionally sized and styled</p></div>
      </div>
      <div className="chip-wrap" style={{ marginBottom: 16 }}>
        {CATEGORIES.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</Chip>)}
      </div>
      <div className="template-grid">
        {list.map((t) => (
          <div key={t.name} className="template-card">
            <div className="template-preview" style={{ background: `linear-gradient(135deg, ${t.pal[0]}, ${t.pal[2]})` }}>
              {thumbs[t.name] ? <img src={thumbs[t.name]} alt={t.name} /> : <span className="tpl-icon">{t.icon}</span>}
              <button className={`fav-btn ${favs[t.name] ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setFavs((f) => ({ ...f, [t.name]: !f[t.name] })); }}>
                {favs[t.name] ? '★' : '☆'}
              </button>
            </div>
            <div className="template-meta">
              <div>
                <strong>{t.icon} {t.name}</strong>
                <small>{t.dims}</small>
              </div>
              <div className="tpl-actions">
                <button className="btn btn-primary btn-sm" onClick={() => useTemplate(t)}>Use</button>
                <button className="btn btn-sm" onClick={() => { navigate('collage', {}); }}>Preview</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <EmptyState icon="🎨" title="Nothing here" sub="Try a different category" />}
    </div>
  );
}