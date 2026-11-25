export type PublicId = string & { readonly __publicId: unique symbol };

export const PUBLIC_ID_LENGTH = 24;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9]{24}$/;

export function isPublicId(value: unknown): value is PublicId {
  return typeof value === 'string' && PUBLIC_ID_PATTERN.test(value);
}
