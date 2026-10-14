import { useEffect, useState } from "react";
import { checkN8nHealth } from "../api/health.js";
export function HealthGate({ children }) {
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function check() {
      try {
        const health = await checkN8nHealth();
        if (!cancelled) setDegraded(health.status !== "healthy");
      } catch {
        if (!cancelled) setDegraded(true);
      }
      if (!cancelled) timer = setTimeout(check, 30000);
    }
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return (
    <>
      {degraded && (
        <div className="automation-banner" role="status">
          Automation is unavailable. Tracking and editing remain available;
          queued runs will retry.
        </div>
      )}
      {children}
    </>
  );
}
