export type DocumentId = `d_${string}`;
export type FolderId = `f_${string}`;

const DOCUMENT_ID_PATTERN = /^d_[A-Za-z0-9_-]{16,32}$/;
const FOLDER_ID_PATTERN = /^f_[A-Za-z0-9_-]{16,32}$/;

export function isDocumentId(value: unknown): value is DocumentId {
  return typeof value === 'string' && DOCUMENT_ID_PATTERN.test(value);
}

export function isFolderId(value: unknown): value is FolderId {
  return typeof value === 'string' && FOLDER_ID_PATTERN.test(value);
}
