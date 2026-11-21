# Swan Worker

一个可直接上手的最小全栈模板：**React 19 + Ant Design 6 前端** 与 **Hono API + Cloudflare D1** 跑在同一个 Cloudflare Worker 上。

## 技术栈

| 层次            | 技术                                 | 版本        |
| --------------- | ------------------------------------ | ----------- |
| 运行时 / 包管理 | Bun                                  | 1.4.4       |
| 语言            | TypeScript（Bun 直接执行，无需 tsc） | 5.x 语法    |
| 类型检查        | Bun 内置 `bun check`                 | 1.4         |
| 视图            | React                                | 19.3        |
| 路由            | React Router                         | 8.5         |
| UI 组件库       | Ant Design + @ant-design/icons       | 6.6 / 6.3   |
| 构建            | Rsbuild（Rspack）                    | 2.2         |
| 服务端框架      | Hono                                 | 4.13        |
| 数据库          | Cloudflare D1                        | 边缘 SQLite |
| 部署            | Wrangler                             | 4.154       |

## 快速开始

```bash
bun install
bun run db:migrate:local   # 初始化本地 D1（.wrangler/state）
bun run db:seed:local      # 可选：写入 5 条演示数据
bun run dev
```

`bun run dev` 用 Bun 1.4 原生的 `bun run --parallel` 并行启动两个进程（不需要 concurrently / npm-run-all）：

- **web**：Rsbuild dev server → http://localhost:3000（HMR）
- **api**：`wrangler dev` → http://127.0.0.1:8787（本地 workerd + 本地 D1）

输出会带 `dev:web |` / `dev:api |` 前缀，按行区分来源。

前端请求 `/api/*` 会被 dev server 代理到 8787，因此浏览器里只需要访问 3000 端口。

> 想直接看「生产形态」，用 `bun run preview`：先构建再把 `dist/` 交给 wrangler dev 托管，此时只开 8787 一个端口。
>
> ⚠️ 注意别写成 `bun build`。`bun build` 是 Bun 自带的打包器命令（需要传 entrypoint），不会执行 `package.json` 里的 `build` 脚本，会报 `Missing entrypoints`。脚本一律用 `bun run <script>`。

## 常用命令

```bash
bun run dev             # 前端 + Worker 同时开发
bun run dev:web         # 只启动前端
bun run dev:api         # 只启动 Worker
bun run vendor          # 生成 public/vendor/ 下的 react 系 ESM 模块（构建时拷进 dist/vendor/）
bun run build                # vendor + 构建前端到 dist/（含静态首屏快照和 Vercel 产物）
bun run build:first-screen   # 只生成 dist/home.html（需先 rsbuild build）
bun run build:static-about   # 只生成最终静态页 dist/about.html（需先 rsbuild build）
bun run build:cn-home        # 只生成静态 dist/home-cn.html（需先 build:first-screen）
bun run build:vercel         # 只生成 dist/vercel/（需先 build:cn-home）
bun run verify:vercel        # 检查所有静态资源已进入 Vercel 产物且没有外部 CDN
bun run check:first-screen   # 检查 home.html 结构（不启动浏览器）
bun run check:static-about   # 检查 about.html 不含 React/module 依赖
bun run perf:budget          # size-limit：入口、路由、antd 和首屏 JS 预算
bun run perf:lighthouse      # Lighthouse CI：/todos 的 LCP/TBT/CLS 回归门槛
bun run perf:check           # 依次执行两项性能检查
bun run check                # 类型检查（bun check，约 80ms，无需安装 typescript）
bun run fmt             # 格式化（Bun 内置，零依赖）
bun run fmt:check       # 只检查不写入，CI 用
bun run preview         # 构建 + 本地以生产形态运行
bun run deploy          # 构建 + wrangler deploy

bun run db:create         # 在 Cloudflare 上创建 D1 数据库
bun run db:migrate:local  # 本地执行 migrations/
bun run db:migrate:remote # 线上执行 migrations/
bun run db:seed:local     # 本地写入 seed/seed.sql
bun run db:seed:remote    # 线上写入 seed/seed.sql
```

## 目录结构

```
swan-worker/
├── .github/workflows/
│   └── deploy.yml         # push 到 main 自动构建并部署
├── migrations/            # D1 迁移（按文件名顺序执行）
│   ├── 0001_init.sql
│   └── 0002_index_optimize.sql
├── seed/                  # 演示数据，不属于迁移
│   └── seed.sql
├── public/                # 静态资源，构建时拷到 dist/
│   └── vendor/            # 构建时生成，react 系 ESM 模块（已 gitignore）
├── scripts/
│   ├── build-vendor.ts    # 把 react/react-dom/router 打成 ESM 供 importmap 使用
│   ├── build-cn-home.ts   # 生成大陆首页静态快照 home-cn.html
│   ├── build-vercel.ts    # 生成 dist/vercel/（整站 + geo rewrite）
│   ├── loading-shell.ts   # SPA shell 的首帧加载骨架
│   └── first-screen/      # 构建期首屏快照（capture → filter → home.html）
├── API.md                 # 接口文档（参数 / 响应 / 错误码）
├── src/
│   ├── client/            # 前端
│   │   ├── api/client.ts  # /api 请求封装
│   │   ├── layouts/       # RootLayout（桌面 Sider / 移动端 Drawer + Header + Outlet）
│   │   ├── pages/         # HomePage / TodosPage / AboutPage / NotFound / Error
│   │   ├── router.tsx     # createBrowserRouter 路由表
│   │   ├── main.tsx       # 入口：ConfigProvider + RouterProvider
│   │   ├── index.html     # HTML 模板
│   │   └── styles/        # 全局样式
│   ├── shared/types.ts    # 前后端共享类型
│   └── worker/            # Worker 端
│       ├── db/todos.ts    # 数据访问层（纯 SQL）
│       ├── routes/        # todos / stats 路由
│       ├── types.ts       # Env 绑定类型
│       └── index.ts       # Hono 应用 + 静态资源兜底
├── rsbuild.config.ts
├── wrangler.jsonc
└── tsconfig.json
```

## 接口

完整接口说明（参数、响应示例、错误码）见 **[API.md](API.md)**。

## 关键设计

**Worker 只负责 API。** `wrangler.jsonc` 只声明 Worker 入口、D1 绑定和可观测性，
不再挂载 `dist/` 静态资源。

- `api.deephos.com/api/*` 直接进入 Worker，命中 Hono 路由
- `/`、`/todos`、`/about` 与所有 JS/CSS/favicon 都由 Vercel 站点处理
- Vercel 的 SPA rewrite 负责 `/todos`、`/about` 刷新和未知路由回退
- Hono 的 `notFound` 对未知 API 返回 JSON 404

**D1 只出现在数据访问层。** `src/worker/db/todos.ts` 里全是 SQL 与行/对象映射，路由层只做参数校验和响应拼装，换 ORM 或加缓存时改动面很小。

**类型只写一次。** `src/shared/types.ts` 被前端和 Worker 同时引用，接口字段改名会立刻在两边报错。

**缓存与安全头由 `scripts/build-vercel.ts` 生成的 `vercel.json` 负责。**
`/static/*`、`/vendor/*` 拿到 `max-age=31536000, immutable`（文件名带 hash/版本号）；
`/todos`、`/about` 的 HTML 浏览器端仍重新验证，Vercel 边缘缓存 60 秒并允许
`stale-while-revalidate=300`；全局加 `X-Content-Type-Options` 与 `Referrer-Policy`。

**错误不泄漏内部信息。** Worker 的 `onError` 只把堆栈写日志，响应里返回 `{ error, traceId }`（`traceId` 取 `cf-ray`，方便回查）；前端 `request()` 对非 JSON 响应做了兜底，边缘层直接吐 HTML 错误页时不会变成 `SyntaxError`。

**产物是 ES Module。** `output.module: true`，产物为 `.mjs` + `<script type="module">`，没有 IIFE 包装和 `rspackChunks` 注册表。Vercel 对 `.mjs` 返回 `text/javascript`，模块能正常执行。

**react 系模块不打进产物，作为静态资源部署。** 生产构建用 `output.externals` 把 `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` / `react-router` / `react-router/dom` 外部化，`index.html` 的 **importmap** 指向同源的 `/vendor/*.mjs`：

| 项       | 值                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| 生成位置 | `public/vendor/`（`scripts/build-vendor.ts`，gitignore）                                                     |
| 部署位置 | `dist/vendor/`（rsbuild 构建时从 `public/` 拷入）                                                            |
| 线上路径 | `/vendor/react-<版本>.<hash>.mjs`、`/vendor/react-dom-<版本>.<hash>.mjs`、`/vendor/router-<版本>.<hash>.mjs` |
| 缓存     | `vercel.json`（build-vercel 生成）的 `max-age=31536000, immutable`                                           |
| 托管     | Vercel 静态资源；`/static/*` 与 `/vendor/*` 都随部署上传并走 Vercel 边缘缓存                                 |

这些文件由 `scripts/build-vendor.ts` 生成（react 的 npm 包只有 CJS，脚本负责 bundle 成 ESM 并补齐具名导出与 default；router 只导出业务实际用到的 14 个 API，避免把整个 router 包拉进首屏）。文件名包含包版本和产物内容 hash，`manifest.json` 再由 Rsbuild 注入 importmap 和 modulepreload，因此只调整导出集合也不会命中旧的一年缓存。`bun run vendor` 会重建 `public/vendor/`，`bun run build` 会自动执行。

`/vendor/*` 随 Vercel 部署，浏览器同源加载；Worker 已不再托管静态资源。大陆和海外访问 `/todos`、`/about` 时使用同一套同源静态资源。

**路由使用 React Router 原生能力。** `/todos`、`/about` 使用路由级 `lazy` 拆分；待办页通过 `loader`、`action`、`useFetcher` 和自动 revalidation 完成读写，菜单使用 `NavLink`，标题来自 `useMatches()`。静态 shell 负责首帧，路由加载阶段不再额外渲染骨架屏。

**性能原语优先使用框架实现。** Rsbuild 的 `output.inlineStyles` 在构建期内联小型 CSS；Hono 的 `timing()` / `wrapTime()` 生成 `Server-Timing` 和跨域计时头。业务代码不再维护对应的手工实现。

**antd 6 的用法。** 根节点用 `<ConfigProvider locale={zhCN}>` 提供主题和中文 locale；`<App>` 只包在需要 `message` / `modal` 的懒加载页面（`TodosPage`）里，首屏因此不下载 message/modal 代码。`message` / `modal` 从 `App.useApp()` 取，不再用静态方法。

**Bun 只负责装依赖和跑脚本，不执行 Worker 代码。** 前端构建走 Rsbuild（Rspack），Worker 由 `wrangler dev` 拉起本地 workerd 运行。`bun run --parallel` 是 Bun 1.4 才有的能力，所以 `engines.bun` 要求 `>=1.4.0`。

## 静态首屏快照（home.html）

首页 `/` 不再等 JS 下载和执行完才出现内容：构建结束后，`scripts/first-screen`
用 headless Chrome 打开刚构建好的首页，抓取 `#root` 的 DOM 和匹配的 CSS，
生成 `dist/home.html`。这个文件里同时包含桌面/移动两套快照、快照 CSS，以及
（在本项目里只有 6.7 kB 的）应用全局 CSS；浏览器解析到 HTML 就能画出首屏，
真实应用渲染完成后由一段内联脚本无缝接管。

- 只影响 `/`：Vercel 按 `x-vercel-ip-country` 返回 `home-cn.html` 或
  `home.html`；`/about` 直接返回构建期生成的最终静态页。
- 无 JS 也能看到完整首页；快照带 `inert` + `aria-hidden`，不会抢焦点。
- 快照缺失或生成失败时自动回退到 SPA shell，不会阻塞构建/部署。
- 代价：`/` 的 HTML 从 ~0.9 kB 增加到 ~16.8 kB Brotli；不减少 JS，也不改善
  TTI/INP，只是消除白屏。动态统计值在快照里是构建时的占位数据，应用也以同一组
  占位值作为初始 state，所以接管不等待 `/api/stats`；真实值到达后再替换。

相关命令与环境变量：

```bash
bun run build:first-screen          # 只跑快照生成（需先 rsbuild build）
bun run check:first-screen          # 结构检查，不启动浏览器
bun run build:static-about          # 生成不加载 React/antd 的 /about
bun run check:static-about --strict # CI 检查 /about 必须存在且完全静态
FIRST_SCREEN_SKIP=1 bun run build   # 跳过快照（CI 没有 Chrome 时）
FIRST_SCREEN_STRICT=1 bun run build # 快照失败时让构建失败
CHROME_PATH=/path/to/chrome bun run build
```

实现细节见 [`scripts/first-screen/README.md`](scripts/first-screen/README.md)。

## 站点托管与大陆分流

`deephos.com` 整站由 Vercel 托管，Cloudflare 提供独立 API 域名：

- `/`：按 `x-vercel-ip-country` 分流，CN 返回 `home-cn.html`（纯静态快照），其他返回 `home.html`；
- `/about`：返回 `about.html`，桌面和移动端 DOM/CSS 均在构建期生成，不加载 React、antd、vendor 或 module script；
- `/todos`：返回 `shell-global.html`，entry、async chunk、antd 与 vendor 全部从 Vercel 同源加载；
- 新构建的 API 请求：浏览器统一访问同域 `/api/*`，由 Vercel 亚洲边缘代理到 `api.deephos.com`；
- `/todos` 构建时内联最近一次待办快照，React 路由加载后立即用 API 刷新；
- `/api/*`：Vercel 反代到 `api.deephos.com`；动态 API 响应统一使用 `no-store`，写操作和刷新都能立即读到新数据；
- Speed Insights 覆盖 SPA 路由与纯静态 CN 首页，生产环境按实际 pathname 归因；
- `static/`、`vendor/` 全部随 Vercel 部署；
  约 9 kB 的应用 CSS 内联进 HTML，避免渲染阻塞和额外 RTT。

`scripts/build-vercel.ts` 生成 `dist/vercel/`。注意 `index.html` 会改名成
`shell-global.html`：部署里存在 `index.html` 时 `/` 会直接命中静态文件，rewrite 不生效。
地理分流用 `has: x-vercel-ip-country`（实测 CN 命中 CN 变体、US 命中 GLOBAL 变体，
边缘缓存不串区）。

`scripts/build-cn-home.ts` 只把 `home.html` 转成不加载模块的纯静态快照。
`scripts/build-vercel.ts` 将 `static/`、`vendor/`、favicon 和所有 HTML 一起打包到
`dist/vercel/`；`scripts/verify-vercel-assets.ts` 会检查 HTML 引用的本地资源确实存在，
并拒绝 `aliyuncs.com`、`oss-cn-*`、npmmirror 等外部静态源重新混入产物。

### 托管策略

- `/` 的 CN 静态快照不请求 React、antd 或 vendor 模块；
- `/todos`、`/about` 的 JS、CSS、React、antd 全部由 Vercel 同源返回；
- 静态文件名带 hash/version，缓存一年；
- 此前三城实测中阿里云 OSS 下载大型 vendor 文件快于 Vercel；迁移到全 Vercel
  后换取的是零 OSS 费用、单一发布链路和更简单的缓存失效模型。

### 线上验证

- 2026-11-16：apex 从 Cloudflare 迁到 Vercel（geo rewrite，地址栏不变）。大陆探针：
  `/` 与 `/todos` 200、PoP sin1、TTFB 120–357ms（边缘 HIT）；`/api/stats` 经 Vercel
  反代约 498ms；美国探针 sfo1 HIT 18–24ms。地理分流实测不串区。
- 分流是国家级 GeoIP，不用于合规判断；VPN、企业出口、港澳台、`XX`/`T1` 都可能
  落到全球版，全球版始终是完整可用的回退。

## 部署到 Vercel（站点）

站点 HTML 与静态资源由 Vercel 托管，`bun run build` 会生成 `dist/vercel/`（含 geo rewrite 与 API 反代）。

- 项目：`deephos-cn-test`（fubd）；生产域只有 `deephos.com`；
- 手动部署：`cd dist/vercel && bunx vercel deploy . --prod --yes`（需要 `VERCEL_TOKEN`）；
- CI：`deploy.yml` 的 Vercel 步骤在 `VERCEL_TOKEN` secret 存在时执行，缺失则跳过；
- 根域在 Cloudflare 用 **A 记录**指向 `216.198.79.65` / `64.29.17.65`（Vercel 项目 anycast），DNS only；
  - 这是按当前项目 IP 固定下来的：Vercel 换 IP 时站点会断，需用
    `dig +short 8a55bf6822ee61dd.vercel-dns-017.com` 对照并更新这两条 A 记录；
  - 实测换 A 后大陆 DNS p90 429→198ms、首页总耗时 p50 399→317ms、p90 728→535ms；
- 浏览器 API 基址为同域 `/api`；上游仍为 `api.deephos.com`，共享配置在 `src/shared/api-config.ts`，Vercel rewrite 写在 `scripts/build-vercel.ts`。

## 部署到 Cloudflare

```bash
# 1. 登录
bunx wrangler login

# 2. 创建 D1，把输出的 database_id 填进 wrangler.jsonc
bun run db:create

# 3. 在线上库建表
bun run db:migrate:remote

# 4. 部署
bun run deploy
```

`wrangler.jsonc` 里已填入线上库 `swan-worker-db` 的 `database_id`（`972f2269-…`）。换账号或重建库时，替换成 `db:create` 返回的新 ID。

### 自动部署（GitHub Actions）

`.github/workflows/deploy.yml` 会在推送到 `main` 时依次跑
`bun install --frozen-lockfile` → `fmt:check` → `check` → `build` →
`check:first-screen` → `check:static-about --strict` → `perf:check` → Vercel 部署 → `wrangler deploy`。`build` 内的
`verify:vercel` 会检查所有静态文件已随站点上传；任一步失败都会停止后续发布。

`perf:check` 先用 `size-limit` 检查入口、Todos 路由、antd 共享包和首屏 JS 的
Brotli 体积，再用 Lighthouse CI 对 `/todos` 跑三次桌面审计。当前门槛为中位数
Performance ≥ 0.85、FCP ≤ 1.8s、LCP ≤ 2.5s、TBT ≤ 400ms、CLS ≤ 0.05。

`bun run build` 会生成 `dist/home.html` 和 `dist/about.html`；GitHub Actions 的 ubuntu runner 自带 Chrome。如果换到没有 Chrome 的环境，快照会自动跳过并回退到 SPA shell；CI 的严格结构检查会阻止这种回退进入生产部署。

启用前在仓库 **Settings → Secrets and variables → Actions** 配置：

| Secret                  | 必需 | 值                                                     |
| ----------------------- | ---- | ------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | 是   | 带 `Workers Scripts:Edit` + `D1:Edit` 权限的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 是   | 账号 ID，`wrangler whoami` 可查                        |
| `VERCEL_TOKEN`          | 是   | 缺少时部署失败，避免 Worker 已更新而站点静态资源仍旧版 |

本地可用下面的命令检查当前 Worker 与 D1 分项耗时：

```bash
bun run perf:api --runs 30
```

脚本会输出 `/api/health`、`/api/todos`、`/api/stats` 的 min / p50 / p75 / p90 /
max，并解析 Hono 生成的 `total`（描述为 `worker`）与 `db`。跨域响应同时发送
`Timing-Allow-Origin: *`，因此浏览器 PerformanceResourceTiming 也能读取分项。

Speed Insights 的下一轮判断门槛：`/todos` 至少累计 100 个真实事件，或继续观察
7 天；Desktop / Mobile 分开看；RES、LCP、INP、TTFB 同时看 P75 / P90，并参考
浏览器 Performance 面板中的资源与长任务时间线。自动化和人工验收请求也会被
Speed Insights 计入，因此样本较少时不要把验收访问当作真实用户趋势。

数据库迁移**不会**自动执行，结构变更仍需手动 `bun run db:migrate:remote`，避免 CI 误改线上数据。

> 另一条路是 Cloudflare 自带的 Workers Builds：在 dashboard 里 Worker → Settings → Builds 连接 GitHub 仓库，构建命令填 `bun run build`、部署命令填 `npx wrangler deploy`。两种方式二选一即可，不要同时开，否则一次 push 会部署两次。

## 备注

- 本地数据库文件在 `.wrangler/state/`，已加入 `.gitignore`；删掉目录重新 `db:migrate:local` 即可重置
- `seed/` 刻意与 `migrations/` 分开：迁移是结构变更，种子数据可以随时重跑
- 格式化用 Bun 内置的 `bun fmt`（零依赖，不用装 prettier/biome），风格写在 `bunfig.toml` 的 `[fmt]` 段（100 列、单引号）；脚本里必须带 `--no-script`，否则 `bun fmt` 会去执行 `package.json` 的 `fmt` 脚本，自己调自己
- 类型检查用 `bun run check`（Bun 1.4 内置，读同一份 `tsconfig.json`，输出与 tsc 一致）；项目不依赖 `typescript` 包，需要产出 `.d.ts` 时再 `bun add -d typescript`
- Bun 执行 `.ts` / `.tsx` 时只擦除类型、不做检查，能跑 ≠ 类型没问题，提交前记得 `bun run check`
- `tsconfig.json` 虽然不再给编译器用，但仍是必需的：`bun check` 靠它拿 `lib` / `types` / `paths`，编辑器靠它做类型提示；删掉它会立刻冒出「找不到 document」「找不到 @/shared/types」这类错误
- `@/*` 别名只写在 `tsconfig.json` 的 `paths` 里，Rspack 会自动读取（`resolve.tsConfig`），不需要在 `rsbuild.config.ts` 里重复声明
- `tsconfig.json` 里不要用 `baseUrl`（TS 7 已移除），`paths` 写相对路径：`"@/*": ["./src/*"]`
- 需要 SSR 时，可在 Rsbuild 开启 `server` 构建 + Hono 里渲染 HTML，但会放弃静态资源的零调用优势
