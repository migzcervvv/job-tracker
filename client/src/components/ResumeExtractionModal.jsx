import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getResumeAutomationStatus,
  getProposedSkills,
  confirmResumeSkills,
  dismissProposedSkills,
} from '../api/resumes.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

const POLL_MS = 3000;
const MAX_ATTEMPTS = 20; // ~60s — resume extraction downloads a file, parses it, then runs an LLM call, so it's meaningfully slower than JD extraction

export function ResumeExtractionModal({ resume, onClose, onSkillsConfirmed }) {
  // 'extracting' | 'review' | 'failed' | 'timeout'
  const [phase, setPhase] = useState('extracting');
  const [proposed, setProposed] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [failMessage, setFailMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!resume) return;

    let cancelled = false;
    let timerId = null;
    let attempts = 0;
    loadedRef.current = false;
    setPhase('extracting');
    setProposed([]);
    setSelected(new Set());
    setFailMessage(null);

    async function loadProposals() {
      if (loadedRef.current) return;
      loadedRef.current = true;
      try {
        const data = await getProposedSkills(resume.id);
        if (cancelled) return;
        const items = data.proposedSkills ?? [];
        setProposed(items);
        // Pre-check everything not already claimed — the common case is
        // "these are all mine", so the user unchecks the wrong ones rather
        // than checking twenty boxes by hand.
        setSelected(new Set(items.filter((s) => !s.alreadyClaimed).map((s) => s.name)));
        setPhase('review');
      } catch (err) {
        if (cancelled) return;
        setFailMessage(extractErrorMessage(err, 'Could not load extracted skills'));
        setPhase('failed');
      }
    }

    async function poll() {
      attempts += 1;
      try {
        const data = await getResumeAutomationStatus(resume.id);
        if (cancelled) return;

        if (data.status === 'succeeded') {
          clearInterval(timerId);
          await loadProposals();
          return;
        }
        if (data.status === 'failed') {
          clearInterval(timerId);
          setFailMessage(data.message ?? null);
          setPhase('failed');
          return;
        }
        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(timerId);
          setPhase('timeout');
        }
      } catch (err) {
        if (cancelled) return;
        clearInterval(timerId);
        setFailMessage(extractErrorMessage(err, 'Lost contact with the server'));
        setPhase('failed');
      }
    }

    poll();
    timerId = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
    };
  }, [resume?.id]);

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(proposed.filter((s) => !s.alreadyClaimed).map((s) => s.name)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const names = [...selected];
      await notify.promise(confirmResumeSkills(resume.id, names), {
        loading: 'Adding to your skills…',
        success: `${names.length} skill${names.length === 1 ? '' : 's'} added`,
        error: (err) => extractErrorMessage(err, 'Could not save skills'),
      });
      onSkillsConfirmed?.();
      onClose();
    } catch {
      // toast already shown
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDismiss() {
    setSubmitting(true);
    try {
      await dismissProposedSkills(resume.id);
      notify.info('Skipped', 'Nothing was added to your skills.');
      onClose();
    } catch (err) {
      notify.error('Could not dismiss', extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const newCount = proposed.filter((s) => !s.alreadyClaimed).length;

  return (
    <AnimatePresence>
      {resume && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="modal-panel"
            style={{ maxWidth: 560 }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="modal-head">
              <div>
                <h2>Reading your resume</h2>
                <div className="sub">{resume.fileName}</div>
              </div>
            </div>

            <div className="modal-body">
              {phase === 'extracting' && (
                <div className="extract-state">
                  <span className="automation-spinner" />
                  <div>
                    <div style={{ marginBottom: 4 }}>Extracting skills…</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      This runs through an external workflow and usually takes 10–30 seconds.
                      Nothing is added to your profile until you confirm it.
                    </div>
                  </div>
                </div>
              )}

              {phase === 'failed' && (
                <>
                  <div className="automation-banner automation-banner-failed" style={{ marginBottom: 14 }}>
                    Extraction failed{failMessage ? `: ${failMessage}` : '.'}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
                    The file is saved and still downloadable — only the automatic skill
                    reading failed. Add skills by hand on this page instead.
                  </p>
                </>
              )}

              {phase === 'timeout' && (
                <>
                  <div className="automation-banner automation-banner-pending" style={{ marginBottom: 14 }}>
                    Still processing after a minute.
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
                    It may still finish in the background. Close this and reopen the resume
                    later to review whatever came back.
                  </p>
                </>
              )}

              {phase === 'review' && (
                <>
                  {proposed.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
                      No skills were found in this document. Add them by hand instead.
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 0, marginBottom: 12 }}>
                        Found {proposed.length} skill{proposed.length === 1 ? '' : 's'}
                        {newCount !== proposed.length && ` (${proposed.length - newCount} already on your profile)`}.
                        Uncheck anything that isn't really yours — only checked items get added.
                      </p>

                      <div className="bulk-row">
                        <button type="button" className="icon-btn" onClick={selectAll}>Select all</button>
                        <button type="button" className="icon-btn" onClick={selectNone}>Select none</button>
                        <span className="bulk-count">{selected.size} selected</span>
                      </div>

                      <ul className="proposal-list">
                        {proposed.map((s) => (
                          <li key={s.name} className={`proposal-item${s.alreadyClaimed ? ' is-claimed' : ''}`}>
                            <input
                              type="checkbox"
                              id={`prop-${s.name}`}
                              checked={selected.has(s.name)}
                              onChange={() => toggle(s.name)}
                            />
                            <label htmlFor={`prop-${s.name}`}>
                              <span className="proposal-name">
                                {s.name}
                                {s.alreadyClaimed && <span className="proposal-tag">already yours</span>}
                              </span>
                              {s.evidence && <span className="proposal-evidence">{s.evidence}</span>}
                            </label>
                            {typeof s.strength === 'number' && s.strength > 0 && (
                              <span className="proposal-strength" title="How strongly the resume supports this skill">
                                {Math.round(s.strength * 100)}%
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="modal-foot">
              {phase === 'review' && proposed.length > 0 ? (
                <>
                  <button className="icon-btn" onClick={handleDismiss} disabled={submitting}>
                    Skip
                  </button>
                  <button className="btn-save" onClick={handleConfirm} disabled={submitting || selected.size === 0}>
                    {submitting ? 'Adding…' : `Add ${selected.size} to my skills`}
                  </button>
                </>
              ) : (
                <button
                  className="icon-btn"
                  onClick={onClose}
                  disabled={phase === 'extracting'}
                  title={phase === 'extracting' ? 'Wait for extraction to finish' : undefined}
                >
                  Close
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
