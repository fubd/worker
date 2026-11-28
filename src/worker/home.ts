import type { Context } from 'hono';

import homeHtml from 'virtual:yuyan-home-html';
import freshHomeHtml from 'virtual:yuyan-home-fresh-html';
import { shellFor, shellParts } from './home-session';
import { hashSessionToken, readSessionToken } from './auth/session';
import { getUserBySession } from './db/auth';
import type { AppEnv } from './types';

const MEMBER_META = '<meta name="yuyan-home-auth" content="member">';
const [visitorShell, memberShell] = shellParts(homeHtml);
const [freshVisitorShell, freshMemberShell] = shellParts(freshHomeHtml);

export function responseFor(html: string, member: boolean): Response {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
  });
  headers.set('Cache-Control', 'no-store');
  headers.delete('CDN-Cache-Control');
  headers.set('Vary', 'Cookie');
  headers.set('X-Yuyan-Home-Auth', member ? 'member' : 'visitor');
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
  const token = readSessionToken(c);
  const fresh = new URL(c.req.url).searchParams.has('fresh');

  if (!token) {
    return responseFor(fresh ? freshVisitorShell : visitorShell, false);
  }

  let member = true;
  try {
    const user = await getUserBySession(c.env.DB, await hashSessionToken(token));
    member = Boolean(user);
  } catch (error) {
    console.error('[home] session lookup failed:', error);
    return responseFor(fresh ? freshVisitorShell : visitorShell, false);
  }

  return responseFor(fresh ? freshMemberShell : memberShell, member);
}
