import { useEffect, useState } from "react";
import { checkN8nHealth } from "../api/health.js";
import { notify } from "../notify.js";

const POLL_START_MS = 3000;
const POLL_MAX_MS = 15000;
const POLL_BACKOFF = 1.5;
const GIVE_UP_AFTER_MS = 45000; // stop hard-blocking even if it's still down

// Ordered by ascending threshold — the last entry whose `after` has been
// passed wins. Keeps the copy honest as a cold start drags on instead of
// showing the same line for the whole wait.
const MESSAGES = [
  { after: 0, text: "Waking up the server…" },
  {
    after: 15000,
    text: "Still waking up — this can take a little longer on the first request.",
  },
  {
    after: 30000,
    text: "Hang tight. Free-tier hosting can take a minute or two to spin back up.",
  },
];

function messageFor(elapsedMs) {
  let text = MESSAGES[0].text;
  for (const m of MESSAGES) {
    if (elapsedMs >= m.after) text = m.text;
  }
  return text;
}

// A 404 means this endpoint doesn't exist on the API yet. A 401/403 means
// it's wired up wrong (it must be anonymous). Neither means n8n is down —
// only a response-less failure (network error, timeout, DNS, CORS block)
// or a 5xx from the API itself counts as a real outage worth blocking for.
function isGenuinelyUnreachable(err, data) {
  if (data?.status === "unreachable") return true; // backend itself said so
  if (!err) return false;
  if (!err.response) return true; // request never got a response at all
  return err.response.status >= 500;
}

export function HealthGate({ children }) {
  const [waking, setWaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timerId = null;
    let delay = POLL_START_MS;
    const startedAt = Date.now();
    let warnedGaveUp = false;

    function stop(isReady) {
      setWaking(false);
      setReady(isReady);
    }

    async function check() {
      try {
        const data = await checkN8nHealth();
        if (cancelled) return;
        if (isGenuinelyUnreachable(null, data))
          throw new Error("n8n unreachable");
        stop(true);
      } catch (err) {
        if (cancelled) return;

        if (!isGenuinelyUnreachable(err, null)) {
          // Endpoint missing or misconfigured, not an outage — don't hold
          // the whole app hostage for a backend gap. Let people in, and
          // leave a trail for whoever's building the backend side.
          console.warn(
            "[HealthGate] GET /api/health/n8n didn't respond as expected" +
              (err?.response
                ? ` (status ${err.response.status})`
                : " (no response)") +
              " — treating as healthy. This endpoint needs to exist, be anonymous, and " +
              'return { "status": "healthy" | "unreachable" | "not_configured" }.',
          );
          stop(true);
          return;
        }

        const elapsedNow = Date.now() - startedAt;
        if (elapsedNow >= GIVE_UP_AFTER_MS) {
          if (!warnedGaveUp) {
            warnedGaveUp = true;
            notify.error(
              "Automation service unreachable",
              "n8n still isn't responding — skill extraction and other automation may be delayed.",
            );
          }
          stop(true); // let them in anyway rather than block forever
          return;
        }

        setWaking(true);
        setElapsed(elapsedNow);
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
