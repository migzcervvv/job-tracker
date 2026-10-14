import { afterEach, describe, expect, it, vi } from "vitest";
import { pollRun } from "../src/api/polling.js";
afterEach(() => vi.useRealTimers());
describe("run polling", () => {
  it("treats unknown, queued, dispatched and running as pending", async () => {
    vi.useFakeTimers();
    const states = [null, "queued", "dispatched", "running", "succeeded"];
    const fetchStatus = vi.fn(async () => ({ status: states.shift() }));
    const onStatus = vi.fn();
    pollRun({ fetchStatus, onStatus, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchStatus).toHaveBeenCalledTimes(5);
    expect(onStatus.mock.calls.at(-1)[0].status).toBe("succeeded");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not overlap slow requests and suppresses responses after route cancellation", async () => {
    vi.useFakeTimers();
    let resolve;
    const fetchStatus = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onStatus = vi.fn();
    const abort = new AbortController();
    pollRun({ fetchStatus, onStatus, signal: abort.signal, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    abort.abort();
    resolve({ status: "succeeded" });
    await Promise.resolve();
    expect(onStatus).not.toHaveBeenCalled();
  });
  it("retries network errors within a bounded deadline", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    pollRun({
      fetchStatus: vi.fn(async () => {
        throw new Error("offline");
      }),
      onStatus: vi.fn(),
      onError,
      intervalMs: 10,
      timeoutMs: 30,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops immediately for deleted resources", async () => {
    const onError = vi.fn();
    pollRun({
      fetchStatus: async () => {
        throw { response: { status: 404 } };
      },
      onStatus: vi.fn(),
      onError,
    });
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
