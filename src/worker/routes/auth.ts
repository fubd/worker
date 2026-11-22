import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as oauth from 'oauth4webapi';

import {
  bindExternalIdentity,
  clearPasswordRateLimit,
  claimOwnerlessDocuments,
  createLocalUser,
  createSession,
  findUserByEmail,
  findUserByUsername,
  getPasswordCredential,
  getPasswordRateLimit,
  recordPasswordFailure,
  recordRegistrationAttempt,
  setPasswordCredential,
  upsertExternalUser,
  type ExternalIdentity,
} from '../db/auth';
import {
  clearSessionCookie,
  createSessionToken,
  hashSessionToken,
  invalidateCurrentSession,
  invalidateOtherSessions,
  readSessionUser,
  requireAuth,
  sessionExpiresAt,
  setSessionCookie,
} from '../auth/session';
import {
  createPasswordCredential,
  hashRateLimitKey,
  isValidEmail,
  normalizeEmail,
  normalizeUsername,
  validateNewPassword,
  validateUsername,
  verifyPassword,
} from '../auth/password';
import type { AppEnv } from '../types';

export const authRoutes = new Hono<AppEnv>();

const OAUTH_COOKIE_MAX_AGE = 10 * 60;
const PASSWORD_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};
const PASSWORD_ACCOUNT_RATE_LIMIT = {
  maxAttempts: 50,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};
const REGISTER_RATE_LIMIT = {
  maxAttempts: 20,
  windowMs: 60 * 60 * 1000,
  blockMs: 60 * 60 * 1000,
};
const PASSWORD_CHANGE_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};
const DUMMY_PASSWORD_CREDENTIAL = {
  algorithm: 'PBKDF2-HMAC-SHA256',
  iterations: 600_000,
  salt: 'AAAAAAAAAAAAAAAAAAAAAA',
  passwordHash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};

const googleAuthorizationServer: oauth.AuthorizationServer = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  code_challenge_methods_supported: ['S256'],
};

const githubAuthorizationServer: oauth.AuthorizationServer = {
  issuer: 'https://github.com/login/oauth',
  authorization_endpoint: 'https://github.com/login/oauth/authorize',
  token_endpoint: 'https://github.com/login/oauth/access_token',
  code_challenge_methods_supported: ['S256'],
};

type LoginProvider = 'google' | 'github';

function publicOrigin(c: Context<AppEnv>): string {
  return (c.env.PUBLIC_ORIGIN ?? new URL(c.req.url).origin).replace(/\/$/, '');
}

function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
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
    bind: `yuyan_oauth_${provider}_bind`,
  };
}

function clearOAuthCookies(c: Context<AppEnv>, provider: LoginProvider): void {
  const { secure, path } = oauthCookieOptions(c);
  const cookies = oauthCookies(provider);
  deleteCookie(c, cookies.state, { path, secure });
  deleteCookie(c, cookies.verifier, { path, secure });
  deleteCookie(c, cookies.bind, { path, secure });
}

function redirectToDocs(c: Context<AppEnv>): Response {
  return c.redirect(new URL('/docs', publicOrigin(c)).toString());
}

function redirectToLogin(c: Context<AppEnv>, authError: string): Response {
  const url = new URL('/login', publicOrigin(c));
  url.searchParams.set('auth', authError);
  return c.redirect(url.toString());
}

function readOAuthError(c: Context<AppEnv>, provider: LoginProvider): Response | null {
  const callbackUrl = new URL(c.req.url);
  const oauthError = callbackUrl.searchParams.get('error');
  if (!oauthError) return null;

  clearOAuthCookies(c, provider);
  return redirectToLogin(c, oauthError === 'access_denied' ? 'cancelled' : 'unavailable');
}

async function beginOAuth(
  c: Context<AppEnv>,
  provider: LoginProvider,
  clientId: string,
  authorizationServer: oauth.AuthorizationServer,
  scope: string,
  extraParameters: Record<string, string> = {},
  bindUserId: number | null = null,
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
  if (bindUserId !== null) {
    setCookie(c, cookies.bind, String(bindUserId), cookieOptions);
  } else {
    deleteCookie(c, cookies.bind, { path: cookieOptions.path, secure: cookieOptions.secure });
  }
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
  const legacyOwnerEmail = normalizeEmail(c.env.OWNER_EMAIL ?? '');
  if (legacyOwnerEmail && normalizeEmail(identity.email) === legacyOwnerEmail) {
    await claimOwnerlessDocuments(c.env.DB, user.id);
  }

  await issueSession(c, user.id);
  return redirectToDocs(c);
}

async function completeIdentityBinding(
  c: Context<AppEnv>,
  identity: ExternalIdentity,
  expectedUserId: number,
): Promise<Response> {
  const currentUser = await readSessionUser(c);
  if (!currentUser || currentUser.id !== expectedUserId) {
    return redirectToLogin(c, 'bind_required');
  }

  const result = await bindExternalIdentity(c.env.DB, currentUser.id, identity);
  if (result.status !== 'bound') return redirectToLogin(c, 'identity_in_use');
  return redirectToDocs(c);
}

async function issueSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = createSessionToken();
  await createSession(c.env.DB, await hashSessionToken(token), userId, sessionExpiresAt());
  setSessionCookie(c, token);
}

async function readJsonObject(c: Context<AppEnv>): Promise<Record<string, unknown> | null> {
  const body = (await c.req.json().catch(() => null)) as unknown;
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

async function loadGithubIdentity(accessToken: string): Promise<ExternalIdentity | null> {
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
    primary?: boolean;
    verified?: boolean;
  }>;
  const verifiedEmails = emails.filter(
    (candidate) => candidate.verified === true && candidate.email?.trim(),
  );
  const email =
    verifiedEmails
      .find((candidate) => candidate.primary)
      ?.email?.trim()
      .toLowerCase() ?? verifiedEmails[0]?.email?.trim().toLowerCase();

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
  if (!c.env.GOOGLE_ID || !c.env.GOOGLE_SECRET) {
    clearOAuthCookies(c, 'google');
    return redirectToLogin(c, 'unavailable');
  }

  const oauthError = readOAuthError(c, 'google');
  if (oauthError) return oauthError;

  const callbackUrl = new URL(c.req.url);
  if (!callbackUrl.searchParams.has('code')) {
    let bindUserId: number | null = null;
    if (callbackUrl.searchParams.get('bind') === '1') {
      const currentUser = await readSessionUser(c);
      if (!currentUser) return redirectToLogin(c, 'bind_required');
      bindUserId = currentUser.id;
    }
    return beginOAuth(
      c,
      'google',
      c.env.GOOGLE_ID,
      googleAuthorizationServer,
      'openid email profile',
      { prompt: 'select_account' },
      bindUserId,
    );
  }

  try {
    const bindUserId = Number(getCookie(c, oauthCookies('google').bind));
    const tokens = await exchangeOAuthCode(
      c,
      'google',
      c.env.GOOGLE_ID,
      c.env.GOOGLE_SECRET,
      googleAuthorizationServer,
      true,
    );
    if (!tokens) return redirectToLogin(c, 'denied');

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
    const email = googleUser.email?.trim().toLowerCase();

    if (!googleUser.sub || !email || !googleUser.email_verified) {
      return redirectToLogin(c, 'denied');
    }

    const identity: ExternalIdentity = {
      provider: 'google',
      providerSub: googleUser.sub,
      email,
      name: googleUser.name?.trim() || email,
      avatarUrl: googleUser.picture ?? '',
    };
    return Number.isInteger(bindUserId) && bindUserId > 0
      ? completeIdentityBinding(c, identity, bindUserId)
      : completeLogin(c, identity);
  } catch (error) {
    console.error('[auth] Google OAuth callback failed:', error);
    return redirectToLogin(c, 'unavailable');
  }
});

authRoutes.get('/github', async (c) => {
  if (!c.env.GITHUB_ID || !c.env.GITHUB_SECRET) {
    clearOAuthCookies(c, 'github');
    return redirectToLogin(c, 'unavailable');
  }

  const oauthError = readOAuthError(c, 'github');
  if (oauthError) return oauthError;

  const callbackUrl = new URL(c.req.url);
  if (!callbackUrl.searchParams.has('code')) {
    let bindUserId: number | null = null;
    if (callbackUrl.searchParams.get('bind') === '1') {
      const currentUser = await readSessionUser(c);
      if (!currentUser) return redirectToLogin(c, 'bind_required');
      bindUserId = currentUser.id;
    }
    return beginOAuth(
      c,
      'github',
      c.env.GITHUB_ID,
      githubAuthorizationServer,
      'read:user user:email',
      { allow_signup: 'false' },
      bindUserId,
    );
  }

  try {
    const bindUserId = Number(getCookie(c, oauthCookies('github').bind));
    const tokens = await exchangeOAuthCode(
      c,
      'github',
      c.env.GITHUB_ID,
      c.env.GITHUB_SECRET,
      githubAuthorizationServer,
    );
    if (!tokens) return redirectToLogin(c, 'denied');

    const identity = await loadGithubIdentity(tokens.access_token);
    if (!identity) return redirectToLogin(c, 'denied');
    return Number.isInteger(bindUserId) && bindUserId > 0
      ? completeIdentityBinding(c, identity, bindUserId)
      : completeLogin(c, identity);
  } catch (error) {
    console.error('[auth] GitHub OAuth callback failed:', error);
    return redirectToLogin(c, 'unavailable');
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

authRoutes.post('/register', async (c) => {
  const body = await readJsonObject(c);
  const username = normalizeUsername(typeof body?.username === 'string' ? body.username : '');
  const password = typeof body?.password === 'string' ? body.password : '';

  const usernameError = validateUsername(username);
  if (usernameError) return c.json({ error: usernameError }, 400);
  const passwordError = validateNewPassword(password);
  if (passwordError) return c.json({ error: passwordError }, 400);

  const now = Date.now();
  const registerRateLimitKey = await hashRateLimitKey(`register:ip:${clientIp(c)}`);
  const registerLimit = await recordRegistrationAttempt(
    c.env.DB,
    registerRateLimitKey,
    now,
    REGISTER_RATE_LIMIT,
  );
  if (registerLimit.blockedUntil > now) {
    const retryAfter = Math.max(1, Math.ceil((registerLimit.blockedUntil - now) / 1000));
    c.header('Retry-After', String(retryAfter));
    return c.json({ error: '注册尝试次数过多，请稍后再试' }, 429);
  }

  if (await findUserByUsername(c.env.DB, username)) {
    return c.json({ error: '这个账号名已经被使用' }, 409);
  }

  const credential = await createPasswordCredential(password);
  const user = await createLocalUser(c.env.DB, {
    username,
    credential,
  });
  if (!user) return c.json({ error: '这个账号名已经被使用' }, 409);

  await issueSession(c, user.id);
  return c.json({ user });
});

authRoutes.post('/password/login', async (c) => {
  const body = await readJsonObject(c);
  const identifier = normalizeUsername(typeof body?.identifier === 'string' ? body.identifier : '');
  const password = typeof body?.password === 'string' ? body.password : '';

  const isEmail = identifier.includes('@');
  const identifierError = isEmail
    ? isValidEmail(identifier)
      ? null
      : '邮箱格式不正确'
    : validateUsername(identifier);
  if (identifierError) return c.json({ error: identifierError }, 400);
  if (!password || password.length > 128) return c.json({ error: '账号名、邮箱或密码错误' }, 401);

  const [ipRateLimitKey, accountRateLimitKey] = await Promise.all([
    hashRateLimitKey(`ip:${clientIp(c)}`),
    hashRateLimitKey(`account:${identifier}`),
  ]);
  const now = Date.now();
  const [ipLimit, accountLimit] = await Promise.all([
    getPasswordRateLimit(c.env.DB, ipRateLimitKey),
    getPasswordRateLimit(c.env.DB, accountRateLimitKey),
  ]);
  const activeBlock = Math.max(ipLimit?.blockedUntil ?? 0, accountLimit?.blockedUntil ?? 0);
  if (activeBlock > now) {
    const retryAfter = Math.max(1, Math.ceil((activeBlock - now) / 1000));
    c.header('Retry-After', String(retryAfter));
    return c.json({ error: '尝试次数过多，请稍后再试' }, 429);
  }

  const user = isEmail
    ? await findUserByEmail(c.env.DB, identifier)
    : await findUserByUsername(c.env.DB, identifier);
  const credential = user ? await getPasswordCredential(c.env.DB, user.id) : null;
  const passwordMatches = await verifyPassword(password, credential ?? DUMMY_PASSWORD_CREDENTIAL);

  if (!user || !credential || !passwordMatches) {
    const failures = [recordPasswordFailure(c.env.DB, ipRateLimitKey, now, PASSWORD_RATE_LIMIT)];
    if (user) {
      failures.push(
        recordPasswordFailure(c.env.DB, accountRateLimitKey, now, PASSWORD_ACCOUNT_RATE_LIMIT),
      );
    }
    const nextLimits = await Promise.all(failures);
    const nextBlock = Math.max(...nextLimits.map((limit) => limit.blockedUntil));
    if (nextBlock > now) {
      const retryAfter = Math.max(1, Math.ceil((nextBlock - now) / 1000));
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: '尝试次数过多，请稍后再试' }, 429);
    }
    return c.json({ error: '账号名、邮箱或密码错误' }, 401);
  }

  await Promise.all([
    clearPasswordRateLimit(c.env.DB, ipRateLimitKey),
    clearPasswordRateLimit(c.env.DB, accountRateLimitKey),
  ]);
  await issueSession(c, user.id);
  return c.json({ user: { ...user, hasPassword: true } });
});

authRoutes.put('/password', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await readJsonObject(c);
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const validationError = validateNewPassword(password);
  if (validationError) return c.json({ error: validationError }, 400);

  const existingCredential = await getPasswordCredential(c.env.DB, user.id);
  if (existingCredential) {
    const rateLimitKey = await hashRateLimitKey(`password-change:user:${user.id}`);
    const now = Date.now();
    const currentLimit = await getPasswordRateLimit(c.env.DB, rateLimitKey);
    if (currentLimit && currentLimit.blockedUntil > now) {
      const retryAfter = Math.max(1, Math.ceil((currentLimit.blockedUntil - now) / 1000));
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: '尝试次数过多，请稍后再试' }, 429);
    }

    if (!currentPassword || !(await verifyPassword(currentPassword, existingCredential))) {
      const nextLimit = await recordPasswordFailure(
        c.env.DB,
        rateLimitKey,
        now,
        PASSWORD_CHANGE_RATE_LIMIT,
      );
      if (nextLimit.blockedUntil > now) {
        const retryAfter = Math.max(1, Math.ceil((nextLimit.blockedUntil - now) / 1000));
        c.header('Retry-After', String(retryAfter));
        return c.json({ error: '尝试次数过多，请稍后再试' }, 429);
      }
      return c.json({ error: '当前密码不正确' }, 400);
    }

    await clearPasswordRateLimit(c.env.DB, rateLimitKey);
  }

  const credential = await createPasswordCredential(password);
  await setPasswordCredential(c.env.DB, user.id, credential);
  await invalidateOtherSessions(c, user.id);
  return c.json({
    user: {
      ...user,
      hasPassword: true,
    },
  });
});

authRoutes.post('/logout', async (c) => {
  await invalidateCurrentSession(c);
  return c.json({ ok: true });
});
