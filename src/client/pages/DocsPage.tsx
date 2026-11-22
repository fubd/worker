import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Empty, Input, Popconfirm, Spin, Tag, Typography } from 'antd';
import {
  BoldOutlined,
  CodeOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ItalicOutlined,
  OrderedListOutlined,
  PlusOutlined,
  RedoOutlined,
  ReloadOutlined,
  UndoOutlined,
  UnorderedListOutlined,
  UndoOutlined as RestoreOutlined,
} from '@ant-design/icons';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Navigate, useSearchParams } from 'react-router';

import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import type { DocumentRecord, DocumentSummary } from '@/shared/types';

const EMPTY_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
type DocumentView = 'documents' | 'trash';

function parseDocumentId(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    excerpt: document.contentText.trim().slice(0, 140),
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    deletedAt: document.deletedAt,
  };
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function HydrateFallback() {
  return (
    <div className="swan-docs">
      <aside className="swan-doc-list-panel swan-card">
        <div className="swan-doc-list-head">
          <div className="swan-doc-list-heading">
            <strong>全部文档</strong>
            <span className="swan-doc-count">0</span>
          </div>
        </div>
        <div className="swan-doc-list-empty">正在载入文档…</div>
      </aside>
      <section className="swan-editor-panel swan-card">
        <div className="swan-editor-loading">
          <Spin />
        </div>
      </section>
    </div>
  );
}

export default function DocsPage() {
  return (
    <App>
      <DocsPageContent />
    </App>
  );
}

function DocsPageContent() {
  const { message } = App.useApp();
  const { status, markUnauthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: DocumentView = searchParams.get('view') === 'trash' ? 'trash' : 'documents';
  const activeId = view === 'documents' ? parseDocumentId(searchParams.get('id')) : null;

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null);
  const [title, setTitle] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editRevision, setEditRevision] = useState(0);

  const activeDocumentRef = useRef<DocumentRecord | null>(null);
  const activeIdRef = useRef<number | null>(activeId);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef('');
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  activeIdRef.current = activeId;

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setEditRevision(revisionRef.current);
    setSaveState((current) => (current === 'conflict' ? current : 'dirty'));
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '开始写点什么，内容会自动保存。',
      }),
    ],
    content: EMPTY_CONTENT,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'swan-prosemirror',
        role: 'textbox',
        'aria-label': '文档正文',
        spellcheck: 'false',
      },
    },
    onUpdate: markDirty,
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (status === 'loading') {
      setListLoading(true);
      return;
    }
    if (status === 'unauthenticated') {
      setDocuments([]);
      setListLoading(false);
      return;
    }

    const controller = new AbortController();
    setListLoading(true);
    setLoadError(null);

    const request =
      view === 'trash'
        ? api.listTrashDocuments({ signal: controller.signal })
        : api.listDocuments({ signal: controller.signal });

    request
      .then(({ items }) => {
        setDocuments(items);
        if (view !== 'documents') return;

        setSearchParams(
          (current) => {
            const requestedId = parseDocumentId(current.get('id'));
            if (requestedId && items.some((item) => item.id === requestedId)) return current;
            const next = new URLSearchParams(current);
            if (items[0]) next.set('id', String(items[0].id));
            else next.delete('id');
            return next;
          },
          { replace: true },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return;
        }
        setLoadError(errorMessage(error, '文档列表加载失败'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });

    return () => controller.abort();
  }, [markUnauthenticated, setSearchParams, status, view]);

  useEffect(() => {
    if (status !== 'authenticated' || view !== 'documents' || !activeId) {
      activeIdRef.current = null;
      activeDocumentRef.current = null;
      setActiveDocument(null);
      setTitle('');
      titleRef.current = '';
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setEditRevision(0);
      setSaveState('idle');
      editor?.commands.setContent(EMPTY_CONTENT, { emitUpdate: false });
      return;
    }

    const controller = new AbortController();
    setEditorLoading(true);
    setLoadError(null);

    api
      .getDocument(activeId, { signal: controller.signal })
      .then((document) => {
        if (activeIdRef.current !== activeId) return;
        activeDocumentRef.current = document;
        setActiveDocument(document);
        setTitle(document.title);
        titleRef.current = document.title;
        revisionRef.current = 0;
        savedRevisionRef.current = 0;
        setEditRevision(0);
        setSaveState('saved');
        editor?.commands.setContent(document.content as JSONContent, { emitUpdate: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeIdRef.current !== activeId) return;
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return;
        }
        setLoadError(errorMessage(error, '文档加载失败'));
      })
      .finally(() => {
        if (!controller.signal.aborted && activeIdRef.current === activeId) {
          setEditorLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeId, editor, markUnauthenticated, status, view]);

  const saveDocument = useCallback(async (): Promise<boolean> => {
    const pending = savePromiseRef.current;
    if (pending) return pending;

    const document = activeDocumentRef.current;
    const currentEditor = editorRef.current;
    if (!document || !currentEditor) return false;

    const revision = revisionRef.current;
    const nextTitle = titleRef.current.trim() || '无标题文档';

    if (!titleRef.current.trim()) {
      titleRef.current = nextTitle;
      setTitle(nextTitle);
    }

    setSaveState('saving');

    const task = (async () => {
      try {
        const updated = await api.updateDocument(document.id, {
          version: document.version,
          title: nextTitle,
          content: currentEditor.getJSON() as Record<string, unknown>,
          contentHtml: currentEditor.getHTML(),
          contentText: currentEditor.getText(),
        });

        setDocuments((items) =>
          [toSummary(updated), ...items.filter((item) => item.id !== updated.id)].sort(
            (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
          ),
        );

        if (activeIdRef.current === document.id) {
          activeDocumentRef.current = updated;
          setActiveDocument(updated);
          savedRevisionRef.current = revision;
          setSaveState('saved');
        }
        return true;
      } catch (error) {
        if (isUnauthorized(error)) {
          markUnauthenticated();
          return false;
        }
        if (activeIdRef.current === document.id) {
          setSaveState(error instanceof ApiError && error.status === 409 ? 'conflict' : 'error');
        }
        return false;
      }
    })();

    savePromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (savePromiseRef.current === task) savePromiseRef.current = null;
    }
  }, [markUnauthenticated]);

  useEffect(() => {
    if (
      !activeDocument ||
      !editor ||
      saveState === 'saving' ||
      saveState === 'error' ||
      saveState === 'conflict'
    ) {
      return;
    }
    if (revisionRef.current <= savedRevisionRef.current) return;

    const timer = window.setTimeout(() => {
      void saveDocument();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeDocument, editRevision, editor, saveDocument, saveState]);

  const reloadActiveDocument = async () => {
    if (!activeId) return;
    setEditorLoading(true);
    try {
      const document = await api.getDocument(activeId);
      activeDocumentRef.current = document;
      setActiveDocument(document);
      setTitle(document.title);
      titleRef.current = document.title;
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setEditRevision(0);
      setSaveState('saved');
      editor?.commands.setContent(document.content as JSONContent, { emitUpdate: false });
      message.success('已加载其他页面的最新版本');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '重新加载失败'));
    } finally {
      setEditorLoading(false);
    }
  };

  const selectDocument = async (id: number) => {
    if (id === activeId) return;
    if (saveState === 'conflict') {
      message.error('请先处理当前文档的保存冲突');
      return;
    }
    if (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再切换');
        return;
      }
    }

    activeIdRef.current = id;
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    next.set('id', String(id));
    setSearchParams(next);
  };

  const createDocument = async () => {
    if (creating || saveState === 'conflict') return;
    if (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再新建');
        return;
      }
    }

    setCreating(true);
    try {
      const document = await api.createDocument();
      setDocuments((items) => [toSummary(document), ...items]);
      activeIdRef.current = document.id;
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.set('id', String(document.id));
      setSearchParams(next);
      message.success('已新建文档');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '新建文档失败'));
    } finally {
      setCreating(false);
    }
  };

  const deleteActiveDocument = async () => {
    const document = activeDocumentRef.current;
    if (!document || deleting || saveState === 'conflict') return;

    setDeleting(true);
    try {
      if (savePromiseRef.current) await savePromiseRef.current;
      await api.deleteDocument(document.id);
      const remaining = documents.filter((item) => item.id !== document.id);
      setDocuments(remaining);
      activeIdRef.current = remaining[0]?.id ?? null;
      activeDocumentRef.current = null;
      setActiveDocument(null);

      const next = new URLSearchParams(searchParams);
      if (remaining[0]) next.set('id', String(remaining[0].id));
      else next.delete('id');
      setSearchParams(next, { replace: true });
      message.success('文档已移入回收站');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const restoreDocument = async (document: DocumentSummary) => {
    if (restoringId !== null) return;
    setRestoringId(document.id);
    try {
      await api.restoreDocument(document.id);
      setDocuments((items) => items.filter((item) => item.id !== document.id));
      message.success('文档已恢复');
    } catch (error) {
      if (isUnauthorized(error)) {
        markUnauthenticated();
        return;
      }
      message.error(errorMessage(error, '恢复失败'));
    } finally {
      setRestoringId(null);
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    markDirty();
  };

  if (status === 'loading') return <HydrateFallback />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;

  return (
    <>
      {loadError && (
        <Alert
          type="error"
          showIcon
          title={loadError}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setLoadError(null)}
        />
      )}

      {saveState === 'conflict' && (
        <Alert
          type="warning"
          showIcon
          title="这篇文档已在其他页面更新"
          description="当前编辑内容仍保留在页面上。重新加载会使用服务器上的最新版本。"
          action={
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => void reloadActiveDocument()}
            >
              重新加载
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="swan-docs">
        <aside className="swan-doc-list-panel swan-card">
          <div className="swan-doc-list-head">
            <div className="swan-doc-list-heading">
              <strong>{view === 'trash' ? '回收站' : '全部文档'}</strong>
              <span className="swan-doc-count">{documents.length}</span>
            </div>
            {view === 'documents' && (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                loading={creating}
                disabled={saveState === 'conflict'}
                onClick={() => void createDocument()}
              >
                新建
              </Button>
            )}
          </div>

          <div className="swan-doc-list">
            {listLoading ? (
              <div className="swan-doc-list-empty">
                <Spin size="small" />
              </div>
            ) : documents.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={view === 'trash' ? '回收站是空的' : '还没有文档'}
                style={{ padding: '40px 0' }}
              />
            ) : (
              documents.map((document) =>
                view === 'trash' ? (
                  <div className="swan-doc-list-item swan-doc-trash-item" key={document.id}>
                    <span className="swan-doc-list-title">
                      <DeleteOutlined />
                      {document.title}
                    </span>
                    <span className="swan-doc-list-excerpt">{document.excerpt || '空白文档'}</span>
                    <span className="swan-doc-list-time">
                      删除于 {formatUpdatedAt(document.deletedAt ?? document.updatedAt)}
                    </span>
                    <Button
                      size="small"
                      icon={<RestoreOutlined />}
                      loading={restoringId === document.id}
                      onClick={() => void restoreDocument(document)}
                    >
                      恢复
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    key={document.id}
                    className={
                      document.id === activeId
                        ? 'swan-doc-list-item is-selected'
                        : 'swan-doc-list-item'
                    }
                    disabled={saveState === 'saving'}
                    onClick={() => void selectDocument(document.id)}
                  >
                    <span className="swan-doc-list-title">
                      <FileTextOutlined />
                      {document.title}
                    </span>
                    <span className="swan-doc-list-excerpt">{document.excerpt || '空白文档'}</span>
                    <span className="swan-doc-list-time">
                      {formatUpdatedAt(document.updatedAt)}
                    </span>
                  </button>
                ),
              )
            )}
          </div>
        </aside>

        <section className="swan-editor-panel swan-card">
          {view === 'trash' ? (
            <div className="swan-editor-loading">
              <Empty description="回收站中的文档不能编辑。恢复后会重新出现在全部文档中。" />
            </div>
          ) : editorLoading || !editor ? (
            <div className="swan-editor-loading">
              <Spin />
            </div>
          ) : !activeDocument ? (
            <div className="swan-editor-loading">
              <Empty description="新建一篇文档，开始让文字飞起来">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => void createDocument()}
                >
                  新建文档
                </Button>
              </Empty>
            </div>
          ) : (
            <>
              <div className="swan-editor-head">
                <Input
                  variant="borderless"
                  className="swan-doc-title-input"
                  value={title}
                  maxLength={200}
                  placeholder="无标题文档"
                  onChange={(event) => handleTitleChange(event.target.value)}
                />
                <div className="swan-editor-actions">
                  <Tag
                    style={{
                      marginInlineEnd: 0,
                      color:
                        saveState === 'error' || saveState === 'conflict'
                          ? '#b42318'
                          : saveState === 'saving' || saveState === 'dirty'
                            ? '#8a4b00'
                            : '#166534',
                      background:
                        saveState === 'error' || saveState === 'conflict'
                          ? '#fef3f2'
                          : saveState === 'saving' || saveState === 'dirty'
                            ? '#fff7e6'
                            : '#ecfdf3',
                    }}
                  >
                    {saveState === 'saving'
                      ? '保存中…'
                      : saveState === 'dirty'
                        ? '等待保存'
                        : saveState === 'error'
                          ? '保存失败'
                          : saveState === 'conflict'
                            ? '版本冲突'
                            : '已保存'}
                  </Tag>
                  {saveState === 'error' && (
                    <Button size="small" type="link" onClick={() => void saveDocument()}>
                      重试
                    </Button>
                  )}
                  {saveState === 'conflict' && (
                    <Button size="small" type="link" onClick={() => void reloadActiveDocument()}>
                      重新加载
                    </Button>
                  )}
                  <Popconfirm
                    title="将这篇文档移入回收站？"
                    description="你之后可以从回收站恢复。"
                    okText="移入回收站"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void deleteActiveDocument()}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deleting}
                      disabled={saveState === 'conflict'}
                      aria-label="删除文档"
                    />
                  </Popconfirm>
                </div>
              </div>

              <EditorToolbar editor={editor} />
              <div className="swan-tiptap">
                <EditorContent editor={editor} />
              </div>
              <div className="swan-editor-meta">
                <Typography.Text style={{ color: '#64748b' }}>
                  V{activeDocument.version} · {formatUpdatedAt(activeDocument.updatedAt)}
                </Typography.Text>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="swan-editor-toolbar" role="toolbar" aria-label="文档格式">
      <Button
        size="small"
        type={editor.isActive('heading', { level: 1 }) ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </Button>
      <Button
        size="small"
        type={editor.isActive('heading', { level: 2 }) ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </Button>
      <Button
        size="small"
        type={editor.isActive('bold') ? 'primary' : 'text'}
        icon={<BoldOutlined />}
        aria-label="粗体"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Button
        size="small"
        type={editor.isActive('italic') ? 'primary' : 'text'}
        icon={<ItalicOutlined />}
        aria-label="斜体"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Button
        size="small"
        type={editor.isActive('bulletList') ? 'primary' : 'text'}
        icon={<UnorderedListOutlined />}
        aria-label="无序列表"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Button
        size="small"
        type={editor.isActive('orderedList') ? 'primary' : 'text'}
        icon={<OrderedListOutlined />}
        aria-label="有序列表"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Button
        size="small"
        type={editor.isActive('blockquote') ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        引用
      </Button>
      <Button
        size="small"
        type={editor.isActive('codeBlock') ? 'primary' : 'text'}
        icon={<CodeOutlined />}
        aria-label="代码块"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <span className="swan-editor-toolbar-spacer" />
      <Button
        size="small"
        type="text"
        icon={<UndoOutlined />}
        aria-label="撤销"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <Button
        size="small"
        type="text"
        icon={<RedoOutlined />}
        aria-label="重做"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}
