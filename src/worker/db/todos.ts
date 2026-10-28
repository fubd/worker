import type { Todo, TodoRow } from '../types';

const SELECT_COLUMNS = 'id, title, completed, created_at, updated_at';

/**
 * SQLite 的 datetime('now') 返回 UTC 但不带时区标记（"2026-10-28 13:32:49"），
 * 直接丢给前端会被当成本地时间解析。统一转成 ISO 8601。
 */
function toIso(value: string): string {
  if (value.includes('T')) return value;
  return `${value.replace(' ', 'T')}Z`;
}

export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export interface ListOptions {
  status?: 'all' | 'active' | 'completed';
  keyword?: string;
  limit?: number;
  offset?: number;
}

export async function listTodos(db: D1Database, options: ListOptions = {}) {
  const { status = 'all', keyword = '', limit = 100, offset = 0 } = options;

  const where: string[] = [];
  const params: unknown[] = [];

  if (status === 'active') {
    where.push('completed = 0');
  } else if (status === 'completed') {
    where.push('completed = 1');
  }

  if (keyword.trim()) {
    where.push('title LIKE ?');
    params.push(`%${keyword.trim()}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const listStmt = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM todos ${whereSql}
       ORDER BY completed ASC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset);

  const countStmt = db
    .prepare(`SELECT COUNT(*) AS total FROM todos ${whereSql}`)
    .bind(...params);

  const [listResult, countResult] = await Promise.all([
    listStmt.all<TodoRow>(),
    countStmt.first<{ total: number }>(),
  ]);

  return {
    items: (listResult.results ?? []).map(toTodo),
    total: countResult?.total ?? 0,
  };
}

export async function getTodo(db: D1Database, id: number): Promise<Todo | null> {
  const row = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM todos WHERE id = ?`)
    .bind(id)
    .first<TodoRow>();

  return row ? toTodo(row) : null;
}

export async function createTodo(db: D1Database, title: string): Promise<Todo> {
  const row = await db
    .prepare(`INSERT INTO todos (title, completed) VALUES (?, 0) RETURNING ${SELECT_COLUMNS}`)
    .bind(title)
    .first<TodoRow>();

  if (!row) {
    throw new Error('Failed to create todo');
  }

  return toTodo(row);
}

export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
}

export async function updateTodo(
  db: D1Database,
  id: number,
  input: UpdateTodoInput,
): Promise<Todo | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (typeof input.title === 'string') {
    sets.push('title = ?');
    params.push(input.title);
  }

  if (typeof input.completed === 'boolean') {
    sets.push('completed = ?');
    params.push(input.completed ? 1 : 0);
  }

  if (sets.length === 0) {
    return getTodo(db, id);
  }

  // 用毫秒精度，避免同一秒内连续更新时 updated_at 看起来没变
  sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);

  const row = await db
    .prepare(`UPDATE todos SET ${sets.join(', ')} WHERE id = ? RETURNING ${SELECT_COLUMNS}`)
    .bind(...params, id)
    .first<TodoRow>();

  return row ? toTodo(row) : null;
}

export async function deleteTodo(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function clearCompleted(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM todos WHERE completed = 1').run();
  return result.meta.changes ?? 0;
}

export async function getStats(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed
       FROM todos`,
    )
    .first<{ total: number; completed: number | null }>();

  const total = row?.total ?? 0;
  const completed = row?.completed ?? 0;

  return {
    total,
    completed,
    active: total - completed,
    completionRate: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
