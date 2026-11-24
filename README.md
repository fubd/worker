# 雨燕

**让文字飞起来。**

雨燕是一个轻量的知识库。M1 先把“私人、安全、可恢复”做完整，M2 继续解决“可整理、可找到”：

- Google、GitHub、账号密码三种登录方式
- 账号名和密码可以直接注册，不要求先提供邮箱
- 邮箱可以稍后通过 Google/GitHub 的可信邮箱绑定
- Google、GitHub 也可以直接注册或登录独立账号
- 文档按 owner 隔离
- 单层文件夹、未归档和文档移动
- 标题与正文全文检索，支持 `⌘K` / `Ctrl+K`
- 自动保存版本冲突检测
- 软删除、回收站与恢复
- 未登录、会话过期和保存失败的明确状态

`deephos.com` 是公开首页，`/login` 是独立登录页，`/docs` 是登录后的私人文档工作区。未登录访问 `/docs` 会跳转到 `/login`；旧 `/todos` 会跳转到 `/docs`，`/about` 会跳转到首页。

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
http://localhost:3000/
http://localhost:3000/login
http://localhost:3000/docs
```

`.dev.vars` 需要：

```dotenv
PUBLIC_ORIGIN=http://localhost:3000
GOOGLE_ID=...
GOOGLE_SECRET=...
GITHUB_ID=...
GITHUB_SECRET=...
OWNER_EMAIL=... # 可选，仅用于接管历史无主文档
```

不要把这些值写入仓库。生产环境通过 Cloudflare Secret 配置：

```bash
bunx wrangler secret put GOOGLE_ID
bunx wrangler secret put GOOGLE_SECRET
bunx wrangler secret put GITHUB_ID
bunx wrangler secret put GITHUB_SECRET
bunx wrangler secret put OWNER_EMAIL # 可选
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
  ├─ /                   → Vercel 公开首页
  ├─ /login              → Vercel 登录页
  ├─ /docs               → Vercel 私有工作区壳（登录后）
  └─ /api/*             → Vercel rewrite → api.deephos.com
                              └─ Cloudflare Worker → D1
```

关键文件：

```text
src/client/auth/AuthProvider.tsx    前端登录状态
src/client/pages/HomePage.tsx       公开首页
src/client/pages/LoginPage.tsx      独立登录页
src/client/pages/DocsPage.tsx       文档列表、编辑器、冲突和回收站
src/worker/auth/session.ts          服务端会话 Cookie
src/worker/routes/auth.ts           三种登录方式与 OAuth
src/worker/routes/documents.ts      文档 API 与 owner 校验
src/worker/auth/password.ts         PBKDF2 密码哈希与限流键
src/worker/db/auth.ts               用户与会话数据访问
src/worker/db/documents.ts          文档数据访问
src/worker/db/folders.ts            文件夹与文档计数
src/worker/routes/folders.ts        文件夹 API
migrations/0004_auth_and_document_safety.sql
migrations/0005_multi_provider_auth.sql
migrations/0006_password_auth.sql
migrations/0007_username_accounts.sql
migrations/0008_folders.sql
migrations/0009_document_favorites.sql
```

## 数据安全

- 浏览器只持有随机会话令牌；D1 只保存令牌的 SHA-256 摘要。
- Cookie 使用 `HttpOnly`、`SameSite=Lax`，线上启用 `Secure`。
- Google OAuth 使用 state、PKCE、ID Token 和 UserInfo subject 校验。
- GitHub OAuth 使用 state、PKCE、GitHub 用户 ID 和已验证邮箱校验。
- 账号名由用户注册时设置，密码凭证直接绑定到该用户 ID。
- 用户可以在登录后的账号菜单分别绑定尚未关联的 Google 或 GitHub，并同步其已验证邮箱。
- 显示名称优先使用 Google 或 GitHub 返回的姓名；没有姓名时使用账号名、GitHub 用户名或邮箱。
- 密码使用 PBKDF2-HMAC-SHA256、10 万次迭代和每个密码独立的 16 字节随机盐；这是当前 Cloudflare Workers WebCrypto 支持的上限。
- 密码凭证按 `user_id` 绑定到现有账号，三种登录方式签发相同结构的服务端会话。
- 修改已有密码时必须验证当前密码，成功后撤销该账号的其他会话。
- 密码登录失败按客户端 IP 和账号双重限流，错误响应不会暴露账号是否存在。
- 文档的读取、更新、删除和恢复都同时匹配公开 ID、`owner_id` 和软删除状态；公开 ID 使用 `d_...` / `f_...`，内部整数主键不对外暴露。
- 文件夹的创建、改名、删除和文档移动都按 `owner_id` 隔离。
- 删除文件夹只把文档移回“未归档”，不会删除文档。
- 自动保存使用 `version` 条件更新，版本不一致返回 `409`。
- 其他用户的文档统一返回 `404`。
- 迁移前已有文档的 `owner_id` 为空，由 `OWNER_EMAIL` 对应的历史所有者首次登录时接管。

## 免费多用户策略

- 公开注册使用账号名和密码，不产生邮件或短信发送费用。
- 账号名和密码是公开注册的默认入口，不需要发送验证邮件。
- 邮箱是后续恢复和跨设备登录的可信身份，OAuth 提供的邮箱必须经过服务商验证。
- 同一邮箱通过不同登录方式进入同一个账号，文档始终按用户 ID 隔离。
- 邮箱验证码属于可选能力，只能在第三方邮件服务的免费额度内启用；额度耗尽时关闭验证码入口，不允许自动升级或产生账单。
- 后续如需启用验证码，使用 Resend 免费额度并配置邮箱、IP、每日发送上限和 Cloudflare Turnstile。

## 构建与部署

`bun run build` 会：

1. 构建浏览器和 Node 静态渲染产物。
2. 用 React Router 生成 `/`、`/login`、`/docs` 静态入口壳。
3. 组装 `dist/vercel/`，包含同源 API rewrite 和旧路径跳转。
4. 校验本地静态引用和禁止使用外部静态源。

GitHub Actions 在推送到 `main` 后执行格式、类型、构建和体积预算，然后按以下顺序发布：

1. 应用远端 D1 迁移。
2. 部署 Worker。
3. 部署 Vercel 页面。

这个顺序保证数据库规则先于新页面和 API 生效。

## 里程碑

M1 已完成，验收结果如下：

- 生产账号分别通过 Google 和 GitHub 登录，均进入同一个 `users.id`；`/api/auth/me` 返回两种已绑定身份，并打开同一篇文档。
- 本地 Worker 与 D1 验证账号名和邮箱两种密码登录入口签发同一用户会话，并与已绑定的 Google、GitHub 身份共存。
- 本地真实 API 验证两个独立账号的文档列表、读取、保存、删除和恢复均按 owner 隔离。
- 浏览器双标签页保存返回 `409`，界面显示冲突并支持重新加载。
- 浏览器清除会话后访问 `/docs` 会跳转到 `/login`。

M1 到此停止，不自动进入搜索、文件夹、分享、附件和实时协作。

M2 是“可整理、可找到”，当前范围如下：

- 单层文件夹、未归档和文件夹文档计数。
- 创建、改名、删除文件夹；删除后文档自动回到未归档。
- 新建文档继承当前文件夹，已有文档可从编辑器移动到其他文件夹。
- 搜索同时匹配标题和正文，结果沿用当前文件夹范围。
- 搜索、文件夹和文档 API 全部按 `owner_id` 隔离。

分享、附件、导入导出、嵌套文件夹和实时协作留到后续里程碑。
