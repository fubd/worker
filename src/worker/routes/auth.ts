import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as oauth from 'oauth4webapi';

import { createSession, claimOwnerlessDocuments, upsertGoogleUser } from '../db/auth';
import {
  clearSessionCookie,
  createSessionToken,
  hashSessionToken,
  invalidateCurrentSession,
  readSessionUser,
  sessionExpiresAt,
  setSessionCookie,
} from '../auth/session';
import type { AppEnv } from '../types';

export const authRoutes = new Hono<AppEnv>();

const OAUTH_STATE_COOKIE = 'yuyan_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'yuyan_oauth_verifier';
const OAUTH_COOKIE_MAX_AGE = 10 * 60;

const googleAuthorizationServer: oauth.AuthorizationServer = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  code_challenge_methods_supported: ['S256'],
};

function publicOrigin(c: Context<AppEnv>): string {
  return (c.env.PUBLIC_ORIGIN ?? new URL(c.req.url).origin).replace(/\/$/, '');
}

function oauthCookieOptions(c: Context<AppEnv>) {
  return {
    httpOnly: true,
    secure: publicOrigin(c).startsWith('https://'),
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
}

function clearOAuthCookies(c: Context<AppEnv>): void {
  const { secure, path } = oauthCookieOptions(c);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path, secure });
  deleteCookie(c, OAUTH_VERIFIER_COOKIE, { path, secure });
}

function redirectToDocs(c: Context<AppEnv>, authError?: string) {
  const url = new URL('/docs', publicOrigin(c));
  if (authError) url.searchParams.set('auth', authError);
  return c.redirect(url.toString());
}

authRoutes.get('/google', async (c) => {
  if (!c.env.GOOGLE_ID || !c.env.GOOGLE_SECRET || !c.env.OWNER_EMAIL) {
    clearOAuthCookies(c);
    return redirectToDocs(c, 'unavailable');
  }

  const callbackUrl = new URL(c.req.url);
  const oauthError = callbackUrl.searchParams.get('error');
  if (oauthError) {
    clearOAuthCookies(c);
    return redirectToDocs(c, oauthError === 'access_denied' ? 'cancelled' : 'unavailable');
  }

  const client: oauth.Client = { client_id: c.env.GOOGLE_ID };
  const redirectUri = `${publicOrigin(c)}/api/auth/google`;
  const clientAuth = oauth.ClientSecretPost(c.env.GOOGLE_SECRET);

  if (!callbackUrl.searchParams.has('code')) {
    const state = oauth.generateRandomState();
    const codeVerifier = oauth.generateRandomCodeVerifier();
    const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
    const authorizationUrl = new URL(googleAuthorizationServer.authorization_endpoint!);
    authorizationUrl.searchParams.set('client_id', client.client_id);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('prompt', 'select_account');

    const cookieOptions = oauthCookieOptions(c);
    setCookie(c, OAUTH_STATE_COOKIE, state, cookieOptions);
    setCookie(c, OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);
    return c.redirect(authorizationUrl.toString());
  }

  const storedState = getCookie(c, OAUTH_STATE_COOKIE);
  const codeVerifier = getCookie(c, OAUTH_VERIFIER_COOKIE);
  clearOAuthCookies(c);

  if (!storedState || !codeVerifier) {
    return redirectToDocs(c, 'denied');
  }

  let callbackParameters: URLSearchParams;
  try {
    callbackParameters = oauth.validateAuthResponse(
      googleAuthorizationServer,
      client,
      callbackUrl,
      storedState,
    );
  } catch {
    return redirectToDocs(c, 'denied');
  }

  try {
    const tokenResponse = await oauth.authorizationCodeGrantRequest(
      googleAuthorizationServer,
      client,
      clientAuth,
      callbackParameters,
      redirectUri,
      codeVerifier,
    );
    const tokens = await oauth.processAuthorizationCodeResponse(
      googleAuthorizationServer,
      client,
      tokenResponse,
      { requireIdToken: true },
    );
    const idTokenClaims = oauth.getValidatedIdTokenClaims(tokens);
    if (!idTokenClaims?.sub) throw new Error('Google response is missing the ID token subject');
    const userInfoResponse = await oauth.userInfoRequest(
      googleAuthorizationServer,
      client,
      tokens.access_token,
    );
    const googleUser = await oauth.processUserInfoResponse(
      googleAuthorizationServer,
      client,
      idTokenClaims.sub,
      userInfoResponse,
    );
    const ownerEmail = c.env.OWNER_EMAIL.trim().toLowerCase();
    const email = googleUser.email?.trim().toLowerCase();

    if (!googleUser.sub || !email || !googleUser.email_verified || email !== ownerEmail) {
      return redirectToDocs(c, 'denied');
    }

    const user = await upsertGoogleUser(c.env.DB, {
      googleSub: googleUser.sub,
      email,
      name: googleUser.name?.trim() || email,
      avatarUrl: googleUser.picture ?? '',
    });

    await claimOwnerlessDocuments(c.env.DB, user.id);

    const token = createSessionToken();
    await createSession(c.env.DB, await hashSessionToken(token), user.id, sessionExpiresAt());
    setSessionCookie(c, token);

    return redirectToDocs(c);
  } catch (error) {
    console.error('[auth] Google OAuth callback failed:', error);
    return redirectToDocs(c, 'unavailable');
  }
});

authRoutes.get('/me', async (c) => {
  const user = await readSessionUser(c);
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: '请先登录' }, 401);
  }
  return c.json({ user });
});

authRoutes.post('/logout', async (c) => {
  await invalidateCurrentSession(c);
  return c.json({ ok: true });
});
