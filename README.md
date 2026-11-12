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
bun run build                # vendor + 构建前端到 dist/（含静态首屏快照和 CN HTML）
bun run build:first-screen   # 只生成 dist/home.html（需先 rsbuild build）
bun run build:cn-html        # 只生成 dist/index-cn.html / home-cn.html（需先 rsbuild build）
bun run vendor-package       # 组装大陆版 npm 包 .vendor-package/（需手动 npm publish）
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
│   ├── _headers           # 缓存策略与安全头
│   └── vendor/            # 构建时生成，react 系 ESM 模块（已 gitignore）
├── scripts/
│   ├── build-vendor.ts    # 把 react/react-dom/router 打成 ESM 供 importmap 使用
│   ├── build-vendor-package.ts  # 组装大陆版 npm 包（vendor + antd chunk）
│   ├── build-cn-html.ts   # 生成 dist/index-cn.html / home-cn.html
│   ├── cn-vendor-loader.ts # 大陆版内联 loader（tarball → blob → importmap）
│   ├── vendor-package-config.ts # npm 包版本、SHA-256、antd 文件名
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

**缓存与安全头写在 `public/_headers`。** 构建时它会被拷到 `dist/_headers`，Workers 静态资源读取后生效：`/static/*` 拿到 `max-age=31536000, immutable`（文件名带 hash，改内容必然改名），`/vendor/*` 同样拿到 immutable（文件名带 React 版本号），HTML 入口走 `no-cache`（否则发版后用户还在用旧壳），并统一加 `X-Content-Type-Options` 与 `Referrer-Policy`。

**错误不泄漏内部信息。** Worker 的 `onError` 只把堆栈写日志，响应里返回 `{ error, traceId }`（`traceId` 取 `cf-ray`，方便回查）；前端 `request()` 对非 JSON 响应做了兜底，边缘层直接吐 HTML 错误页时不会变成 `SyntaxError`。

**产物是 ES Module。** `output.module: true`，产物为 `.mjs` + `<script type="module">`，没有 IIFE 包装和 `rspackChunks` 注册表。Workers 静态资源对 `.mjs` 返回 `text/javascript`，模块能正常执行。

**react 系模块不打进产物，作为静态资源部署。** 生产构建用 `output.externals` 把 `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` / `react-router` / `react-router/dom` 外部化，`index.html` 的 **importmap** 指向同源的 `/vendor/*.mjs`：

| 项       | 值                                                                                     |
| -------- | -------------------------------------------------------------------------------------- |
| 生成位置 | `public/vendor/`（`scripts/build-vendor.ts`，gitignore）                               |
| 部署位置 | `dist/vendor/`（rsbuild 构建时从 `public/` 拷入）                                      |
| 线上路径 | `/vendor/react-19.3.1.mjs`、`/vendor/react-dom-19.3.1.mjs`、`/vendor/router-8.5.1.mjs` |
| 缓存     | `public/_headers` 里的 `max-age=31536000, immutable`                                   |
| 托管     | Workers Static Assets，和 `/static/*` 一样走 Cloudflare 边缘缓存                       |

这些文件由 `scripts/build-vendor.ts` 生成（react 的 npm 包只有 CJS，脚本负责 bundle 成 ESM 并补齐具名导出与 default；router 只导出业务实际用到的 7 个 API，避免把整个 data router 拉进首屏）。`bun run vendor` 会重建 `public/vendor/`，`bun run build` 会自动执行。

不再走 Worker → R2：`/vendor/*` 不放进 `run_worker_first`，请求由静态资源层直接返回，避免每次冷请求都多一次 Worker → R2 往返。代价是 `dist` 每次部署多带约 327 kB 的 vendor 文件。

大陆版不请求 `/vendor/*`，而是从 npmmirror 的版本化 tarball 里取同样的文件；详见下一节。

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

## 中国大陆分流（CN-only vendor）

Worker 用 `cf.country === 'CN'` 做性能分流（本地 dev 用 `CF-IPCountry` 头模拟；
线上只信 `cf.country`，防止伪造头）：

- `/` → 优先 `dist/home-cn.html`，缺失回退 `dist/home.html`
- `/todos`、`/about`、未知 SPA 路径 → 优先 `dist/index-cn.html`，缺失回退 `dist/index.html`
- 响应头 `x-swan-vendor: cn | cn-fallback | global` 方便探针确认；CN 版带
  `Vary: CF-IPCountry` + `Cache-Control: private, no-store`，避免边缘缓存把
  CN HTML 发给海外用户。

`scripts/build-cn-html.ts` 在构建后改写 HTML：

1. 移除静态 importmap、`/vendor/*` modulepreload，以及 `lib-antd.<hash>.mjs` 的
   `<script type="module">`；
2. 加 `preconnect` / `preload` 指向 npmmirror tarball，并 `prefetch` 入口 chunk；
3. 内联 `scripts/cn-vendor-loader.ts`。

loader 的逻辑：

1. 从 `cdn.npmmirror.com` 拉版本化 tarball（npmmirror 的 per-file `/files/`
   端点在 `cnpm/unpkg-white-list` 白名单之外，新包会 403；tarball CDN 不受限）；
2. 校验 SHA-256，`DecompressionStream('gzip')` 解压，解析 tar；
3. 把 React / ReactDOM / Router / `lib-antd.<hash>.mjs` 建成 `blob:` URL；
4. 注册 importmap：三个 vendor 说明符指向 blob，`lib-antd` 则把
   `https://deephos.com/static/js/lib-antd.<hash>.mjs` 这个**解析后的绝对 URL**
   映射到 blob（入口 chunk 里是 `import "./lib-antd.<hash>.mjs"`，importmap 在
   URL 解析后生效）；
5. 注入入口 script。任一步失败（CORS、超时、hash 不匹配、浏览器不支持）都回退到
   `/vendor/*` + `/static/js/*`，页面不会白屏。

npm 包 `@meteor957/swan-vendor` 同时包含这些文件。发布流程：

```bash
bun run vendor-package          # 组装 .vendor-package/（含当前 lib-antd chunk）
cd .vendor-package
npm publish --access public     # 需要 npm 2FA
# 把新版本的 tarball SHA-256 和 antd 文件名写回
# scripts/vendor-package-config.ts，然后：
bun run build:cn-html
```

`build:cn-html` 会校验 dist 里的 `lib-antd.<hash>.mjs` 与包里锁定的文件名一致；
antd 依赖或首屏 antd import 变化导致 hash 变化时，必须发新版本并更新配置，否则
构建直接报错，避免部署出引用不存在文件的 CN HTML。

### 实测（Globalping，8 个大陆探针）

| 资源                                       | firstByte 中位数 | total 中位数 | 成功 |
| ------------------------------------------ | ---------------: | -----------: | ---: |
| npmmirror tarball 0.2.0（248 kB，含 antd） |            111ms |        159ms |  8/8 |
| Cloudflare `index` chunk                   |            341ms |       2242ms |  7/8 |
| Cloudflare `lib-antd` chunk（改造前）      |            526ms |       1774ms |  8/8 |

- 改造前 CN 页面要等 Cloudflare 上的 `lib-antd`（中位 ~1.8s）；改造后 antd 字节
  跟着 tarball 走（~159ms），CN 关键路径只剩 HTML（Cloudflare 大陆边缘）和
  `index` chunk（中位 ~2.2s）。
- 用生产 `/home-cn` / `/index-cn` HTML 在 `/` 和 `/todos` 路径回放：home 2.3s
  渲染 4 个 Steps，todos 3.3s 出现「任务列表」，`lib-antd` 原 URL 请求 0 次，
  0 console error。
- CN 版 HTML 本身仍由 Cloudflare 返回；没有 ICP / 大陆节点，`/` 的 firstByte
  仍在 300ms–2.7s 波动，个别探针 total 到 12s。tarball 只解决 JS 字节，不解决
  HTML 的跨境 RTT。
- 分流是国家级 GeoIP，不用于合规判断；VPN、企业出口、港澳台、`XX`/`T1` 都可能
  落到全球版，全球版始终是完整可用的回退。

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

`.github/workflows/deploy.yml` 会在推送到 `main` 时依次跑 `bun install --frozen-lockfile` → `bun run check` → `bun run build` → `bun run check:first-screen` → `wrangler deploy`。

`bun run build` 会生成 `dist/home.html`；GitHub Actions 的 ubuntu runner 自带 Chrome。如果换到没有 Chrome 的环境，快照会自动跳过并回退到 SPA shell，不影响部署。

启用前在仓库 **Settings → Secrets and variables → Actions** 加两个 secret：

| Secret                  | 值                                                     |
| ----------------------- | ------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | 带 `Workers Scripts:Edit` + `D1:Edit` 权限的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID，`wrangler whoami` 可查                        |

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
