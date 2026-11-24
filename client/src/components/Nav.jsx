import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Button } from './ui';

const LINKS = {
  learner: [['/', 'For you'], ['/path', 'My path'], ['/catalogue', 'Catalogue'], ['/progress', 'Progress']],
  instructor: [['/admin', 'Analytics'], ['/admin/catalogue', 'Manage content'], ['/catalogue', 'Catalogue']],
  admin: [['/admin', 'Analytics'], ['/admin/catalogue', 'Manage content'], ['/admin/users', 'Users'], ['/catalogue', 'Catalogue']],
};

export function Logo() {
  return (
    <Link to="/" className="brand" aria-label="LEAP home">
      <span className="brand-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 32 32"><path d="M8 23 L16 9 L24 23" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      LEAP
    </Link>
  );
}

export default function Nav() {
  const { user, logout } = useAuth();
  const initials = user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('') || '?';
  return (
    <header className="nav">
      <div className="nav-inner">
        <Logo />
        <nav className="nav-links" aria-label="Main">
          {(LINKS[user?.role] || []).map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/' || to === '/admin'}>{label}</NavLink>
          ))}
          <a href="/api/v1/docs" target="_blank" rel="noreferrer">API docs</a>
        </nav>
        <div className="nav-user">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span className="small"><b>{user?.name}</b><br /><span className="muted">{user?.role}</span></span>
          <Button variant="ghost" size="sm" onClick={logout}>Log out</Button>
        </div>
      </div>
    </header>
  );
}
