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
export function ApplicationsProvider({ children }) {
  const [applications, setApplications] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const polls = useRef(new Map());
  const mounted = useRef(true);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const data = await listApplications();
      if (mounted.current && request === revision.current) {
        setApplications(data);
        setLoadFailed(false);
      }
      return data;
    } catch (err) {
      if (mounted.current && request === revision.current) setLoadFailed(true);
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
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((err) =>
      notify.error("Could not load the board", extractErrorMessage(err)),
    );
    const activePolls = polls.current;
    // Lifecycle counters intentionally change during cleanup; these refs are not DOM nodes.
    const dispose = () => {
      mounted.current = false;
      revision.current++;
      activePolls.forEach((stop) => stop());
      activePolls.clear();
    };
    return dispose;
  }, [refresh]);
  function addApplication(app) {
    revision.current++;
    setApplications((prev) => [
      app,
      ...(prev ?? []).filter((a) => a.id !== app.id),
    ]);
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
        refresh,
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
