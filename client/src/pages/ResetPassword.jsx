import { useState } from 'react';
import { api } from '../api';
import { Logo } from '../components/Nav';
import { Banner, Button, Card, Field } from '../components/ui';

/** Reached from the emailed link: /reset-password?token=... */
export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(token ? null : 'This reset link is missing its token. Request a new one from the login page.');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      setDone((await api('/auth/reset-password', { method: 'POST', body: { token, password } })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form" style={{ minHeight: '100vh' }}>
      <Card>
        <div style={{ marginBottom: 16 }}><Logo /></div>
        <h2>Choose a new password</h2>
        {error && <Banner tone="error">{error}</Banner>}
        {done ? (
          <>
            <Banner tone="success">{done}</Banner>
            <a href="/"><Button block>Go to log in</Button></a>
          </>
        ) : (
          <form className="stack" onSubmit={submit}>
            <Field label="New password" id="new-password">
              <input id="new-password" type="password" className="input" value={password} minLength={8} required
                autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} disabled={!token} />
            </Field>
            <Field label="Confirm new password" id="confirm-password">
              <input id="confirm-password" type="password" className="input" value={confirm} minLength={8} required
                autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} disabled={!token} />
            </Field>
            <p className="small muted" style={{ margin: 0 }}>At least 8 characters, with a letter and a digit. Every device you are signed in on will be logged out.</p>
            <Button type="submit" block disabled={busy || !token}>{busy ? 'Saving…' : 'Set new password'}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
