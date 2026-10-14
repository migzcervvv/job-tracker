import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Dashboard } from "../src/pages/Dashboard.jsx";
import { updateApplicationStatus } from "../src/api/applications.js";
import { useApplications } from "../src/state/ApplicationsContext.jsx";
vi.mock("../src/state/ApplicationsContext.jsx", () => ({
  useApplications: vi.fn(),
}));
vi.mock("../src/auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: { email: "test@example.test", role: "user" },
    isAdmin: false,
    logout: vi.fn(),
  }),
}));
vi.mock("../src/api/applications.js", () => ({
  updateApplicationStatus: vi.fn(),
}));
vi.mock("../src/notify.js", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/components/DataTools.jsx", () => ({ DataTools: () => null }));
vi.mock("../src/components/FunnelSummary.jsx", () => ({
  FunnelSummary: () => null,
}));
const apps = [
  {
    id: "active",
    title: "Platform Engineer",
    company: "Northstar",
    status: 0,
    version: "original-version",
    appliedDate: "2026-10-10T12:00:00Z",
    fitPercentage: 80,
  },
  {
    id: "saved",
    title: "Cloud Engineer",
    company: "Finch",
    status: -1,
    version: "v2",
    appliedDate: "2026-10-11T12:00:00Z",
  },
  {
    id: "closed",
    title: "Support Engineer",
    company: "Atlas",
    status: 9,
    version: "v3",
    appliedDate: "2026-10-01T12:00:00Z",
  },
];
const update = vi.fn();
const refresh = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  refresh.mockResolvedValue([]);
  useApplications.mockReturnValue({
    applications: apps,
    loadFailed: false,
    updateApplication: update,
    refresh,
  });
});
function show() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}
it("starts with a readable list and separates saved and closed applications", () => {
  show();
  expect(screen.getByRole("table")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Platform Engineer", exact: true }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: "Cloud Engineer", exact: true }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Saved for later/ }));
  expect(
    screen.getByRole("link", { name: "Cloud Engineer", exact: true }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Closed/ }));
  expect(
    screen.getByRole("link", { name: "Support Engineer", exact: true }),
  ).toBeTruthy();
});
it("explains an empty search and clears filters without losing applications", () => {
  show();
  fireEvent.change(screen.getByLabelText("Search company or title"), {
    target: { value: "no matches" },
  });
  expect(screen.getByText("No matching applications")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(
    screen.getByRole("link", { name: "Platform Engineer", exact: true }),
  ).toBeTruthy();
});
it("updates stages with the original version and applies the server response", async () => {
  const fresh = { ...apps[0], status: 3, version: "server-version" };
  updateApplicationStatus.mockResolvedValue(fresh);
  show();
  fireEvent.change(screen.getByLabelText("Stage for Platform Engineer"), {
    target: { value: "3" },
  });
  await waitFor(() => expect(update).toHaveBeenCalledWith("active", fresh));
  expect(updateApplicationStatus).toHaveBeenCalledWith(
    "active",
    3,
    "original-version",
  );
});
it("lets people archive a selection and undo using the new server version", async () => {
  updateApplicationStatus
    .mockResolvedValueOnce({
      ...apps[0],
      status: 9,
      version: "archived-version",
    })
    .mockResolvedValueOnce({ ...apps[0], version: "restored-version" });
  show();
  fireEvent.click(
    screen.getByLabelText("Select Platform Engineer at Northstar"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Archive selected" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Undo archive" }).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo archive" }));
  await waitFor(() =>
    expect(updateApplicationStatus).toHaveBeenNthCalledWith(
      2,
      "active",
      0,
      "archived-version",
    ),
  );
});
it("shows a retry action instead of an endless loading state when the list fails", () => {
  useApplications.mockReturnValue({
    applications: null,
    loadFailed: true,
    updateApplication: update,
    refresh,
  });
  show();
  expect(screen.getByRole("alert").textContent).toContain("couldn’t load");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(refresh).toHaveBeenCalled();
});
