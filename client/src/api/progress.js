export function progressLabel(status) {
  return (
    {
      queued: "Waiting to start",
      pending: "Waiting to start",
      dispatching: "Starting",
      dispatched: "Request sent",
      running: "Processing",
      succeeded: "Ready to review",
      failed: "Needs attention",
      cancelled: "Stopped",
      unknown: "Checking progress",
    }[status] ?? "Not processed yet"
  );
}
export function progressMessage(state, subject = "skills") {
  const label =
    subject === "resume"
      ? "your resume"
      : subject === "questions"
        ? "practice questions"
        : "the job requirements";
  if (state?.status === "succeeded")
    return subject === "questions"
      ? "Your practice questions are ready below."
      : "Processing is complete. Review the suggestions below.";
  if (state?.status === "failed" || state?.message === "callback_timeout")
    return "Automatic processing couldn’t finish. Try again, or continue adding your details manually.";
  if (state?.status === "cancelled")
    return "Processing was stopped. You can start it again when you’re ready.";
  if (
    ["queued", "pending", "dispatching", "dispatched", "running"].includes(
      state?.status,
    )
  )
    return (
      "We’re working on " +
      label +
      ". You can leave this page and come back later."
    );
  return "We can’t check progress right now. Try opening this page again in a moment.";
}
