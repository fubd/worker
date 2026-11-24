import { describe, expect, test } from 'bun:test';

import {
  buildFolderTree,
  getFolderAncestors,
  getFolderPathLabel,
  getFolderSubtreeIds,
  isFolderInSubtree,
} from '../../src/client/folder-utils';
import type { PublicId } from '../../src/shared/ids';
import type { FolderSummary } from '../../src/shared/types';

function folder(id: string, name: string, parentId: string | null = null): FolderSummary {
  return {
    id: id as PublicId,
    parentId: parentId as PublicId | null,
    name,
    documentCount: 0,
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
  };
}

const folders = [
  folder('c', '项目 C', 'b'),
  folder('a', '产品'),
  folder('b', '文档', 'a'),
  folder('d', '归档'),
];

describe('folder utilities', () => {
  test('builds a sorted tree', () => {
    expect(buildFolderTree(folders).map((node) => node.folder.name)).toEqual(['产品', '归档']);
  });

  test('resolves ancestors and path labels', () => {
    expect(getFolderAncestors(folders, 'c' as PublicId).map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(getFolderPathLabel(folders, 'c' as PublicId)).toBe('产品 / 文档 / 项目 C');
  });

  test('resolves subtrees and descendants', () => {
    expect([...getFolderSubtreeIds(folders, 'a' as PublicId)]).toEqual(['a', 'b', 'c']);
    expect(isFolderInSubtree(folders, 'c' as PublicId, 'a' as PublicId)).toBe(true);
    expect(isFolderInSubtree(folders, 'd' as PublicId, 'a' as PublicId)).toBe(false);
  });
});
