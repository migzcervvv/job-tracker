import { expect, it, vi } from "vitest";
import { api } from "../src/api/client.js";
import {
  generateInterviewQuestions,
  getAutomationStatus,
  updateApplicationStatus,
  createApplication,
} from "../src/api/applications.js";
import {
  setApplicationSkills,
  addMySkill,
  removeMySkill,
} from "../src/api/skills.js";
vi.mock("../src/api/client.js", () => ({
  api: {
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));
it("questions and run status use immutable IDs and the requested run", async () => {
  await generateInterviewQuestions("app", "round-id");
  expect(api.post).toHaveBeenCalledWith(
    "/api/applications/app/interview-questions",
    { stageDetailId: "round-id" },
  );
  await getAutomationStatus("app", "run-id", "interview_questions");
  expect(api.get.mock.calls.at(-1)[1].params).toEqual({
    runId: "run-id",
    type: "interview_questions",
  });
});
it("status and required-skill replacements include concurrency versions", async () => {
  await updateApplicationStatus("app", 9, "version");
  expect(api.patch).toHaveBeenCalledWith("/api/applications/app/status", {
    status: 9,
    version: "version",
  });
  await setApplicationSkills(
    "app",
    [{ name: "docker", importance: 3 }],
    "version",
  );
  expect(api.put).toHaveBeenCalledWith("/api/applications/app/skills", {
    version: "version",
    skills: [{ name: "docker", importance: 3 }],
  });
});
it("personal skills use additive and per-skill operations", async () => {
  await addMySkill("Docker");
  await removeMySkill("c#");
  expect(api.post).toHaveBeenCalledWith("/api/me/skills", {
    skillNames: ["Docker"],
  });
  expect(api.delete).toHaveBeenCalledWith("/api/me/skills/c%23");
});
it("create retains saved status, submitted resume, date and idempotency key", async () => {
  const input = {
    title: "Engineer",
    status: -1,
    resumeId: "resume",
    appliedDate: "2026-01-01T00:00:00Z",
    requestId: "request",
  };
  await createApplication(input);
  expect(api.post).toHaveBeenCalledWith("/api/applications", input);
});
