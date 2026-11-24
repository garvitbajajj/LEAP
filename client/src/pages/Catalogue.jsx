import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import {
  Banner, Button, Card, Difficulty, Empty, Spinner, TypeBadge, skillLabel,
} from '../components/ui';

export default function Catalogue() {
  const [params, setParams] = useSearchParams();
  const [skills, setSkills] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState(params.get('q') || '');

  useEffect(() => { api('/catalogue/skills').then(setSkills).catch(() => {}); }, []);

  // Debounce typing into the URL; the URL is the single source of truth for filters.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (params.get('q') || '')) update({ q });
    }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData(null);
    api(`/catalogue/items?${params.toString()}&limit=12`).then(setData).catch((e) => setError(e.message));
  }, [params]);

  function update(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  const page = Number(params.get('page') || 1);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Catalogue</h1>
          <p>Everything in LEAP. Your feed picks from this for you - here you can explore freely.</p>
        </div>
      </div>

      <Card flat style={{ marginBottom: 20 }}>
        <div className="row">
          <input className="input" style={{ flex: '2 1 240px' }} placeholder="Search titles and descriptions…" aria-label="Search"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ flex: '1 1 150px' }} aria-label="Skill" value={params.get('skill') || ''} onChange={(e) => update({ skill: e.target.value })}>
            <option value="">All skills</option>
            {skills.map((s) => <option key={s} value={s}>{skillLabel(s)}</option>)}
          </select>
          <select className="select" style={{ flex: '1 1 120px' }} aria-label="Type" value={params.get('type') || ''} onChange={(e) => update({ type: e.target.value })}>
            <option value="">All types</option>
            {['course', 'video', 'article', 'quiz'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" style={{ flex: '1 1 120px' }} aria-label="Difficulty" value={params.get('difficulty') || ''} onChange={(e) => update({ difficulty: e.target.value })}>
            <option value="">Any difficulty</option>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>Level {d}</option>)}
          </select>
          {[...params.keys()].length > 0 && <Button variant="ghost" size="sm" onClick={() => { setQ(''); setParams({}); }}>Clear</Button>}
        </div>
      </Card>

      {error && <Banner tone="error">{error}</Banner>}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && <Empty title="Nothing matches">Try a different search or clear the filters.</Empty>}

      {data && data.items.length > 0 && (
        <>
          <p className="small muted">{data.total} item{data.total === 1 ? '' : 's'}</p>
          <div className="grid">
            {data.items.map((it) => (
              <Card key={it._id} className="rec">
                <div className="row"><TypeBadge type={it.type} /><Difficulty level={it.difficulty} /><span className="small muted">{it.durationMins} min</span></div>
                <h3><Link to={`/item/${it._id}`}>{it.title}</Link></h3>
                <p className="rec-desc">{it.description}</p>
                <div className="row">
                  {it.skills.map((s) => <span key={s} className="chip">{skillLabel(s)}</span>)}
                  {it.prerequisites?.length > 0 && <span className="small muted">· {it.prerequisites.length} prerequisite{it.prerequisites.length > 1 ? 's' : ''}</span>}
                </div>
              </Card>
            ))}
          </div>
          {data.pages > 1 && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>← Previous</Button>
              <span className="small muted">Page {page} of {data.pages}</span>
              <Button variant="ghost" size="sm" disabled={page >= data.pages} onClick={() => update({ page: page + 1 })}>Next →</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
