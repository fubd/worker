export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
export type DocumentView = 'documents' | 'trash';
export type FolderScope = 'all' | 'unfiled' | number;

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
