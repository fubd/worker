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
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useSearchParams } from 'react-router';

import { api } from '../api/client';
import type { DocumentRecord, DocumentSummary } from '@/shared/types';

const EMPTY_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

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

export function HydrateFallback() {
  return (
    <div className="swan-docs">
      <aside className="swan-doc-list-panel swan-card">
        <div className="swan-doc-list-head">
          <div className="swan-doc-list-heading">
            <strong>文档</strong>
            <span className="swan-doc-count">0</span>
          </div>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            className="swan-doc-create-button"
          >
            新建
          </Button>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = parseDocumentId(searchParams.get('id'));

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null);
  const [title, setTitle] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    setSaveState('dirty');
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
        spellcheck: 'false',
      },
    },
    onUpdate: markDirty,
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setLoadError(null);

    api
      .listDocuments({ signal: controller.signal })
      .then(({ items }) => {
        setDocuments(items);
        setSearchParams(
          (current) => {
            if (current.get('id') || items.length === 0) return current;
            const next = new URLSearchParams(current);
            next.set('id', String(items[0].id));
            return next;
          },
          { replace: true },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(errorMessage(error, '文档列表加载失败'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });

    return () => controller.abort();
  }, [setSearchParams]);

  useEffect(() => {
    if (!activeId) {
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
        setLoadError(errorMessage(error, '文档加载失败'));
      })
      .finally(() => {
        if (!controller.signal.aborted && activeIdRef.current === activeId) {
          setEditorLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeId, editor]);

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
      } catch {
        if (activeIdRef.current === document.id) setSaveState('error');
        return false;
      }
    })();

    savePromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (savePromiseRef.current === task) savePromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activeDocument || !editor || saveState === 'saving' || saveState === 'error') return;
    if (revisionRef.current <= savedRevisionRef.current) return;

    const timer = window.setTimeout(() => {
      void saveDocument();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeDocument, editRevision, editor, saveDocument, saveState]);

  const selectDocument = async (id: number) => {
    if (id === activeId) return;
    if (revisionRef.current > savedRevisionRef.current || savePromiseRef.current) {
      const saved = await saveDocument();
      if (!saved) {
        message.error('当前文档保存失败，请重试后再切换');
        return;
      }
    }

    activeIdRef.current = id;
    const next = new URLSearchParams(searchParams);
    next.set('id', String(id));
    setSearchParams(next);
  };

  const createDocument = async () => {
    if (creating) return;
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
      next.set('id', String(document.id));
      setSearchParams(next);
      message.success('已新建文档');
    } catch (error) {
      message.error(errorMessage(error, '新建文档失败'));
    } finally {
      setCreating(false);
    }
  };

  const deleteActiveDocument = async () => {
    const document = activeDocumentRef.current;
    if (!document || deleting) return;

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
      message.success('文档已删除');
    } catch (error) {
      message.error(errorMessage(error, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    markDirty();
  };

  return (
    <>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setLoadError(null)}
        />
      )}

      <div className="swan-docs">
        <aside className="swan-doc-list-panel swan-card">
          <div className="swan-doc-list-head">
            <div className="swan-doc-list-heading">
              <strong>文档</strong>
              <span className="swan-doc-count">{documents.length}</span>
            </div>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              loading={creating}
              className="swan-doc-create-button"
              onClick={() => void createDocument()}
            >
              新建
            </Button>
          </div>

          <div className="swan-doc-list">
            {listLoading ? (
              <div className="swan-doc-list-empty">
                <Spin size="small" />
              </div>
            ) : documents.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有文档"
                style={{ padding: '40px 0' }}
              />
            ) : (
              documents.map((document) => (
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
                  <span className="swan-doc-list-time">{formatUpdatedAt(document.updatedAt)}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="swan-editor-panel swan-card">
          {editorLoading || !editor ? (
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
                    color={
                      saveState === 'error'
                        ? 'error'
                        : saveState === 'saving' || saveState === 'dirty'
                          ? 'processing'
                          : 'success'
                    }
                    style={{ marginInlineEnd: 0 }}
                  >
                    {saveState === 'saving'
                      ? '保存中…'
                      : saveState === 'dirty'
                        ? '等待保存'
                        : saveState === 'error'
                          ? '保存失败'
                          : '已保存'}
                  </Tag>
                  {saveState === 'error' && (
                    <Button size="small" type="link" onClick={() => void saveDocument()}>
                      重试
                    </Button>
                  )}
                  <Popconfirm
                    title="删除这篇文档？"
                    description="删除后无法恢复。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void deleteActiveDocument()}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deleting}
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
                <Typography.Text type="secondary">
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
