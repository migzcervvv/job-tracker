import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { ApplicationsProvider } from "../state/ApplicationsContext.jsx";

export function ProtectedRoute() {
  const { isAuthenticated, loading, user } = useAuth();
  const { pathname } = useLocation();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <ApplicationsProvider key={user.token} enabled={pathname === "/"}>
      <Outlet />
    </ApplicationsProvider>
  );
}

export function AdminRoute() {
  const { isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <Outlet />;
}
