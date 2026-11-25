import { rm } from 'node:fs/promises';

const databaseName = 'swan-worker-db-apac';
const local = process.argv.includes('--local');

async function clearRemoteDatabase(): Promise<void> {
  const process = Bun.spawn(
    ['bunx', 'wrangler', 'd1', 'execute', databaseName, '--remote', '--command', CLEAR_SQL],
    { stdout: 'pipe', stderr: 'inherit' },
  );
  const [code, output] = await Promise.all([process.exited, new Response(process.stdout).text()]);
  if (code !== 0) throw new Error(`wrangler exited with code ${code}`);
  if (!output.includes('success: true')) throw new Error(`D1 cleanup failed:\n${output}`);
}

const CLEAR_SQL = [
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
].join('; ');

if (local) {
  await rm('.wrangler/state/v3/d1', { recursive: true, force: true });
  console.log('[db] cleared local D1 state');
} else {
  await clearRemoteDatabase();
  console.log('[db] cleared remote D1');
}
