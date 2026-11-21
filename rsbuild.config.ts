import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [pluginReact()],

  environments: {
    web: {
      source: {
        entry: {
          index: './src/client/main.tsx',
        },
        // 别名 @/* 由 tsconfig.json 的 compilerOptions.paths 提供。
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
        target: 'web',
        distPath: {
          root: './dist',
        },
        cleanDistPath: true,
        assetPrefix: '/',
        sourceMap: command === 'dev' ? { js: 'source-map' } : false,
        legalComments: 'none',
        module: true,
        filename: {
          js: '[name].[contenthash:8].mjs',
        },
        inlineStyles: {
          enable: 'auto',
          test: ({ name, size }: { name: string; size: number }) =>
            name.includes('/css/') && size <= 50_000,
        },
      },

      splitChunks: {
        preset: 'default',
        cacheGroups: {
          'lib-antd': {
            name: 'lib-antd',
            test: /node_modules[\\/](?:antd|@ant-design|rc-[^\\/]+|@rc-component)[\\/]/,
            chunks: 'initial',
            priority: 10,
          },
        },
      },

      performance: {
        buildCache: true,
      },
    },

    node: {
      source: {
        entry: {
          server: './src/client/server-entry.tsx',
        },
      },

      output: {
        target: 'node',
        distPath: {
          root: './dist/server',
        },
        cleanDistPath: false,
        sourceMap: false,
        legalComments: 'none',
        module: true,
        autoExternal: true,
        filename: {
          js: '[name].mjs',
        },
        inlineStyles: false,
      },

      splitChunks: false,

      performance: {
        buildCache: true,
      },
    },
  },

  server: {
    port: 3000,
    host: 'localhost',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
}));
