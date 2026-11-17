/**
 * 构建期静态页（首页快照 / about 快照）共用的菜单、遮罩与样式。
 *
 * 快照里的桌面 sider 是真实锚点；移动端由脚本克隆 sider 到固定面板，
 * 交互与 SPA 的移动抽屉一致。
 */
export const STATIC_PAGE_STYLE = `<style id="swan-static-home-style">
  /* 静态页就是最终页面：快照里的链接/按钮全部可点 */
  #swan-first-screen, #swan-first-screen * { pointer-events: auto; }
  /* 快照里捕获的是关闭状态的 SPA 移动抽屉/遮罩，不能拦截点击；静态菜单用自己的面板 */
  #swan-first-screen .swan-mobile-backdrop,
  #swan-first-screen .swan-mobile-panel { pointer-events: none !important; }
  #swan-first-screen .swan-header button[aria-label="收起菜单"] { display: none; }
  #swan-first-screen .swan-sider .swan-menu-item,
  #swan-first-screen .swan-sider .swan-menu-item * { transition: background-color 0.2s, color 0.2s !important; }
  #swan-static-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }
  #swan-static-backdrop.is-open { opacity: 1; pointer-events: auto; }
  #swan-static-menu {
    position: fixed; top: 0; left: 0; bottom: 0; width: 264px; max-width: 82vw;
    background: #fff; z-index: 1000; box-shadow: 0 0 24px rgba(15, 23, 42, 0.18);
    transform: translateX(-100%); pointer-events: none; transition: transform 0.2s ease;
    overflow-y: auto;
  }
  #swan-static-menu.is-open { transform: translateX(0); pointer-events: auto; }
  #swan-static-menu .swan-sider { width: 100% !important; max-width: none !important; min-width: 0 !important; height: auto; border-right: 0; }
  #swan-static-menu > a { display: block; padding: 10px 16px; color: #0f172a; font-size: 14px; text-decoration: none; }
</style>`;

export const STATIC_MENU = `<div id="swan-static-backdrop"></div>
<nav id="swan-static-menu" aria-hidden="true" aria-label="站点导航"></nav>`;

export const STATIC_MENU_SCRIPT = `<script id="swan-static-home-menu">
(function () {
  var btn = document.querySelector('#swan-first-screen .swan-header button[aria-label="打开菜单"]');
  var menu = document.getElementById('swan-static-menu');
  var backdrop = document.getElementById('swan-static-backdrop');
  if (!btn || !menu || !backdrop) return;
  var sider = document.querySelector('#swan-first-screen .swan-sider');
  if (sider) {
    var clone = sider.cloneNode(true);
    clone.removeAttribute('style');
    menu.appendChild(clone);
  } else {
    menu.innerHTML = '<a href="/">概览</a><a href="/todos">待办 Demo</a><a href="/about">技术栈</a>';
  }
  function set(open) {
    menu.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', function () { set(!menu.classList.contains('is-open')); });
  backdrop.addEventListener('click', function () { set(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') set(false); });
})();
</script>`;
