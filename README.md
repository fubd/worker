# 雨燕

**让文字飞起来。**

雨燕是一个轻量的知识库。M1 先把“私人、安全、可恢复”做完整，M2 继续解决“可整理、可找到”，M5 进入稳定性与公开 Beta 准备：

- Google、GitHub、账号密码三种登录方式
- 账号名和密码可以直接注册，不要求先提供邮箱
- 邮箱可以稍后通过 Google/GitHub 的可信邮箱绑定
- Google、GitHub 也可以直接注册或登录独立账号
- 文档按 owner 隔离
- 多层分组、嵌套文档和文档移动
- 标题与正文全文检索，支持 `⌘K` / `Ctrl+K`
- 自动保存版本冲突检测
- 软删除、回收站、恢复和不可逆永久删除
- 文档游标分页、账号配额和普通 API 限流
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
bun run test                 # 单元测试
bun run test:e2e             # Playwright 关键流程测试
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
src/client/pages/DocsPage.tsx       工作区交互与数据变更
src/client/docs-loader.ts           React Router Data Mode loader
src/client/components/docs/         编辑器展示组件
src/worker/auth/session.ts          服务端会话 Cookie
src/worker/routes/auth.ts           三种登录方式与 OAuth
src/worker/routes/documents.ts      文档 API 与 owner 校验
src/worker/quota.ts                 文档与附件配额
src/worker/rate-limit.ts            普通 API 和上传限流
src/worker/auth/password.ts         PBKDF2 密码哈希与限流键
src/worker/db/auth.ts               用户与会话数据访问
src/worker/db/documents.ts          文档数据访问
src/worker/db/folders.ts            分组与文档计数
src/worker/routes/folders.ts        分组 API
migrations/0004_auth_and_document_safety.sql
migrations/0005_multi_provider_auth.sql
migrations/0006_password_auth.sql
migrations/0007_username_accounts.sql
migrations/0008_folders.sql
migrations/0009_document_favorites.sql
migrations/0010_public_resource_ids.sql
migrations/0011_opaque_public_ids.sql
migrations/0017_m5_public_beta.sql
tests/unit/                         Bun 单元测试
tests/e2e/                          Playwright 关键流程测试
docs/API.md                         API、分页、配额与恢复限制
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
- 普通读、普通写、文档创建、附件上传和公开分享都有独立限流。
- 文档的读取、更新、删除和恢复都同时匹配公开 ID、`owner_id` 和软删除状态；文档与分组共用 24 位不透明公开 ID，内部整数主键不对外暴露。
- 文档列表使用稳定游标分页，默认每页 50 条，最大 100 条。
- 分组的创建、改名、删除和文档移动都按 `owner_id` 隔离。
- 删除分组只把文档移回“未归档”，不会删除文档。
- 自动保存使用 `version` 条件更新，版本不一致返回 `409`。
- 其他用户的文档统一返回 `404`。
- 永久删除只接受回收站文档，并清理历史版本、附件元数据和 R2 对象。
- 迁移前已有文档的 `owner_id` 为空，由 `OWNER_EMAIL` 对应的历史所有者首次登录时接管。

## 免费多用户策略

- 公开注册使用账号名和密码，不产生邮件或短信发送费用。
- 账号名和密码是公开注册的默认入口，不需要发送验证邮件。
- 邮箱是后续恢复和跨设备登录的可信身份，OAuth 提供的邮箱必须经过服务商验证。
- 同一邮箱通过不同登录方式进入同一个账号，文档始终按用户 ID 隔离。
- 账号名和密码没有邮件验证码或邮件重置入口；绑定 Google 或 GitHub 后，使用可信服务商重新登录。
- 未绑定可信身份且忘记密码的账号无法自动证明所有权，因此不支持自动恢复。
- 邮箱验证码属于可选能力，只能在第三方邮件服务的免费额度内启用；额度耗尽时关闭验证码入口，不允许自动升级或产生账单。
- 后续如需启用验证码，使用 Resend 免费额度并配置邮箱、IP、每日发送上限和 Cloudflare Turnstile。
- 每用户最多 1,000 篇文档、200 MB 附件；每篇文档最多 20 个附件。回收站文档仍占用文档配额。

## 构建与部署

`bun run build` 会：

1. 构建浏览器和 Node 静态渲染产物。
2. 用 React Router 生成 `/`、`/login`、`/docs` 静态入口壳。
3. 组装 `dist/vercel/`，包含同源 API rewrite 和旧路径跳转。
4. 校验本地静态引用和禁止使用外部静态源。

GitHub Actions 在推送到 `main` 后执行格式、类型、单元测试、Playwright、构建和体积预算，然后按以下顺序发布：

1. 应用远端 D1 迁移。
2. 部署 Worker。
3. 部署 Vercel 页面。
4. 对线上 API 和 D1 健康接口执行探针。

这个顺序保证数据库规则先于新页面和 API 生效。

## 里程碑

M1 已完成，验收结果如下：

- 生产账号分别通过 Google 和 GitHub 登录，均进入同一个 `users.id`；`/api/auth/me` 返回两种已绑定身份，并打开同一篇文档。
- 本地 Worker 与 D1 验证账号名和邮箱两种密码登录入口签发同一用户会话，并与已绑定的 Google、GitHub 身份共存。
- 本地真实 API 验证两个独立账号的文档列表、读取、保存、删除和恢复均按 owner 隔离。
- 浏览器双标签页保存返回 `409`，界面显示冲突并支持重新加载。
- 浏览器清除会话后访问 `/docs` 会跳转到 `/login`。

M1 到此停止，不自动进入搜索、分组、分享、附件和实时协作。

M2 是“可整理、可找到”，范围如下：

- 单层分组、未归档和分组文档计数。
- 创建、改名、删除分组；删除后文档自动回到未归档。
- 新建文档继承当前分组，已有文档可从编辑器移动到其他分组。
- 搜索同时匹配标题和正文，结果沿用当前分组范围。
- 搜索、分组和文档 API 全部按 `owner_id` 隔离。

分享、附件、导入导出和实时协作留到后续里程碑。

M3 是“多层整理”，当前进度如下：

- P0 已完成：最多五层分组、展开状态持久化、分组与文档拖拽移动、循环移动保护、递归删除和完整路径展示。
- P1 已完成：分组操作菜单中的跨设备移动入口，以及可点击的层级面包屑。
- P2 已完成：文档多选、当前列表全选、批量移动、批量收藏与取消收藏、批量移入回收站，以及删除后的撤销恢复。
- 分组列表只展示直属文档；计数会同时标明直属分组数和直属文档数。

M3 已完成。桌面端和移动端都可以完成多层整理与批量操作，操作后列表、分组计数、当前文档和路由会保持同步。
文档也可以直接在另一篇文档下创建子文档，或移动到另一篇文档下；侧栏按需读取直属子文档，不会把整个文档树塞进首页首屏请求。

M4 是“内容进出”，当前进度如下：

- P0 已完成：导入 Markdown、HTML、JSON 和纯文本，保留标题与可编辑的 Tiptap 正文；单篇文档可导出 Markdown、HTML 和 JSON。
- P1 已完成：文档附件使用 Cloudflare R2 存储，支持上传、列表、下载和删除；单个文件最大 10 MB，所有操作按文档 owner 隔离。
- P2 已完成：批量选择后可一次导出最多 50 篇文档的完整 JSON 包，包含正文结构和纯文本。
- 导入解析器、附件面板均按需加载，不进入 `/docs` 首屏关键路径。

M4 已完成。实时协作仍属于后续里程碑，不把当前的版本冲突保护描述成实时协作。

M5 是“稳定性与公开 Beta 准备”，当前进度如下：

- P0 已完成：移动端顶部栏、主要触控区域和格式工具栏完成触控适配。
- P1 已完成：文档稳定游标分页、每用户文档配额、附件配额、普通 API 限流和公开分享限流。
- P1 已完成：Playwright 覆盖注册、保存、刷新、分页、限流、所有权隔离、移动端触控和永久删除；D1 健康探针进入部署流水线。
- P1 已完成：`DocsPage` 的编辑器展示组件已拆分，私有工作区数据由 React Router Data Mode loader 和 revalidation 统一加载。
- P1 已完成：回收站永久删除会清理历史版本、附件元数据和 R2 对象。
- P1 已完成：登录页明确说明账号恢复边界，完整接口与配额说明见 `docs/API.md`。
