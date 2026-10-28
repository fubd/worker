# API 文档

Swan Worker 的 HTTP 接口，全部挂在 `/api` 下，由 Worker 里的 Hono 应用处理。

## 环境

| 环境 | Base URL |
| --- | --- |
| 本地 Worker（wrangler dev） | `http://127.0.0.1:8787` |
| 本地前端代理（rsbuild dev） | `http://localhost:3000` |
| 线上 | `https://swan-worker.312bdf.workers.dev` |

## 约定

- 请求与响应均为 `application/json`
- 时间字段是 **ISO 8601 UTC**，例如 `2026-10-28T14:06:05Z`
- 成功返回 2xx，失败返回 4xx/5xx，错误体统一为 `{ "error": string }`
- 5xx 不返回内部细节，只给 `{ "error": "Internal Server Error", "traceId": "<cf-ray>" }`，排查时用 `traceId` 查 Worker 日志
- 无鉴权、无速率限制（模板定位，上线前需自行补）

## 数据结构

```ts
interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC，毫秒精度
}
```

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/stats` | 任务统计（总数 / 已完成 / 完成率） |
| GET | `/api/todos?status=all\|active\|completed&q=&limit=&offset=` | 列表 |
| POST | `/api/todos` | 新建，body `{ "title": "..." }` |
| PATCH | `/api/todos/:id` | 更新，body `{ "title"?, "completed"? }` |
| DELETE | `/api/todos/:id` | 删除单条 |
| DELETE | `/api/todos/completed` | 清空已完成 |

---

## GET /api/health

健康检查，同时暴露当前运行环境。

```bash
curl http://127.0.0.1:8787/api/health
```

```json
{
  "ok": true,
  "runtime": "cloudflare-workers",
  "environment": "local",
  "time": "2026-10-28T14:06:04.493Z"
}
```

`environment` 取值 `local` / `production`，依据请求头 `cf-ray` 是否存在判断（本地 wrangler dev 没有该头）。

## GET /api/stats

首页看板用的聚合数据。

```bash
curl http://127.0.0.1:8787/api/stats
```

```json
{
  "total": 5,
  "completed": 2,
  "active": 3,
  "completionRate": 40,
  "database": "Cloudflare D1",
  "region": "a51a7fc0be772ae3",
  "runtime": "Cloudflare Workers"
}
```

`region` 取自 `cf-ray`，本地开发时是 `local`。

## GET /api/todos

列表查询，按「未完成在前、id 倒序」排序。

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `status` | `all` \| `active` \| `completed` | `all` | 过滤状态，非法值按 `all` 处理 |
| `q` | string | 空 | 标题模糊匹配（`LIKE %q%`） |
| `limit` | number | 100 | 每页条数，最大 500 |
| `offset` | number | 0 | 偏移量 |

```bash
curl "http://127.0.0.1:8787/api/todos?status=active&limit=10"
```

```json
{
  "items": [
    {
      "id": 5,
      "title": "wrangler deploy 上线",
      "completed": false,
      "createdAt": "2026-10-28T13:38:16Z",
      "updatedAt": "2026-10-28T13:38:16Z"
    }
  ],
  "total": 3
}
```

`total` 是**满足过滤条件的总数**，不受 `limit` 影响，可用于分页；`items` 是当前页数据。

## POST /api/todos

新建任务。

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `title` | string | 是 | 去除首尾空格后长度 1~200 |

```bash
curl -X POST http://127.0.0.1:8787/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"写点东西"}'
```

`201 Created`：

```json
{
  "id": 6,
  "title": "写点东西",
  "completed": false,
  "createdAt": "2026-10-28T14:06:05Z",
  "updatedAt": "2026-10-28T14:06:05Z"
}
```

`400 Bad Request`（title 为空或超长）：

```json
{ "error": "title 必填，且长度需在 1~200 之间" }
```

## PATCH /api/todos/:id

部分更新，`title` 与 `completed` 至少传一个。

```bash
curl -X PATCH http://127.0.0.1:8787/api/todos/6 \
  -H 'Content-Type: application/json' \
  -d '{"completed":true}'
```

返回更新后的完整 `Todo`。`updatedAt` 用毫秒精度，同一秒内多次更新也能看出变化。

错误：

| 状态码 | 场景 |
| --- | --- |
| `400` | `id` 非法 / 请求体不是合法 JSON / `title` 非法 / `completed` 不是布尔 |
| `404` | `{ "error": "Todo 不存在" }` |

## DELETE /api/todos/:id

删除单条。

```bash
curl -X DELETE http://127.0.0.1:8787/api/todos/6
```

```json
{ "ok": true, "id": 6 }
```

不存在时返回 `404 { "error": "Todo 不存在" }`。

## DELETE /api/todos/completed

一次性清空所有已完成任务。

```bash
curl -X DELETE http://127.0.0.1:8787/api/todos/completed
```

```json
{ "removed": 3 }
```

> 该接口会直接删数据且不可恢复，前端调用前有二次确认。

## 未匹配路径

- `/api` 或 `/api/*` 未命中任何路由 → `404 { "error": "Not Found", "path": "/api/xxx" }`
- 其他路径 → 交给静态资源，未命中时回退 `index.html`（SPA 路由）
