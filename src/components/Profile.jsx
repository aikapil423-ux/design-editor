import { useRef } from 'react';
import { useApp } from '../lib/store';
import { Btn, Field, Tag } from './common';

export default function Profile() {
  const { profile, updateProfile, navigate, notify, aiHistory, projects } = useApp();
  const avRef = useRef(null);

  const onAvatar = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => updateProfile({ avatar: r.result });
    r.readAsDataURL(f);
  };

  return (
    <div className="ws">
      <div className="ws-header"><div><h1>👤 Profile</h1></div></div>
      <div className="settings-grid">
        <div className="panel profile-card">
          <div className="avatar-wrap">
            {profile.avatar ? <img src={profile.avatar} alt="avatar" /> : <div className="avatar-initial">{(profile.name || 'CP')[0]}</div>}
            <button className="avatar-edit" onClick={() => avRef.current.click()}>📷</button>
            <input ref={avRef} type="file" accept="image/*" hidden onChange={onAvatar} />
          </div>
          <h3>{profile.name}</h3>
          <p className="muted">{profile.email}</p>
          <Tag>Plan: {profile.plan}</Tag>
          <div className="hero-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => navigate('premium')}>💎 {profile.plan === 'Free' ? 'Upgrade' : 'Manage plan'}</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Edit profile</h3></div>
          <Field label="Display name"><input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} /></Field>
          <Field label="Email"><input value={profile.email} onChange={(e) => updateProfile({ email: e.target.value })} /></Field>
          <Btn className="btn-primary" onClick={() => notify('Profile saved')}>💾 Save changes</Btn>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Usage</h3></div>
          <div className="stat-row">
            <div><strong>{aiHistory.length}</strong><small>AI generations</small></div>
            <div><strong>{(projects || []).length}</strong><small>Projects</small></div>
            <div><strong>0</strong><small>GB cloud used (local-only)</small></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Privacy</h3></div>
          <p className="muted">All media and generations stay on your device. Nothing is uploaded unless you explicitly share/export. You can delete permanently anytime from the recycle bin.</p>
          <div className="gen-actions" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => notify('Privacy report exported (demo)')}>Export my data</button>
            <button className="btn btn-danger" onClick={() => { if (window.confirm('Delete all AI generation history?')) { notify('History cleared'); } }}>Clear AI history</button>
          </div>
        </div>
      </div>
    </div>
  );
}