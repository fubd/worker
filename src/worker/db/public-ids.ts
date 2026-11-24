import { nanoid } from 'nanoid';

import type { DocumentId, FolderId } from '../../shared/ids';

export function createDocumentId(): DocumentId {
  return `d_${nanoid(16)}` as DocumentId;
}

export function createFolderId(): FolderId {
  return `f_${nanoid(16)}` as FolderId;
}
