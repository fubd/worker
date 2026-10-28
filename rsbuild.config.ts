import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
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
    // 便于在 Worker 端调试
    sourceMap: {
      js: 'source-map',
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
});
