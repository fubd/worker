import { Hono } from 'hono';
import * as repo from '../db/todos';
import type { AppEnv } from '../types';

export const todoRoutes = new Hono<AppEnv>();

const MAX_TITLE_LENGTH = 200;

function normalizeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return null;
  return title;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/todos?status=all|active|completed&q=keyword&limit=&offset= */
todoRoutes.get('/', async (c) => {
  const statusParam = c.req.query('status');
  const status =
    statusParam === 'active' || statusParam === 'completed' ? statusParam : 'all';

  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100) || 100, 1), 500);
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);

  const result = await repo.listTodos(c.env.DB, {
    status,
    keyword: c.req.query('q') ?? '',
    limit,
    offset,
  });

  return c.json(result);
});

/** POST /api/todos  { title: string } */
todoRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const title = normalizeTitle((body as { title?: unknown } | null)?.title);

  if (!title) {
    return c.json({ error: 'title 必填，且长度需在 1~200 之间' }, 400);
  }

  const todo = await repo.createTodo(c.env.DB, title);
  return c.json(todo, 201);
});

/** DELETE /api/todos/completed —— 清空已完成 */
todoRoutes.delete('/completed', async (c) => {
  const removed = await repo.clearCompleted(c.env.DB);
  return c.json({ removed });
});

/** PATCH /api/todos/:id  { title?: string; completed?: boolean } */
todoRoutes.patch('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const body = (await c.req.json().catch(() => null)) as {
    title?: unknown;
    completed?: unknown;
  } | null;

  if (!body) return c.json({ error: '请求体必须是合法 JSON' }, 400);

  const input: repo.UpdateTodoInput = {};

  if (body.title !== undefined) {
    const title = normalizeTitle(body.title);
    if (!title) return c.json({ error: 'title 非法' }, 400);
    input.title = title;
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      return c.json({ error: 'completed 必须是布尔值' }, 400);
    }
    input.completed = body.completed;
  }

  const todo = await repo.updateTodo(c.env.DB, id, input);
  if (!todo) return c.json({ error: 'Todo 不存在' }, 404);

  return c.json(todo);
});

/** DELETE /api/todos/:id */
todoRoutes.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'id 非法' }, 400);

  const ok = await repo.deleteTodo(c.env.DB, id);
  if (!ok) return c.json({ error: 'Todo 不存在' }, 404);

  return c.json({ ok: true, id });
});
