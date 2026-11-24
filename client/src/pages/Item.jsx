import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { track, trackNow } from '../tracker';
import {
  Badge, Banner, Button, Card, Difficulty, ProgressBar, Spinner, TypeBadge, skillLabel,
} from '../components/ui';

function Quiz({ item, onDone }) {
  const [answers, setAnswers] = useState(item.quiz.map(() => null));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/catalogue/items/${item._id}/attempt`, { method: 'POST', body: { answers } });
      setResult(r);
      onDone(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && <Banner tone="error">{error}</Banner>}
      {item.quiz.map((q, qi) => (
        <fieldset key={q.question} className="card card-flat" style={{ margin: 0 }}>
          <legend className="small muted">Question {qi + 1} of {item.quiz.length}</legend>
          <b>{q.question}</b>
          <div className="stack" style={{ marginTop: 10, gap: 6 }}>
            {q.options.map((opt, oi) => {
              const r = result?.results[qi];
              const mark = r && (oi === r.answerIndex ? ' ✓' : (answers[qi] === oi ? ' ✗' : ''));
              return (
                <label key={opt} className="row" style={{ gap: 8, cursor: result ? 'default' : 'pointer' }}>
                  <input type="radio" name={`q${qi}`} checked={answers[qi] === oi} disabled={Boolean(result)}
                    onChange={() => setAnswers(answers.map((a, i) => (i === qi ? oi : a)))} />
                  <span>{opt}<b style={{ color: r && oi === r.answerIndex ? 'var(--success)' : 'var(--danger)' }}>{mark}</b></span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {!result && (
        <Button onClick={submit} disabled={busy || answers.includes(null)}>
          {busy ? 'Grading…' : answers.includes(null) ? 'Answer every question to submit' : 'Submit answers'}
        </Button>
      )}
    </div>
  );
}

function Lesson({ item }) {
  return (
    <div className="stack">
      {item.type === 'video' && (
        <div style={{ background: '#111827', borderRadius: 12, aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, lineHeight: 1 }} aria-hidden="true">▶</div>
            <p className="small" style={{ opacity: 0.7, marginTop: 8 }}>{item.title} · {item.durationMins} min</p>
          </div>
        </div>
      )}
      <div>
        <h3>About this {item.type}</h3>
        <p>{item.description}</p>
      </div>
      <div>
        <h3>What you will learn</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {item.skills.map((s) => <li key={s}>Core concepts of {skillLabel(s)}, with worked examples</li>)}
          <li>Practice exercises to check your understanding</li>
        </ul>
      </div>
    </div>
  );
}

export default function Item() {
  const { id } = useParams();
  const { refresh } = useAuth();
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const opened = useRef(Date.now());

  useEffect(() => {
    setItem(null);
    setDone(null);
    opened.current = Date.now();
    api(`/catalogue/items/${id}`).then((it) => {
      setItem(it);
      track('view', id);
    }).catch((e) => setError(e.message));
  }, [id]);

  async function complete() {
    setBusy(true);
    const dwellSeconds = Math.round((Date.now() - opened.current) / 1000);
    await trackNow('complete', id, { progressPct: 100, dwellSeconds });
    await refresh();
    setDone({ passed: true });
    setBusy(false);
  }

  async function quizDone(result) {
    await refresh();
    setDone(result);
  }

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!item) return <Spinner />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20 }} className="item-layout">
      <div>
        <p className="small"><Link to="/">← Recommendations</Link></p>
        <div className="row" style={{ marginBottom: 6 }}>
          <TypeBadge type={item.type} />
          <Difficulty level={item.difficulty} />
          <span className="small muted">{item.durationMins} min</span>
        </div>
        <h1>{item.title}</h1>

        {done && (
          <Banner tone={done.passed ? 'success' : 'warn'}>
            <div>
              {done.score !== undefined
                ? <><b>{done.passed ? 'Passed' : 'Not quite'} - {done.correct}/{done.total} correct.</b> </>
                : <b>Marked complete. </b>}
              Your mastery has been updated{done.passed ? ' and your learning path has moved on' : ''}.
              {' '}<Link to="/path">See my path →</Link>
            </div>
          </Banner>
        )}

        <Card>
          {item.type === 'quiz' && item.quiz?.length ? <Quiz item={item} onDone={quizDone} /> : <Lesson item={item} />}
        </Card>
      </div>

      <aside className="stack">
        {item.type !== 'quiz' && (
          <Card>
            <h3>Finished?</h3>
            <p className="small muted">Marking this complete updates your skill mastery and unlocks the next steps on your path.</p>
            <Button block onClick={complete} disabled={busy || Boolean(done)}>{done ? 'Completed ✓' : busy ? 'Saving…' : 'Mark as complete'}</Button>
          </Card>
        )}
        <Card>
          <h3>Skills</h3>
          <div className="row">{item.skills.map((s) => <Badge key={s} tone="primary">{skillLabel(s)}</Badge>)}</div>
          {done?.mastery && (
            <div className="stack" style={{ marginTop: 12 }}>
              {done.mastery.map((m) => (
                <div key={m.skill}>
                  <div className="spread small"><span>{skillLabel(m.skill)} mastery</span><b>{Math.round(m.score * 100)}%</b></div>
                  <ProgressBar value={m.score * 100} tone="accent" label={`${m.skill} mastery`} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3>Prerequisites</h3>
          {item.prerequisites?.length
            ? <ul style={{ margin: 0, paddingLeft: 18 }}>{item.prerequisites.map((p) => <li key={p._id}><Link to={`/item/${p._id}`}>{p.title}</Link></li>)}</ul>
            : <p className="small muted" style={{ margin: 0 }}>None - a good place to start.</p>}
        </Card>
      </aside>
    </div>
  );
}
