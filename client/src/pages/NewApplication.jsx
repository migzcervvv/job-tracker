import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { createApplication } from '../api/applications.js';
import { extractErrorMessage } from '../api/errors.js';
import { notify } from '../notify.js';

export function NewApplication() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [rawDescription, setRawDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await notify.promise(createApplication({ title, company, jobUrl, rawDescription }), {
        loading: 'Saving application…',
        success: 'Application saved',
        error: (err) => extractErrorMessage(err, 'Could not save this application'),
      });
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
            Paste the full posting. Skill extraction runs against this once n8n is wired up.
          </div>
        </div>

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save application'}
        </button>
      </form>
    </Layout>
  );
}
