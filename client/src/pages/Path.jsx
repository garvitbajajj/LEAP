import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  Banner, Button, Card, Difficulty, Empty, ProgressBar, Spinner, TypeBadge,
} from '../components/ui';

const STATUS_TEXT = {
  available: 'Ready', locked: 'Locked', complete: 'Done', skipped: 'Skipped', in_progress: 'In progress',
};

export default function Path() {
  const { profile } = useAuth();
  const [path, setPath] = useState(undefined);
  const [goals, setGoals] = useState([]);
  const [goal, setGoal] = useState(profile?.goals?.[0] || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/goals').then(setGoals).catch(() => {});
    api('/paths/active').then(setPath).catch((e) => (e.code === 'NO_ACTIVE_PATH' ? setPath(null) : setError(e.message)));
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setPath(await api('/paths', { method: 'POST', body: { goal } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(step, action) {
    let body;
    if (action === 'skip') {
      const reason = window.prompt('Why are you skipping this step? (helps LEAP learn)');
      if (!reason) return;
      body = { reason };
    }
    try {
      setPath(await api(`/paths/${path._id}/steps/${step._id}/${action}`, { method: 'POST', body }));
    } catch (e) {
      setError(e.message);
    }
  }

  if (path === undefined && !error) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{path ? `Path to ${path.goalLabel}` : 'Your learning path'}</h1>
          <p>Ordered so every prerequisite comes first, and paced to the hours you set.</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: 230 }} aria-label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <Button onClick={generate} disabled={busy || !goal}>{busy ? 'Building…' : path ? 'Rebuild path' : 'Build path'}</Button>
        </div>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {path === null && <Empty title="No path yet">Pick a goal and build one - LEAP will order everything you need.</Empty>}

      {path && (
        <>
          <div className="grid" style={{ marginBottom: 20 }}>
            <Card><div className="stat"><b>{path.summary.progressPct}%</b><span>complete</span></div><ProgressBar value={path.summary.progressPct} label="Path progress" /></Card>
            <Card><div className="stat"><b>{path.summary.completedSteps} / {path.summary.totalSteps}</b><span>steps done</span></div></Card>
            <Card><div className="stat"><b>{Math.round(path.summary.remainingMins / 60 * 10) / 10} h</b><span>left · about {path.summary.etaWeeks} weeks at your pace</span></div></Card>
          </div>

          {path.status === 'completed' && <Banner tone="success">You have completed this path. Choose a new goal to keep going.</Banner>}

          <Card>
            <ol className="steps" aria-label="Learning path steps">
              {path.steps.map((s, i) => (
                <li key={s._id} className={`step ${s.status}`}>
                  <span className="step-dot" aria-hidden="true">{s.status === 'complete' ? '✓' : i + 1}</span>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <TypeBadge type={s.itemId.type} />
                      <Difficulty level={s.itemId.difficulty} />
                      <span className="small muted">{s.itemId.durationMins} min</span>
                    </div>
                    <b>{s.status === 'locked' ? s.itemId.title : <Link to={`/item/${s.itemId._id}`}>{s.itemId.title}</Link>}</b>
                    <div className="small muted">
                      {STATUS_TEXT[s.status]}
                      {s.status === 'locked' && ' - finish the earlier steps first'}
                      {s.skipReason && ` - "${s.skipReason}"`}
                    </div>
                  </div>
                  <div className="row">
                    {s.status === 'available' && (
                      <>
                        <Link to={`/item/${s.itemId._id}`}><Button size="sm">Start</Button></Link>
                        <Button size="sm" variant="ghost" onClick={() => act(s, 'skip')}>Skip</Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </>
  );
}
