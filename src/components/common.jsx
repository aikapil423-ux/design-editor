import { useEffect } from 'react';

export const Btn = ({ className = '', children, ...rest }) => (
  <button className={`btn ${className}`} {...rest}>
    {children}
  </button>
);

export const BtnPrimary = (props) => <Btn className="btn-primary" {...props} />;
export const BtnGhost = (props) => <Btn className="btn-ghost" {...props} />;
export const BtnDanger = (props) => <Btn className="btn-danger" {...props} />;
export const BtnAI = (props) => <Btn className="btn-ai" {...props} />;

export const Slider = ({ label, value, min = -100, max = 100, step = 1, onChange, format }) => (
  <label className="ctl-row">
    <span className="ctl-label">
      {label} <em>{typeof format === 'function' ? format(value) : value}</em>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
  </label>
);

export const Field = ({ label, children }) => (
  <label className="ctl-col">
    <span className="ctl-label">{label}</span>
    {children}
  </label>
);

export const Segmented = ({ options, value, onChange, small = false }) => (
  <div className={`seg ${small ? 'seg-sm' : ''}`}>
    {options.map((o) => (
      <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} title={o.title}>
        {o.icon || o.label}
      </button>
    ))}
  </div>
);

export const Chip = ({ children, active, onClick }) => (
  <button className={`chip ${active ? 'active' : ''}`} onClick={onClick}>
    {children}
  </button>
);

export const Spinner = ({ size = 20, label }) => (
  <span className="spin-wrap">
    <span className="spinner" style={{ width: size, height: size }} />
    {label && <small>{label}</small>}
  </span>
);

export const EmptyState = ({ icon, title, sub, action }) => (
  <div className="empty">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    {sub && <p>{sub}</p>}
    {action}
  </div>
);

export const Modal = ({ open, onClose, title, children, width = 560 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-head">
            <h3>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

export const Tag = ({ children, color }) => (
  <span className="tag" style={color ? { color, borderColor: color + 'aa', background: color + '18' } : undefined}>
    {children}
  </span>
);

export const SectionTitle = ({ children, right }) => (
  <div className="section-title">
    <h2>{children}</h2>
    {right}
  </div>
);

export const Tooltip = ({ text, children }) => (
  <span className="tip" data-tip={text}>
    {children}
  </span>
);

export const PROMPTS = {
  photo: [
    'Cinematic portrait of a woman, soft golden-hour light',
    'Futuristic cityscape at night, neon rain, ultra detailed',
    'Mystical forest with glowing plants, fantasy art',
    'Minimal product shot of perfume, studio lighting',
    'Watercolor illustration of mountains at sunrise',
    'Cyberpunk samurai, dramatic rim lighting',
    'Cozy coffee shop interior, warm film grain',
    'Abstract 3D render, liquid chrome waves',
  ],
  video: [
    'Slow cinematic drone shot over misty mountains at sunrise',
    'A busy neon city street in the rain, tracking shot',
    'Macro footage of a flower blooming in slow motion',
    'An astronaut walking on a red alien planet',
    'Ocean waves crashing against volcanic rocks, dramatic light',
    'A chef plating gourmet food, top-down cinematic',
  ],
};

export const prettyTime = (s) => {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};