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
  login: 'Welcome back',
  register: 'Create your account',
  otp: 'Sign in with Email OTP',
  forgot: 'Reset your password',
  'forgot-otp': 'Reset password with OTP',
};

export default function Login() {
  const { login, loginWithOtp, register } = useAuth();
  const [mode, setMode] = useState('login');
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
      <section className="auth-hero">
        <div>
          <div className="brand" style={{ color: '#fff' }}>
            <span className="brand-mark" style={{ background: 'rgba(255,255,255,0.2)' }} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 32 32"><path d="M8 23 L16 9 L24 23" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            LEAP
          </div>
          <h1>Learn what matters next.</h1>
          <p>LEAP is a Learning Engine for Adaptive Personalization. It learns what you know, recommends what you should learn next, and tells you why.</p>
          <div className="auth-points">
            <div><span>✦</span><span>Hybrid AI recommendations - collaborative, content-based and skill-gap signals</span></div>
            <div><span>✦</span><span>An adaptive learning path that respects every prerequisite</span></div>
            <div><span>✦</span><span>Mastery tracked with Bayesian Knowledge Tracing</span></div>
            <div><span>✦</span><span>An explanation on every single recommendation</span></div>
          </div>
        </div>
        <p className="small" style={{ opacity: 0.75 }}>Capstone II · Team 35 · NIIT University</p>
      </section>

      <section className="auth-form">
        <Card>
          <div className="spread" style={{ marginBottom: 20 }}>
            <div className="mobile-only"><Logo /></div>
            <h2 style={{ margin: 0 }}>{HEADINGS[mode]}</h2>
          </div>

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
        </Card>
      </section>
    </div>
  );
}
