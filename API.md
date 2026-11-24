# 雨燕 API

雨燕 API 由 Cloudflare Worker + Hono 提供，数据存放在 D1。除健康检查和登录流程外，所有接口都要求有效的 `yuyan_session` Cookie。

## 环境

| 环境         | Base URL                |
| ------------ | ----------------------- |
| 本地 Worker  | `http://127.0.0.1:8787` |
| 本地前端代理 | `http://localhost:3000` |
| 线上         | `https://deephos.com`   |

浏览器请求统一使用同源 `/api/*`；Vercel 将其代理到 `api.deephos.com`。

站点入口分为公开首页 `/`、登录页 `/login` 和私有工作区 `/docs`。OAuth 成功后返回 `/docs`；取消授权或服务不可用时返回 `/login?auth=...` 显示对应提示。

## 鉴权

| 方法 | 路径                       | 说明                                  |
| ---- | -------------------------- | ------------------------------------- |
| GET  | `/api/auth/google`         | 发起 Google OAuth，也接收 Google 回调 |
| GET  | `/api/auth/github`         | 发起 GitHub OAuth，也接收 GitHub 回调 |
| POST | `/api/auth/register`       | 使用账号名和密码直接注册              |
| POST | `/api/auth/password/login` | 使用账号名或邮箱和密码登录            |
| PUT  | `/api/auth/password`       | 已登录用户设置或修改密码              |
| GET  | `/api/auth/me`             | 返回当前用户；未登录返回 `401`        |
| POST | `/api/auth/logout`         | 删除当前服务端会话并清除 Cookie       |

服务端只保存会话令牌的 SHA-256 摘要。Cookie 设置为 `HttpOnly`、`SameSite=Lax`，线上使用 `Secure`。
Google 登录流程使用 state、PKCE S256、ID Token 和 UserInfo subject 校验；GitHub 使用已验证邮箱和 GitHub 用户 ID。

M1 支持公开多用户注册。账号名和密码可以直接创建独立用户；Google、GitHub 也可以直接注册或登录。用户登录后可以把尚未关联的 Google、GitHub 绑定到现有账号。可信 OAuth 邮箱相同的账号会归并到同一个 `users.id`，密码凭证也按 `user_id` 绑定到该账号。

密码使用 PBKDF2-HMAC-SHA256、10 万次迭代和每个密码独立的 16 字节随机盐；这是当前 Cloudflare Workers WebCrypto 支持的上限。连续失败会按 IP 和账号限流。修改已有密码时必须验证当前密码，成功后撤销该账号的其他会话。

可选的 `OWNER_EMAIL` 只用于历史迁移：该邮箱第一次通过 Google 或 GitHub 登录时，会接管迁移前 `owner_id IS NULL` 的现有文档。

## 文档

| 方法   | 路径                         | 说明                                   |
| ------ | ---------------------------- | -------------------------------------- |
| GET    | `/api/documents`             | 当前用户的文档，可按文件夹和关键词筛选 |
| GET    | `/api/documents/trash`       | 当前用户的回收站                       |
| GET    | `/api/documents/:id`         | 获取单篇文档                           |
| POST   | `/api/documents`             | 新建文档                               |
| PATCH  | `/api/documents/:id`         | 保存标题和正文，必须携带 `version`     |
| DELETE | `/api/documents/:id`         | 移入回收站                             |
| POST   | `/api/documents/:id/restore` | 从回收站恢复                           |
| PATCH  | `/api/documents/:id/folder`  | 把文档移动到文件夹或未归档             |

所有查询都按服务端会话中的 `owner_id` 过滤。其他用户的文档统一返回 `404`，不会暴露文档是否存在。

文档对外 ID 使用 `d_` 前缀，文件夹对外 ID 使用 `f_` 前缀。数据库自增主键只在 Worker 内部使用，API 和页面链接不会暴露整数 ID。

`GET /api/documents` 支持：

| 参数     | 说明                                                      |
| -------- | --------------------------------------------------------- |
| `folder` | `f_...` 表示文件夹 ID，`unfiled` 表示未归档；省略表示全部 |
| `q`      | 同时搜索标题和正文，最多 100 个字符                       |
| `limit`  | 每页数量，默认 100，最大 200                              |
| `offset` | 偏移量，默认 0                                            |

### 文件夹

| 方法   | 路径               | 说明                             |
| ------ | ------------------ | -------------------------------- |
| GET    | `/api/folders`     | 当前用户的文件夹和未删除文档数量 |
| POST   | `/api/folders`     | 创建文件夹，名称 1~30 个字符     |
| PATCH  | `/api/folders/:id` | 重命名文件夹                     |
| DELETE | `/api/folders/:id` | 删除文件夹，文档自动移回未归档   |

文件夹名称在同一用户下不区分大小写且不可重复。删除文件夹不会删除文档。

### 保存冲突

```json
{
  "version": 4,
  "title": "标题",
  "content": { "type": "doc", "content": [] },
  "contentHtml": "<p>正文</p>",
  "contentText": "正文"
}
```

`version` 是乐观并发控制的版本号。若数据库中的版本已经变化，接口返回：

```json
{
  "error": "文档已在其他页面更新，请重新加载后再保存",
  "currentVersion": 5
}
```

HTTP 状态为 `409 Conflict`。

## 错误码

| 状态码 | 含义                             |
| ------ | -------------------------------- |
| `400`  | 参数或请求体非法                 |
| `401`  | 未登录或会话已过期               |
| `404`  | 文档不存在，或不属于当前用户     |
| `409`  | 文档版本冲突                     |
| `429`  | 密码登录尝试次数过多             |
| `500`  | 未处理异常，响应只包含 `traceId` |

## 本地开发

```bash
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev
```

`.dev.vars` 至少需要：

```dotenv
PUBLIC_ORIGIN=http://localhost:3000
GOOGLE_ID=...
GOOGLE_SECRET=...
GITHUB_ID=...
GITHUB_SECRET=...
OWNER_EMAIL=... # 可选，仅用于接管历史无主文档
```

Google OAuth 的授权回调地址是：

```text
http://localhost:3000/api/auth/google
https://deephos.com/api/auth/google
```
