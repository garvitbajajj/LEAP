/** LEAP design system: small, composable primitives used by every page. */

export function Button({ variant = 'primary', size, block, className = '', ...props }) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return <button type="button" className={cls} {...props} />;
}

export function Card({ flat, className = '', ...props }) {
  return <div className={`card ${flat ? 'card-flat' : ''} ${className}`} {...props} />;
}

export function Badge({ tone, children }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>;
}

export function Banner({ tone = 'info', children }) {
  return <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function ProgressBar({ value, tone, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`bar ${tone || ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, id, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

const TYPE_TONE = { course: 'primary', video: 'accent', article: undefined, quiz: 'warn' };
export function TypeBadge({ type }) {
  return <Badge tone={TYPE_TONE[type]}>{type}</Badge>;
}

export function Difficulty({ level }) {
  return <span className="small muted" title={`Difficulty ${level} of 5`}>{'●'.repeat(level)}{'○'.repeat(5 - level)}</span>;
}

export const skillLabel = (s) => ({ sql: 'SQL', 'html-css': 'HTML & CSS', 'web-apis': 'Web APIs', git: 'Git' }[s]
  ?? s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
