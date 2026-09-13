import React, { useEffect, useState } from 'react';
import './App.css';
import { AppProvider, useApp } from './lib/store';
import { ffLoaded } from './lib/ffmpeg';

import Home from './components/Home';
import ImageGenerator from './components/ImageGenerator';
import VideoGenerator from './components/VideoGenerator';
import ProEditor from './components/ProEditor';
import VideoMerge from './components/VideoMerge';
import Collage from './components/Collage';
import Templates from './components/Templates';
import AITools from './components/AITools';
import AIHistory from './components/AIHistory';
import Subtitles from './components/Subtitles';
import AudioStudio from './components/AudioStudio';
import AutoEdit from './components/AutoEdit';
import Projects from './components/Projects';
import Premium from './components/Premium';
import Settings from './components/Settings';
import Profile from './components/Profile';
import Search from './components/Search';

const NAV = [
  {
    group: 'Create',
    items: [
      { id: 'home', icon: '🏠', label: 'Home' },
      { id: 'aigen', icon: '✨', label: 'AI Image' },
      { id: 'aivid', icon: '🎬', label: 'AI Video' },
    ],
  },
  {
    group: 'Edit',
    items: [
      { id: 'photo', icon: '🖼️', label: 'Photo Editor' },
      { id: 'video', icon: '🎥', label: 'Video Editor' },
      { id: 'merge', icon: '🎞', label: 'Merge Studio' },
      { id: 'autoedit', icon: '🤖', label: 'Auto Edit' },
      { id: 'collage', icon: '🧩', label: 'Collage' },
    ],
  },
  {
    group: 'Assets',
    items: [
      { id: 'templates', icon: '🎨', label: 'Templates' },
      { id: 'ai', icon: '🧠', label: 'AI Tools' },
      { id: 'history', icon: '🕘', label: 'AI History' },
    ],
  },
  {
    group: 'Audio & Text',
    items: [
      { id: 'subtitles', icon: '📝', label: 'Subtitles' },
      { id: 'audio', icon: '🎛', label: 'Audio Studio' },
    ],
  },
  {
    group: 'Manage',
    items: [
      { id: 'projects', icon: '📁', label: 'My Projects' },
      { id: 'premium', icon: '💎', label: 'Premium' },
    ],
  },
];

const ROUTES = {
  home: Home, aigen: ImageGenerator, aivid: VideoGenerator, photo: ProEditor,
  video: ProEditor, merge: VideoMerge, collage: Collage, templates: Templates,
  ai: AITools, history: AIHistory, subtitles: Subtitles, audio: AudioStudio,
  autoedit: AutoEdit, projects: Projects, premium: Premium, settings: Settings, profile: Profile,
};

const MOBILE = ['home', 'aigen', 'photo', 'video', 'projects'];

function EngineDot() {
  const [on, setOn] = useState(ffLoaded());
  useEffect(() => {
    const t = setInterval(() => setOn(ffLoaded()), 1500);
    return () => clearInterval(t);
  }, []);
  return <span className={`engine-dot ${on ? 'on' : ''}`} title={on ? 'FFmpeg engine ready' : 'FFmpeg engine idle'} />;
}

function Sidebar({ open, setOpen }) {
  const { view, navigate, profile } = useApp();
  const go = (id) => { navigate(id, {}); setOpen(false); };
  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand" onClick={() => go('home')}>
          <span className="brand-mark">✧</span>
          <span className="brand-text">Design<b>Master</b><small>AI STUDIO</small></span>
        </div>
        <nav className="nav">
          {NAV.map((sec) => (
            <div key={sec.group} className="nav-group">
              <span className="nav-label">{sec.group}</span>
              {sec.items.map((it) => (
                <button key={it.id} className={`nav-item ${view.name === it.id ? 'active' : ''}`} onClick={() => go(it.id)}>
                  <span className="nav-icon">{it.icon}</span>
                  <span>{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button className={`nav-item ${view.name === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}><span className="nav-icon">⚙</span><span>Settings</span></button>
          <button className={`nav-item ${view.name === 'profile' ? 'active' : ''}`} onClick={() => go('profile')}>
            <span className="nav-icon avatar-mini">{profile.avatar ? <img src={profile.avatar} alt="" /> : (profile.name || 'C')[0]}</span>
            <span>{profile.name}<small className="plan-mini">{profile.plan}</small></span>
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
    </>
  );
}

function TopBar({ onMenu }) {
  const { view, navigate, openSearch, notify, profile } = useApp();
  const title = (NAV.flatMap((s) => s.items).find((i) => i.id === view.name) || { label: 'Home' }).label;
  return (
    <header className="topbar">
      <button className="icon-btn burger" onClick={onMenu}>☰</button>
      <div className="topbar-title"><h2>{title}</h2><span className="crumb">Design Master Studio</span></div>
      <button className="search-trigger" onClick={openSearch}>
        <span>🔍</span> Search… <kbd>Ctrl</kbd><kbd>K</kbd>
      </button>
      <div className="topbar-actions">
        <EngineDot />
        <button className="icon-btn" title="Create" onClick={() => navigate('aigen')}>＋</button>
        <button className="icon-btn" title="Notifications" onClick={() => notify('You are all caught up 🎉', 'info')}>🔔</button>
        <button className="avatar-btn" onClick={() => navigate('profile')}>
          {profile.avatar ? <img src={profile.avatar} alt="" /> : (profile.name || 'C')[0]}
        </button>
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-ico">{t.type === 'error' ? '⚠' : t.type === 'warn' ? '!' : t.type === 'info' ? 'ℹ' : '✓'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function KeyBindings() {
  const { openSearch, closeSearch, searchOpen, notify } = useApp();
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); searchOpen ? closeSearch() : openSearch(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); notify('Project saved ✓'); }
      if (e.key === 'Escape' && searchOpen) closeSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch, closeSearch, searchOpen, notify]);
  return null;
}

function BottomNav() {
  const { view, navigate } = useApp();
  const items = MOBILE.map((id) => NAV.flatMap((s) => s.items).find((i) => i.id === id));
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <button key={it.id} className={view.name === it.id ? 'active' : ''} onClick={() => navigate(it.id, {})}>
          <span>{it.icon}</span><small>{it.label}</small>
        </button>
      ))}
    </nav>
  );
}

function Shell() {
  const { view, settings, searchOpen } = useApp();
  const [sidebar, setSidebar] = useState(false);
  const Page = ROUTES[view.name] || Home;
  const pageParams = view.name === 'video' ? { ...view.params, kind: 'video' } : view.params;
  return (
    <div className={`app theme-${settings.theme}`}>
      <Sidebar open={sidebar} setOpen={setSidebar} />
      <div className="main">
        <TopBar onMenu={() => setSidebar(true)} />
        <main className="content">
          <Page key={view.name + JSON.stringify(view.params)} params={pageParams} />
        </main>
      </div>
      <BottomNav />
      <Toasts />
      {searchOpen && <Search />}
      <KeyBindings />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
