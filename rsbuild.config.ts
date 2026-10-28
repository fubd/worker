import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

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

  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  },
}));
