export const HOME_VISITOR_TEXT = {
  primary: '开始写作',
  nav: '登录',
  footer: '登录雨燕',
  path: '/login',
} as const;

export const HOME_MEMBER_TEXT = {
  primary: '进入文档',
  nav: '进入文档',
  footer: '打开文档',
  path: '/docs',
} as const;

const PRIMARY_LINK = '[data-swan-public-home="primary"]';
const NAV_LOGIN = '[data-swan-public-home="nav"]';
const FOOTER_LOGIN = '[data-swan-public-home="footer"]';

function isHome(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '' || path === '/index.html';
}

function showMemberHome(options: { navigation: boolean }): void {
  const navigate = (path: string) => {
    if (options.navigation) {
      window.location.assign(path);
    } else {
      window.location.replace(path);
    }
  };

  for (const [kind, selector] of [
    ['primary', PRIMARY_LINK],
    ['nav', NAV_LOGIN],
    ['footer', FOOTER_LOGIN],
  ] as const) {
    const anchor = document.querySelector<HTMLAnchorElement>(selector);
    const text = anchor?.firstChild;
    if (!anchor) continue;
    anchor.href = HOME_MEMBER_TEXT.path;
    anchor.onclick = (event) => {
      event.preventDefault();
      navigate(HOME_MEMBER_TEXT.path);
    };
    if (text?.nodeType === Node.TEXT_NODE) text.textContent = HOME_MEMBER_TEXT[kind];
  }
}

function prepareVisitorNavigation(): void {
  for (const selector of [PRIMARY_LINK, NAV_LOGIN, FOOTER_LOGIN]) {
    const anchor = document.querySelector<HTMLAnchorElement>(selector);
    if (!anchor) continue;
    anchor.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        window.location.assign(new URL(anchor.getAttribute('href') ?? '/', window.location.href));
      },
      { once: true },
    );
  }
}

async function detectHomeSession(
  requestSession: () => Promise<unknown>,
): Promise<'authenticated' | 'unauthenticated'> {
  if (typeof window === 'undefined') {
    return 'authenticated';
  }

  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  if (!isHome()) return 'authenticated';

  prepareVisitorNavigation();
  try {
    await requestSession();
  } catch {
    return 'unauthenticated';
  }
  if (isHome()) showMemberHome({ navigation: false });
  return 'authenticated';
}

export function syncHomeSession(
  requestSession: () => Promise<unknown>,
): Promise<'authenticated' | 'unauthenticated'> {
  const result = detectHomeSession(requestSession);
  if (typeof window === 'undefined' || !isHome()) return result;
  return Promise.race([
    result,
    new Promise<'unauthenticated'>((resolve) => {
      window.setTimeout(() => resolve('unauthenticated'), 3_000);
    }),
  ]);
}
