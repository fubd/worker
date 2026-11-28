import { SERVER_HOME_AUTH_META } from '@/shared/home-session';

import type { AuthSessionResponse } from '@/shared/types';

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

export function isServerVerifiedHome(): boolean {
  return document.querySelector(SERVER_HOME_AUTH_META) !== null;
}

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

function hasSessionUser(session: unknown): boolean {
  return (
    typeof session === 'object' &&
    session !== null &&
    'user' in session &&
    typeof session.user === 'object' &&
    session.user !== null
  );
}

async function detectHomeSession(
  requestSession: () => Promise<AuthSessionResponse>,
): Promise<'authenticated' | 'unauthenticated'> {
  if (typeof window === 'undefined') {
    return 'authenticated';
  }
  if (isServerVerifiedHome()) {
    return document.querySelector(SERVER_HOME_AUTH_META) ? 'authenticated' : 'unauthenticated';
  }
  if (document.querySelector('meta[name="yuyan-home-auth"]')) return 'unauthenticated';

  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  if (!isHome()) return 'authenticated';

  prepareVisitorNavigation();
  let memberSession: unknown;
  try {
    memberSession = await requestSession();
  } catch {
    return 'unauthenticated';
  }
  if (!hasSessionUser(memberSession)) return 'unauthenticated';
  if (isHome()) showMemberHome({ navigation: false });
  return 'authenticated';
}

export function syncHomeSession(
  requestSession: () => Promise<AuthSessionResponse>,
): Promise<'authenticated' | 'unauthenticated'> {
  const result = detectHomeSession(requestSession);
  if (
    typeof window === 'undefined' ||
    !isHome() ||
    document.querySelector('meta[name="yuyan-home-auth"]')
  ) {
    return result;
  }
  return Promise.race([
    result,
    new Promise<'unauthenticated'>((resolve) => {
      window.setTimeout(() => resolve('unauthenticated'), 3_000);
    }),
  ]);
}

export function readHomeVariant(): 'member' | 'visitor' {
  return document.querySelector(SERVER_HOME_AUTH_META) ? 'member' : 'visitor';
}
