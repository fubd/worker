import { describe, expect, test } from 'bun:test';

import { isPublicId, PUBLIC_ID_LENGTH } from '../../src/shared/ids';
import { createPublicId } from '../../src/worker/db/public-ids';

describe('public IDs', () => {
  test('use only letters and numbers', () => {
    for (let index = 0; index < 100; index += 1) {
      const id = createPublicId();
      expect(id).toHaveLength(PUBLIC_ID_LENGTH);
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
      expect(isPublicId(id)).toBe(true);
    }
  });

  test('reject hyphens, underscores and other lengths', () => {
    expect(isPublicId('Abcdefghijklmnopqrstuvwx')).toBe(true);
    expect(isPublicId('Abcdefghijklmnopqrstu-wx')).toBe(false);
    expect(isPublicId('Abcdefghijklmnopqrstu_wx')).toBe(false);
    expect(isPublicId('Abcdefghijklmnopqrstuvw')).toBe(false);
  });
});
