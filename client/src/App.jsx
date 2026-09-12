import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GooeyToaster } from 'goey-toast';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute.jsx';
import { Login } from './pages/Login.jsx';
import { Register } from './pages/Register.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { NewApplication } from './pages/NewApplication.jsx';
import { SkillsGap } from './pages/SkillsGap.jsx';
import { Settings } from './pages/Settings.jsx';
import { Placeholder } from './pages/Placeholder.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <GooeyToaster position="top-center" theme="dark" />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/applications/new" element={<NewApplication />} />
            <Route path="/skills-gap" element={<SkillsGap />} />
            <Route path="/settings" element={<Settings />} />

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
