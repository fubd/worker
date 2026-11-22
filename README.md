# 雨燕

**让文字飞起来。**

雨燕是一个轻量的个人知识库。当前 M1 的目标是先把“私人、安全、可恢复”做完整：

- Google、GitHub OAuth 登录
- 单账号邮箱白名单
- 文档按 owner 隔离
- 自动保存版本冲突检测
- 软删除、回收站与恢复
- 未登录、会话过期和保存失败的明确状态

`deephos.com/docs` 是唯一产品入口；旧 `/`、`/todos`、`/about` 会跳转到 `/docs`。

## 技术栈

| 层次   | 技术                                         |
| ------ | -------------------------------------------- |
| 前端   | React 19、React Router、Ant Design 6、TipTap |
| 构建   | Bun、Rsbuild                                 |
| API    | Cloudflare Workers、Hono                     |
| 数据库 | Cloudflare D1                                |
| 站点   | Vercel                                       |
| 部署   | GitHub Actions、Wrangler                     |

## 本地开发

```bash
bun install
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev
```

打开：

```text
http://localhost:3000/docs
```

`.dev.vars` 需要：

```dotenv
PUBLIC_ORIGIN=http://localhost:3000
GOOGLE_ID=...
GOOGLE_SECRET=...
GITHUB_ID=...
GITHUB_SECRET=...
OWNER_EMAIL=...
```

不要把这些值写入仓库。生产环境通过 Cloudflare Secret 配置：

```bash
bunx wrangler secret put GOOGLE_ID
bunx wrangler secret put GOOGLE_SECRET
bunx wrangler secret put GITHUB_ID
bunx wrangler secret put GITHUB_SECRET
bunx wrangler secret put OWNER_EMAIL
```

OAuth 授权回调地址：

```text
http://localhost:3000/api/auth/google
https://deephos.com/api/auth/google
http://localhost:3000/api/auth/github
https://deephos.com/api/auth/github
```

## 常用命令

```bash
bun run dev                  # Rsbuild 3000 + wrangler 8787
bun run build                # 构建 Vercel 产物
bun run fmt                  # 格式化
bun run fmt:check            # 格式检查
bun run check                # 类型检查
bun run perf:budget          # JS 体积预算
bun run perf:lighthouse      # Lighthouse
bun run perf:api             # 线上 API 探针
bun run db:migrate:local     # 本地迁移
bun run db:migrate:remote    # 线上迁移
bun run deploy               # 构建并部署 Worker
```

## 架构

```text
Browser
  ├─ /docs              → Vercel 静态产品壳
  └─ /api/*             → Vercel rewrite → api.deephos.com
                              └─ Cloudflare Worker → D1
```

关键文件：

```text
src/client/auth/AuthProvider.tsx    前端登录状态
src/client/pages/DocsPage.tsx       文档列表、编辑器、冲突和回收站
src/worker/auth/session.ts          服务端会话 Cookie
src/worker/routes/auth.ts           Google、GitHub OAuth
src/worker/routes/documents.ts      文档 API 与 owner 校验
src/worker/db/auth.ts               用户与会话数据访问
src/worker/db/documents.ts          文档数据访问
migrations/0004_auth_and_document_safety.sql
migrations/0005_multi_provider_auth.sql
```

## 数据安全

- 浏览器只持有随机会话令牌；D1 只保存令牌的 SHA-256 摘要。
- Cookie 使用 `HttpOnly`、`SameSite=Lax`，线上启用 `Secure`。
- Google OAuth 使用 state、PKCE、ID Token 和 UserInfo subject 校验。
- GitHub OAuth 使用 state、PKCE、GitHub 用户 ID 和已验证邮箱校验。
- 文档的读取、更新、删除和恢复都同时匹配 `id`、`owner_id` 和软删除状态。
- 自动保存使用 `version` 条件更新，版本不一致返回 `409`。
- 其他用户的文档统一返回 `404`。
- 迁移前已有文档的 `owner_id` 为空，由白名单账号首次登录时接管。

## 构建与部署

`bun run build` 会：

1. 构建浏览器和 Node 静态渲染产物。
2. 用 React Router 生成 `/docs` 静态产品壳。
3. 组装 `dist/vercel/`，包含同源 API rewrite 和旧路径跳转。
4. 校验本地静态引用和禁止使用外部静态源。

GitHub Actions 在推送到 `main` 后执行格式、类型、构建和体积预算，然后按以下顺序发布：

1. 应用远端 D1 迁移。
2. 部署 Worker。
3. 部署 Vercel 页面。

这个顺序保证 M1 的鉴权规则先于新页面生效。

## 里程碑

当前只实施 M1。M1 完成真实账号验收后停止，不自动进入搜索、文件夹、分享、附件和实时协作。
