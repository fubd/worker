import { describe, expect, test } from 'bun:test';

import { sortDocumentSummaries } from '../../src/client/document-order';
import type { PublicId } from '../../src/shared/ids';
import type { DocumentSummary } from '../../src/shared/types';

const older = '2026-11-25T08:00:00.000Z';
const newer = '2026-11-25T09:00:00.000Z';

function document(
  id: string,
  title: string,
  updatedAt: string,
  lastViewedAt: string | null,
): DocumentSummary {
  return {
    id: id as PublicId,
    title,
    excerpt: '',
    folderId: null,
    parentId: null,
    childCount: 0,
    favorite: false,
    pinned: false,
    lastViewedAt,
    shareId: null,
    sharedAt: null,
    version: 1,
    createdAt: older,
    updatedAt,
    deletedAt: null,
  };
}

const items = [
  document('first', '先编辑', older, newer),
  document('second', '后编辑', newer, older),
];

describe('document list ordering', () => {
  test('keeps edited order independent of browsing history', () => {
    expect(sortDocumentSummaries(items, 'edited').map((item) => item.title)).toEqual([
      '后编辑',
      '先编辑',
    ]);
  });

  test('uses browsing history only for the recent view', () => {
    expect(sortDocumentSummaries(items, 'activity').map((item) => item.title)).toEqual([
      '先编辑',
      '后编辑',
    ]);
  });
});
