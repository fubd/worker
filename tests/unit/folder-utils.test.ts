import { describe, expect, test } from 'bun:test';

import {
  buildDocumentTree,
  buildFolderTree,
  getFolderAncestors,
  getFolderPathLabel,
  getFolderSubtreeIds,
  isFolderInSubtree,
} from '../../src/client/folder-utils';
import type { PublicId } from '../../src/shared/ids';
import type { FolderSummary } from '../../src/shared/types';
import type { DocumentSummary } from '../../src/shared/types';

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
    expect(getFolderPathLabel(folders, null)).toBe('根目录');
  });

  test('resolves subtrees and descendants', () => {
    expect([...getFolderSubtreeIds(folders, 'a' as PublicId)]).toEqual(['a', 'b', 'c']);
    expect(isFolderInSubtree(folders, 'c' as PublicId, 'a' as PublicId)).toBe(true);
    expect(isFolderInSubtree(folders, 'd' as PublicId, 'a' as PublicId)).toBe(false);
  });
});

function document(id: string, title: string, parentId: string | null = null): DocumentSummary {
  return {
    id: id as PublicId,
    title,
    excerpt: '',
    folderId: null,
    parentId: parentId as PublicId | null,
    childCount: 0,
    favorite: false,
    pinned: false,
    lastViewedAt: null,
    shareId: null,
    sharedAt: null,
    version: 1,
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
    deletedAt: null,
  };
}

describe('document tree utilities', () => {
  test('nests direct child documents without duplicating them', () => {
    const tree = buildDocumentTree([
      document('root', '根文档'),
      document('child', '子文档', 'root'),
      document('grandchild', '孙文档', 'child'),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].document.id).toBe('root');
    expect(tree[0].children[0].document.id).toBe('child');
    expect(tree[0].children[0].children[0].document.id).toBe('grandchild');
  });
});
