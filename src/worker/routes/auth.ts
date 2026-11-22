import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as oauth from 'oauth4webapi';

import {
  claimOwnerlessDocuments,
  createSession,
  upsertExternalUser,
  type ExternalIdentity,
} from '../db/auth';
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

const OAUTH_COOKIE_MAX_AGE = 10 * 60;

const googleAuthorizationServer: oauth.AuthorizationServer = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  code_challenge_methods_supported: ['S256'],
};

const githubAuthorizationServer: oauth.AuthorizationServer = {
  issuer: 'https://github.com',
  authorization_endpoint: 'https://github.com/login/oauth/authorize',
  token_endpoint: 'https://github.com/login/oauth/access_token',
  code_challenge_methods_supported: ['S256'],
};

type LoginProvider = 'google' | 'github';

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

function oauthCookies(provider: LoginProvider) {
  return {
    state: `yuyan_oauth_${provider}_state`,
    verifier: `yuyan_oauth_${provider}_verifier`,
  };
}

function clearOAuthCookies(c: Context<AppEnv>, provider: LoginProvider): void {
  const { secure, path } = oauthCookieOptions(c);
  const cookies = oauthCookies(provider);
  deleteCookie(c, cookies.state, { path, secure });
  deleteCookie(c, cookies.verifier, { path, secure });
}

function redirectToDocs(c: Context<AppEnv>, authError?: string): Response {
  const url = new URL('/docs', publicOrigin(c));
  if (authError) url.searchParams.set('auth', authError);
  return c.redirect(url.toString());
}

function readOAuthError(c: Context<AppEnv>, provider: LoginProvider): Response | null {
  const callbackUrl = new URL(c.req.url);
  const oauthError = callbackUrl.searchParams.get('error');
  if (!oauthError) return null;

  clearOAuthCookies(c, provider);
  return redirectToDocs(c, oauthError === 'access_denied' ? 'cancelled' : 'unavailable');
}

async function beginOAuth(
  c: Context<AppEnv>,
  provider: LoginProvider,
  clientId: string,
  authorizationServer: oauth.AuthorizationServer,
  scope: string,
  extraParameters: Record<string, string> = {},
): Promise<Response> {
  const client: oauth.Client = { client_id: clientId };
  const state = oauth.generateRandomState();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const authorizationUrl = new URL(authorizationServer.authorization_endpoint!);
  authorizationUrl.searchParams.set('client_id', client.client_id);
  authorizationUrl.searchParams.set('redirect_uri', `${publicOrigin(c)}/api/auth/${provider}`);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', scope);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  for (const [key, value] of Object.entries(extraParameters)) {
    authorizationUrl.searchParams.set(key, value);
  }

  const cookies = oauthCookies(provider);
  const cookieOptions = oauthCookieOptions(c);
  setCookie(c, cookies.state, state, cookieOptions);
  setCookie(c, cookies.verifier, codeVerifier, cookieOptions);
  return c.redirect(authorizationUrl.toString());
}

async function exchangeOAuthCode(
  c: Context<AppEnv>,
  provider: LoginProvider,
  clientId: string,
  clientSecret: string,
  authorizationServer: oauth.AuthorizationServer,
  requireIdToken = false,
): Promise<oauth.TokenEndpointResponse | null> {
  const callbackUrl = new URL(c.req.url);
  const client: oauth.Client = { client_id: clientId };
  const redirectUri = `${publicOrigin(c)}/api/auth/${provider}`;
  const clientAuth = oauth.ClientSecretPost(clientSecret);
  const cookies = oauthCookies(provider);
  const storedState = getCookie(c, cookies.state);
  const codeVerifier = getCookie(c, cookies.verifier);
  clearOAuthCookies(c, provider);

  if (!storedState || !codeVerifier) return null;

  try {
    const callbackParameters = oauth.validateAuthResponse(
      authorizationServer,
      client,
      callbackUrl,
      storedState,
    );
    const tokenResponse = await oauth.authorizationCodeGrantRequest(
      authorizationServer,
      client,
      clientAuth,
      callbackParameters,
      redirectUri,
      codeVerifier,
    );
    return await oauth.processAuthorizationCodeResponse(
      authorizationServer,
      client,
      tokenResponse,
      requireIdToken ? { requireIdToken: true } : undefined,
    );
  } catch (error) {
    console.error(`[auth] ${provider} token exchange failed:`, error);
    return null;
  }
}

async function completeLogin(c: Context<AppEnv>, identity: ExternalIdentity): Promise<Response> {
  const user = await upsertExternalUser(c.env.DB, identity);
  await claimOwnerlessDocuments(c.env.DB, user.id);

  const token = createSessionToken();
  await createSession(c.env.DB, await hashSessionToken(token), user.id, sessionExpiresAt());
  setSessionCookie(c, token);
  return redirectToDocs(c);
}

async function loadGithubIdentity(
  accessToken: string,
  ownerEmail: string,
): Promise<ExternalIdentity | null> {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'yuyan',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const [userResponse, emailsResponse] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);
  if (!userResponse.ok || !emailsResponse.ok) {
    throw new Error(
      `GitHub API failed (user=${userResponse.status}, emails=${emailsResponse.status})`,
    );
  }

  const githubUser = (await userResponse.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
  };
  const emails = (await emailsResponse.json()) as Array<{
    email?: string;
    verified?: boolean;
  }>;
  const email = emails
    .find(
      (candidate) =>
        candidate.verified === true && candidate.email?.trim().toLowerCase() === ownerEmail,
    )
    ?.email?.trim()
    .toLowerCase();

  if (!githubUser.id || !githubUser.login || !email) return null;

  return {
    provider: 'github',
    providerSub: String(githubUser.id),
    email,
    name: githubUser.name?.trim() || githubUser.login,
    avatarUrl: githubUser.avatar_url ?? '',
  };
}

authRoutes.get('/google', async (c) => {
  if (!c.env.GOOGLE_ID || !c.env.GOOGLE_SECRET || !c.env.OWNER_EMAIL) {
    clearOAuthCookies(c, 'google');
    return redirectToDocs(c, 'unavailable');
  }

  const oauthError = readOAuthError(c, 'google');
  if (oauthError) return oauthError;

  const callbackUrl = new URL(c.req.url);
  if (!callbackUrl.searchParams.has('code')) {
    return beginOAuth(
      c,
      'google',
      c.env.GOOGLE_ID,
      googleAuthorizationServer,
      'openid email profile',
      { prompt: 'select_account' },
    );
  }

  try {
    const tokens = await exchangeOAuthCode(
      c,
      'google',
      c.env.GOOGLE_ID,
      c.env.GOOGLE_SECRET,
      googleAuthorizationServer,
      true,
    );
    if (!tokens) return redirectToDocs(c, 'denied');

    const idTokenClaims = oauth.getValidatedIdTokenClaims(tokens);
    if (!idTokenClaims?.sub) throw new Error('Google response is missing the ID token subject');

    const client: oauth.Client = { client_id: c.env.GOOGLE_ID };
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

    return completeLogin(c, {
      provider: 'google',
      providerSub: googleUser.sub,
      email,
      name: googleUser.name?.trim() || email,
      avatarUrl: googleUser.picture ?? '',
    });
  } catch (error) {
    console.error('[auth] Google OAuth callback failed:', error);
    return redirectToDocs(c, 'unavailable');
  }
});

authRoutes.get('/github', async (c) => {
  if (!c.env.GITHUB_ID || !c.env.GITHUB_SECRET || !c.env.OWNER_EMAIL) {
    clearOAuthCookies(c, 'github');
    return redirectToDocs(c, 'unavailable');
  }

  const oauthError = readOAuthError(c, 'github');
  if (oauthError) return oauthError;

  const callbackUrl = new URL(c.req.url);
  if (!callbackUrl.searchParams.has('code')) {
    return beginOAuth(
      c,
      'github',
      c.env.GITHUB_ID,
      githubAuthorizationServer,
      'read:user user:email',
      { allow_signup: 'false' },
    );
  }

  try {
    const tokens = await exchangeOAuthCode(
      c,
      'github',
      c.env.GITHUB_ID,
      c.env.GITHUB_SECRET,
      githubAuthorizationServer,
    );
    if (!tokens) return redirectToDocs(c, 'denied');

    const ownerEmail = c.env.OWNER_EMAIL.trim().toLowerCase();
    const identity = await loadGithubIdentity(tokens.access_token, ownerEmail);
    if (!identity) return redirectToDocs(c, 'denied');
    return completeLogin(c, identity);
  } catch (error) {
    console.error('[auth] GitHub OAuth callback failed:', error);
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
