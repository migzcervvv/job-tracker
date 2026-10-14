import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Profile } from "../src/pages/Profile.jsx";
import { AdminSkills } from "../src/pages/admin/AdminSkills.jsx";
import { ApplicationForm } from "../src/components/ApplicationForm.jsx";
import { getProfile } from "../src/api/profile.js";
import { api } from "../src/api/client.js";
import {
  listSkillsAdmin,
  getSkillDetails,
  mergeSkills,
} from "../src/api/admin.js";

vi.mock("../src/components/Layout.jsx", () => ({
  Layout: ({ children }) => <main>{children}</main>,
}));
vi.mock("../src/auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: { role: "user" },
    updateUser: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("../src/api/profile.js", () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
}));
vi.mock("../src/api/client.js", () => ({
  api: { get: vi.fn(), defaults: {} },
}));
vi.mock("../src/api/admin.js", () => ({
  listSkillsAdmin: vi.fn(),
  getSkillDetails: vi.fn(),
  mergeSkills: vi.fn(),
}));
vi.mock("../src/notify.js", () => ({
  notify: { promise: (promise) => promise },
}));
beforeEach(() => {
  getProfile.mockReset();
  api.get.mockReset();
  listSkillsAdmin.mockReset();
  getSkillDetails.mockReset();
  mergeSkills.mockReset();
});

it("shows account details without waiting for reminders and cancels abandoned requests", async () => {
  getProfile.mockResolvedValue({ email: "member@example.test", role: "user" });
  api.get.mockReturnValue(new Promise(() => {}));
  const view = render(<Profile />);
  await screen.findByDisplayValue("member@example.test");
  view.unmount();
  expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
});

it("explains malformed account responses and database failures with a request reference", async () => {
  getProfile.mockResolvedValue({});
  api.get.mockRejectedValue({
    response: {
      status: 503,
      data: { code: "database_schema_outdated", requestId: "req-123" },
    },
  });
  render(<Profile />);
  await screen.findByText(
    /Account details: The server returned incomplete settings/,
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "database migrations",
  );
  expect(screen.getByRole("alert").textContent).toContain("req-123");
});

it("shows account details even if preferences fail and retries the failed load", async () => {
  getProfile.mockResolvedValue({ email: "member@example.test", role: "user" });
  api.get
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockResolvedValueOnce({
      data: {
        timeZone: "UTC",
        remindersEnabled: false,
        weeklyDigestEnabled: false,
      },
    });
  render(<Profile />);
  await screen.findByDisplayValue("member@example.test");
  expect(screen.getByRole("alert").textContent).toContain("Reminder settings");
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "unsaved@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Save preferences" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText("Email address").value).toBe(
    "unsaved@example.test",
  );
  expect(getProfile).toHaveBeenCalledTimes(1);
});

it("reviews duplicate matches and only sends the override after an explicit choice", async () => {
  const submit = vi
    .fn()
    .mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: "application_duplicate",
          threshold: 85,
          matches: [
            {
              id: "existing",
              title: "Engineer",
              company: "Acme",
              descriptionSimilarity: 96,
            },
          ],
        },
      },
    })
    .mockResolvedValueOnce({});
  render(
    <MemoryRouter>
      <ApplicationForm
        initial={{
          title: "Engineer",
          company: "Acme",
          rawDescription: "Linux servers",
        }}
        onSubmit={submit}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save application" }));
  await screen.findByText(/96% description match/);
  expect(
    screen.getByRole("link", { name: "Engineer at Acme" }).getAttribute("href"),
  ).toBe("/applications/existing");
  expect(submit.mock.calls[0][0].allowDuplicate).toBeUndefined();
  fireEvent.click(
    screen.getByRole("button", { name: "Save as a separate application" }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[1][0].allowDuplicate).toBe(true);
});

it("selects two library entries, swaps the kept name, and waits for merge completion", async () => {
  const skills = [
    { id: "linux", name: "linux", applicationUsage: 3, requiredUsage: 2 },
    { id: "alias", name: "linux administration", applicationUsage: 1 },
    { id: "git", name: "git", applicationUsage: 0 },
  ];
  listSkillsAdmin.mockResolvedValue({ items: skills, totalCount: 3 });
  getSkillDetails.mockResolvedValue({
    ...skills[0],
    userUsage: 1,
    requiredCount: 2,
    preferredCount: 1,
    niceToHaveCount: 0,
    roles: [{ title: "Platform Engineer", count: 3 }],
    relatedSkills: [],
    suggestedAliases: [],
  });
  let resolve;
  mergeSkills.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<AdminSkills />);
  await screen.findByText("Platform Engineer · 3 postings");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select linux for merge" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Select linux administration for merge",
    }),
  );
  expect(
    screen.getByRole("checkbox", { name: "Select git for merge" }).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Swap which name is kept" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Merge selected skills" }),
  );
  expect(mergeSkills).toHaveBeenCalledWith("alias", "linux");
  expect(screen.getByRole("button", { name: "Merging…" }).disabled).toBe(true);
  resolve({ mergedInto: "linux" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Merge selected skills" }).disabled,
    ).toBe(true),
  );
});
