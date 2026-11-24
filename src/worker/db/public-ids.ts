import { nanoid } from 'nanoid';

import type { PublicId } from '../../shared/ids';

export function createPublicId(): PublicId {
  return nanoid(24) as PublicId;
}
