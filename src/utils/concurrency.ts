export const runWithConcurrency = async <T,>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> => {
  const results: T[] = []
  let taskIndex = 0

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (taskIndex < tasks.length) {
      const currentIndex = taskIndex++
      results[currentIndex] = await tasks[currentIndex]()
    }
  })

  await Promise.all(workers)
  return results
}
