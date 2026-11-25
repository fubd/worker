import { customAlphabet } from 'nanoid';

import { PUBLIC_ID_LENGTH, type PublicId } from '../../shared/ids';

const PUBLIC_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generatePublicId = customAlphabet(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);

export function createPublicId(): PublicId {
  return generatePublicId() as PublicId;
}
