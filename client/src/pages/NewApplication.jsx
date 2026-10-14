import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "../components/Layout.jsx";
import { ApplicationForm } from "../components/ApplicationForm.jsx";
import { createApplication } from "../api/applications.js";
import { listResumes } from "../api/resumes.js";
import { useApplications } from "../state/ApplicationsContext.jsx";
export function NewApplication() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [requestId] = useState(() => crypto.randomUUID());
  const [resumes, setResumes] = useState([]);
  const { addApplication, pollExtraction } = useApplications();
  useEffect(() => {
    let cancelled = false;
    void listResumes()
      .then((rows) => {
        if (!cancelled) setResumes(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  async function save(values) {
    const result = await createApplication({ ...values, requestId });
    addApplication(result.application);
    if (result.automationTriggered)
      pollExtraction(result.application.id, result.runId);
    navigate(`/applications/${result.application.id}`);
  }
  return (
    <Layout title="New application">
      <ApplicationForm
        initial={{
          title: params.get("title") ?? "",
          jobUrl: params.get("url") ?? "",
          rawDescription: params.get("description") ?? "",
          status: params.has("url") ? -1 : 0,
        }}
        resumes={resumes}
        onSubmit={save}
      />
    </Layout>
  );
}
