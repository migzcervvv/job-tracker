import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { listApplications, getApplication, getAutomationStatus } from '../api/applications.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

const ApplicationsContext = createContext(null);

export function ApplicationsProvider({ children }) {
  const [applications, setApplications] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(() => {
    return listApplications()
      .then((data) => {
        setApplications(data);
        setLoadFailed(false);
        return data;
      })
      .catch((err) => {
        setLoadFailed(true);
        throw err;
      });
  }, []);

  // Fetched exactly once, when a user enters the authenticated part of the
  // app — not on every navigation to the board. Every mutation below updates
  // this same array directly from its own response, so no page ever needs
  // to re-fetch and hope the write is visible yet.
  useEffect(() => {
    refresh().catch((err) => {
      notify.error('Could not load the board', extractErrorMessage(err));
    });
  }, [refresh]);

  function addApplication(app) {
    setApplications((prev) => (prev ? [app, ...prev] : [app]));
  }

  function updateApplication(id, patch) {
    setApplications((prev) => prev?.map((a) => (a.id === id ? { ...a, ...patch } : a)) ?? prev);
  }

  function removeApplication(id) {
    setApplications((prev) => prev?.filter((a) => a.id !== id) ?? prev);
  }

  // Fires after creating an application whose skill extraction was
  // triggered. Polls status in the background — independent of whatever
  // page the user navigates to next — and once extraction succeeds,
  // refetches the full application (fit score, skills) and folds it into
  // the shared list so the board reflects it without a manual reload.
  function pollExtraction(id, attempt = 0) {
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 3000;

    getAutomationStatus(id)
      .then((status) => {
        if (status.status === 'succeeded') {
          getApplication(id)
            .then((fresh) => updateApplication(id, fresh))
            .catch(() => {});
          return;
        }
        if (status.status === 'triggered' && attempt < MAX_ATTEMPTS) {
          setTimeout(() => pollExtraction(id, attempt + 1), INTERVAL_MS);
        }
        // 'failed', or timed out after MAX_ATTEMPTS: stop quietly — the
        // application detail page surfaces a retry option for this.
      })
      .catch(() => {});
  }

  const value = {
    applications,
    loadFailed,
    refresh,
    addApplication,
    updateApplication,
    removeApplication,
    pollExtraction,
  };

  return <ApplicationsContext.Provider value={value}>{children}</ApplicationsContext.Provider>;
}

export function useApplications() {
  const ctx = useContext(ApplicationsContext);
  if (!ctx) throw new Error('useApplications must be used inside ApplicationsProvider');
  return ctx;
}
