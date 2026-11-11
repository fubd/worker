import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// R2 上的 react 系模块。换域名时这里和 src/client/index.html 的 importmap 要一起改
const VENDOR_ORIGIN = 'https://fbd-oss.cc.cd';
const VENDOR_ENTRIES = [
  // 先列 impl：它们是真正的实现，体积最大，且是 wrapper 的依赖。
  // modulepreload 不会递归预加载依赖，不显式列出就会晚一个 RTT 才被发现
  'react.impl.mjs',
  'react-dom.impl.mjs',
  // wrapper：把 importmap 的裸模块名映射到 impl
  'react.mjs',
  'react-jsx-runtime.mjs',
  'react-dom.mjs',
  'react-dom-client.mjs',
];

export default defineConfig(({ command }) => ({
  plugins: [pluginReact()],

  source: {
    entry: {
      index: './src/client/main.tsx',
    },
    // 别名 @/* 由 tsconfig.json 的 compilerOptions.paths 提供，
    // Rspack 的 resolve.tsConfig 会自动读取，无需在这里重复声明。
  },

  html: {
    template: './src/client/index.html',
    favicon: './public/favicon.svg',
    meta: {
      description: 'Bun + React 19 + Ant Design 6 + Hono + Cloudflare D1 on Workers',
      viewport: 'width=device-width, initial-scale=1',
      'theme-color': '#ffffff',
    },
    // importmap 里的模块只能等浏览器解析到 app chunk 的 import 才发现。
    // 这里按「先建连、再预加载」的顺序注入：preconnect → dns-prefetch → modulepreload，
    // 让 React 与首屏 JS 并行下载。modulepreload 不会递归预加载依赖，
    // 所以 impl 文件必须显式列在 VENDOR_ENTRIES 里。
    // dev 下 react 由 bundler 解析，不需要这些标签
    tags:
      command === 'build'
        ? [
            {
              tag: 'link',
              attrs: { rel: 'preconnect', href: VENDOR_ORIGIN, crossorigin: true },
              head: true,
              append: false,
              publicPath: false,
            },
            {
              tag: 'link',
              attrs: { rel: 'dns-prefetch', href: VENDOR_ORIGIN },
              head: true,
              append: false,
              publicPath: false,
            },
            ...VENDOR_ENTRIES.map((file) => ({
              tag: 'link',
              attrs: {
                rel: 'modulepreload',
                href: `${VENDOR_ORIGIN}/${file}`,
                crossorigin: true,
              },
              head: true,
              append: false,
              publicPath: false,
            })),
          ]
        : undefined,
  },

  output: {
    distPath: {
      root: './dist',
    },
    // 让 Worker 静态资源绑定直接读取 dist 目录
    cleanDistPath: true,
    assetPrefix: '/',
    // 生产环境不打 source map：体积占 dist 的 80%，而且会被公开访问，
    // 等于把源码送到浏览器。需要排查线上问题时改成 'hidden-source-map' 并私有托管。
    sourceMap: command === 'dev' ? { js: 'source-map' } : false,
    // 不生成 *.js.LICENSE.txt（默认 'linked' 会把三方库的 license 注释抽成单独文件）
    legalComments: 'none',
    // 输出 ES Module：产物为 .mjs + <script type="module">，去掉 IIFE 包装和 chunk 注册表
    module: true,
    // 生产构建把 react 系模块外部化，改由 importmap 指向 R2 上的 vendor 文件提供；
    // dev 不外部化，保证 HMR 与依赖解析走 bundler
    externals:
      command === 'build'
        ? {
            react: 'react',
            'react/jsx-runtime': 'react/jsx-runtime',
            'react-dom': 'react-dom',
            'react-dom/client': 'react-dom/client',
          }
        : undefined,
    // 模块脚本必须按真实 MIME 提供，Cloudflare 静态资源按扩展名推断，.mjs → text/javascript
    filename: {
      js: '[name].[contenthash:8].mjs',
    },
  },

  server: {
    port: 3000,
    host: 'localhost',
    proxy: {
      // 本地开发时把 /api 转发给 wrangler dev（默认 8787）
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },

  // 2.3 起 performance.chunkSplit 已废弃，改用顶层 splitChunks。
  // preset: 'default' 等价于原来的 split-by-experience，且会保留 plugin-react 的 lib-router 分组
  splitChunks: {
    preset: 'default',
    cacheGroups: {
      // antd 及其底层 rc-* 组件单独成块：它们体积大、版本稳定，
      // 与业务代码分离后，改业务代码不会让用户重新下载这 500 kB。
      // chunks: 'initial' 保证只从首屏图里提取，懒加载路由用的组件仍留在 async chunk
      'lib-antd': {
        name: 'lib-antd',
        test: /node_modules[\\/](?:antd|@ant-design|rc-[^\\/]+|@rc-component)[\\/]/,
        chunks: 'initial',
        priority: 10,
      },
    },
  },

  performance: {
    // Rspack 持久化构建缓存：二次构建复用未变更模块，缓存目录默认 node_modules/.cache
    buildCache: true,
  },
}));
