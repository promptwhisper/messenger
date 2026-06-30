/**
 * Tiny Suspense cache. `suspend(key, fn)` throws the in-flight promise until it
 * resolves, so R3F components can read decoded geometry/textures synchronously
 * inside a <Suspense> boundary.
 */
type Entry<T> =
  | { status: "pending"; promise: Promise<void> }
  | { status: "ok"; value: T }
  | { status: "error"; error: unknown };

const store = new Map<string, Entry<unknown>>();

export function suspend<T>(key: string, fn: () => Promise<T>): T {
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing) {
    if (existing.status === "ok") return existing.value;
    if (existing.status === "error") throw existing.error;
    throw existing.promise;
  }
  const promise = fn().then(
    (value) => {
      store.set(key, { status: "ok", value });
    },
    (error) => {
      store.set(key, { status: "error", error });
    }
  );
  store.set(key, { status: "pending", promise });
  throw promise;
}

/** Number of resources that have finished resolving (for progress UIs). */
export function resourceProgress(): { loaded: number; total: number } {
  let loaded = 0;
  for (const entry of store.values()) if (entry.status === "ok") loaded += 1;
  return { loaded, total: store.size };
}
