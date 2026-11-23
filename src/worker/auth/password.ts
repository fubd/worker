// Cloudflare Workers WebCrypto rejects PBKDF2 iteration counts above 100,000.
export const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_KEY_BITS = 256;
const PASSWORD_SALT_BYTES = 16;
const USERNAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}_-]{1,30})[\p{L}\p{N}]$/u;
const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'docs',
  'help',
  'login',
  'logout',
  'register',
  'root',
  'support',
  'system',
  'user',
  'yuyan',
]);

export interface PasswordCredential {
  algorithm: string;
  iterations: number;
  salt: string;
  passwordHash: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateUsername(value: string): string | null {
  if (!USERNAME_PATTERN.test(value)) return '账号名需要 3–32 个字符，并以文字或数字开头和结尾';
  if (RESERVED_USERNAMES.has(value)) return '这个账号名不可用';
  return null;
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 10) return '密码至少需要 10 个字符';
  if (password.length > 128) return '密码不能超过 128 个字符';
  return null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength,
  ) as ArrayBuffer;
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBuffer,
      iterations,
    },
    material,
    PASSWORD_KEY_BITS,
  );
  return new Uint8Array(bits);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function createPasswordCredential(password: string): Promise<PasswordCredential> {
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);
  const passwordHash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return {
    algorithm: 'PBKDF2-HMAC-SHA256',
    iterations: PASSWORD_ITERATIONS,
    salt: toBase64Url(salt),
    passwordHash: toBase64Url(passwordHash),
  };
}

export async function verifyPassword(
  password: string,
  credential: PasswordCredential,
): Promise<boolean> {
  if (credential.algorithm !== 'PBKDF2-HMAC-SHA256') return false;
  const actual = await derivePasswordHash(
    password,
    fromBase64Url(credential.salt),
    credential.iterations,
  );
  return equalBytes(actual, fromBase64Url(credential.passwordHash));
}

export async function hashRateLimitKey(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`password:${normalizeEmail(identifier)}`),
  );
  return toBase64Url(new Uint8Array(digest));
}
