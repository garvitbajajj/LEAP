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

/** Routes gated by DB-backed permissions. Learners are also gated by consent, then onboarding. */
export default function App() {
  const { user, profile, can, loading } = useAuth();

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
          {can('catalogue:read') && <Route path="/catalogue" element={<Catalogue />} />}
          {can('paths:write') && <Route path="/path" element={<Path />} />}
          {can('progress:read') && <Route path="/progress" element={<Progress />} />}
          <Route path="/" element={can('recommendations:read') ? <Feed /> : <Navigate to="/admin" replace />} />
          {can('analytics:read') && <Route path="/admin" element={<Analytics />} />}
          {can('catalogue:write') && <Route path="/admin/catalogue" element={<ManageContent />} />}
          {can('users:read') && <Route path="/admin/users" element={<Users />} />}
        </Routes>
      </main>
    </>
  );
}
