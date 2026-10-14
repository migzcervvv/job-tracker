export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateDispatch(type, body) {
  if (body?.schemaVersion !== 1 || !UUID.test(body.runId)) throw new Error("Invalid schemaVersion or runId");
  if (type === "resumes") {
    if (!UUID.test(body.resumeId) || !/^https:\/\//.test(body.downloadUrl)) throw new Error("Invalid resume or signed URL");
  } else {
    if (!UUID.test(body.applicationId)) throw new Error("Invalid applicationId");
    if (type === "skills" && (typeof body.rawDescription !== "string" || body.rawDescription.length > 100000)) throw new Error("Invalid description");
    if (type === "questions" && !UUID.test(body.stageDetailId)) throw new Error("Missing saved interview round");
  }
  return body;
}
export function fixtureResult(type, body) {
  const source = (body.rawDescription ?? body.jobDescription ?? "").toLowerCase();
  if (type === "skills") return { runId: body.runId, skills: ["docker", "linux", "terraform", "kubernetes", "n8n", "c#", "react"].filter(name => source.includes(name)).map(name => ({ name, importance: 2 })) };
  if (type === "questions") return { runId: body.runId, stageDetailId: body.stageDetailId, questions: "Development fixture\nDescribe your deployment pipeline.\nHow would you investigate a failed release?" };
  return { runId: body.runId, extractedText: "Development fixture only: document parsing is not performed.", skills: [] };
}
export function callbackPath(type, body) {
  return type === "resumes" ? `/api/internal/resumes/${body.resumeId}/extraction` : `/api/internal/applications/${body.applicationId}/${type === "skills" ? "skills" : "interview-questions"}`;
}
