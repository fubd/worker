import type { FolderId } from '@/shared/ids';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
export type DocumentView = 'documents' | 'favorites' | 'trash';
export type FolderScope = 'all' | 'unfiled' | FolderId;

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
