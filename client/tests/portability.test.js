import { expect, it } from "vitest";
import { parseCsv, toCsv } from "../src/api/portability.js";
import { dateOnlyLabel, toInstant, toLocalInput } from "../src/api/datetime.js";
it("CSV supports quotes, embedded newlines and Unicode", () => {
  const row = {
    title: 'Developer, "senior"',
    company: "北京",
    rawDescription: "Docker\nLinux",
    status: 0,
    appliedDate: "2026-01-01T00:00:00Z",
  };
  expect(parseCsv(toCsv([row]))[0]).toMatchObject(row);
});
it("CSV rejects malformed quoting and neutralizes spreadsheet formulas", () => {
  expect(() => parseCsv('title\n"unclosed')).toThrow();
  expect(toCsv([{ title: "=1+1" }])).toContain("'=1+1");
  expect(() => parseCsv("company\nExample")).toThrow("title");
});
it("datetime conversion preserves the instant through local editing", () => {
  const original = "2026-10-13T04:20:00.000Z";
  expect(toInstant(toLocalInput(original))).toBe(original);
  expect(dateOnlyLabel("2026-10-13", "en-CA")).toContain("2026");
});
