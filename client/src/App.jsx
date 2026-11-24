import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Nav from './components/Nav';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Consent from './pages/Consent';
import Onboarding from './pages/Onboarding';
import Feed from './pages/Feed';
import Item from './pages/Item';
import Catalogue from './pages/Catalogue';

/** Routes for each role. Learners are gated by consent, then onboarding. */
export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Login />;

  const isLearner = user.role === 'learner';

  if (isLearner && !profile?.consentGivenAt) return <><Nav /><main className="shell"><Consent /></main></>;
  if (isLearner && !profile?.onboarded) return <><Nav /><main className="shell"><Onboarding /></main></>;

  return (
    <>
      <Nav />
      <main className="shell">
        <Routes>
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/item/:id" element={<Item />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/" element={isLearner ? <Feed /> : <div className="card"><h1>Welcome, {user.name}</h1><p className="muted">Staff console</p></div>} />
        </Routes>
      </main>
    </>
  );
}
