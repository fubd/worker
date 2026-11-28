import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';

import homeHtml from 'virtual:yuyan-home-html';
import freshHomeHtml from 'virtual:yuyan-home-fresh-html';
import { shellFor, shellParts } from './home-session';
import { hashSessionToken, invalidateCurrentSession, SESSION_COOKIE } from './auth/session';
import { getUserBySession } from './db/auth';
import { HOME_COOKIE } from '../shared/home-session';
import type { AppEnv } from './types';

const MEMBER_META = '<meta name="yuyan-home-auth" content="member">';
const [visitorShell, memberShell] = shellParts(homeHtml);
const [freshVisitorShell, freshMemberShell] = shellParts(freshHomeHtml);

export function responseFor(html: string, member: boolean): Response {
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  if (member) {
    headers.set('Cache-Control', 'no-store');
    headers.set('Vary', 'Cookie');
    headers.set('X-Yuyan-Home-Auth', 'member');
  } else {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    headers.set('CDN-Cache-Control', 'public, max-age=0, must-revalidate');
  }
  const shell = shellFor(
    html === freshMemberShell ? freshVisitorShell : html,
    html === freshVisitorShell ? freshMemberShell : html,
    member,
  );
  if (member && !shell.includes(MEMBER_META)) throw new Error('member home marker is missing');
  if (!member && shell.includes(MEMBER_META)) throw new Error('visitor home marker is invalid');
  return new Response(shell, { status: 200, headers });
}

export async function resolveHome(c: Context<AppEnv>): Promise<Response> {
  const cookies =
    c.req
      .header('cookie')
      ?.split(';')
      .map((item) => item.trim())
      .filter((item) => item.startsWith(`${SESSION_COOKIE}=`))
      .map((item) => item.slice(item.indexOf('=') + 1)) ?? [];
  const apiToken = cookies?.at(-1);
  if (apiToken) {
    const expected = await hashSessionToken(apiToken);
    const user = await getUserBySession(c.env.DB, expected).catch((error: unknown) => {
      console.error('[home] home session lookup failed:', error);
      return null;
    });
    if (!user) {
      await invalidateCurrentSession(c);
      return responseFor(
        new URL(c.req.url).searchParams.has('fresh') ? freshVisitorShell : visitorShell,
        false,
      );
    }
    setCookie(c, HOME_COOKIE, apiToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  const fresh = new URL(c.req.url).searchParams.has('fresh');

  if (!cookies.length) {
    return responseFor(fresh ? freshVisitorShell : visitorShell, false);
  }

  try {
    const hashes = await Promise.all(cookies.map((token) => hashSessionToken(token)));
    const users = await Promise.all(hashes.map((hash) => getUserBySession(c.env.DB, hash)));
    if (!users.some(Boolean)) return responseFor(fresh ? freshVisitorShell : visitorShell, false);
  } catch (error) {
    console.error('[home] session lookup failed:', error);
    return responseFor(fresh ? freshVisitorShell : visitorShell, false);
  }

  return responseFor(fresh ? freshMemberShell : memberShell, true);
}
