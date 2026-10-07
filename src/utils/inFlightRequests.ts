// Share concurrent reads, but never retain completed responses or failures.
export function createInFlightRequestPool() {
  const pending = new Map<string, Promise<unknown>>()

  return function run<T>(key: string, request: () => Promise<T>): Promise<T> {
    const existing = pending.get(key)
    if (existing) return existing as Promise<T>

    const result = Promise.resolve().then(request).finally(() => pending.delete(key))
    pending.set(key, result)
    return result
  }
}
