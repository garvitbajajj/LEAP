import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Banner, Button, Card } from '../components/ui';

export default function Consent() {
  const { refresh, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function accept() {
    setBusy(true);
    try {
      await api('/me/consent', { method: 'POST' });
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="wizard">
      <Card>
        <h1>Before we personalise anything</h1>
        <p className="muted">LEAP learns from how you use it so it can recommend what to study next. Here is exactly what that means.</p>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="stack" style={{ margin: '20px 0' }}>
          <div><b>What we collect</b><p className="muted small" style={{ margin: 0 }}>Which items you open, how long you spend on them, what you complete, your quiz scores, and any feedback you give on recommendations.</p></div>
          <div><b>Why</b><p className="muted small" style={{ margin: 0 }}>To estimate your mastery of each skill, order your learning path, and rank recommendations for you.</p></div>
          <div><b>What we never do</b><p className="muted small" style={{ margin: 0 }}>Show your activity to other learners, or use it for anything other than your own recommendations.</p></div>
          <div><b>Your control</b><p className="muted small" style={{ margin: 0 }}>You can review your history at any time from the Progress page.</p></div>
        </div>
        <div className="row">
          <Button onClick={accept} disabled={busy}>{busy ? 'Saving…' : 'I agree - personalise my learning'}</Button>
          <Button variant="ghost" onClick={logout}>Not now</Button>
        </div>
      </Card>
    </div>
  );
}
