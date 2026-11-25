import { describe, expect, test } from 'bun:test';

import { decodeDocumentListCursor, encodeDocumentListCursor } from '../../src/shared/pagination';

describe('document list cursor', () => {
  test('round trips a valid cursor', () => {
    const cursor = {
      pinned: true,
      favorite: false,
      activityAt: '2026-11-24T12:34:56.789Z',
      id: 42,
    };

    expect(decodeDocumentListCursor(encodeDocumentListCursor(cursor))).toEqual(cursor);
  });

  test('supports pagination by last edit time', () => {
    const cursor = {
      pinned: false,
      favorite: false,
      activityAt: '2026-11-24T12:34:56.789Z',
      id: 42,
    };
    expect(decodeDocumentListCursor(encodeDocumentListCursor(cursor, 'updatedAt'))).toEqual(cursor);
  });

  test('rejects malformed cursors', () => {
    expect(decodeDocumentListCursor('not-base64')).toBeNull();
    expect(decodeDocumentListCursor(btoa('[]'))).toBeNull();
    expect(decodeDocumentListCursor(btoa('[2,0,"date",1]'))).toBeNull();
    expect(decodeDocumentListCursor(btoa('[0,0,"",1]'))).toBeNull();
    expect(decodeDocumentListCursor(btoa('[0,0,"date",0]'))).toBeNull();
  });
});
