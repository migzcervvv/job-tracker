import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { validateDispatch, fixtureResult, callbackPath } from "../n8n/contracts.mjs";
export function createFixture({ key, apiBase, send = fetch }) {
  if (!key) throw new Error("AUTOMATION_KEY is required");
  return http.createServer(async (request, response) => {
    if (request.url === "/healthz/readiness") { response.writeHead(200); response.end("ready"); return; }
    const supplied = String(request.headers["x-automation-key"] ?? "");
    const digest = value => createHash("sha256").update(value).digest();
    if (!supplied || !timingSafeEqual(digest(supplied), digest(key))) { response.writeHead(401); response.end(); return; }
    const type = request.url?.split("/").at(-1);
    if (request.method !== "POST" || !["skills","questions","resumes"].includes(type)) { response.writeHead(404); response.end(); return; }
    let data = ""; let bytes = 0; let body;
    try { for await (const chunk of request) { bytes += chunk.length; if (bytes > 1000000) throw new Error("Payload too large"); data += chunk; } body = validateDispatch(type, JSON.parse(data)); }
    catch { response.writeHead(400); response.end(); return; }
    response.writeHead(202, { "Content-Type": "application/json" }); response.end(JSON.stringify({ runId: body.runId, status: "accepted" }));
    const headers = { "Content-Type": "application/json", "X-Automation-Key": key };
    let claimed = false;
    try {
      const claim = await send(apiBase + "/api/internal/runs/" + body.runId + "/claim", { method: "POST", headers });
      if (claim.status === 409) return;
      if (!claim.ok) throw new Error("claim_failed");
      claimed = true;
      const saved = await send(apiBase + callbackPath(type, body), { method: "PUT", headers, body: JSON.stringify(fixtureResult(type, body)) });
      if (!saved.ok) throw new Error("callback_failed");
    } catch {
      if (claimed) await send(apiBase + "/api/internal/runs/" + body.runId + "/state", { method: "POST", headers, body: JSON.stringify({ status: "failed" }) }).catch(() => {});
      process.stderr.write("Fixture automation delivery failed\n");
    }
  });
}
