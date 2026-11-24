import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { track } from '../tracker';
import {
  Badge, Banner, Button, Card, Difficulty, Empty, ProgressBar, TypeBadge, skillLabel,
} from '../components/ui';

const STRATEGY = {
  hybrid: ['Hybrid AI', 'accent', 'Blending learners like you, content similarity, your skill gaps and popularity'],
  cold_start: ['Getting to know you', 'primary', 'Based on your goal while LEAP learns your habits'],
  fallback: ['Simplified', 'warn', 'Popular picks while the AI service is unavailable'],
};

const FACTOR_LABEL = {
  cf_similarity: 'Learners like you',
  content_similarity: 'Similar to your history',
  skill_gap_fit: 'Fills a goal skill gap',
  completed_prerequisite: 'Builds on your work',
  popularity: 'Popular on this path',
};

function RecCard({ rec, onReject }) {
  const [open, setOpen] = useState(false);
  const [rated, setRated] = useState(null);
  const total = rec.reasonFactors?.reduce((s, f) => s + f.contribution, 0) || 1;

  async function feedback(verdict) {
    setRated(verdict);
    try {
      await api('/feedback', { method: 'POST', body: { itemId: rec.itemId, verdict } });
      if (verdict === 'not_relevant') onReject(rec.itemId);
    } catch { setRated(null); }
  }

  return (
    <Card className="rec">
      <div className="rec-top">
        <div className="row">
          <span className="rec-rank">#{rec.rank}</span>
          <TypeBadge type={rec.type} />
          <Difficulty level={rec.difficulty} />
        </div>
        <span className="score-ring" title="Relevance score">{Math.round(rec.score * 100)}% match</span>
      </div>

      <div>
        <h3><Link to={`/item/${rec.itemId}`} onClick={() => track('click', rec.itemId)}>{rec.title}</Link></h3>
        <p className="rec-desc">{rec.description}</p>
      </div>

      <div className="row">
        {rec.skills.map((s) => <span key={s} className="chip">{skillLabel(s)}</span>)}
        <span className="small muted">· {rec.durationMins} min</span>
      </div>

      <div className="why">
        <b>Why this? </b>{rec.reason}
        {rec.reasonFactors?.length > 0 && (
          <div>
            <button type="button" className="why-toggle" aria-expanded={open} onClick={() => setOpen(!open)} style={{ marginTop: 6 }}>
              {open ? 'Hide' : 'Show'} the factors
            </button>
            {open && rec.reasonFactors.map((f) => (
              <div className="factor" key={f.factor}>
                <span>{FACTOR_LABEL[f.factor] || f.factor}</span>
                <ProgressBar value={(f.contribution / total) * 100} label={FACTOR_LABEL[f.factor]} />
                <span className="muted">{Math.round((f.contribution / total) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="spread">
        <Link to={`/item/${rec.itemId}`} onClick={() => track('click', rec.itemId)}><Button size="sm">Start</Button></Link>
        <div className="row" role="group" aria-label="Was this useful?">
          <Button variant="ghost" size="sm" disabled={Boolean(rated)} onClick={() => feedback('relevant')} aria-pressed={rated === 'relevant'}>
            {rated === 'relevant' ? 'Thanks!' : 'Useful'}
          </Button>
          <Button variant="ghost" size="sm" disabled={Boolean(rated)} onClick={() => feedback('not_relevant')}>Not for me</Button>
        </div>
      </div>
    </Card>
  );
}

function PathTeaser() {
  const [path, setPath] = useState(null);
  useEffect(() => { api('/paths/active').then(setPath).catch(() => {}); }, []);
  if (!path) return null;
  const next = path.steps.find((s) => s.status === 'available');
  return (
    <Card style={{ marginBottom: 20 }}>
      <div className="spread">
        <div>
          <span className="small muted">Your path</span>
          <h2 style={{ margin: 0 }}>{path.goalLabel}</h2>
        </div>
        <div style={{ minWidth: 220, flex: '0 1 320px' }}>
          <div className="spread small"><span>{path.summary.completedSteps} of {path.summary.totalSteps} steps</span><b>{path.summary.progressPct}%</b></div>
          <ProgressBar value={path.summary.progressPct} label="Path progress" />
        </div>
        <div className="small" style={{ textAlign: 'right' }}>
          {next ? <>Next up<br /><Link to={`/item/${next.itemId._id}`}><b>{next.itemId.title}</b></Link></> : 'Path complete'}
          <br /><Link to="/path">View full path →</Link>
        </div>
      </div>
    </Card>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    setFeed(null);
    setError(null);
    api('/recommendations?limit=12').then(setFeed).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function reject(itemId) {
    setFeed((f) => ({ ...f, items: f.items.filter((i) => i.itemId !== itemId) }));
    setToast("Got it - we won't recommend that again.");
  }

  const [label, tone, hint] = STRATEGY[feed?.strategy] || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recommended for you, {user.name.split(' ')[0]}</h1>
          <p>Ranked for your goal, your mastery and what learners like you found useful.</p>
        </div>
        <div className="row">
          {feed && <span title={hint}><Badge tone={tone}>{label}</Badge></span>}
          <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
        </div>
      </div>

      <PathTeaser />

      {feed?.degraded && (
        <Banner tone="warn">Recommendations are temporarily simplified while the AI service is unavailable. Your learning path and progress are unaffected.</Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}

      {!feed && !error && <div className="grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" />)}</div>}

      {feed && feed.items.length === 0 && (
        <Empty title="You're all caught up">Every item you're ready for is done. Generate a fresh path or browse the <Link to="/catalogue">catalogue</Link>.</Empty>
      )}

      {feed && feed.items.length > 0 && (
        <>
          <div className="grid">
            {feed.items.map((rec) => <RecCard key={rec.itemId} rec={rec} onReject={reject} />)}
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>
            Model {feed.modelVersion} · generated {new Date(feed.generatedAt).toLocaleTimeString()} · only items whose prerequisites you have completed are shown
          </p>
        </>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
