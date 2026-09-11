import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Placeholder } from './pages/Placeholder.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/skills-gap"
              element={
                <Placeholder
                  title="Skills gap"
                  note="Bar chart of skill frequency across your applications vs. your own skills. Reads GET /api/analytics/skills-gap."
                />
              }
            />
            <Route
              path="/settings"
              element={
                <Placeholder
                  title="Settings"
                  note="Manage your claimed skills and profile."
                />
              }
            />

            <Route element={<AdminRoute />}>
              <Route
                path="/admin/team"
                element={
                  <Placeholder
                    title="Team"
                    note="Registered users on this instance. Admin-only."
                  />
                }
              />
              <Route
                path="/admin/automation"
                element={
                  <Placeholder
                    title="Automation log"
                    note="Recent n8n webhook activity: skill extraction, email match proposals, digests. Admin-only."
                  />
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
