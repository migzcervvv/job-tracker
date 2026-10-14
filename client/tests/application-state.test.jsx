import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  ApplicationsProvider,
  useApplications,
} from "../src/state/ApplicationsContext.jsx";
import { listApplications } from "../src/api/applications.js";
import { notify } from "../src/notify.js";

vi.mock("../src/api/applications.js", () => ({
  listApplications: vi.fn(),
  getApplication: vi.fn(),
  getAutomationStatus: vi.fn(),
}));
vi.mock("../src/notify.js", () => ({ notify: { error: vi.fn() } }));
beforeEach(() => {
  listApplications.mockReset();
});

function Consumer() {
  const { applications, loadError, refresh } = useApplications();
  return (
    <>
      <p>{loadError || `Loaded: ${applications?.length ?? "pending"}`}</p>
      <button onClick={() => void refresh().catch(() => {})}>Retry</button>
    </>
  );
}

it("does not show duplicate notifications from StrictMode's disposed request", async () => {
  listApplications.mockRejectedValue(new Error("unavailable"));
  render(
    <StrictMode>
      <ApplicationsProvider>
        <Consumer />
      </ApplicationsProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1));
});

it("exposes a useful failure reason and clears it after a successful retry", async () => {
  listApplications
    .mockRejectedValueOnce({ code: "API_RETURNED_HTML" })
    .mockResolvedValueOnce([{ id: "app" }]);
  render(
    <ApplicationsProvider>
      <Consumer />
    </ApplicationsProvider>,
  );
  await screen.findByText(/frontend API address/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Loaded: 1");
  expect(screen.queryByText(/frontend API address/)).toBeNull();
});
