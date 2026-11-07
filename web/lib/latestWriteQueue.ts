export type LatestWriteState = "saving" | "saved" | "error";

/** Serialize writes, keeping only the newest queued value while a request is in flight. */
export function createLatestWriteQueue<T>(
  write: (value: T) => Promise<unknown>,
  onState: (state: LatestWriteState, error?: unknown) => void,
) {
  let latest: T | undefined;
  let running: Promise<void> | null = null;
  let failed = false;

  function enqueue(value: T) {
    latest = value;
    failed = false;
    onState("saving");
  }

  async function flushOne() {
    if (running) return running;
    if (failed || latest === undefined) return;
    const value = latest;
    latest = undefined;
    onState("saving");
    const operation = (async () => {
      try {
        await write(value);
        onState(latest === undefined ? "saved" : "saving");
      } catch (error) {
        if (latest === undefined) latest = value;
        failed = true;
        onState("error", error);
      }
    })();
    running = operation;
    try {
      await operation;
    } finally {
      running = null;
      if (!failed && latest !== undefined) void flushOne();
    }
  }

  async function flushAll(): Promise<boolean> {
    while (true) {
      if (failed) return false;
      if (running) { await running; continue; }
      if (latest !== undefined) { await flushOne(); continue; }
      return true;
    }
  }

  async function retry(): Promise<boolean> {
    failed = false;
    return flushAll();
  }

  function discard(): boolean {
    if (running) return false;
    latest = undefined;
    failed = false;
    onState("saved");
    return true;
  }

  return {
    enqueue,
    flush: flushOne,
    flushAll,
    retry,
    discard,
    hasPending: () => running !== null || latest !== undefined || failed,
  };
}
