import { expect, it, vi } from "vitest";
import { toast } from "sonner";
import { notify } from "../src/notify.js";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(() => "toast-id"),
  },
}));

it("awaits the operation instead of returning the notification ID", async () => {
  let resolve;
  const operation = new Promise((done) => {
    resolve = done;
  });
  const options = {
    loading: "Saving…",
    success: "Saved",
    error: "Could not save",
  };
  const result = notify.promise(operation, options);
  expect(result).toBe(operation);
  expect(toast.promise).toHaveBeenCalledWith(operation, options);
  resolve({ saved: true });
  await expect(result).resolves.toEqual({ saved: true });
});

it("propagates failures so callers do not clear forms or report success", async () => {
  const operation = Promise.reject(new Error("save failed"));
  await expect(notify.promise(operation, {})).rejects.toThrow("save failed");
});
