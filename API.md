# 雨燕 API

M1 的 API 由 Cloudflare Worker + Hono 提供，数据存放在 D1。除健康检查和登录流程外，所有接口都要求有效的 `yuyan_session` Cookie。

## 环境

| 环境         | Base URL                |
| ------------ | ----------------------- |
| 本地 Worker  | `http://127.0.0.1:8787` |
| 本地前端代理 | `http://localhost:3000` |
| 线上         | `https://deephos.com`   |

浏览器请求统一使用同源 `/api/*`；Vercel 将其代理到 `api.deephos.com`。

站点入口分为公开首页 `/`、登录页 `/login` 和私有工作区 `/docs`。OAuth 成功后返回 `/docs`；取消、白名单拒绝或服务不可用时返回 `/login?auth=...` 显示对应提示。

## 鉴权

| 方法 | 路径                       | 说明                                  |
| ---- | -------------------------- | ------------------------------------- |
| GET  | `/api/auth/google`         | 发起 Google OAuth，也接收 Google 回调 |
| GET  | `/api/auth/github`         | 发起 GitHub OAuth，也接收 GitHub 回调 |
| POST | `/api/auth/password/login` | 使用邮箱和密码登录                    |
| PUT  | `/api/auth/password`       | 已登录所有者设置或修改密码            |
| GET  | `/api/auth/me`             | 返回当前用户；未登录返回 `401`        |
| POST | `/api/auth/logout`         | 删除当前服务端会话并清除 Cookie       |

服务端只保存会话令牌的 SHA-256 摘要。Cookie 设置为 `HttpOnly`、`SameSite=Lax`，线上使用 `Secure`。
Google 登录流程使用 state、PKCE S256、ID Token 和 UserInfo subject 校验；GitHub 使用已验证邮箱和 GitHub 用户 ID。

M1 只允许 `OWNER_EMAIL` 指定的所有者邮箱。账号密码不会创建独立用户：必须先通过 Google 或 GitHub 登录，再调用 `PUT /api/auth/password` 设置密码。密码使用 PBKDF2-HMAC-SHA256、60 万次迭代和随机盐；连续失败会按 IP 和账号限流。三种登录方式最终都绑定到同一个 `users.id`。

该账号第一次通过 Google 或 GitHub 登录时，会接管迁移前 `owner_id IS NULL` 的现有文档。

## 文档

| 方法   | 路径                         | 说明                               |
| ------ | ---------------------------- | ---------------------------------- |
| GET    | `/api/documents`             | 当前用户的全部文档                 |
| GET    | `/api/documents/trash`       | 当前用户的回收站                   |
| GET    | `/api/documents/:id`         | 获取单篇文档                       |
| POST   | `/api/documents`             | 新建文档                           |
| PATCH  | `/api/documents/:id`         | 保存标题和正文，必须携带 `version` |
| DELETE | `/api/documents/:id`         | 移入回收站                         |
| POST   | `/api/documents/:id/restore` | 从回收站恢复                       |

所有查询都按服务端会话中的 `owner_id` 过滤。其他用户的文档统一返回 `404`，不会暴露文档是否存在。

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
OWNER_EMAIL=...
```

Google OAuth 的授权回调地址是：

```text
http://localhost:3000/api/auth/google
https://deephos.com/api/auth/google
```
