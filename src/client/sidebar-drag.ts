import type { DragEvent as ReactDragEvent } from 'react';

import { isPublicId, type PublicId } from '@/shared/ids';

const SIDEBAR_DRAG_TYPE = 'application/x-swan-sidebar-item';

export interface SidebarDragPayload {
  kind: 'document' | 'folder';
  id: PublicId;
  label: string;
}

export function beginSidebarDrag(event: ReactDragEvent<HTMLElement>, payload: SidebarDragPayload) {
  const serialized = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(SIDEBAR_DRAG_TYPE, serialized);
  event.dataTransfer.setData('text/plain', serialized);

  const row = event.currentTarget.closest(
    payload.kind === 'folder' ? '.swan-folder-item' : '.swan-sidebar-doc-item',
  );
  if (row instanceof HTMLElement) {
    event.dataTransfer.setDragImage(row, 18, 18);
  }
}

export function readSidebarDrag(event: ReactDragEvent<HTMLElement>): SidebarDragPayload | null {
  const serialized =
    event.dataTransfer.getData(SIDEBAR_DRAG_TYPE) || event.dataTransfer.getData('text/plain');
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Partial<SidebarDragPayload>;
    if (
      (value.kind === 'document' || value.kind === 'folder') &&
      isPublicId(value.id) &&
      typeof value.label === 'string'
    ) {
      return { kind: value.kind, id: value.id, label: value.label };
    }
  } catch {
    return null;
  }
  return null;
}
