import { rm } from 'node:fs/promises';

const databaseName = 'swan-worker-db-apac';
const local = process.argv.includes('--local');

async function runWrangler(...args: string[]): Promise<{ changes?: number }> {
  const process = Bun.spawn(
    ['bunx', 'wrangler', 'd1', 'execute', databaseName, ...args, '--json'],
    { stdout: 'pipe', stderr: 'inherit' },
  );
  const [code, output] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  if (code !== 0) throw new Error(`wrangler exited with code ${code}`);
  return (JSON.parse(output) as [{ meta?: { changes?: number } }])[0] ?? {};
}

if (local) {
  await rm('.wrangler/state/v3/d1', { recursive: true, force: true });
  console.log('[db] cleared local D1 state');
} else {
  const result = await runWrangler(
    '--remote',
    '--command',
    [
      'PRAGMA defer_foreign_keys = ON',
      'DELETE FROM todos',
      'DELETE FROM document_versions',
      'DELETE FROM document_attachments',
      'DELETE FROM documents',
      'DELETE FROM folders',
      'DELETE FROM sessions',
      'DELETE FROM password_credentials',
      'DELETE FROM user_identities',
      'DELETE FROM users',
      'DELETE FROM auth_rate_limits',
    ].join('; '),
  );
  console.log(`[db] cleared remote D1 (${result.changes ?? 0} rows changed)`);
}
