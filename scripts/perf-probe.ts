/**
 * Measure production API latency and split Worker time from D1 time.
 *
 * Usage:
 *   bun run perf:api
 *   bun run perf:api --runs 50
 *   API_BASE_URL=http://127.0.0.1:8787 bun run perf:api
 */
const DEFAULT_RUNS = 30;
const baseUrl = (process.env.API_BASE_URL ?? 'https://api.deephos.com').replace(/\/$/, '');
const runsFlag = process.argv.indexOf('--runs');
const requestedRuns = runsFlag >= 0 ? Number(process.argv[runsFlag + 1]) : DEFAULT_RUNS;
const runs = Number.isInteger(requestedRuns) && requestedRuns > 0 ? requestedRuns : DEFAULT_RUNS;
const paths = ['/api/health'];

interface Sample {
  totalMs: number;
  workerMs: number | null;
  dbMs: number | null;
  status: number;
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function readTiming(response: Response, metric: 'worker' | 'db'): number | null {
  const timing = response.headers.get('server-timing') ?? '';
  // Hono timing() names the overall metric "total" and exposes its human label
  // through desc="worker". Keep accepting "worker" for older deployments.
  const name = metric === 'worker' ? '(?:worker|total)' : 'db';
  const match = timing.match(new RegExp(`(?:^|,\\s*)${name};dur=([0-9.]+)`));
  return match ? Number(match[1]) : null;
}

function summarize(values: number[]): string {
  const sorted = [...values].sort((left, right) => left - right);
  return [
    `min=${sorted[0]?.toFixed(1)}`,
    `p50=${percentile(sorted, 0.5).toFixed(1)}`,
    `p75=${percentile(sorted, 0.75).toFixed(1)}`,
    `p90=${percentile(sorted, 0.9).toFixed(1)}`,
    `max=${sorted.at(-1)?.toFixed(1)}`,
  ].join(' ');
}

async function probe(path: string): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json' },
    });
    await response.arrayBuffer();
    samples.push({
      totalMs: performance.now() - startedAt,
      workerMs: readTiming(response, 'worker'),
      dbMs: readTiming(response, 'db'),
      status: response.status,
    });
  }
  return samples;
}

console.log(`[perf] ${baseUrl}, ${runs} requests per endpoint`);
for (const path of paths) {
  const samples = await probe(path);
  const failures = samples.filter((sample) => sample.status !== 200).length;
  const workerSamples = samples.flatMap((sample) =>
    sample.workerMs === null ? [] : [sample.workerMs],
  );
  const dbSamples = samples.flatMap((sample) => (sample.dbMs === null ? [] : [sample.dbMs]));
  console.log(
    JSON.stringify({
      path,
      statusFailures: failures,
      total: summarize(samples.map((sample) => sample.totalMs)),
      worker: workerSamples.length ? summarize(workerSamples) : 'n/a',
      db: dbSamples.length ? summarize(dbSamples) : 'n/a',
    }),
  );
}
