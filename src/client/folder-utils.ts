import type { PublicId } from '@/shared/ids';
import type { DocumentSummary, FolderSummary } from '@/shared/types';

export interface FolderTreeNode {
  folder: FolderSummary;
  children: FolderTreeNode[];
}

export interface DocumentTreeNode {
  document: DocumentSummary;
  children: DocumentTreeNode[];
}

function sortFolders(items: FolderSummary[]): FolderSummary[] {
  return [...items].sort(
    (left, right) =>
      left.name.localeCompare(right.name, 'zh-CN', { sensitivity: 'base' }) ||
      left.id.localeCompare(right.id),
  );
}

export function buildFolderTree(folders: FolderSummary[]): FolderTreeNode[] {
  const byParent = new Map<PublicId | null, FolderSummary[]>();
  for (const folder of folders) {
    const siblings = byParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    byParent.set(folder.parentId, siblings);
  }

  const build = (parentId: PublicId | null): FolderTreeNode[] =>
    sortFolders(byParent.get(parentId) ?? []).map((folder) => ({
      folder,
      children: build(folder.id),
    }));

  return build(null);
}

export function buildDocumentTree(documents: DocumentSummary[]): DocumentTreeNode[] {
  const ids = new Set(documents.map((document) => document.id));
  const byParent = new Map<PublicId | null, DocumentSummary[]>();
  for (const document of documents) {
    const parentId = document.parentId && ids.has(document.parentId) ? document.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(document);
    byParent.set(parentId, siblings);
  }

  const visited = new Set<PublicId>();
  const build = (parentId: PublicId | null): DocumentTreeNode[] =>
    (byParent.get(parentId) ?? []).flatMap((document) => {
      if (visited.has(document.id)) return [];
      visited.add(document.id);
      return [{ document, children: build(document.id) }];
    });

  return build(null);
}

export function getFolderAncestors(folders: FolderSummary[], folderId: PublicId): FolderSummary[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result: FolderSummary[] = [];
  const visited = new Set<PublicId>();
  let current = byId.get(folderId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return result.reverse();
}

export function getFolderPath(folders: FolderSummary[], folderId: PublicId): string[] {
  return getFolderAncestors(folders, folderId).map((folder) => folder.name);
}

export function getFolderPathLabel(folders: FolderSummary[], folderId: PublicId | null): string {
  if (!folderId) return '根目录';
  return getFolderPath(folders, folderId).join(' / ') || '根目录';
}

export function getFolderSubtreeIds(folders: FolderSummary[], folderId: PublicId): Set<PublicId> {
  const children = new Map<PublicId | null, FolderSummary[]>();
  for (const folder of folders) {
    const items = children.get(folder.parentId) ?? [];
    items.push(folder);
    children.set(folder.parentId, items);
  }

  const result = new Set<PublicId>();
  const visit = (id: PublicId) => {
    if (result.has(id)) return;
    result.add(id);
    for (const child of children.get(id) ?? []) visit(child.id);
  };
  visit(folderId);
  return result;
}

export function isFolderInSubtree(
  folders: FolderSummary[],
  folderId: PublicId,
  subtreeRootId: PublicId,
): boolean {
  return getFolderAncestors(folders, folderId).some((folder) => folder.id === subtreeRootId);
}
