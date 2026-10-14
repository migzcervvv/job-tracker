import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { ApplicationDetail } from "../src/pages/ApplicationDetail.jsx";
import { getApplication } from "../src/api/applications.js";
import { getApplicationSkills, getMySkills } from "../src/api/skills.js";
import { listResumes } from "../src/api/resumes.js";

const update = vi.hoisted(() => vi.fn());
vi.mock("../src/state/ApplicationsContext.jsx", () => ({
  useApplications: () => ({
    updateApplication: update,
    removeApplication: vi.fn(),
  }),
}));
vi.mock("../src/components/Layout.jsx", () => ({
  Layout: ({ title, children }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("../src/components/ConnectionHelp.jsx", () => ({
  ConnectionHelp: () => null,
}));
vi.mock("../src/api/applications.js", () => ({
  getApplication: vi.fn(),
  editApplication: vi.fn(),
  updateApplicationStatus: vi.fn(),
  deleteApplication: vi.fn(),
  retrySkillExtraction: vi.fn(),
  getAutomationStatus: vi.fn(),
  generateInterviewQuestions: vi.fn(),
  saveFollowUp: vi.fn(),
  addNote: vi.fn(),
  upsertStageDetail: vi.fn(),
}));
vi.mock("../src/api/skills.js", () => ({
  getApplicationSkills: vi.fn(),
  getMySkills: vi.fn(),
  setApplicationSkills: vi.fn(),
}));
vi.mock("../src/api/resumes.js", () => ({ listResumes: vi.fn() }));
const application = {
  id: "one",
  title: "Platform Engineer",
  company: "Acme",
  status: 0,
  version: "v1",
  appliedDate: "2026-10-01T00:00:00Z",
  timeline: [],
  stageDetails: [],
  rawDescription: "Linux",
};
beforeEach(() => {
  vi.resetAllMocks();
  getApplication.mockResolvedValue(application);
  getApplicationSkills.mockResolvedValue({ version: "v1", skills: [] });
  getMySkills.mockResolvedValue([]);
  listResumes.mockResolvedValue([]);
});
function show(strict = false) {
  const page = (
    <MemoryRouter initialEntries={["/applications/one"]}>
      <Routes>
        <Route path="/applications/:id" element={<ApplicationDetail />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}
it("opens application details while job skills are still pending", async () => {
  getApplicationSkills.mockReturnValue(new Promise(() => {}));
  show();
  await screen.findByRole("heading", { name: "Platform Engineer" });
  expect(screen.getByRole("button", { name: "Edit application" })).toBeTruthy();
});
it("keeps details usable when skills fail and lets skills retry", async () => {
  getApplicationSkills.mockRejectedValueOnce({ code: "ECONNABORTED" });
  show();
  await screen.findByRole("heading", { name: "Platform Engineer" });
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry job skills" }),
  );
  await screen.findByText("No matches yet");
  expect(screen.queryByRole("button", { name: "Retry job skills" })).toBeNull();
});
it("can retry a failed application request", async () => {
  getApplication.mockRejectedValueOnce({ response: { status: 500 } });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Platform Engineer" });
  expect(screen.queryByRole("alert")).toBeNull();
});
it.each(["invalid JSON", "null"])(
  "opens older interview data with fields %s",
  async (fieldsJson) => {
    getApplication.mockResolvedValue({
      ...application,
      stageDetails: [
        {
          id: "round1",
          stage: 3,
          fieldsJson,
          createdAt: application.appliedDate,
          version: "s1",
        },
      ],
    });
    show();
    await screen.findByRole("heading", { name: "Platform Engineer" });
    expect(screen.getByText("Round ?")).toBeTruthy();
  },
);
it("does not duplicate detail or skills requests during StrictMode remounting", async () => {
  show(true);
  await screen.findByRole("heading", { name: "Platform Engineer" });
  expect(getApplication).toHaveBeenCalledTimes(1);
  expect(getApplicationSkills).toHaveBeenCalledTimes(1);
  expect(getMySkills).toHaveBeenCalledTimes(1);
  expect(listResumes).not.toHaveBeenCalled();
});
it("loads resume choices only when editing and reuses them", async () => {
  show();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit application" }),
  );
  await waitFor(() => expect(listResumes).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit application" }));
  expect(listResumes).toHaveBeenCalledTimes(1);
});
