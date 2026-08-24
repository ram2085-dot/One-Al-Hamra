import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { strings } from '../strings';

export function AppHeader() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-xs font-heading font-semibold uppercase tracking-wider ${isActive ? 'text-accent' : 'text-white/80 hover:text-white'}`;

  return (
    <header className="flex items-center justify-between bg-ink px-6 py-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-white">
          <span aria-hidden className="text-sm text-white">▲</span>
        </div>
        <span className="font-heading text-sm font-bold uppercase tracking-wide text-white">{strings.appName}</span>
      </div>
      <nav className="flex items-center gap-6" aria-label="Main">
        <NavLink to="/" end className={navLinkClass}>Catalog</NavLink>
        {user.role === 'CATALOG_ADMIN' && <NavLink to="/admin" className={navLinkClass}>Admin</NavLink>}
        <button type="button" onClick={() => logout()} className="text-xs font-heading font-semibold uppercase tracking-wider text-white/80 hover:text-white">
          {strings.logoutButton}
        </button>
      </nav>
    </header>
  );
}
