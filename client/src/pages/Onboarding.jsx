import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  Banner, Button, Card, ProgressBar, Spinner, skillLabel,
} from '../components/ui';

const LEVELS = [[0, 'New to it'], [1, 'Beginner'], [2, 'Comfortable'], [3, 'Confident']];
const FORMATS = [['mixed', 'A mix', 'Whatever teaches it best'], ['video', 'Video', 'I learn by watching'], ['article', 'Reading', 'I learn by reading']];
const DIFFICULTY = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];

export default function Onboarding() {
  const { setProfile } = useAuth();
  const [goals, setGoals] = useState(null);
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(null);
  const [skills, setSkills] = useState({});
  const [hours, setHours] = useState(5);
  const [format, setFormat] = useState('mixed');
  const [level, setLevel] = useState('beginner');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/goals').then(setGoals).catch((e) => setError(e.message)); }, []);
  if (!goals) return error ? <Banner tone="error">{error}</Banner> : <Spinner />;

  const selected = goals.find((g) => g.id === goal);
  const canNext = [Boolean(goal), true, hours >= 1, true][step];

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const knownSkills = Object.entries(skills).filter(([, l]) => l > 0).map(([skill, l]) => ({ skill, level: l }));
      const profile = await api('/me/profile', {
        method: 'PUT',
        body: { goals: [goal], knownSkills, weeklyHours: Number(hours), preferredFormat: format, difficultyLevel: level },
      });
      // Generate the first learning path straight away so the learner lands on a plan.
      await api('/paths', { method: 'POST', body: { goal } }).catch(() => {});
      setProfile(profile);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="wizard">
      <div className="spread small muted" style={{ marginBottom: 8 }}>
        <span>Step {step + 1} of 4</span>
        <span>{['Your goal', 'What you know', 'How you learn', 'Review'][step]}</span>
      </div>
      <ProgressBar value={((step + 1) / 4) * 100} label="Onboarding progress" />

      <Card style={{ marginTop: 16 }}>
        {error && <Banner tone="error">{error}</Banner>}

        {step === 0 && (
          <>
            <h1>What do you want to become?</h1>
            <p className="muted">Your goal decides which skills LEAP builds your path around.</p>
            <div className="choice-grid" role="radiogroup" aria-label="Learning goal">
              {goals.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={goal === g.id}
                  className={`choice ${goal === g.id ? 'selected' : ''}`} onClick={() => { setGoal(g.id); setSkills({}); }}>
                  <b>{g.label}</b>
                  <span className="small muted">{g.skills.map(skillLabel).join(' · ')}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>What do you already know?</h1>
            <p className="muted">Be honest - LEAP corrects this from your quiz results, so guessing high only slows you down.</p>
            <div className="stack">
              {selected.skills.map((s) => (
                <div key={s} className="spread" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                  <b>{skillLabel(s)}</b>
                  <select className="select" style={{ width: 170 }} aria-label={`${skillLabel(s)} level`}
                    value={skills[s] || 0} onChange={(e) => setSkills({ ...skills, [s]: Number(e.target.value) })}>
                    {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>How do you like to learn?</h1>
            <div className="stack">
              <div className="field">
                <label htmlFor="hours">Hours per week: <b>{hours}</b></label>
                <input id="hours" type="range" min="1" max="20" value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
              <div className="field">
                <label>Preferred format</label>
                <div className="choice-grid">
                  {FORMATS.map(([v, l, d]) => (
                    <button key={v} type="button" className={`choice ${format === v ? 'selected' : ''}`} onClick={() => setFormat(v)}>
                      <b>{l}</b><span className="small muted">{d}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="level">Overall level</label>
                <select id="level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                  {DIFFICULTY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Ready to go</h1>
            <p className="muted">LEAP will build your path and first recommendations from this.</p>
            <table className="table">
              <tbody>
                <tr><th>Goal</th><td>{selected.label}</td></tr>
                <tr><th>Known skills</th><td>{Object.entries(skills).filter(([, l]) => l > 0).map(([s, l]) => `${skillLabel(s)} (${LEVELS[l][1]})`).join(', ') || 'Starting fresh'}</td></tr>
                <tr><th>Time</th><td>{hours} hours a week</td></tr>
                <tr><th>Format</th><td>{FORMATS.find(([v]) => v === format)[1]}</td></tr>
                <tr><th>Level</th><td>{level}</td></tr>
              </tbody>
            </table>
          </>
        )}

        <div className="spread" style={{ marginTop: 24 }}>
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0 || busy}>Back</Button>
          {step < 3
            ? <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue</Button>
            : <Button onClick={finish} disabled={busy}>{busy ? 'Building your path…' : 'Build my learning path'}</Button>}
        </div>
      </Card>
    </div>
  );
}
