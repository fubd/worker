import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { deleteOtherSessions, deleteSession, getUserBySession } from '../db/auth';
import type { AppEnv } from '../types';

export const SESSION_COOKIE = 'yuyan_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function sessionExpiresAt(): string {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

export function readSessionToken(c: Context<AppEnv>): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export async function readSessionUser(c: Context<AppEnv>) {
  const token = readSessionToken(c);
  if (!token) return null;
  return getUserBySession(c.env.DB, await hashSessionToken(token));
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure: new URL(c.req.url).protocol === 'https:',
  });
}

export async function invalidateCurrentSession(c: Context<AppEnv>): Promise<void> {
  const token = readSessionToken(c);
  if (token) await deleteSession(c.env.DB, await hashSessionToken(token));
  clearSessionCookie(c);
}

export async function invalidateOtherSessions(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = readSessionToken(c);
  if (token) {
    await deleteOtherSessions(c.env.DB, userId, await hashSessionToken(token));
  }
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await readSessionUser(c);
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: '请先登录' }, 401);
  }
  c.set('user', user);
  await next();
};
