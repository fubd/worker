const HOME_SESSION_COOKIE = 'yuyan_has_session';

export const HOME_SESSION_TEXT =
  typeof document !== 'undefined' && document.cookie.includes(`${HOME_SESSION_COOKIE}=1`)
    ? {
        primary: '进入文档',
        nav: '进入文档',
        footer: '打开文档',
        path: '/docs',
      }
    : {
        primary: '开始写作',
        nav: '登录',
        footer: '登录雨燕',
        path: '/login',
      };

const PRIMARY_LINK = '[data-swan-public-home="primary"]';
const NAV_LOGIN = '[data-swan-public-home="nav"]';
const FOOTER_LOGIN = '[data-swan-public-home="footer"]';
const dataKey = {
  primary: 'swanPublicHomePrimary',
  nav: 'swanPublicHomeNav',
  footer: 'swanPublicHomeFooter',
} as const;

function isHome(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '' || path === '/index.html';
}

function resetHomePresentation(): void {
  for (const [kind, selector] of [
    ['primary', PRIMARY_LINK],
    ['nav', NAV_LOGIN],
    ['footer', FOOTER_LOGIN],
  ] as const) {
    const anchor = document.querySelector<HTMLAnchorElement>(selector);
    const text = anchor?.firstChild;
    if (!anchor || !text || !window[dataKey[kind]]) continue;
    anchor.href = HOME_SESSION_TEXT.path;
    delete window[dataKey[kind]];
    if (text.nodeType === Node.TEXT_NODE) text.textContent = HOME_SESSION_TEXT[kind];
  }
}

if (
  typeof window !== 'undefined' &&
  isHome() &&
  document.documentElement.hasAttribute('data-swan-public-shell')
) {
  resetHomePresentation();
}
