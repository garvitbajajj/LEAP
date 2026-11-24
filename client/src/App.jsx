import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Nav from './components/Nav';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Consent from './pages/Consent';
import Onboarding from './pages/Onboarding';
import Feed from './pages/Feed';
import Item from './pages/Item';
import Catalogue from './pages/Catalogue';
import Path from './pages/Path';
import Progress from './pages/Progress';
import { Analytics, ManageContent, Users } from './pages/Admin';

/** Routes for each role. Learners are gated by consent, then onboarding. */
export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return window.location.pathname === '/reset-password' ? <ResetPassword /> : <Login />;

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
          {isLearner && <Route path="/path" element={<Path />} />}
          {isLearner && <Route path="/progress" element={<Progress />} />}
          <Route path="/" element={isLearner ? <Feed /> : <Navigate to="/admin" replace />} />
          {!isLearner && <Route path="/admin" element={<Analytics />} />}
          {!isLearner && <Route path="/admin/catalogue" element={<ManageContent />} />}
          {user.role === 'admin' && <Route path="/admin/users" element={<Users />} />}
        </Routes>
      </main>
    </>
  );
}
