import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Logo } from '../components/Nav';
import { Banner, Button, Card, Field } from '../components/ui';

const DEMO = [
  ['Learner', 'learner@leap.dev', 'Learner@123'],
  ['Instructor', 'instructor@leap.dev', 'Instructor@123'],
  ['Admin', 'admin@leap.dev', 'Admin@1234'],
];

// Reasons the Google callback sends back in ?oauth=...
const OAUTH_ERRORS = {
  denied: 'Google sign-in was cancelled.',
  state_mismatch: 'Google sign-in expired or was tampered with. Please try again.',
  failed: 'Google sign-in failed. Please try again or use your email and password.',
};

const HEADINGS = {
  welcome: 'Welcome to LEAP',
  login: 'Welcome back',
  register: 'Create your account',
  otp: 'Sign in with Email OTP',
  forgot: 'Reset your password',
  'forgot-otp': 'Reset password with OTP',
};

export default function Login() {
  const { login, loginWithOtp, register } = useAuth();
  const [mode, setMode] = useState(() => (window.location.search.includes('oauth=') ? 'login' : 'welcome'));
  const [otpSent, setOtpSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', code: '' });
  const [error, setError] = useState(() => OAUTH_ERRORS[new URLSearchParams(window.location.search).get('oauth')] || null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api('/auth/providers').then((p) => setGoogleEnabled(p.google)).catch(() => {});
    // Drop ?oauth=... so a refresh does not re-show a stale error.
    if (window.location.search.includes('oauth=')) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const switchMode = (m) => { setMode(m); setOtpSent(false); setError(null); setNotice(null); };

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else if (mode === 'register') {
        await register(form.name, form.email, form.password);
      } else if (mode === 'forgot') {
        setNotice((await api('/auth/forgot-password', { method: 'POST', body: { email: form.email } })).message);
      } else if (mode === 'otp') {
        if (!otpSent) {
          const res = await api('/auth/otp/send', { method: 'POST', body: { email: form.email, purpose: 'login_otp' } });
          setOtpSent(true);
          setNotice(res.devCode
            ? `OTP sent! (Dev OTP: ${res.devCode})`
            : 'If an account exists for that email, a 6-digit login code has been sent.');
        } else {
          await loginWithOtp(form.email, form.code);
        }
      } else if (mode === 'forgot-otp') {
        if (!otpSent) {
          const res = await api('/auth/otp/send', { method: 'POST', body: { email: form.email, purpose: 'password_reset' } });
          setOtpSent(true);
          setNotice(res.devCode
            ? `Reset OTP sent! (Dev OTP: ${res.devCode})`
            : 'If an account exists for that email, a 6-digit reset OTP has been sent.');
        } else {
          const res = await api('/auth/reset-password-otp', {
            method: 'POST',
            body: { email: form.email, code: form.code, password: form.password },
          });
          switchMode('login');
          setNotice(res.message);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = {
    login: 'Log in',
    register: 'Create account',
    forgot: 'Send reset link',
    otp: otpSent ? 'Verify & sign in' : 'Send login OTP',
    'forgot-otp': otpSent ? 'Reset password' : 'Send reset OTP',
  }[mode];

  return (
    <div className="auth-wrap">
      <div className="y2k-login-shell">
        <div className="y2k-titlebar">
          <div className="y2k-title">
            <span className="y2k-dot" aria-hidden="true" />
            <span>LEAP // {HEADINGS[mode]}</span>
          </div>
          <div className="y2k-controls" aria-hidden="true">
            <span>_</span><span>□</span><span>×</span>
          </div>
        </div>

        <section className="auth-form">
          <div className="auth-brand-row">
            <Logo />
            {mode === 'welcome'
              ? <span className="badge badge-primary">v1.0</span>
              : (
                <button type="button" className="why-toggle small" onClick={() => switchMode('welcome')}>
                  ← Welcome
                </button>
              )}
          </div>

          {mode === 'welcome' ? (
            <div className="stack">
              <div>
                <h1 className="welcome-title">Learn what matters next.</h1>
                <p className="muted" style={{ marginBottom: 0 }}>
                  AI-powered adaptive learning that recommends your next step and explains why.
                </p>
              </div>
              <div className="welcome-tiles">
                <div className="welcome-tile"><b>✦ Smart Feed</b><span>Hybrid AI recommendations</span></div>
                <div className="welcome-tile"><b>✦ Adaptive Path</b><span>Prerequisite-aware steps</span></div>
                <div className="welcome-tile"><b>✦ Secured API</b><span>JWT, OAuth 2.0, OTP &amp; Keys</span></div>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <Button block onClick={() => switchMode('login')}>Sign in →</Button>
                <Button variant="ghost" block onClick={() => switchMode('register')}>Create account</Button>
              </div>
              <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
                <a href="/api/v1/docs" target="_blank" rel="noreferrer">Explore API Docs (Swagger)</a>
              </p>
            </div>
          ) : (
            <>
              {error && <Banner tone="error">{error}</Banner>}
          {notice && <Banner tone="success">{notice}</Banner>}
          {mode === 'forgot' && !notice && (
            <p className="small muted">Enter your account email and we will send you a link to choose a new password.</p>
          )}
          {mode === 'forgot-otp' && !notice && (
            <p className="small muted">Enter your account email to receive a 6-digit OTP to reset your password.</p>
          )}

          <form className="stack" onSubmit={submit}>
            {mode === 'register' && (
              <Field label="Full name" id="name">
                <input id="name" className="input" value={form.name} onChange={set('name')} required autoComplete="name" />
              </Field>
            )}
            <Field label="Email" id="email">
              <input id="email" type="email" className="input" value={form.email} onChange={set('email')} required autoComplete="email" />
            </Field>
            {(mode === 'otp' || mode === 'forgot-otp') && otpSent && (
              <Field label="6-digit OTP" id="otp-code">
                <input id="otp-code" className="input" value={form.code} onChange={set('code')} required maxLength={6} pattern="\d{6}" placeholder="123456" />
              </Field>
            )}
            {(mode === 'login' || mode === 'register' || (mode === 'forgot-otp' && otpSent)) && (
              <Field label={mode === 'forgot-otp' ? 'New password' : 'Password'} id="password">
                <input id="password" type="password" className="input" value={form.password} onChange={set('password')} required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' || mode === 'forgot-otp' ? 8 : undefined} />
              </Field>
            )}
            {mode === 'login' && (
              <div className="spread small" style={{ marginTop: -6 }}>
                <button type="button" className="why-toggle small" onClick={() => switchMode('otp')}>
                  Sign in with OTP
                </button>
                <button type="button" className="why-toggle small" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              </div>
            )}
            {(mode === 'register' || (mode === 'forgot-otp' && otpSent)) && (
              <p className="small muted" style={{ margin: 0 }}>At least 8 characters, with a letter and a digit.</p>
            )}
            <Button type="submit" block disabled={busy}>
              {busy ? 'Please wait…' : submitLabel}
            </Button>
          </form>

          {(mode === 'forgot' || mode === 'forgot-otp') && (
            <p className="small" style={{ textAlign: 'center', margin: '12px 0 0' }}>
              <button type="button" className="why-toggle" onClick={() => switchMode(mode === 'forgot' ? 'forgot-otp' : 'forgot')}>
                {mode === 'forgot' ? 'Or reset with a 6-digit Email OTP' : 'Or send a password reset link instead'}
              </button>
            </p>
          )}

          {(mode === 'login' || mode === 'register') && (
            <Button variant="ghost" block style={{ marginTop: 10 }} disabled={!googleEnabled}
              title={googleEnabled ? undefined : 'Google sign-in is not configured on this server'}
              onClick={() => { window.location.href = '/api/v1/auth/google'; }}>
              Continue with Google
            </Button>
          )}

          <p className="small" style={{ textAlign: 'center', margin: '16px 0 0' }}>
            {mode === 'login' ? 'New to LEAP? ' : mode === 'register' ? 'Already have an account? ' : 'Remembered it? '}
            <button type="button" className="why-toggle" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </button>
          </p>

          {mode === 'login' && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              <p className="small muted" style={{ marginBottom: 8 }}>Demo accounts</p>
              <div className="demo-accounts">
                {DEMO.map(([label, email, password]) => (
                  <Button key={label} variant="ghost" size="sm" onClick={() => setForm({ ...form, email, password })}>{label}</Button>
                ))}
              </div>
            </div>
          )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
