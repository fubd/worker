export type PublicId = string & { readonly __publicId: unique symbol };

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export function isPublicId(value: unknown): value is PublicId {
  return typeof value === 'string' && PUBLIC_ID_PATTERN.test(value);
}
