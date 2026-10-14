import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useVersionedDraft } from "../src/hooks/useVersionedDraft.js";

it("clean drafts accept new server data while dirty drafts keep their original concurrency version", () => {
  const { result, rerender } = renderHook(
    ({ values, version }) => useVersionedDraft(values, version),
    { initialProps: { values: { notes: "Initial" }, version: "v1" } },
  );
  rerender({ values: { notes: "Callback" }, version: "v2" });
  expect(result.current.values.notes).toBe("Callback");
  expect(result.current.version).toBe("v2");
  act(() => result.current.change({ notes: "Personal draft" }));
  rerender({ values: { notes: "Concurrent change" }, version: "v3" });
  expect(result.current.values.notes).toBe("Personal draft");
  expect(result.current.version).toBe("v2");
  act(() => result.current.reset({ notes: "Saved" }, "v4"));
  expect(result.current.dirty).toBe(false);
  expect(result.current.version).toBe("v4");
});
