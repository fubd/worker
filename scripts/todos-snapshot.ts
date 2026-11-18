import { readFileSync, writeFileSync } from 'node:fs';
import type { TodoListSnapshot } from '../src/shared/types';
import { upstreamApiUrl } from '../src/shared/api-config';

const SNAPSHOT_FILE = 'todos-snapshot.json';

export function readTodosSnapshot(distDir: string): TodoListSnapshot | null {
  try {
    const parsed = JSON.parse(readFileSync(`${distDir}/${SNAPSHOT_FILE}`, 'utf8')) as unknown;
    if (parsed === null) return null;
    if (
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as { items?: unknown }).items) ||
      typeof (parsed as { capturedAt?: unknown }).capturedAt !== 'string'
    ) {
      throw new Error('invalid todos snapshot shape');
    }
    return parsed as TodoListSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function captureTodosSnapshot(): Promise<TodoListSnapshot | null> {
  try {
    const response = await fetch(upstreamApiUrl('/todos'), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) {
      throw new Error('missing items array');
    }
    return {
      items: data.items as TodoListSnapshot['items'],
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('[todos-snapshot] skipped:', error);
    return null;
  }
}

if (import.meta.main) {
  const snapshot = await captureTodosSnapshot();
  writeFileSync(`dist/${SNAPSHOT_FILE}`, `${JSON.stringify(snapshot)}\n`);
  console.log(
    snapshot
      ? `[todos-snapshot] wrote ${snapshot.items.length} items`
      : '[todos-snapshot] API unavailable; wrote empty fallback',
  );
}
