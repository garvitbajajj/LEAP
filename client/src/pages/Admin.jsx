import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Banner, Button, Card, Field, ProgressBar, Spinner, TypeBadge, skillLabel,
} from '../components/ui';

const pct = (x) => `${Math.round((x || 0) * 100)}%`;

// ---------------------------------------------------------------- analytics
export function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/analytics/overview').then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!data) return <Spinner />;
  const q = data.recommendationQuality;

  return (
    <>
      <div className="page-head">
        <div><h1>Analytics</h1><p>Engagement, cohort mastery and how well the recommender is doing.</p></div>
        <div className="row">
          <a href="/api/v1/docs" target="_blank" rel="noreferrer"><Button variant="ghost" size="sm">API docs (Swagger)</Button></a>
          <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer"><Button variant="ghost" size="sm">ML service docs</Button></a>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 20 }}>
        <Card><div className="stat"><b>{data.learners}</b><span>learners</span></div></Card>
        <Card><div className="stat"><b>{data.activeLearners7d}</b><span>active in the last 7 days</span></div></Card>
        <Card><div className="stat"><b>{data.publishedItems}</b><span>published items</span></div></Card>
        <Card><div className="stat"><b>{data.eventsByType.complete || 0}</b><span>completions</span></div></Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card>
          <h2>Recommendation quality</h2>
          <table className="table">
            <tbody>
              <tr><th>Feed requests</th><td>{q.requests}</td></tr>
              <tr><th>Items served</th><td>{q.itemsServed}</td></tr>
              <tr><th>Click-through rate</th><td>{pct(q.ctr)}</td></tr>
              <tr><th>Catalogue coverage</th><td>{pct(q.catalogueCoverage)}</td></tr>
              <tr><th>Fallback rate</th><td>{pct(q.fallbackRate)}</td></tr>
              <tr><th>Feedback</th><td>{q.feedback.relevant || 0} useful · {q.feedback.not_relevant || 0} not for me</td></tr>
            </tbody>
          </table>
        </Card>

        <Card>
          <h2>Cohort mastery by skill</h2>
          <div className="stack" style={{ marginTop: 8 }}>
            {data.masteryBySkill.map((m) => (
              <div key={m.skill}>
                <div className="spread small"><span>{skillLabel(m.skill)} <span className="muted">· {m.learners} learner{m.learners === 1 ? '' : 's'}</span></span><b>{pct(m.avg)}</b></div>
                <ProgressBar value={m.avg * 100} tone="accent" label={`${m.skill} average mastery`} />
              </div>
            ))}
            {data.masteryBySkill.length === 0 && <p className="muted">No mastery data yet.</p>}
          </div>
        </Card>

        <Card>
          <h2>Most completed</h2>
          <table className="table">
            <thead><tr><th>Item</th><th>Completions</th></tr></thead>
            <tbody>{data.topItems.map((t) => <tr key={t.itemId}><td>{t.title}</td><td>{t.completions}</td></tr>)}</tbody>
          </table>
        </Card>

        <Card>
          <h2>Events by type</h2>
          <table className="table">
            <tbody>{Object.entries(data.eventsByType).map(([k, v]) => <tr key={k}><th>{k.replace('_', ' ')}</th><td>{v}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- content management
const BLANK = { title: '', description: '', type: 'video', skills: '', difficulty: 2, durationMins: 20, prerequisites: [] };

export function ManageContent() {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [message, setMessage] = useState(null);

  async function reloadAll() {
    const pages = await Promise.all(['draft', 'published', 'retired'].map((s) => api(`/catalogue/items?status=${s}&limit=100`)));
    setItems(pages.flatMap((p) => p.items));
  }

  useEffect(() => { reloadAll().catch((e) => setMessage(['error', e.message])); }, []);

  async function create(e) {
    e.preventDefault();
    setMessage(null);
    try {
      const item = await api('/catalogue/items', {
        method: 'POST',
        body: {
          ...form,
          skills: form.skills.split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean),
          difficulty: Number(form.difficulty),
          durationMins: Number(form.durationMins),
        },
      });
      setMessage(['success', `Created "${item.title}" as a draft. Publish it to make it recommendable.`]);
      setForm(BLANK);
      await reloadAll();
    } catch (err) {
      setMessage(['error', err.code === 'PREREQUISITE_CYCLE_DETECTED'
        ? `Rejected: those prerequisites would create a cycle (${err.details?.cycle?.length - 1} items in a loop).`
        : err.message]);
    }
  }

  async function transition(item, action) {
    try {
      await api(`/catalogue/items/${item._id}/${action}`, { method: 'POST' });
      await reloadAll();
    } catch (err) {
      setMessage(['error', err.message]);
    }
  }

  if (!items) return <Spinner />;
  const published = items.filter((i) => i.status === 'published');

  return (
    <>
      <div className="page-head">
        <div><h1>Manage content</h1><p>Every write is validated against the prerequisite graph and recorded in the audit log.</p></div>
      </div>
      {message && <Banner tone={message[0]}>{message[1]}</Banner>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 20 }} className="item-layout">
        <Card>
          <h2>Catalogue ({items.length})</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Title</th><th>Type</th><th>Skills</th><th>Status</th><th /></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it._id}>
                    <td><Link to={`/item/${it._id}`}>{it.title}</Link></td>
                    <td><TypeBadge type={it.type} /></td>
                    <td className="small">{it.skills.map(skillLabel).join(', ')}</td>
                    <td><Badge tone={{ published: 'success', draft: 'warn' }[it.status]}>{it.status}</Badge></td>
                    <td>
                      {it.status !== 'published' && <Button size="sm" variant="ghost" onClick={() => transition(it, 'publish')}>Publish</Button>}
                      {it.status === 'published' && <Button size="sm" variant="danger" onClick={() => transition(it, 'retire')}>Retire</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2>New content item</h2>
          <form className="stack" onSubmit={create}>
            <Field label="Title" id="t"><input id="t" className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Description" id="d"><textarea id="d" className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="row">
              <Field label="Type" id="ty">
                <select id="ty" className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {['course', 'video', 'article', 'quiz'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Difficulty" id="df">
                <select id="df" className="select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  {[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Minutes" id="m"><input id="m" type="number" min="1" className="input" style={{ width: 90 }} value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: e.target.value })} /></Field>
            </div>
            <Field label="Skills (comma separated)" id="s"><input id="s" className="input" required placeholder="sql, data-wrangling" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
            <Field label="Prerequisites" id="p">
              <select id="p" multiple className="select" style={{ height: 120 }} value={form.prerequisites}
                onChange={(e) => setForm({ ...form, prerequisites: [...e.target.selectedOptions].map((o) => o.value) })}>
                {published.map((it) => <option key={it._id} value={it._id}>{it.title}</option>)}
              </select>
            </Field>
            <Button type="submit">Create draft</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- users
export function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/admin/users').then(setUsers).catch((e) => setError(e.message)); }, []);

  async function setRole(u, role) {
    try {
      const updated = await api(`/admin/users/${u._id}/role`, { method: 'PATCH', body: { role } });
      setUsers(users.map((x) => (x._id === u._id ? updated : x)));
    } catch (e) { setError(e.message); }
  }

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!users) return <Spinner />;
  return (
    <>
      <div className="page-head"><div><h1>Users</h1><p>Role changes are role-based access controlled and audit logged.</p></div></div>
      <Card>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td className="small">{u.email}</td>
                <td>
                  <select className="select" style={{ width: 140 }} value={u.role} disabled={u._id === me.id} aria-label={`Role for ${u.name}`}
                    onChange={(e) => setRole(u, e.target.value)}>
                    {['learner', 'instructor', 'admin'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
