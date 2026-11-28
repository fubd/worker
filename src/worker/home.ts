import type { Context } from 'hono';

import homeHtml from 'virtual:yuyan-home-html';
import freshHomeHtml from 'virtual:yuyan-home-fresh-html';
import { hashSessionToken, readSessionToken } from './auth/session';
import { getUserBySession } from './db/auth';
import type { AppEnv } from './types';

const MEMBER_MARKER = '<!----yuyan-member-home---->';
const MEMBER_META = '<meta name="yuyan-home-auth" content="member">';
function shellParts(html: string): [string, string] {
  const memberStart = html.indexOf(MEMBER_MARKER);
  if (memberStart < 0) throw new Error('Worker home template is missing its member shell');
  return [html.slice(0, memberStart), html.slice(memberStart + MEMBER_MARKER.length)];
}
const [visitorShell, memberShell] = shellParts(homeHtml);
const [freshVisitorShell, freshMemberShell] = shellParts(freshHomeHtml);

function shellFor(html: string, member: boolean): string {
  if (member) {
    return (html === freshVisitorShell ? freshMemberShell : html).replace(
      ' name="yuyan-home-fresh-auth"',
      ' name="yuyan-home-auth"',
    );
  }
  return (html === freshMemberShell ? freshVisitorShell : html).replace(
    ' name="yuyan-home-fresh-auth"',
    ' name="yuyan-home-auth"',
  );
}

function responseFor(html: string, member: boolean): Response {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
  });
  headers.set('Cache-Control', 'no-store');
  headers.delete('CDN-Cache-Control');
  headers.set('Vary', 'Cookie');
  headers.set('X-Yuyan-Home-Auth', member ? 'member' : 'visitor');
  const shell = shellFor(html, member);
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
