import { useApp } from '../lib/store';
import { Tag } from './common';

const PLANS = [
  {
    id: 'free', name: 'Free', price: '₹0', tag: 'For trying', ai: '20 AI generations/mo', export: '720p export',
    feats: ['Basic editing tools', 'Standard templates', '720p video export', 'Local projects', 'Watermark on exports'],
    cta: 'Current plan', disabled: true, accent: ['#818cf8', '#6366f1'],
  },
  {
    id: 'pro', name: 'Pro', price: '₹499', per: '/month', tag: 'Most popular', ai: '1,000 AI generations/mo', export: '1080p + 2K',
    feats: ['Everything in Free', 'Unlimited basic editing', '1080p & 2K exports', 'Premium effects & templates', 'AI background studio', 'Priority processing', 'Remove watermark'],
    cta: 'Upgrade to Pro', accent: ['#e94560', '#ff6a9d'],
  },
  {
    id: 'studio', name: 'Studio', price: '₹1,299', per: '/month', tag: 'For professionals', ai: '10,000 AI generations/mo', export: '4K export',
    feats: ['Everything in Pro', '4K + high-bitrate exports', 'Advanced AI video tools', 'Team & commercial license', 'API / batch export', 'Dedicated support'],
    cta: 'Start Free Trial', accent: ['#8a2be2', '#ff6a00'],
  },
];

export default function Premium() {
  const { notify, updateProfile } = useApp();
  const activate = (plan) => {
    if (plan.id === 'free') return;
    if (plan.id === 'studio') notify('14-day free trial started 🎉', 'success');
    else notify('Welcome to Pro! 💎', 'success');
    updateProfile({ plan: plan.name });
  };
  return (
    <div className="ws">
      <div className="ws-header"><div><h1>💎 Premium</h1><p>Unlock the full studio — no aggressive upsells, just more power</p></div></div>
      <div className="pricing">
        {PLANS.map((p) => (
          <div key={p.id} className={`price-card glass ${p.id === 'pro' ? 'popular' : ''}`} style={{ '--accent1': p.accent[0], '--accent2': p.accent[1] }}>
            <div className="price-top">
              <span className="plan-tag">{p.tag}</span>
              <h3>{p.name}</h3>
              <div className="price"><strong>{p.price}</strong>{p.per && <small>{p.per}</small>}</div>
              <p className="price-ai">✦ {p.ai}<br />🖥 {p.export}</p>
            </div>
            <ul>
              {p.feats.map((f) => <li key={f}>✓ {f}</li>)}
            </ul>
            <button className={p.id === 'pro' ? 'btn btn-primary' : 'btn'} disabled={p.disabled} onClick={() => activate(p)}>{p.cta}</button>
          </div>
        ))}
      </div>
      <div className="glass" style={{ padding: 20, marginTop: 24 }}>
        <Tag>🔒 Payment handled securely</Tag> <Tag>↩ Cancel anytime</Tag> <Tag>🤝 30-day money-back</Tag>
      </div>
    </div>
  );
}