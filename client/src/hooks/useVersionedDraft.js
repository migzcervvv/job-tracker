import { useState } from "react";
// Clean forms follow server revisions; dirty forms retain the revision they edited.
// A stale dirty save is rejected by the API instead of silently rebasing old values.
export function useVersionedDraft(initialValues, serverVersion) {
  const [draft, setDraft] = useState(() => ({
    values: initialValues,
    version: serverVersion,
    observedVersion: serverVersion,
    dirty: false,
  }));
  if (draft.observedVersion !== serverVersion)
    setDraft(
      draft.dirty
        ? { ...draft, observedVersion: serverVersion }
        : {
            values: initialValues,
            version: serverVersion,
            observedVersion: serverVersion,
            dirty: false,
          },
    );
  function change(update) {
    setDraft((previous) => ({
      ...previous,
      dirty: true,
      values: typeof update === "function" ? update(previous.values) : update,
    }));
  }
  function reset(values, version) {
    setDraft({ values, version, observedVersion: serverVersion, dirty: false });
  }
  return {
    values: draft.values,
    version: draft.version,
    dirty: draft.dirty,
    change,
    reset,
  };
}
