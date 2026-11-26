import { useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { Dropdown, type MenuProps } from 'antd';
import { Check, ChevronRight, FileText, Folder, MoreHorizontal, X } from 'lucide-react';

import type { PublicId } from '@/shared/ids';
import type { DocumentSummary, FolderSummary } from '@/shared/types';
import { isFolderInSubtree, type FolderTreeNode } from '../folder-utils';
import type { SidebarDragPayload } from '../sidebar-drag';
import { OverflowText } from './OverflowText';

interface FolderCreateFormProps {
  draft: string;
  saving: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function FolderCreateForm({ draft, saving, onCancel, onChange, onSubmit }: FolderCreateFormProps) {
  'use no memo';

  return (
    <form
      className="swan-folder-create"
      data-saving={saving ? 'true' : 'false'}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Folder aria-hidden="true" size={15} strokeWidth={1.8} />
      <input
        autoFocus
        maxLength={30}
        value={draft}
        aria-label="新分组名称"
        placeholder="分组名称"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
      <button type="submit" aria-label="创建分组" disabled={saving || !draft.trim()}>
        <Check aria-hidden="true" size={14} strokeWidth={2} />
      </button>
      <button type="button" aria-label="取消新建分组" disabled={saving} onClick={onCancel}>
        <X aria-hidden="true" size={14} strokeWidth={2} />
      </button>
    </form>
  );
}

interface FolderTreeItemProps {
  activeFolderId: PublicId | null;
  creatingFolder: boolean;
  creatingFolderParentId: PublicId | null;
  documentsByFolder: ReadonlyMap<PublicId, DocumentSummary[]>;
  draggingItem: SidebarDragPayload | null;
  dropTargetId: string | null;
  expandedFolderIds: Set<PublicId>;
  folders: FolderSummary[];
  folderDraft: string;
  folderSaving: boolean;
  getFolderMenuItems: (folder: FolderSummary) => MenuProps['items'];
  node: FolderTreeNode;
  rootLevel?: boolean;
  onBeginDrag: (event: ReactDragEvent<HTMLElement>, payload: SidebarDragPayload) => void;
  onCancelFolderCreate: () => void;
  onDragEnd: () => void;
  onDragLeaveTarget: (targetId: string) => void;
  onDragOverTarget: (targetId: string) => void;
  onDropTarget: (event: ReactDragEvent<HTMLElement>, parentId: PublicId | null) => void;
  onEditFolder: (folder: FolderSummary) => void;
  onFolderMenuAction: (folder: FolderSummary, key: string) => void;
  onFolderDraftChange: (value: string) => void;
  onSubmitFolderCreate: () => void;
  onSetExpanded: (folderId: PublicId, expanded: boolean) => void;
  renderDocuments: (documents: DocumentSummary[], depth?: number) => ReactNode;
  onFolderCreateChild: (folder: FolderSummary) => void;
  onFolderCreateDocument: (folder: FolderSummary) => void;
}

export function FolderTreeItem({
  activeFolderId,
  creatingFolder,
  creatingFolderParentId,
  documentsByFolder,
  draggingItem,
  dropTargetId,
  expandedFolderIds,
  folders,
  folderDraft,
  folderSaving,
  getFolderMenuItems,
  node,
  rootLevel = false,
  onBeginDrag,
  onCancelFolderCreate,
  onDragEnd,
  onDragLeaveTarget,
  onDragOverTarget,
  onDropTarget,
  onEditFolder,
  onFolderCreateChild,
  onFolderCreateDocument,
  onFolderMenuAction,
  onFolderDraftChange,
  onSubmitFolderCreate,
  onSetExpanded,
  renderDocuments,
}: FolderTreeItemProps) {
  'use no memo';

  const { folder, children } = node;
  const documents = documentsByFolder.get(folder.id) ?? [];
  const expanded = expandedFolderIds.has(folder.id);
  const targetId = `folder:${folder.id}`;
  const isOver = dropTargetId === targetId;
  const canDrop =
    Boolean(draggingItem) &&
    !(
      draggingItem?.kind === 'folder' &&
      (draggingItem.id === folder.id || isFolderInSubtree(folders, folder.id, draggingItem.id))
    );
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  return (
    <div className="swan-folder-tree-node">
      <div
        className={[
          'swan-folder-item',
          expanded ? 'is-expanded' : '',
          activeFolderId === folder.id ? 'is-selected' : '',
          isOver ? 'is-drop-target' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDragOver={(event) => {
          if (!canDrop) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          onDragOverTarget(targetId);
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          onDragLeaveTarget(targetId);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDragLeaveTarget(targetId);
          onDropTarget(event, folder.id);
        }}
      >
        {rootLevel && (
          <button
            type="button"
            className={expanded ? 'swan-folder-toggle is-expanded' : 'swan-folder-toggle'}
            aria-label={`${expanded ? '收起' : '展开'} 分组 ${folder.name}`}
            aria-expanded={expanded}
            onClick={() => onSetExpanded(folder.id, !expanded)}
          >
            <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />
          </button>
        )}
        <div className="swan-folder-actions">
          <button
            type="button"
            className={rootLevel ? 'swan-folder-row is-root' : 'swan-folder-row'}
            aria-expanded={expanded}
            onClick={() => onSetExpanded(folder.id, !expanded)}
          >
            <Folder aria-hidden="true" size={15} strokeWidth={1.8} />
            <OverflowText text={folder.name} />
            <span className="swan-folder-meta">
              <small>{folder.documentCount}</small>
            </span>
          </button>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            destroyOnHidden
            open={createMenuOpen}
            onOpenChange={setCreateMenuOpen}
            menu={{
              items: [
                {
                  key: 'document',
                  label: '新建文档',
                  icon: (
                    <FileText
                      className="swan-menu-icon is-document"
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.8}
                    />
                  ),
                },
                {
                  key: 'group',
                  label: '新建分组',
                  icon: (
                    <Folder
                      className="swan-menu-icon is-folder"
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.8}
                    />
                  ),
                },
              ],
              onClick: ({ key }) => {
                setCreateMenuOpen(false);
                if (key === 'document') onFolderCreateDocument(folder);
                else onFolderCreateChild(folder);
              },
            }}
          >
            <button
              type="button"
              className="swan-folder-add"
              aria-label={`在 ${folder.name} 中新建`}
            >
              +
            </button>
          </Dropdown>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            destroyOnHidden
            menu={{
              items: getFolderMenuItems(folder),
              onClick: ({ key }) => onFolderMenuAction(folder, key),
            }}
          >
            <button
              type="button"
              className="swan-folder-edit"
              aria-label={`分组操作 ${folder.name}`}
            >
              <MoreHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
            </button>
          </Dropdown>
        </div>
      </div>

      {(expanded || (creatingFolder && creatingFolderParentId === folder.id)) && (
        <div className="swan-folder-children">
          {creatingFolder && creatingFolderParentId === folder.id && (
            <FolderCreateForm
              draft={folderDraft}
              saving={folderSaving}
              onCancel={onCancelFolderCreate}
              onChange={onFolderDraftChange}
              onSubmit={onSubmitFolderCreate}
            />
          )}
          {documents.length > 0 && (
            <div className="swan-folder-documents">
              {renderDocuments(documents, rootLevel ? 0 : 1)}
            </div>
          )}
          {children.map((child) => (
            <FolderTreeItem
              key={child.folder.id}
              activeFolderId={activeFolderId}
              creatingFolder={creatingFolder}
              creatingFolderParentId={creatingFolderParentId}
              documentsByFolder={documentsByFolder}
              draggingItem={draggingItem}
              dropTargetId={dropTargetId}
              expandedFolderIds={expandedFolderIds}
              folders={folders}
              folderDraft={folderDraft}
              folderSaving={folderSaving}
              getFolderMenuItems={getFolderMenuItems}
              node={child}
              rootLevel={false}
              onBeginDrag={onBeginDrag}
              onCancelFolderCreate={onCancelFolderCreate}
              onDragEnd={onDragEnd}
              onDragLeaveTarget={onDragLeaveTarget}
              onDragOverTarget={onDragOverTarget}
              onDropTarget={onDropTarget}
              onEditFolder={onEditFolder}
              onFolderCreateChild={onFolderCreateChild}
              onFolderCreateDocument={onFolderCreateDocument}
              onFolderMenuAction={onFolderMenuAction}
              onFolderDraftChange={onFolderDraftChange}
              onSubmitFolderCreate={onSubmitFolderCreate}
              onSetExpanded={onSetExpanded}
              renderDocuments={renderDocuments}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { FolderCreateForm };
