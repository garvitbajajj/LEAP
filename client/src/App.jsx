import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Nav from './components/Nav';
import { Spinner } from './components/ui';
import Login from './pages/Login';

/** Routes for each role. Learners are gated by consent, then onboarding. */
export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Login />;

  const isLearner = user.role === 'learner';

  return (
    <>
      <Nav />
      <main className="shell">
        <Routes>
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/" element={<div className="card"><h1>Welcome, {user.name}</h1><p className="muted">{isLearner ? `Goals: ${profile?.goals?.join(', ') || 'none yet'}` : 'Staff console'}</p></div>} />
        </Routes>
      </main>
    </>
  );
}
