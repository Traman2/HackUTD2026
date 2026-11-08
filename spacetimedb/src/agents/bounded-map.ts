// Limit provider traffic and wait for in-flight work before failing a job. This
// prevents old workers writing after the server has marked their job failed.
export async function boundedMap<T, R>(items: T[], concurrency: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await work(items[index]!, index); }
      catch (error) { failed = true; throw error; }
    }
  }));
  for (const outcome of outcomes) if (outcome.status === "rejected") throw outcome.reason;
  return results;
}
