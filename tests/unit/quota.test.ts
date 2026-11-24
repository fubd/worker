import { describe, expect, test } from 'bun:test';

import { checkAttachmentQuota, checkDocumentQuota } from '../../src/worker/quota';
import {
  DOCUMENT_ATTACHMENT_LIMIT,
  USER_ATTACHMENT_BYTES_LIMIT,
  USER_DOCUMENT_LIMIT,
} from '../../src/shared/limits';
import type { PublicId } from '../../src/shared/ids';

function fakeDatabase(result: Record<string, number>): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => result,
      }),
    }),
  } as unknown as D1Database;
}

describe('quota checks', () => {
  test('allows document creation below the limit', async () => {
    const result = await checkDocumentQuota(fakeDatabase({ count: USER_DOCUMENT_LIMIT - 1 }), 1);
    expect(result.allowed).toBe(true);
  });

  test('blocks document creation at the limit', async () => {
    const result = await checkDocumentQuota(fakeDatabase({ count: USER_DOCUMENT_LIMIT }), 1);
    expect(result.allowed).toBe(false);
  });

  test('blocks a document attachment at its per-document limit', async () => {
    const result = await checkAttachmentQuota(
      fakeDatabase({
        count: 30,
        bytes: 1024,
        document_count: DOCUMENT_ATTACHMENT_LIMIT,
      }),
      1,
      'document' as PublicId,
      10,
    );
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(DOCUMENT_ATTACHMENT_LIMIT);
  });

  test('blocks uploads that exceed total storage', async () => {
    const result = await checkAttachmentQuota(
      fakeDatabase({
        count: 2,
        bytes: USER_ATTACHMENT_BYTES_LIMIT - 5,
        document_count: 1,
      }),
      1,
      'document' as PublicId,
      10,
    );
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(USER_ATTACHMENT_BYTES_LIMIT);
  });
});
