import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "../src/api/errors.js";
import { progressLabel, progressMessage } from "../src/api/progress.js";
describe("messages people can act on", () => {
  it("explains connection and timeout problems without API setup instructions", () => {
    expect(extractErrorMessage({ message: "Network Error" })).toContain(
      "internet connection",
    );
    expect(extractErrorMessage({ code: "ECONNABORTED" })).toContain(
      "request took too long",
    );
  });
  it("reads useful validation messages from ASP.NET errors", () => {
    expect(
      extractErrorMessage({
        response: {
          status: 400,
          data: { errors: { Email: ["Enter a valid email address."] } },
        },
      }),
    ).toBe("Enter a valid email address.");
    expect(
      extractErrorMessage({
        response: {
          status: 400,
          data: { error: "Resume extraction is not configured." },
        },
      }),
    ).toContain("keep editing");
  });
  it("does not show server exceptions, HTML error pages, or raw run contracts", () => {
    expect(
      extractErrorMessage({
        response: {
          status: 500,
          data: { error: "NpgsqlException: database password secret" },
        },
      }),
    ).not.toMatch(/Npgsql|password|secret/);
    expect(
      extractErrorMessage({
        response: { status: 400, data: "<html>Bad Gateway</html>" },
      }),
    ).toBe("Check the information you entered and try again.");
    expect(
      extractErrorMessage({
        response: {
          status: 400,
          data: "Invalid runId or 1536-dimensional vector",
        },
      }),
    ).not.toMatch(/runId|1536/);
  });
  it("separates an incorrect password from an expired session", () => {
    expect(
      extractErrorMessage({
        response: { status: 401, data: "Invalid email or password" },
      }),
    ).toContain("email or password");
    expect(
      extractErrorMessage({ response: { status: 401, data: "Unauthorized" } }),
    ).toBe("Please sign in again to continue.");
  });
  it("gives a recovery action for conflicts, permissions and rate limits", () => {
    expect(extractErrorMessage({ response: { status: 409 } })).toContain(
      "Reload the latest",
    );
    expect(extractErrorMessage({ response: { status: 403 } })).toContain(
      "permission",
    );
    expect(extractErrorMessage({ response: { status: 429 } })).toContain(
      "Wait a moment",
    );
  });
  it("explains malformed import files and invalid local dates", () => {
    expect(extractErrorMessage(new SyntaxError("Unexpected token"))).toContain(
      "valid JSON",
    );
    expect(
      extractErrorMessage(new Error("CSV requires a title column")),
    ).toContain("column named title");
    expect(extractErrorMessage(new Error("Invalid date and time"))).toContain(
      "valid date and time",
    );
  });
  it("turns automation codes into progress and recovery language", () => {
    expect(progressLabel("queued")).toBe("Waiting to start");
    expect(progressLabel("succeeded")).toBe("Ready to review");
    expect(progressMessage({ status: "running" }, "questions")).toContain(
      "practice questions",
    );
    const message = progressMessage({
      status: "failed",
      message: "dispatch_exhausted",
    });
    expect(message).toContain("Try again");
    expect(message).not.toContain("dispatch_exhausted");
  });
});
