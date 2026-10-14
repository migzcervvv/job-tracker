import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateDispatch, fixtureResult, callbackPath } from "../n8n/contracts.mjs";
import { createFixture } from "./automation-fixture.mjs";
import { runInNewContext } from "node:vm";
const runId = "11111111-1111-1111-1111-111111111111";
const applicationId = "22222222-2222-2222-2222-222222222222";
const stageDetailId = "33333333-3333-3333-3333-333333333333";
test("dispatch contracts reject missing run and saved-round IDs", () => {
  assert.throws(() => validateDispatch("skills", { applicationId, rawDescription: "Docker" }));
  assert.throws(() => validateDispatch("questions", { schemaVersion: 1, runId, applicationId }));
  assert.throws(() => validateDispatch("resumes", { schemaVersion: 1, runId, resumeId: applicationId, downloadUrl: "file:///etc/passwd" }));
});
test("fixture callbacks preserve correlated resource IDs", () => {
  const body = validateDispatch("questions", { schemaVersion: 1, runId, applicationId, stageDetailId });
  assert.equal(fixtureResult("questions", body).stageDetailId, stageDetailId);
  assert.equal(callbackPath("questions", body), "/api/internal/applications/" + applicationId + "/interview-questions");
  assert.equal(fixtureResult("skills", { runId, rawDescription: "Docker + Linux" }).skills.length, 2);
});
test("fixture rejects anonymous requests and uses claim then callback after acknowledgement", async t => {
  const calls = [];
  const server = createFixture({ key: "fixture-key", apiBase: "http://localhost:9999", send: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; } });
  server.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); t.after(() => server.close());
  const url = "http://127.0.0.1:" + server.address().port + "/webhook/skills";
  assert.equal((await fetch(url, { method: "POST", body: "{}" })).status, 401);
  const result = await fetch(url, { method: "POST", headers: { "X-Automation-Key": "fixture-key" }, body: JSON.stringify({ schemaVersion: 1, runId, applicationId, rawDescription: "Docker" }) });
  assert.equal(result.status, 202); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2); assert.match(calls[0].url, /\/claim$/); assert.equal(JSON.parse(calls[1].options.body).runId, runId);
});
test("exported n8n workflows require header auth, claim runs and correlate callbacks", async () => {
  for (const name of ["skills", "questions", "resumes"]) {
    const workflow = JSON.parse(await readFile(new URL("../n8n/" + name + ".workflow.json", import.meta.url)));
    assert.equal(workflow.active, false);
    const webhook = workflow.nodes.find(node => node.type === "n8n-nodes-base.webhook");
    assert.equal(webhook.parameters.authentication, "headerAuth"); assert.equal(webhook.parameters.responseMode, "onReceived");
    assert(workflow.nodes.some(node => node.name === "Claim run"));
    assert(workflow.nodes.some(node => node.name === "Failure callback"));
    const callback = workflow.nodes.find(node => node.name === "Completion callback"); assert.match(callback.parameters.jsonBody, /payload/);
    const result = runInNewContext('(function(){' + workflow.nodes.find(node => node.name === 'Validate result').parameters.jsCode + '})()', {
      $: () => ({first: () => ({json: {body: {runId,applicationId,stageDetailId},text:'Parsed resume fixture'}})}),
      $json: {choices:[{message:{content:JSON.stringify(name === 'questions' ? {questions:'What did you build?'} : {skills:[{name:'docker',importance:3,evidence:'Built Docker services',strength:0.8}]})}}]}
    });
    assert.equal(result[0].json.payload.runId, runId);
    if (name === 'questions') assert.equal(result[0].json.payload.stageDetailId, stageDetailId);
    assert.equal(workflow.settings.saveDataSuccessExecution, "none");
    assert.equal(workflow.settings.saveDataErrorExecution, "none");
  }
});
