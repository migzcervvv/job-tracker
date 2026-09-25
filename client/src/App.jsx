import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GooeyToaster } from "goey-toast";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { HealthGate } from "./components/HealthGate.jsx";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute.jsx";
import { Login } from "./pages/Login.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";

// Everything except login and the board is lazy — those two are the only
// routes on the critical path to first paint. The rest (admin section,
// charts, resume flow) loads on navigation, which is what keeps the main
// bundle from growing every time a page is added.
const NewApplication = lazy(() =>
  import("./pages/NewApplication.jsx").then((m) => ({
    default: m.NewApplication,
  })),
);
const ApplicationDetail = lazy(() =>
  import("./pages/ApplicationDetail.jsx").then((m) => ({
    default: m.ApplicationDetail,
  })),
);
const Alerts = lazy(() =>
  import("./pages/Alerts.jsx").then((m) => ({ default: m.Alerts })),
);
const SkillsGap = lazy(() =>
  import("./pages/SkillsGap.jsx").then((m) => ({ default: m.SkillsGap })),
);
const MySkills = lazy(() =>
  import("./pages/MySkills.jsx").then((m) => ({ default: m.MySkills })),
);
const ResumeManager = lazy(() =>
  import("./pages/ResumeManager.jsx").then((m) => ({
    default: m.ResumeManager,
  })),
);
const Profile = lazy(() =>
  import("./pages/Profile.jsx").then((m) => ({ default: m.Profile })),
);
const AdminUsers = lazy(() =>
  import("./pages/admin/AdminUsers.jsx").then((m) => ({
    default: m.AdminUsers,
  })),
);
const AdminSkills = lazy(() =>
  import("./pages/admin/AdminSkills.jsx").then((m) => ({
    default: m.AdminSkills,
  })),
);
const AdminHealth = lazy(() =>
  import("./pages/admin/AdminHealth.jsx").then((m) => ({
    default: m.AdminHealth,
  })),
);
const AdminAutomationLog = lazy(() =>
  import("./pages/admin/AdminAutomationLog.jsx").then((m) => ({
    default: m.AdminAutomationLog,
  })),
);

function RouteFallback() {
  return <div style={{ padding: 28, color: "var(--text-dim)" }}>Loading…</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <GooeyToaster position="top-center" theme="dark" />
      <HealthGate>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/applications/new" element={<NewApplication />} />
              <Route path="/applications/:id" element={<ApplicationDetail />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/skills-gap" element={<SkillsGap />} />
              <Route path="/skills" element={<MySkills />} />
              <Route path="/resume" element={<ResumeManager />} />
              {/* Old paths kept as redirects so existing bookmarks don't 404. */}
              <Route
                path="/settings"
                element={<Navigate to="/skills" replace />}
              />
              <Route
                path="/skills-resume"
                element={<Navigate to="/skills" replace />}
              />
              <Route path="/profile" element={<Profile />} />

              <Route element={<AdminRoute />}>
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/skills" element={<AdminSkills />} />
                <Route path="/admin/health" element={<AdminHealth />} />
                <Route
                  path="/admin/automation"
                  element={<AdminAutomationLog />}
                />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
      </HealthGate>
    </BrowserRouter>
  );
}
