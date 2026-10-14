import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HealthGate } from "../src/components/HealthGate.jsx";
import { TagEditor } from "../src/components/TagEditor.jsx";
import { StageDetailForm } from "../src/components/StageDetailForm.jsx";
import { checkN8nHealth } from "../src/api/health.js";
import { upsertStageDetail } from "../src/api/applications.js";
vi.mock("../src/api/health.js", () => ({ checkN8nHealth: vi.fn() }));
vi.mock("../src/api/applications.js", () => ({ upsertStageDetail: vi.fn() }));
vi.mock("../src/notify.js", () => ({ notify: { error: vi.fn() } }));
afterEach(() => vi.useRealTimers());
it("automation health failures preserve the mounted form and its draft", async () => {
  checkN8nHealth.mockRejectedValue(new Error("offline"));
  render(
    <HealthGate>
      <input aria-label="Draft" defaultValue="Original" />
    </HealthGate>,
  );
  const input = screen.getByLabelText("Draft");
  fireEvent.change(input, { target: { value: "Unsubmitted draft" } });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("unavailable"),
  );
  expect(screen.getByLabelText("Draft")).toBe(input);
  expect(input.value).toBe("Unsubmitted draft");
});
it("controlled requirements follow new extraction results and retain importance", () => {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const { rerender } = render(
    <TagEditor skills={[]} onChange={onChange} onSave={onSave} />,
  );
  rerender(
    <TagEditor
      skills={[{ name: "docker", importance: 3 }]}
      onChange={onChange}
      onSave={onSave}
    />,
  );
  expect(screen.getByLabelText("Importance of docker").value).toBe("3");
  fireEvent.change(screen.getByLabelText("Importance of docker"), {
    target: { value: "2" },
  });
  expect(onChange).toHaveBeenCalledWith([{ name: "docker", importance: 2 }]);
});
it("a dirty stage form retains its original version after a question callback", async () => {
  upsertStageDetail.mockRejectedValue({
    response: { status: 409, data: "Stage changed" },
  });
  const onSaved = vi.fn();
  const { rerender } = render(
    <StageDetailForm
      applicationId="app"
      stage={3}
      initialFields={{ round: 1, prepNotes: "Original" }}
      stageDetailId="round"
      version="v1"
      onSaved={onSaved}
    />,
  );
  fireEvent.change(screen.getByLabelText("Prep notes"), {
    target: { value: "Unsaved personal notes" },
  });
  rerender(
    <StageDetailForm
      applicationId="app"
      stage={3}
      initialFields={{ round: 1, prepNotes: "Server notes" }}
      stageDetailId="round"
      version="v2"
      onSaved={onSaved}
    />,
  );
  fireEvent.click(screen.getByText("Save details"));
  await waitFor(() => expect(upsertStageDetail).toHaveBeenCalled());
  expect(upsertStageDetail.mock.calls[0][4]).toBe("v1");
  expect(screen.getByLabelText("Prep notes").value).toBe(
    "Unsaved personal notes",
  );
  expect(onSaved).not.toHaveBeenCalled();
});
it("stage forms use unique accessible IDs and send an explicit UTC interview instant", async () => {
  upsertStageDetail.mockResolvedValue({ id: "round" });
  render(
    <>
      <StageDetailForm
        applicationId="app"
        stage={3}
        initialFields={{ round: 1 }}
        onSaved={vi.fn()}
      />
      <StageDetailForm
        applicationId="app"
        stage={3}
        initialFields={{ round: 2 }}
        onSaved={vi.fn()}
      />
    </>,
  );
  const dates = screen.getAllByLabelText("Date & time");
  expect(dates[0].id).not.toBe(dates[1].id);
  fireEvent.change(dates[0], { target: { value: "2026-12-01T08:00" } });
  await act(async () =>
    fireEvent.click(screen.getAllByText("Save details")[0]),
  );
  expect(upsertStageDetail.mock.calls[0][2].scheduledAt).toMatch(/Z$/);
  expect(upsertStageDetail.mock.calls[0][2].timeZone).toBeTruthy();
});
