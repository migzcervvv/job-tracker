export const TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled"]);
export function pollRun({
  fetchStatus,
  onStatus,
  onError,
  signal,
  intervalMs = 3000,
  timeoutMs = 610000,
  now = Date.now,
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  const started = now();
  let timer;
  let stopped = false;
  function stop() {
    stopped = true;
    unschedule(timer);
    signal?.removeEventListener("abort", stop);
  }
  signal?.addEventListener("abort", stop, { once: true });
  async function tick() {
    if (stopped || signal?.aborted) return;
    try {
      const state = await fetchStatus(signal);
      if (stopped || signal?.aborted) return;
      onStatus(state);
      if (TERMINAL_STATES.has(state.status)) {
        stop();
        return;
      }
    } catch (error) {
      if (stopped || signal?.aborted) return;
      if ([401, 403, 404].includes(error.response?.status)) {
        onError?.(error);
        stop();
        return;
      }
    }
    if (now() - started >= timeoutMs) {
      onError?.(
        new Error(
          "Polling deadline reached. Reopen the run to check its final state.",
        ),
      );
      stop();
      return;
    }
    timer = schedule(tick, intervalMs);
  }
  void tick();
  return stop;
}
