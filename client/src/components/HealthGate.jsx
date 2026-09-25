import { useEffect, useState } from "react";
import { checkN8nHealth } from "../api/health.js";

const POLL_START_MS = 3000;
const POLL_MAX_MS = 15000;
const POLL_BACKOFF = 1.5;

// Ordered by ascending threshold — the last entry whose `after` has been
// passed wins. Keeps the copy honest as a cold start drags on instead of
// showing the same line for two minutes straight.
const MESSAGES = [
  { after: 0, text: "Waking up the server…" },
  { after: 15000, text: "Still waking up — this can take a little longer on the first request." },
  { after: 45000, text: "Hang tight. Free-tier hosting can take a minute or two to spin back up." },
];

function messageFor(elapsedMs) {
  let text = MESSAGES[0].text;
  for (const m of MESSAGES) {
    if (elapsedMs >= m.after) text = m.text;
  }
  return text;
}

// Runs once per app load. Checks are optimistic — children render
// immediately and nothing blocks unless a check actually fails, at which
// point this takes over the full screen and retries with backoff until
// n8n answers healthy (or reports itself not configured, which is treated
// the same as healthy: nothing to wake up). Once healthy, it stops
// checking for the rest of the session.
export function HealthGate({ children }) {
  const [waking, setWaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timerId = null;
    let delay = POLL_START_MS;
    const startedAt = Date.now();

    async function check() {
      try {
        const data = await checkN8nHealth();
        if (cancelled) return;
        if (data?.status === "unreachable") {
          throw new Error("n8n unreachable");
        }
        setWaking(false);
        setReady(true);
      } catch {
        if (cancelled) return;
        setWaking(true);
        setElapsed(Date.now() - startedAt);
        delay = Math.min(delay * POLL_BACKOFF, POLL_MAX_MS);
        timerId = setTimeout(check, delay);
      }
    }

    check();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  if (ready || !waking) return children;

  return (
    <div className="wake-screen">
      <div className="wake-card">
        <span className="automation-spinner wake-spinner" />
        <div className="wake-title">{messageFor(elapsed)}</div>
        <div className="wake-hint">
          This screen clears on its own once the server responds.
        </div>
      </div>
    </div>
  );
}
