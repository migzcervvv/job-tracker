import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../src/api/client.js";
import { listApplications } from "../src/api/applications.js";
import { resolveApiBaseUrl } from "../src/api/config.js";
import { extractErrorMessage } from "../src/api/errors.js";

vi.mock("../src/api/client.js", () => ({ api: { get: vi.fn() } }));
beforeEach(() => {
  api.get.mockReset();
});

it("uses Netlify's same-origin proxy even with a stale production build variable", () => {
  expect(resolveApiBaseUrl(undefined, true)).toBe("");
  expect(resolveApiBaseUrl("https://localhost:7179/api", true)).toBe("");
  expect(resolveApiBaseUrl(" ", true)).toBe("");
  expect(resolveApiBaseUrl(undefined, false)).toBe("https://localhost:7179");
});

it("preserves custom hosts and prevents duplicate api path segments", () => {
  expect(resolveApiBaseUrl(" https://api.example.test/api/ ", false)).toBe(
    "https://api.example.test",
  );
  expect(resolveApiBaseUrl("http://localhost:5233/", false)).toBe(
    "http://localhost:5233",
  );
});

it("loads all pages including a final empty page for an exact page boundary", async () => {
  const page = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));
  api.get
    .mockResolvedValueOnce({ data: page })
    .mockResolvedValueOnce({ data: [] });
  expect(await listApplications()).toEqual(page);
  expect(api.get.mock.calls[1][1].params.page).toBe(2);
});

it("explains an HTML fallback response instead of failing with a spread error", async () => {
  api.get.mockResolvedValue({
    data: "<!doctype html><html>Netlify app</html>",
  });
  const error = await listApplications().catch((err) => err);
  expect(error.code).toBe("API_RETURNED_HTML");
  expect(extractErrorMessage(error)).toContain("frontend API address");
  expect(api.get).toHaveBeenCalledTimes(1);
});

it("rejects unexpected payloads without presenting them as an empty board", async () => {
  api.get.mockResolvedValue({ data: { error: "unavailable" } });
  await expect(listApplications()).rejects.toMatchObject({
    code: "INVALID_APPLICATION_LIST",
  });
});
