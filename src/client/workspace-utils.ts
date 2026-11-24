import type { PublicId } from '@/shared/ids';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
export type DocumentMode = 'read' | 'edit';
export type DocumentView = 'documents' | 'recent' | 'favorites' | 'trash';
export type FolderScope = 'all' | 'unfiled' | PublicId;

export function parseDocumentView(value: string | null): DocumentView {
  if (value === 'trash') return 'trash';
  if (value === 'favorites') return 'favorites';
  if (value === 'recent') return 'recent';
  return 'documents';
}

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

export function formatLastEditedAt(value: string, now: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';

  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return formatUpdatedAt(value);
}
