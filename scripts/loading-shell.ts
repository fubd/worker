/**
 * 给 SPA shell 注入首帧加载骨架：React 启动前 #root 不再纯白。
 *
 * 只注入 index-cn.html 和 shell-global.html；首页有首屏快照，不注入。
 * 骨架用内联 CSS 和唯一前缀，不依赖尚未加载的 OSS/Vercel CSS。
 * React 挂载前由 src/client/main.tsx 的 container.replaceChildren() 清空。
 */
const SHELL_STYLE = `<style id="swan-boot-style">
  #root { min-height: 100vh; background: var(--swan-bg, #f4f7fb); }
  .swan-boot { display: flex; min-height: 100vh; }
  .swan-boot-sider { width: 240px; flex: 0 0 240px; background: var(--swan-panel, #fff); border-right: 1px solid var(--swan-border, #e9ebf0); }
  .swan-boot-main { flex: 1; min-width: 0; padding: 24px; }
  .swan-boot-header { height: 32px; width: 180px; border-radius: 8px; background: var(--swan-skeleton, #e9eef5); margin-bottom: 24px; }
  .swan-boot-card { height: 120px; border-radius: 12px; background: var(--swan-skeleton, #e9eef5); margin-bottom: 16px; }
  @media (max-width: 991.98px) {
    .swan-boot-sider { display: none; }
    .swan-boot-main { padding: 16px; }
    .swan-boot-header { height: 28px; width: 140px; }
    .swan-boot-card { height: 96px; }
  }
</style>`;

const SHELL_ROOT = `<div id="root"><div class="swan-boot" aria-hidden="true"><div class="swan-boot-sider"></div><div class="swan-boot-main"><div class="swan-boot-header"></div><div class="swan-boot-card"></div><div class="swan-boot-card"></div></div></div></div>`;

export function injectLoadingShell(html: string): string {
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('loading shell: <div id="root"></div> not found');
  }
  return html
    .replace('</head>', `    ${SHELL_STYLE}\n  </head>`)
    .replace('<div id="root"></div>', SHELL_ROOT);
}
