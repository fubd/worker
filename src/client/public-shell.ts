const HOME_SESSION_COOKIE = 'yuyan_has_session';

const PRIMARY_LINK = '.swan-home-actions .swan-public-button.is-primary';
const NAV_LOGIN = '.swan-public-login';
const FOOTER_LOGIN = '.swan-public-footer a';

function isHome(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '' || path === '/index.html';
}

function resetHomePresentation(): void {
  const signedIn = document.cookie.includes(`${HOME_SESSION_COOKIE}=1`);
  const primary = document.querySelector<HTMLAnchorElement>(PRIMARY_LINK);
  if (primary?.firstChild) {
    primary.href = signedIn ? '/docs' : '/login';
    primary.firstChild.textContent = signedIn ? '进入文档' : '开始写作';
  }
  const nav = document.querySelector<HTMLAnchorElement>(NAV_LOGIN);
  if (nav) {
    nav.href = signedIn ? '/docs' : '/login';
    nav.textContent = signedIn ? '进入文档' : '登录';
  }
  const footer = document.querySelector<HTMLAnchorElement>(FOOTER_LOGIN);
  if (footer) {
    footer.href = signedIn ? '/docs' : '/login';
    footer.textContent = signedIn ? '打开文档' : '登录雨燕';
  }
}

if (isHome()) resetHomePresentation();
