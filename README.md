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
bun run build                # vendor + 构建前端到 dist/（含静态首屏快照、CN HTML、Vercel 产物）
bun run build:first-screen   # 只生成 dist/home.html（需先 rsbuild build）
bun run build:cn-html        # 只生成 dist/index-cn.html / home-cn.html（需先 rsbuild build）
bun run build:vercel         # 只生成 dist/vercel/（CN 首页子域产物，需先 build:cn-html）
bun run check:first-screen   # 检查 home.html 结构（不启动浏览器）
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
│   ├── build-cn-html.ts   # 生成 dist/index-cn.html / home-cn.html
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

**一个 Worker 同时干两件事。** `wrangler.jsonc` 里：

```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": [
    "/api/*",
    "/",
    "/home",
    "/home.html",
    "/todos",
    "/todos/*",
    "/about",
    "/about/*"
  ]
}
```

- `run_worker_first: ["/api/*"]` —— API 请求先进 Worker，命中 Hono 路由
- `/`、`/todos`、`/about` 也先进 Worker：Worker 按 `cf.country` 选择
  `/home-cn` / `/home` 或 `/index-cn` / `index.html`（见下文「中国大陆分流」）
- 其余请求直接由静态资源返回，不消耗 Worker 调用
- `not_found_handling: single-page-application` —— 静态资源未命中时回退 `index.html`，React Router 的 `/todos`、`/about` 刷新不会 404
- Hono 的 `notFound` 里对 `/api/*` 返回 JSON 404，其它路径兜底到 `c.env.ASSETS.fetch()`

**D1 只出现在数据访问层。** `src/worker/db/todos.ts` 里全是 SQL 与行/对象映射，路由层只做参数校验和响应拼装，换 ORM 或加缓存时改动面很小。

**类型只写一次。** `src/shared/types.ts` 被前端和 Worker 同时引用，接口字段改名会立刻在两边报错。

**缓存与安全头由 `scripts/build-vercel.ts` 生成的 `vercel.json` 负责。** `/static/*`、`/vendor/*` 拿到 `max-age=31536000, immutable`（文件名带 hash/版本号），HTML 走 Vercel 默认的 `no-cache`，全局加 `X-Content-Type-Options` 与 `Referrer-Policy`。

**错误不泄漏内部信息。** Worker 的 `onError` 只把堆栈写日志，响应里返回 `{ error, traceId }`（`traceId` 取 `cf-ray`，方便回查）；前端 `request()` 对非 JSON 响应做了兜底，边缘层直接吐 HTML 错误页时不会变成 `SyntaxError`。

**产物是 ES Module。** `output.module: true`，产物为 `.mjs` + `<script type="module">`，没有 IIFE 包装和 `rspackChunks` 注册表。Workers 静态资源对 `.mjs` 返回 `text/javascript`，模块能正常执行。

**react 系模块不打进产物，作为静态资源部署。** 生产构建用 `output.externals` 把 `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` / `react-router` / `react-router/dom` 外部化，`index.html` 的 **importmap** 指向同源的 `/vendor/*.mjs`：

| 项       | 值                                                                                     |
| -------- | -------------------------------------------------------------------------------------- |
| 生成位置 | `public/vendor/`（`scripts/build-vendor.ts`，gitignore）                               |
| 部署位置 | `dist/vendor/`（rsbuild 构建时从 `public/` 拷入）                                      |
| 线上路径 | `/vendor/react-19.3.1.mjs`、`/vendor/react-dom-19.3.1.mjs`、`/vendor/router-8.5.1.mjs` |
| 缓存     | `vercel.json`（build-vercel 生成）的 `max-age=31536000, immutable`                     |
| 托管     | Vercel 静态资源（全局版），`/static/*` 同样随部署上传并走 Vercel 边缘缓存              |

这些文件由 `scripts/build-vendor.ts` 生成（react 的 npm 包只有 CJS，脚本负责 bundle 成 ESM 并补齐具名导出与 default；router 只导出业务实际用到的 7 个 API，避免把整个 data router 拉进首屏）。`bun run vendor` 会重建 `public/vendor/`，`bun run build` 会自动执行。

`/vendor/*` 随 Vercel 部署，浏览器同源加载；Worker 已不再托管静态资源。代价是 `dist/vercel` 每次部署多带约 327 kB 的 vendor 文件。

大陆版不请求 `/vendor/*`，而是从 OSS `/static/vendor/*` 取同样的文件；详见下一节。

**首屏路由只加载概览页。** `/todos`、`/about` 用 `React.lazy()` 拆分，首次进入时才拉对应 chunk（`Suspense` 兜底是骨架屏）；404 与错误页作为兜底留在主包。首屏 JS（不含外部化的 vendor）约 483 kB（gzip 约 156 kB）；Table、表单等懒加载部分按需加载。

**antd 6 的用法。** 根节点用 `<ConfigProvider locale={zhCN}>` 提供主题和中文 locale；`<App>` 只包在需要 `message` / `modal` 的懒加载页面（`TodosPage`）里，首屏因此不下载 message/modal 代码。`message` / `modal` 从 `App.useApp()` 取，不再用静态方法。

**Bun 只负责装依赖和跑脚本，不执行 Worker 代码。** 前端构建走 Rsbuild（Rspack），Worker 由 `wrangler dev` 拉起本地 workerd 运行。`bun run --parallel` 是 Bun 1.4 才有的能力，所以 `engines.bun` 要求 `>=1.4.0`。

## 静态首屏快照（home.html）

首页 `/` 不再等 JS 下载和执行完才出现内容：构建结束后，`scripts/first-screen`
用 headless Chrome 打开刚构建好的首页，抓取 `#root` 的 DOM 和匹配的 CSS，
生成 `dist/home.html`。这个文件里同时包含桌面/移动两套快照、快照 CSS，以及
（在本项目里只有 6.7 kB 的）应用全局 CSS；浏览器解析到 HTML 就能画出首屏，
真实应用渲染完成后由一段内联脚本无缝接管。

- 只影响 `/`：Worker 的 `run_worker_first` 把 `/` 交给 Worker，Worker 按
  `cf.country` 返回 `/home-cn`（`dist/home-cn.html`）或 `/home`
  （`dist/home.html`）；`/todos`、`/about` 走 `index.html`，CN 用户走
  `index-cn.html`（见「中国大陆分流」）。
- 无 JS 也能看到完整首页；快照带 `inert` + `aria-hidden`，不会抢焦点。
- 快照缺失或生成失败时自动回退到 SPA shell，不会阻塞构建/部署。
- 代价：`/` 的 HTML 从 ~0.9 kB 增加到 ~16.8 kB Brotli；不减少 JS，也不改善
  TTI/INP，只是消除白屏。动态统计值在快照里是构建时的占位数据，应用也以同一组
  占位值作为初始 state，所以接管不等待 `/api/stats`；真实值到达后再替换。

相关命令与环境变量：

```bash
bun run build:first-screen          # 只跑快照生成（需先 rsbuild build）
bun run check:first-screen          # 结构检查，不启动浏览器
FIRST_SCREEN_SKIP=1 bun run build   # 跳过快照（CI 没有 Chrome 时）
FIRST_SCREEN_STRICT=1 bun run build # 快照失败时让构建失败
FIRST_SCREEN_CSS_MODE=async bun run build # inline-css | async | blocking
CHROME_PATH=/path/to/chrome bun run build
```

实现细节见 [`scripts/first-screen/README.md`](scripts/first-screen/README.md)。

## 站点托管与大陆分流

`deephos.com` 整站由 Vercel 托管，Cloudflare 提供独立 API 域名：

- `/`：按 `x-vercel-ip-country` 分流，CN 返回 `home-cn.html`（纯静态快照），其他返回 `home.html`；
- `/todos`、`/about`：CN 返回 `index-cn.html`（OSS + 静态 import map），其他返回 `shell-global.html`（同源 vendor）；
- 新构建的 API 请求：浏览器统一访问同域 `/api/*`，由 Vercel 亚洲边缘代理到 `api.deephos.com`；
- `/todos` 在 importmap 和模块脚本之前同域预取默认待办列表；`/about` 不预取未使用的数据；
- `/todos` 构建时内联最近一次待办快照，React 首帧直接渲染，随后用 API 在后台刷新；
- 待办列表允许浏览器先显示短时间内的旧响应并在后台重新验证；写操作和手动刷新强制重新请求；
- `/api/*`：Vercel 反代到 `api.deephos.com`；`/api/todos` 使用 5 秒 CDN 缓存和 15 秒后台重验证；
- Speed Insights 覆盖 SPA 路由与纯静态 CN 首页，生产环境按实际 pathname 归因；
- `static/`、`vendor/` 随 Vercel 部署，供全球版使用；CN 的 JS/CSS 仍在 OSS。

`scripts/build-vercel.ts` 生成 `dist/vercel/`。注意 `index.html` 会改名成
`shell-global.html`：部署里存在 `index.html` 时 `/` 会直接命中静态文件，rewrite 不生效。
地理分流用 `has: x-vercel-ip-country`（实测 CN 命中 CN 变体、US 命中 GLOBAL 变体，
边缘缓存不串区）。

`scripts/build-cn-html.ts` 在构建后改写 HTML：

1. 移除同源 import map 和 `/vendor/*` modulepreload，换成指向 OSS
   `/static/vendor/*` 的静态 import map；
2. 去掉 `lib-antd.<hash>.mjs` 的 `<script type="module">`（由入口相对 import 命中 OSS）；
3. 入口 script 改为 OSS 绝对地址；`home-cn.html` 走静态快照分支（无模块脚本）。

CN vendor 全部来自 OSS：没有 loader、SHA 校验、`DecompressionStream` 和 blob URL；
`scripts/upload-oss.ts` 同时上传 `dist/vendor` → `static/vendor/`。

入口、async chunk 和 CSS 由 `scripts/upload-oss.ts` 镜像到 OSS（同域默认域名，
免备案）；CI 在 `wrangler deploy` 之前执行 `bun run upload:oss`，再由
`bun run verify:oss` 对每个本地产物检查 HTTP 200、MIME、长期缓存头和 SHA-256。
上传需要仓库 secrets
`OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET`（RAM 用户只授权该桶的
Put/Get/Delete/List）。

CN 的 vendor 与 antd chunk 全部从 OSS `/static/vendor/*`、`/static/js/*` 加载，
不再维护 npm 备份包；antd 文件名由构建产物自动发现，不再有手动锁。

### 实测（Globalping，8 个大陆探针）

| 资源                                  | firstByte 中位数 | total 中位数 |   成功 |
| ------------------------------------- | ---------------: | -----------: | -----: |
| OSS 入口 chunk（带 Referer，20 探针） |             48ms |        196ms |  20/20 |
| OSS antd chunk（10 探针）             |             55ms |        208ms |  10/10 |
| OSS vendor（与 antd 同前缀）          |       预计 ≤60ms |            — | 待复测 |
| Cloudflare `lib-antd` chunk（改造前） |            526ms |       1774ms |    8/8 |

- 改造前 CN 页面要等 Cloudflare 上的 `lib-antd`（中位 ~1.8s）；现在 entry / antd /
  vendor 全部从 OSS 返回（实测 48–55ms 首字节），CN 关键路径只剩 HTML（Vercel）和
  OSS 静态字节。
- 用生产 `/home-cn` / `/index-cn` HTML 在 `/` 和 `/todos` 路径回放：home 2.3s
  渲染 4 个 Steps，todos 3.3s 出现「任务列表」，`lib-antd` 原 URL 请求 0 次，
  0 console error。
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
`check:first-screen` → `upload:oss` → `verify:oss` → Vercel 部署（可选）→
`wrangler deploy`。任一步失败都会停止后续发布，不会出现 HTML 已上线但 OSS
缺文件的状态。

`bun run build` 会生成 `dist/home.html`；GitHub Actions 的 ubuntu runner 自带 Chrome。如果换到没有 Chrome 的环境，快照会自动跳过并回退到 SPA shell，不影响部署。

启用前在仓库 **Settings → Secrets and variables → Actions** 配置：

| Secret                  | 必需 | 值                                                       |
| ----------------------- | ---- | -------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | 是   | 带 `Workers Scripts:Edit` + `D1:Edit` 权限的 API Token   |
| `CLOUDFLARE_ACCOUNT_ID` | 是   | 账号 ID，`wrangler whoami` 可查                          |
| `OSS_ACCESS_KEY_ID`     | 是   | 仅允许 `deephos-static` 桶上传/读取/校验的 RAM AccessKey |
| `OSS_ACCESS_KEY_SECRET` | 是   | 对应 RAM AccessKey Secret                                |
| `VERCEL_TOKEN`          | 否   | 未配置时跳过 Vercel 步骤，站点保持上一版                 |

本地可用下面的命令检查当前 Worker 与 D1 分项耗时：

```bash
bun run perf:api --runs 30
```

脚本会输出 `/api/health`、`/api/todos`、`/api/stats` 的 min / p50 / p75 / p90 /
max，并解析 `Server-Timing` 的 `worker` 与 `db`。跨域响应同时发送
`Timing-Allow-Origin: *`，因此浏览器 PerformanceResourceTiming 也能读取分项。

Speed Insights 的下一轮判断门槛：`/todos` 至少累计 100 个真实事件，或继续观察
7 天；Desktop / Mobile 分开看；RES、LCP、INP、TTFB 同时看 P75 / P90，并参考
浏览器中的 `swan:todos-data-visible`。自动化和人工验收请求也会被 Speed Insights
计入，因此样本较少时不要把验收访问当作真实用户趋势。

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
