import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  listApplications,
  getApplication,
  getAutomationStatus,
} from "../api/applications.js";
import { pollRun } from "../api/polling.js";
import { extractErrorMessage } from "../api/errors.js";
import { notify } from "../notify.js";
const ApplicationsContext = createContext(null);
export function ApplicationsProvider({ children, enabled = true }) {
  const [applications, setApplications] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const polls = useRef(new Map());
  const mounted = useRef(true);
  const revision = useRef(0);
  const loadController = useRef(null);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const data = await listApplications(controller.signal);
      if (
        mounted.current &&
        request === revision.current &&
        !controller.signal.aborted
      ) {
        setApplications(data);
        setLoadFailed(false);
        setLoadError("");
      }
      return data;
    } catch (err) {
      if (
        mounted.current &&
        request === revision.current &&
        !controller.signal.aborted
      ) {
        setLoadFailed(true);
        setLoadError(extractErrorMessage(err));
      }
      throw err;
    }
  }, []);
  const updateApplication = useCallback((id, patch) => {
    revision.current++;
    setApplications(
      (prev) =>
        prev?.map((a) => (a.id === id ? { ...a, ...patch } : a)) ?? prev,
    );
  }, []);
  const invalidate = useCallback(() => {
    revision.current++;
    loadController.current?.abort();
    setApplications(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const activePolls = polls.current;
    // Lifecycle counters intentionally change during cleanup; these refs are not DOM nodes.
    const dispose = () => {
      mounted.current = false;
      revision.current++;
      loadController.current?.abort();
      activePolls.forEach((stop) => stop());
      activePolls.clear();
    };
    return dispose;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // Deferring avoids issuing the discarded StrictMode mount's request.
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        await refresh();
      } catch (err) {
        if (
          active &&
          err?.code !== "ERR_CANCELED" &&
          err?.name !== "AbortError"
        )
          notify.error(
            "Couldn’t load your applications",
            extractErrorMessage(err),
          );
      }
    });
    return () => {
      active = false;
      loadController.current?.abort();
    };
  }, [enabled, refresh]);
  function addApplication(app) {
    revision.current++;
    setApplications((prev) =>
      prev === null
        ? null
        : [app, ...(prev ?? []).filter((a) => a.id !== app.id)],
    );
  }
  function removeApplication(id) {
    revision.current++;
    polls.current.get(id)?.();
    polls.current.delete(id);
    setApplications((prev) => prev?.filter((a) => a.id !== id) ?? prev);
  }
  function pollExtraction(id, runId) {
    if (!runId) return;
    polls.current.get(id)?.();
    const controller = new AbortController();
    polls.current.set(id, () => controller.abort());
    pollRun({
      signal: controller.signal,
      fetchStatus: (signal) =>
        getAutomationStatus(id, runId, "skill_extraction", signal),
      onStatus: (state) => {
        if (state.status === "succeeded")
          void getApplication(id, controller.signal)
            .then((fresh) => {
              if (!controller.signal.aborted && mounted.current)
                updateApplication(id, fresh);
            })
            .catch(() => {});
      },
    });
  }
  return (
    <ApplicationsContext.Provider
      value={{
        applications,
        loadFailed,
        loadError,
        refresh,
        invalidate,
        addApplication,
        updateApplication,
        removeApplication,
        pollExtraction,
      }}
    >
      {children}
    </ApplicationsContext.Provider>
  );
}
export function useApplications() {
  const context = useContext(ApplicationsContext);
  if (!context) throw new Error("ApplicationsProvider required");
  return context;
}
