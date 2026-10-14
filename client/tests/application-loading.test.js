import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../src/api/client.js";
import { listApplications, getApplication } from "../src/api/applications.js";
import { resolveApiBaseUrl, resolveApiTimeout } from "../src/api/config.js";
import { extractErrorMessage } from "../src/api/errors.js";

vi.mock("../src/api/client.js", () => ({ api: { get: vi.fn() } }));
beforeEach(() => {
  api.get.mockReset();
});

it.each([
  null,
  {},
  { id: "one", title: "Engineer", timeline: null, stageDetails: [] },
])("rejects incomplete detail data before rendering", async (data) => {
  api.get.mockResolvedValue({ data });
  await expect(getApplication("one")).rejects.toMatchObject({
    code: "INVALID_APPLICATION_DETAIL",
  });
});

it("allows breakpoint debugging without weakening production timeouts", () => {
  expect(resolveApiTimeout(undefined, true)).toBe(120000);
  expect(resolveApiTimeout("300000", true)).toBe(300000);
  for (const value of [
    undefined,
    "",
    "invalid",
    "0",
    "-1",
    "Infinity",
    "600001",
  ]) {
    expect(resolveApiTimeout(value, true)).toBe(120000);
  }
  expect(resolveApiTimeout("600000", false)).toBe(15000);
});

it("uses Netlify's same-origin proxy even with a stale production build variable", () => {
  expect(resolveApiBaseUrl(undefined, true, "job-trackerch.netlify.app")).toBe(
    "",
  );
  expect(
    resolveApiBaseUrl(
      "https://localhost:7179/api",
      true,
      "job-trackerch.netlify.app",
    ),
  ).toBe("");
  expect(resolveApiBaseUrl(" ", true, "job-trackerch.netlify.app")).toBe("");
  expect(resolveApiBaseUrl(undefined, false)).toBe("https://localhost:7179");
});

it("uses the local backend when previewing a production build on localhost", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "app.localhost"]) {
    expect(resolveApiBaseUrl("https://localhost:7179", true, host)).toBe(
      "https://localhost:7179",
    );
    expect(resolveApiBaseUrl(undefined, true, host)).toBe(
      "https://localhost:7179",
    );
  }
  expect(
    resolveApiBaseUrl("https://localhost:44393/api/", true, "localhost"),
  ).toBe("https://localhost:44393");
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
