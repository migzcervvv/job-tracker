import { expect, it } from "vitest";
import { api } from "../src/api/client.js";

it("rejects an HTML frontend fallback on account and creation requests too", async () => {
  const adapter = async (config) => ({
    data: "<!doctype html><html>Frontend fallback</html>",
    status: 200,
    statusText: "OK",
    headers: { "content-type": "text/html" },
    config,
  });
  await expect(api.get("/api/me", { adapter })).rejects.toMatchObject({
    code: "API_RETURNED_HTML",
  });
  await expect(
    api.post("/api/applications", { title: "Engineer" }, { adapter }),
  ).rejects.toMatchObject({ code: "API_RETURNED_HTML" });
});
