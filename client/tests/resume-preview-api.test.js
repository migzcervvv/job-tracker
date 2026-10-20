import { afterEach, expect, it, vi } from "vitest";
import { getResumePreviewFile } from "../src/api/resumes.js";
import { api } from "../src/api/client.js";

vi.mock("../src/api/client.js", () => ({ api: { get: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

it("loads demo resume bytes through the authenticated API and carries cancellation", async () => {
  const file = new Blob(["resume"], { type: "application/pdf" });
  const { signal } = new AbortController();
  api.get
    .mockResolvedValueOnce({ data: { demo: true } })
    .mockResolvedValueOnce({ data: file });
  expect(await getResumePreviewFile("demo", signal)).toBe(file);
  expect(api.get).toHaveBeenLastCalledWith("/api/resumes/demo/content", {
    responseType: "blob",
    signal,
  });
});

it("loads signed storage bytes without forwarding application credentials", async () => {
  const file = new Blob(["resume"], { type: "application/pdf" });
  const { signal } = new AbortController();
  api.get.mockResolvedValueOnce({
    data: { url: "https://storage.example.test/resume?token=signed" },
  });
  const request = vi
    .fn()
    .mockResolvedValue({ ok: true, blob: async () => file });
  vi.stubGlobal("fetch", request);
  expect(await getResumePreviewFile("private", signal)).toBe(file);
  expect(request).toHaveBeenCalledWith(
    "https://storage.example.test/resume?token=signed",
    { signal, credentials: "omit" },
  );
});

it("reports expired or inaccessible storage links instead of rendering an error response", async () => {
  api.get.mockResolvedValueOnce({
    data: { url: "https://storage.example.test/expired" },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  await expect(getResumePreviewFile("expired")).rejects.toThrow(
    "The resume could not be loaded",
  );
});
