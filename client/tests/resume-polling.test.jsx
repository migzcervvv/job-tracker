import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResumeManager } from "../src/pages/ResumeManager.jsx";
import { listResumes, activateResume } from "../src/api/resumes.js";

const invalidate = vi.hoisted(() => vi.fn());
vi.mock("../src/state/ApplicationsContext.jsx", () => ({
  useApplications: () => ({ invalidate }),
}));
vi.mock("../src/components/Layout.jsx", () => ({
  Layout: ({ children }) => <main>{children}</main>,
}));
vi.mock("../src/components/ResumeUpload.jsx", () => ({
  ResumeUpload: () => null,
}));
vi.mock("../src/components/ResumeExtractionModal.jsx", () => ({
  ResumeExtractionModal: () => null,
}));
vi.mock("../src/api/resumes.js", () => ({
  listResumes: vi.fn(),
  activateResume: vi.fn(),
  getResumeDownloadUrl: vi.fn(),
  deleteResume: vi.fn(),
  retryResumeExtraction: vi.fn(),
}));
const resume = {
  id: "resume",
  fileName: "CV.pdf",
  extractionStatus: "succeeded",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it("loads once in StrictMode and does not poll completed resumes", async () => {
  listResumes.mockResolvedValue([resume]);
  await act(async () => {
    render(
      <StrictMode>
        <ResumeManager />
      </StrictMode>,
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(listResumes).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Make default" }));
  await act(async () => {});
  expect(activateResume).toHaveBeenCalledWith("resume");
  expect(invalidate).toHaveBeenCalledTimes(1);
});

it("polls active extraction and stops when it completes", async () => {
  listResumes
    .mockResolvedValueOnce([{ ...resume, extractionStatus: "dispatched" }])
    .mockResolvedValue([resume]);
  await act(async () => {
    render(<ResumeManager />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(listResumes).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(listResumes).toHaveBeenCalledTimes(2);
});

it("stops after a polling error and allows an explicit retry", async () => {
  listResumes
    .mockResolvedValueOnce([{ ...resume, extractionStatus: "queued" }])
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockResolvedValue([resume]);
  await act(async () => {
    render(<ResumeManager />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40000);
  });
  expect(listResumes).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Retry resumes" }));
  await act(async () => {});
  expect(listResumes).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("alert")).toBeNull();
});
