import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  Badge, Card, Empty, ProgressBar, skillLabel,
} from '../components/ui';

const levelOf = (score) => (score >= 0.85 ? ['Mastered', 'success'] : score >= 0.55 ? ['Proficient', 'accent'] : score >= 0.3 ? ['Developing', 'primary'] : ['Beginning', undefined]);

export default function Progress() {
  const { profile, refresh } = useAuth();
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    refresh().catch(() => {});
    api('/goals').then(setGoals).catch(() => {});
  }, [refresh]);

  const goalSkills = new Set(goals.filter((g) => profile?.goals?.includes(g.id)).flatMap((g) => g.skills));
  const mastery = [...(profile?.mastery || [])].sort((a, b) => b.score - a.score);
  const onGoal = mastery.filter((m) => goalSkills.has(m.skill));
  const avg = onGoal.length ? onGoal.reduce((s, m) => s + m.score, 0) / onGoal.length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your progress</h1>
          <p>Mastery is estimated with Bayesian Knowledge Tracing from what you complete and how you score on quizzes.</p>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 20 }}>
        <Card><div className="stat"><b>{Math.round(avg * 100)}%</b><span>average mastery across your goal skills</span></div></Card>
        <Card><div className="stat"><b>{mastery.filter((m) => m.score >= 0.85).length}</b><span>skills mastered</span></div></Card>
        <Card><div className="stat"><b>{profile?.interactionCount ?? 0}</b><span>lessons and quizzes finished</span></div></Card>
      </div>

      <Card>
        <h2>Skill mastery</h2>
        {mastery.length === 0 && <Empty title="No skills tracked yet">Complete a lesson or take a quiz from your <Link to="/">recommendations</Link>.</Empty>}
        <div className="stack" style={{ marginTop: 12 }}>
          {mastery.map((m) => {
            const [label, tone] = levelOf(m.score);
            return (
              <div key={m.skill}>
                <div className="spread" style={{ marginBottom: 4 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <b>{skillLabel(m.skill)}</b>
                    <Badge tone={tone}>{label}</Badge>
                    {goalSkills.has(m.skill) && <span className="small muted">goal skill</span>}
                  </span>
                  <span className="small"><b>{Math.round(m.score * 100)}%</b> <span className="muted">· confidence {Math.round(m.confidence * 100)}%</span></span>
                </div>
                <ProgressBar value={m.score * 100} tone={m.score >= 0.85 ? 'accent' : undefined} label={`${skillLabel(m.skill)} mastery`} />
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
