import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GooeyToaster } from 'goey-toast';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { NewApplication } from './pages/NewApplication.jsx';
import { SkillsGap } from './pages/SkillsGap.jsx';
import { Settings } from './pages/Settings.jsx';
import { Profile } from './pages/Profile.jsx';
import { AdminUsers } from './pages/admin/AdminUsers.jsx';
import { AdminSkills } from './pages/admin/AdminSkills.jsx';
import { AdminHealth } from './pages/admin/AdminHealth.jsx';
import { AdminAutomationLog } from './pages/admin/AdminAutomationLog.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <GooeyToaster position="top-center" theme="dark" />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/applications/new" element={<NewApplication />} />
            <Route path="/skills-gap" element={<SkillsGap />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />

            <Route element={<AdminRoute />}>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/skills" element={<AdminSkills />} />
              <Route path="/admin/health" element={<AdminHealth />} />
              <Route path="/admin/automation" element={<AdminAutomationLog />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
