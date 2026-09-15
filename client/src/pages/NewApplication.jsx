import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { createApplication } from '../api/applications.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';
import { useApplications } from '../state/ApplicationsContext.jsx';

export function NewApplication() {
  const navigate = useNavigate();
  const { addApplication } = useApplications();

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [rawDescription, setRawDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const createPromise = createApplication({ title, company, jobUrl, rawDescription });
      notify.promise(createPromise, {
        loading: 'Saving application…',
        success: (result) =>
          result.wasDuplicate
            ? 'Looks like you just added this — showing the existing entry'
            : result.automationTriggered
              ? 'Application saved'
              : 'Application saved (skill automation not configured)',
        error: (err) => extractErrorMessage(err, 'Could not save this application'),
      });

      const result = await createPromise;
      // Update the shared store directly from this response — no re-fetch,
      // no dependency on a GET reflecting a write that only just committed.
      if (!result.wasDuplicate) {
        addApplication(result.application);
      }
      navigate('/', { replace: true });
    } catch {
      // toast already shown by notify.promise
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout title="New application">
      <form onSubmit={handleSubmit} className="panel" style={{ maxWidth: 640 }}>

        <div className="field">
          <label htmlFor="title">Job title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="company">Company</label>
          <input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="jobUrl">Job URL</label>
          <input
            id="jobUrl"
            type="url"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="rawDescription">Job description</label>
          <textarea
            id="rawDescription"
            rows={10}
            value={rawDescription}
            onChange={(e) => setRawDescription(e.target.value)}
            required
            style={{
              width: '100%',
              background: 'var(--panel-raised)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              padding: '10px 12px',
              color: 'var(--text)',
              resize: 'vertical',
            }}
          />
          <div className="field-hint">
            Paste the full posting. Skills are extracted automatically within a few seconds.
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save application'}
        </button>
      </form>
    </Layout>
  );
}
