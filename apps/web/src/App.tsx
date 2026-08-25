import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CatalogHome } from './pages/CatalogHome';
import { ServiceDetail } from './pages/ServiceDetail';
import { AppHeader } from './components/AppHeader';
import { AdminConsole } from './pages/admin/AdminConsole';
import { strings } from './strings';

/**
 * While the on-mount session probe (GET /auth/me) is in flight, `user` is still null even for a
 * signed-in visitor — redirecting now would bounce every page refresh to /login.
 */
function Initializing() {
  return <p role="status">{strings.loadingLabel}</p>;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Initializing />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}

function RequireRole({ role, children }: { role: string; children: JSX.Element }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Initializing />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><CatalogHome /></RequireAuth>} />
      <Route path="/services/:id" element={<RequireAuth><ServiceDetail /></RequireAuth>} />
      <Route path="/admin" element={<RequireRole role="CATALOG_ADMIN"><AdminConsole /></RequireRole>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
