# CN Shell 性能与 vendor 架构改造计划

- 状态：待执行
- 基线：`main` @ `4a50619`（2026-11-16）
- 日期：2026-11-17
- 范围：`deephos.com` 的 CN/global 首页与 `/todos` 首屏、CN vendor 来源、API 链路
- 相关文档：`README.md` 的「站点托管与大陆分流」「中国大陆分流」

## TL;DR

按收益排序做四件事：

1. **CN vendor 从 npmmirror tarball 迁到自有 OSS per-file + 静态 import map**。去掉 tarball、SHA-256、`DecompressionStream`、blob URL、4s 超时和 npmmirror 依赖，CN shell 变成纯静态 HTML。
2. **给 `index-cn.html` 和 `shell-global.html` 加纯 HTML/CSS 加载骨架**，消灭启动白屏。
3. **让 global 首页快照里的 CTA 在 hydrate 前可点**（只放行 CTA，菜单按钮继续不可点），把“首页→todos”从约 3.5s 降到约 1.5s。
4. **可选**：CN 首页预取 `/todos` 资源；API 改为浏览器直连 `api.deephos.com` + preconnect。

预期结果：

| 指标 | 现状 | 目标 |
|---|---|---|
| CN `/todos` 点击到首条数据 | 约 1.5–2s，npmmirror 慢时 +4s | < 1.5s，无 4s 等待 |
| CN vendor 来源 | npmmirror 第三方 | 自有 OSS 北京 |
| CN `/todos` 白屏 | 启动期间空白 | 首帧即有骨架 |
| global 首页 CTA 可点时间 | hydrate 后约 2.2–2.7s | 首帧即可点 |
| CN shell 运行时 JS | tarball 解析 + blob import map | 无 loader JS，浏览器原生 import map |

## 1. 背景与现状

### 1.1 当前架构

```text
CN /                Vercel (sin1/hnd1) -> home-cn.html
                    纯静态快照，约 23KB transfer，无 React/antd；仅 1 个内联 stats 脚本

CN /todos, /about   Vercel (sin1/hnd1) -> index-cn.html
                    CSS / app entry / async chunks -> OSS 北京
                    react / react-dom / router / antd -> npmmirror tarball
                    tarball -> SHA-256 -> gunzip -> tar -> blob URL -> import map
                    /api/* -> Vercel rewrite -> swan-worker.312bdf.workers.dev -> D1

Global /            Vercel -> home.html
                    完整 React + antd；首屏快照在 hydrate 前带 inert

Global /todos       Vercel -> shell-global.html
                    /vendor/*、/static/* 随 Vercel 部署

API                 /api/* 同源 -> Vercel rewrite -> Worker -> D1
```

关键文件：

| 文件 | 作用 |
|---|---|
| `scripts/build-cn-html.ts` | 生成 `dist/index-cn.html`、`dist/home-cn.html`，注入 CN vendor loader |
| `scripts/cn-vendor-loader.ts` | CN 版内联 loader：npmmirror tarball → blob import map |
| `scripts/vendor-package-config.ts` | npm 包版本、tarball SHA-256、antd chunk 文件名锁 |
| `scripts/upload-oss.ts` | 把 `dist/static` 镜像到 OSS `static/` 前缀 |
| `scripts/build-vercel.ts` | 生成 `dist/vercel/`、`shell-global.html`、geo rewrite |
| `scripts/first-screen/generate.ts` | 生成 `home.html` 的首屏快照和 readiness 脚本 |
| `src/client/index.html` | 全局版 import map / modulepreload 模板 |
| `src/client/pages/TodosPage.tsx` | `/todos` 懒加载页，挂载后请求 `/api/todos` |

### 1.2 实测数据（2026-11-17）

**global 首页（代理出口 US，移动端 4x CPU，冷缓存）**

| 阶段 | 时间 |
|---|---|
| `DOMContentLoaded` | 约 2.4s |
| 快照 CTA 可点（hydrate 完成） | 约 2.7s |
| 点击 → `/todos` 首条数据（SPA） | 约 0.8–1.3s |
| 打开首页 → todos 数据 | 约 3.5s |

**CN shell（模拟 CN 首页 → `/todos`）**

| 资源 | 实测 |
|---|---|
| npmmirror tarball 248,372B（4 个大陆探针） | 200；TTFB 73–273ms；总 91–340ms |
| OSS app entry（4 个大陆探针） | 200；TTFB 34–59ms；总 142–246ms |
| OSS antd chunk | 200；gzip 143,757B；`immutable`；CORS 允许 `deephos.com` |
| `/api/todos`（大陆探针） | TTFB 294–676ms；总 579–2,653ms |
| API 同连接第二请求 | TTFB 约 0.25–0.37s |
| 点击 → 首条数据（模拟） | 约 1.5s |

**其他确认**

- `api.deephos.com` 当前 NXDOMAIN；Worker custom domain 只有 `bdf.cc.cd` / `fbd.cc.cd`。
- Vercel API rewrite 目标是 `https://swan-worker.312bdf.workers.dev`。
- OSS `/static/vendor/` 前缀走现有 Referer 规则：缺文件返回 404（不是 403），可直接使用。
- OSS `/vendor/` 前缀当前返回 403，不要用这个路径。
- 全局版 antd chunk 文件名锁：`lib-antd.e1ded704.mjs`；任何客户端模块图变化都可能改这个 hash。

## 2. 问题清单

| 优先级 | 问题 | 影响 |
|---|---|---|
| P0 | CN vendor 依赖 npmmirror tarball | 第三方可用性；失败要等满 4s 才 fallback；tarball 解析占 CPU |
| P0 | vendor 未上 OSS | OSS 已经托管 entry/async/CSS，vendor 是唯一的外部依赖 |
| P1 | CN shell 启动期间白屏 | 用户看不到反馈，体感比实际更慢 |
| P1 | global 首页快照 CTA 在 hydrate 前 `inert` | 用户看到按钮但点不动，白等 2s+ |
| P2 | `/todos` 懒加载 chunk + API 串行 | 点击后至少两段串行等待 |
| P3 | API 走 Vercel rewrite 再到 Worker | 多一跳；收益约 0.3s，优先级最低 |

## 3. 目标与非目标

### 目标

- CN 路径不再请求 `cdn.npmmirror.com`；vendor 与 entry/async/CSS 全部来自自有 OSS。
- CN `/todos` 点击到首条数据 < 1.5s（典型大陆网络），最坏情况不再出现 4s 白等。
- CN/global `/todos` 首帧有加载骨架，不再纯白屏。
- global 首页快照 CTA 在 hydrate 前可点；菜单按钮仍不可点。
- 不破坏现有零 JS 首页、antd UI 栈、CN/global 分流和 vendor hash 锁。

### 非目标

- 不更换 antd / React / React Router。
- 不把站点重新放回 Cloudflare 代理。
- 不为了性能牺牲首页的零 JS 特性（除非明确选择 hover 预取方案）。
- 不在本次计划里改产品交互或视觉设计。

## 4. 目标架构

```text
CN /                Vercel -> home-cn.html
                    纯静态；可选 prefetch /todos 关键资源

CN /todos, /about   Vercel -> index-cn.html
                    静态 import map：
                      react / react-dom / router -> OSS /static/vendor/*
                    app entry / async / CSS -> OSS /static/*
                    antd chunk -> OSS /static/js/lib-antd.<hash>.mjs（entry 相对 import 自动命中）
                    #root 内联加载骨架
                    /api/* -> Vercel rewrite -> Worker -> D1

Global /            Vercel -> home.html
                    快照 CTA 在 hydrate 前可点（pointer-events 放行）

Global /todos       Vercel -> shell-global.html
                    同源 /vendor/* + 加载骨架

API                 /api/* -> Vercel rewrite -> Worker -> D1（可选：浏览器直连 api.deephos.com）
```

## 5. 详细改动

### Phase 1（P0）：OSS per-file vendor + 静态 import map

**目标**：删除 CN vendor tarball loader 和 npmmirror 依赖，vendor 由 OSS 直接提供。

**改动文件**

| 文件 | 改动 |
|---|---|
| `scripts/upload-oss.ts` | 增加 `dist/vendor` → OSS `static/vendor/` 的上传 |
| `scripts/build-cn-html.ts` | 用静态 import map + modulepreload 替换 tarball loader |
| `scripts/cn-vendor-loader.ts` | 删除（或停止引用后删除） |
| `scripts/vendor-package-config.ts` | 移除 `cnVendorTarball()` / `tarballSha256` 的运行时用途；保留 antd 文件名锁 |
| `scripts/build-vendor-package.ts`、`.vendor-package/` | 保留为可选的 npm 版本化产物，但不再参与运行时 |
| `README.md` | 实施后更新 CN vendor 章节和实测数据 |

**实施步骤**

1. `upload-oss.ts` 增加 vendor 上传：
   - 复用现有的 gzip + `Cache-Control: public, max-age=31536000, immutable` 逻辑。
   - OSS key 为 `static/vendor/<filename>`，与 CN HTML 中的 URL 一一对应。
   - 校验 `dist/vendor` 存在，否则构建失败。
2. `build-cn-html.ts` 生成静态 import map：
   - 从 `dist/vendor` 读取实际文件名（或复用 `build-vendor.ts` 的版本常量），不要硬编码 React 版本。
   - 生成：

     ```html
     <script type="importmap">
     {
       "imports": {
         "react": "https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/react-19.3.1.mjs",
         "react/jsx-runtime": "https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/react-19.3.1.mjs",
         "react-dom": "https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/react-dom-19.3.1.mjs",
         "react-dom/client": "https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/react-dom-19.3.1.mjs",
         "react-router": "https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/router-8.5.1.mjs",
         "react-router/dom": "https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/router-8.5.1.mjs"
       }
     }
     </script>
     <link rel="modulepreload" href="…/static/vendor/react-19.3.1.mjs" />
     <link rel="modulepreload" href="…/static/vendor/react-dom-19.3.1.mjs" />
     <link rel="modulepreload" href="…/static/vendor/router-8.5.1.mjs" />
     ```

   - import map 必须排在所有 module 加载之前（现有注释里的约束继续适用）。
   - app entry 仍从 OSS 加载；entry 里的 `import "./lib-antd.<hash>.mjs"` 会相对解析到 OSS `/static/js/lib-antd.<hash>.mjs`，不需要额外 import map 条目。
   - 删除 `preconnect` / `preload` 指向 npmmirror 的标签，删除内联 loader。
   - `meta name="swan-vendor"` 改为 `cn-oss-importmap`。
3. 校验逻辑更新：
   - 断言 `dist/index-cn.html` 包含 OSS vendor URL、OSS entry、OSS antd URL。
   - 断言不包含 `cdn.npmmirror.com`、`cn-vendor-loader`、`DecompressionStream`、tarball 字符串。
   - 断言 `dist/static/js/lib-antd.<hash>.mjs` 存在，hash 与 `VENDOR_PACKAGE.antdFile` 一致。
4. 删除 `cn-vendor-loader.ts` 的引用；确认没有其他文件 import 它。
5. 更新 `README.md` 的 CN vendor 说明（实施完成后）。

**验证**

```bash
bun run build
grep -c 'npmmirror' dist/index-cn.html          # 期望 0
grep -o 'static/vendor/[^"]*' dist/index-cn.html
grep -o 'lib-antd\.[a-f0-9]*\.mjs' dist/index-cn.html
bun run check:first-screen
```

OSS 上传后验证（不要把密钥写进 shell 历史，使用本地 env）：

```bash
curl -sS -o /dev/null -D - \
  -H 'Referer: https://deephos.com/' \
  https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/react-19.3.1.mjs
# 期望 200 + Content-Encoding: gzip + Cache-Control: immutable + CORS
```

浏览器验证：
- `/todos` 网络面板中 vendor 来自 `deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/`。
- 没有 `cdn.npmmirror.com` 请求。
- 没有 `blob:` module 请求。
- `/todos` CRUD 正常。

**回滚**：回退本阶段提交；OSS 文件是新增的，不影响旧 HTML；重新部署上一版 Vercel。

---

### Phase 2（P1）：`/todos` 加载骨架

**目标**：CN/global 的 `/todos`、`/about` 在 React 启动前显示应用外壳骨架，消灭白屏。

**改动文件**

| 文件 | 改动 |
|---|---|
| `scripts/loading-shell.ts`（新增） | 提供 `injectLoadingShell(html)`，注入骨架 HTML + 内联 CSS |
| `scripts/build-cn-html.ts` | 对 `index-cn.html` 调用 `injectLoadingShell` |
| `scripts/build-vercel.ts` | 对 `shell-global.html` 调用 `injectLoadingShell` |
| `src/client/main.tsx` | 仅在 React 不清空 `#root` 时需要 `container.replaceChildren()`；否则不动 |

**骨架结构**

```html
<div id="root">
  <div class="swan-boot" aria-hidden="true">
    <div class="swan-boot-sider"></div>
    <div class="swan-boot-main">
      <div class="swan-boot-header"></div>
      <div class="swan-boot-card"></div>
      <div class="swan-boot-card"></div>
    </div>
  </div>
</div>
<style>
  /* 唯一前缀 swan-boot-，内联，不依赖 OSS CSS */
  /* 桌面：左侧栏 + 顶栏 + 两张卡片；移动端隐藏侧栏 */
</style>
```

**实施步骤**

1. 新建 `scripts/loading-shell.ts`，骨架 HTML/CSS 用一个函数生成，桌面/移动端用媒体查询适配。
2. `build-cn-html.ts` 在写出 `index-cn.html` 前注入；`build-vercel.ts` 在复制 `index.html` 为 `shell-global.html` 后注入。
3. 确认 React `createRoot(container).render()` 会清空 `#root` 的占位内容；如果不清理，在 `src/client/main.tsx` 里 `container.replaceChildren()`。
   - 这会改变 entry chunk hash（`index.<hash>.mjs`），但**不应改变** `lib-antd.<hash>.mjs`；构建后跑 `build:cn-html` 验证 vendor 锁。
4. 骨架尺寸尽量贴近真实布局，减少 CLS；颜色使用 `--swan-bg` / `--swan-panel` / `--swan-border` 的 fallback 值。
5. 骨架不要放进 `home.html` / `home-cn.html`：首页已有首屏快照。

**验证**
- 网络限速到 Fast 3G，导航到 `/todos`，首帧在 100ms 内出现骨架。
- React 渲染后骨架完全消失，无重复内容、无明显布局跳动。
- `/about` 同样生效。
- `bun run check:first-screen` 仍通过（首页快照不受影响）。

**回滚**：移除注入调用；无运行时依赖。

---

### Phase 3（P1）：global 首页快照 CTA 在 hydrate 前可点

**目标**：global `home.html` 的快照 CTA（`href="/todos"`）在 React hydrate 前就能点击；菜单按钮继续保持不可点。

**改动文件**

| 文件 | 改动 |
|---|---|
| `scripts/first-screen/generate.ts` | 给快照里的 CTA 加标记；快照容器去掉 `inert`；加 pointer-events CSS；给快照内可聚焦元素加 `tabindex="-1"` |
| `scripts/build-cn-html.ts` | 静态 CN 首页覆盖 pointer-events 规则，确保所有链接可点 |

**实施步骤**

1. 在 `generate.ts` 生成快照 HTML 后，对桌面/移动两份快照里的 `<a href="/todos">` 加 `data-swan-snapshot-cta`。
2. 快照容器从：

   ```html
   <div id="swan-first-screen" aria-hidden="true" inert>
   ```

   改为：

   ```html
   <div id="swan-first-screen" aria-hidden="true">
   ```

3. 在首屏 CSS 中加入：

   ```css
   #swan-first-screen { pointer-events: none; }
   #swan-first-screen [data-swan-snapshot-cta] { pointer-events: auto; }
   ```

   这样只有 CTA 接收点击，菜单按钮和其他快照元素不接收点击。
4. 给快照内所有 `a` / `button` 加 `tabindex="-1"`，避免 `aria-hidden` 容器里出现可聚焦元素。CTA 因此是鼠标/触屏可点、键盘不可聚焦；键盘用户等 hydrate 后的真实 CTA。这是有意的取舍，需要在代码注释和 README 里写明。
5. 静态 CN 首页（`home-cn.html`）会把快照保留为最终页面，必须覆盖：

   ```css
   #swan-first-screen, #swan-first-screen * { pointer-events: auto; }
   ```

   或直接在 `STATIC_HOME_STYLE` 里移除/覆盖 Phase 3 的 pointer-events 规则。菜单按钮继续由现有 CSS 隐藏。
6. readiness 脚本不变：hydrate 完成后移除快照，React 的真实 CTA 接管 SPA 跳转。

**验证**
- 清空缓存，打开 global `/`，在快照可见但 React 未 hydrate 时点击 CTA：
  - 浏览器开始导航到 `/todos`（全量跳转），不出现“点了没反应”。
- 菜单按钮在 hydrate 前点击无效；hydrate 后正常。
- hydrate 后点击 CTA 仍是 SPA 跳转（`location.pathname` 变化、无新 document 请求）。
- 键盘 Tab 在 hydrate 前不会进入快照；hydrate 后能聚焦真实 CTA。
- 静态 CN 首页的 CTA 和菜单锚点仍可点。

**回滚**：恢复 `inert` 和原 CSS；重新生成 first-screen。

---

### Phase 4（P2，可选）：CN 首页预取 `/todos`

**目标**：用户从 CN 静态首页点击 `/todos` 前，关键资源已在缓存里。

**方案 A：纯 HTML prefetch（推荐先做）**

在 `home-cn.html` 的 `<head>` 加低优先级提示：

```html
<link rel="prefetch" href="https://deephos-static.oss-cn-beijing.aliyuncs.com/static/js/index.<hash>.mjs" />
<link rel="prefetch" href="https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/react-dom-19.3.1.mjs" />
```

- 只预取小文件（entry + 可能用到的 vendor），不要默认预取 250KB 的 antd/vendor 全集，避免首页流量浪费。
- `rel="prefetch"` 是低优先级，不阻塞首页 LCP。
- `/todos` 的 async chunks 需要构建清单；可在 Rsbuild 开启 `output.manifest`，由 `build-cn-html.ts` 读取后注入精确的 route chunk prefetch。

**方案 B：hover/touch 预取（需要加约 0.3KB JS）**

- 在 CTA 上监听 `mouseenter` / `touchstart`，动态创建 `<link rel="prefetch">` 或 `fetch()` 预热 entry、vendor、antd 和 async chunks。
- 优点：只有有意图的用户才付出带宽。
- 缺点：破坏“零 JS 首页”的卖点；需要单独评审。

**验证**
- 首页 LCP 不退化；首页 transfer 不因预取而显著增加。
- 点击 `/todos` 后，entry/vendor 命中缓存（Network 面板 `(memory cache)` / `(disk cache)`）。
- 移动端 hover 不触发；touchstart 触发。

**回滚**：移除 prefetch 标签/脚本。

---

### Phase 5（P3，可选）：API 直连 `api.deephos.com`

**目标**：去掉 `/api/*` 的 Vercel rewrite 跳，浏览器直接连 Worker。

**前置条件**

- `api.deephos.com` 当前 NXDOMAIN；需要给 Worker 添加 Custom Domain（Cloudflare Workers & Pages → `swan-worker` → Settings → Domains & Routes → Add custom domain）。
- 确认 Cloudflare 自动创建的 DNS 记录不与 apex 的 Vercel CNAME 冲突。
- Hono 已有 `cors()`；确认允许 `https://deephos.com`。

**实施步骤**

1. 添加 Worker custom domain `api.deephos.com`，验证 HTTPS 和 `/api/health`。
2. 客户端 API base 改为 `https://api.deephos.com/api`（构建时注入或按 hostname 判断）。
3. 在 `index-cn.html` / `shell-global.html` 加：

   ```html
   <link rel="preconnect" href="https://api.deephos.com" crossorigin />
   ```

4. 保留 Vercel rewrite 作为兼容路径；观察是否还有请求走它。
5. 测量 CN/global 的 API TTFB，确认收益 ≥ 0.2s 再保留。

**验证**
- `/api/todos` GET/POST/PATCH/DELETE 全部正常。
- CORS 预检通过；无 console CORS 错误。
- CN 探针 API TTFB 下降；global 不退化。

**回滚**：客户端 API base 切回同源 `/api`；保留 custom domain 不影响。

---

## 6. 执行顺序与预估

| 阶段 | 优先级 | 依赖 | 预估 | 可独立上线 |
|---|---|---|---|---|
| Phase 0：基线 & 分支 | — | — | 0.5h | — |
| Phase 1：OSS per-file vendor | P0 | OSS 上传权限 | 0.5–1d | 是 |
| Phase 2：加载骨架 | P1 | Phase 1 可并行 | 0.5d | 是 |
| Phase 3：快照 CTA | P1 | 无 | 0.5d | 是 |
| Phase 4：预取 | P2 | Phase 1 的 OSS 文件 | 0.5d | 是 |
| Phase 5：API 直连 | P3 | Worker custom domain | 0.5d | 是 |

建议按 1 → 2 → 3 上线；4/5 观察一周后再决定。

## 7. 验证计划

### 7.1 构建与静态检查

```bash
bun run fmt:check
bun run check
bun run build
bun run check:first-screen
```

断言：

- `dist/index-cn.html` 不含 `cdn.npmmirror.com`、`cn-vendor-loader`、`DecompressionStream`。
- `dist/index-cn.html` 含 OSS vendor URL、OSS entry、`lib-antd.<hash>.mjs`。
- `lib-antd.<hash>.mjs` 与 `VENDOR_PACKAGE.antdFile` 一致；否则先 bump vendor 包。
- `dist/vercel/shell-global.html` 含加载骨架。
- `dist/home.html` 的 CTA 带 `data-swan-snapshot-cta`，快照容器不再有 `inert`。

### 7.2 本地/预览

- `bun run preview` 或 `cd dist/vercel && bunx vercel dev`。
- 用 Playwright/agent-browser 跑：
  - CN 变体（route 拦截或真实 CN 探针）：`/` → 点击 CTA → `/todos` 首条数据时间、网络请求列表、骨架首帧时间。
  - global 变体：hydrate 前点击 CTA、hydrate 后 SPA 点击、菜单按钮。
  - `/about`、404、移动端布局。

### 7.3 线上探测

Globalping（CN 探针）：

- `https://deephos.com/`：`content-disposition: home-cn.html`，`server: Vercel`，无 `cf-ray`。
- `https://deephos.com/todos`：`content-disposition: index-cn.html`。
- `https://deephos.com/api/todos`：TTFB/总耗时。
- 检查 HTML 中不再出现 npmmirror。

OSS：

```bash
curl -sS -o /dev/null -D - -H 'Referer: https://deephos.com/' \
  https://deephos-static.oss-cn-beijing.aliyuncs.com/static/vendor/react-19.3.1.mjs
```

期望：`200`、`Content-Encoding: gzip`、`Cache-Control: public, max-age=31536000, immutable`、CORS 允许 `https://deephos.com`。

### 7.4 回归清单

- [ ] CN `/` 静态首页正常，stats 脚本更新数字。
- [ ] CN `/todos` 首屏骨架、数据加载、CRUD、筛选、搜索、清理已完成。
- [ ] CN `/about` 正常。
- [ ] global `/` 快照、hydrate、CTA、菜单。
- [ ] global `/todos` 正常。
- [ ] 移动端菜单、CTA、布局。
- [ ] 无 console error / 无 404 / 无 CORS error。
- [ ] `lib-antd` hash 未意外变化。

## 8. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| OSS `/static/vendor/` 被 Referer 规则拦截 | CN vendor 403，白屏 | 已验证缺文件返回 404（前缀允许）；上传后立即用带 Referer 的 curl 验证 |
| 旧浏览器不支持 import map | CN shell 白屏 | 当前 loader 也依赖 import map；目标现代浏览器；如需兼容，保留一个极小的 fallback 脚本（会增加 JS） |
| 客户端改动导致 `lib-antd` hash 变化 | `build:cn-html` 报错 | 优先只改构建脚本；如必须改客户端，先 bump `@meteor957/swan-vendor` 并更新 `VENDOR_PACKAGE.antdFile` |
| React 不清空 `#root` 骨架 | 骨架和 App 同时出现 | 验证；必要时在 `main.tsx` 调用 `container.replaceChildren()`（只改 entry hash） |
| 快照 CTA 可点带来 a11y 问题 | 键盘/读屏体验 | CTA 仅鼠标/触屏；快照内元素 `tabindex="-1"`；hydrate 后真实 CTA 可聚焦；在 README 注明 |
| 预取浪费带宽 | 首页流量增加 | 只 prefetch 小文件；大文件用 hover/touch；观察后再扩大 |
| API custom domain DNS/SSL/CORS | API 不可用 | 保留 Vercel rewrite；先加 domain 验证 health，再切客户端 |
| OSS 上传失败但 HTML 已发布 | CN shell 引用不存在的 vendor | CI 先 `upload:oss` 再部署 Vercel；上传失败即中止；OSS 文件名 immutable，无需 purge |
| 回滚 | — | 回退提交 + 重新部署上一版 Vercel；OSS 新增文件可保留；Worker 不变 |

## 9. 验收标准

- CN `/todos` 点击到首条数据 < 1.5s（典型大陆网络），最坏情况无 4s 白等。
- CN `/todos` 网络面板无 `cdn.npmmirror.com`、无 `blob:` module；vendor 来自 OSS。
- CN `/todos` 首帧 100ms 内出现骨架。
- global 首页快照 CTA 在 hydrate 前可点；菜单按钮仍不可点；hydrate 后 SPA 正常。
- `bun run fmt:check`、`bun run check`、`bun run check:first-screen` 全绿。
- `lib-antd.e1ded704.mjs` 未被意外改名；CN/global 分流、CRUD、移动端均无回归。
- OSS vendor 文件返回 200、gzip、immutable、CORS 正确。

## 10. 待决策

1. **npmmirror 去留**：推荐完全移除，OSS per-file 作为唯一来源；如果担心 OSS 单点，可保留 npmmirror 作为可选备用（但需要 race/超时逻辑，复杂度回升）。
2. **预取策略**：不做 / 纯 HTML prefetch / hover 脚本。推荐先做纯 HTML 小文件 prefetch，观察一周。
3. **快照 CTA 方案**：pointer-events + `tabindex="-1"`（推荐，改动小）vs 保持 `inert`（不改 a11y，但保留 2s 等待）vs 额外 overlay 链接（a11y 最好，实现复杂）。
4. **API 直连**：现在做还是等 Phase 1–3 稳定后再评估；`api.deephos.com` 需要新增 Worker custom domain。

## 附录 A：当前关键路径（供对照）

```text
CN /:
  Vercel home-cn.html (23KB transfer) -> 首屏快照 + stats 脚本

CN /todos:
  Vercel index-cn.html (8KB)
    -> OSS CSS / entry / async chunks
    -> npmmirror tarball 243KB -> SHA-256 -> gunzip -> tar -> blob import map
    -> React mount -> lazy TodosPage chunk -> /api/todos -> Vercel rewrite -> Worker -> D1

Global /:
  Vercel home.html -> 首屏快照（inert）-> vendor/antd/entry -> hydrate -> CTA 可点

Global /todos:
  Vercel shell-global.html -> /vendor + /static -> React mount -> lazy chunk -> /api/todos
```

## 附录 B：常用命令

```bash
# 构建
bun run build

# 只重建 CN HTML / Vercel 产物
bun run build:cn-html
bun run build:vercel

# 检查
bun run fmt:check
bun run check
bun run check:first-screen

# 上传 OSS（本地需要 env；CI 用 secrets）
bun run upload:oss

# 本地预览
bun run preview

# 部署 Vercel（CI 自动执行；手动时）
cd dist/vercel && bunx vercel deploy . --prod --yes

# 部署 Worker（API）
bun run deploy
```

## 附录 C：文件变更清单

| 文件 | 类型 | 阶段 |
|---|---|---|
| `scripts/upload-oss.ts` | 修改 | 1 |
| `scripts/build-cn-html.ts` | 修改 | 1, 2, 3, 4 |
| `scripts/cn-vendor-loader.ts` | 删除 | 1 |
| `scripts/vendor-package-config.ts` | 修改 | 1 |
| `scripts/loading-shell.ts` | 新增 | 2 |
| `scripts/build-vercel.ts` | 修改 | 2 |
| `scripts/first-screen/generate.ts` | 修改 | 3 |
| `src/client/main.tsx` | 条件修改 | 2 |
| `README.md` | 修改 | 实施后 |
| `docs/cn-shell-performance-plan.md` | 新增 | 本计划 |
