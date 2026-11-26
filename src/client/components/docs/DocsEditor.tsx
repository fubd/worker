import { useEffect, useState } from 'react';
import { Button, Dropdown, Input } from 'antd';
import {
  Bold,
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudCheck,
  CodeXml,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  MoreVertical,
  Redo2,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useEditorState, type Editor } from '@tiptap/react';

import { DOCUMENT_TITLE_MAX_LENGTH } from '@/shared/limits';
import { formatLastEditedAt, type DocumentMode, type SaveState } from '../../workspace-utils';

export function DocumentSkeleton() {
  return (
    <div
      className="swan-editor-canvas swan-document-loading"
      role="status"
      aria-label="正在加载文档"
    >
      <div className="swan-editor-stage">
        <aside className="swan-editor-margin" aria-hidden="true">
          <span>DOCUMENT</span>
          <div className="swan-skeleton-bar is-margin" />
          <div className="swan-skeleton-bar is-margin is-short" />
          <div className="swan-skeleton-bar is-margin is-short" />
        </aside>
        <article className="swan-editor-page">
          <span className="swan-editor-kicker">私人笔记 · 写作</span>
          <div className="swan-document-skeleton swan-loading-surface" aria-hidden="true">
            <div className="swan-skeleton-bar is-title" />
            <div className="swan-skeleton-meta">
              <div className="swan-skeleton-bar is-meta" />
              <div className="swan-skeleton-bar is-meta is-short" />
              <div className="swan-skeleton-bar is-meta is-folder-meta" />
            </div>
            <div className="swan-skeleton-bar is-toolbar" />
            <div className="swan-skeleton-copy">
              <div className="swan-skeleton-bar is-copy" />
              <div className="swan-skeleton-bar is-copy is-wide" />
              <div className="swan-skeleton-bar is-copy" />
              <div className="swan-skeleton-bar is-copy is-short" />
            </div>
          </div>
        </article>
        <aside className="swan-editor-margin is-right" aria-hidden="true" />
      </div>
    </div>
  );
}

export function SaveStatus({ state, updatedAt }: { state: SaveState; updatedAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (state !== 'idle') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [state]);

  const syncing = state === 'dirty' || state === 'saving';
  const Icon =
    state === 'error'
      ? CircleAlert
      : state === 'conflict'
        ? TriangleAlert
        : syncing
          ? LoaderCircle
          : state === 'saved'
            ? CloudCheck
            : Clock3;
  const label =
    state === 'error'
      ? '保存失败'
      : state === 'conflict'
        ? '版本冲突'
        : syncing
          ? '正在保存...'
          : state === 'saved'
            ? '已保存'
            : `上次编辑 ${formatLastEditedAt(updatedAt, now)}`;

  return (
    <span className={`swan-save-state is-${state}`} aria-live="polite">
      <Icon
        className={syncing ? 'swan-save-icon is-spinning' : 'swan-save-icon'}
        aria-hidden="true"
        size={14}
        strokeWidth={1.8}
      />
      <span>{label}</span>
    </span>
  );
}

export function DocumentTitleInput({
  value: currentValue,
  mode,
  onChange,
}: {
  value: string;
  mode: DocumentMode;
  onChange: (value: string) => void;
}) {
  if (mode === 'read') {
    return <h1 className="swan-doc-title-display">{currentValue.trim() || '无标题文档'}</h1>;
  }

  return (
    <Input.TextArea
      variant="borderless"
      className="swan-doc-title-input"
      autoSize={{ minRows: 1 }}
      value={currentValue}
      maxLength={DOCUMENT_TITLE_MAX_LENGTH}
      placeholder="无标题文档"
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.preventDefault();
      }}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}

export function EditorCharacterCount({ editor }: { editor: Editor }) {
  const count = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor.getText().trim().length,
  });

  return count;
}

export function DocumentOutline({ editor }: { editor: Editor }) {
  const [collapsed, setCollapsed] = useState(false);
  const headings = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const items: Array<{ level: number; pos: number; text: string }> = [];
      currentEditor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return;
        const level = Number(node.attrs.level);
        const text = node.textContent.trim();
        if (level >= 1 && level <= 3 && text) {
          items.push({ level, pos, text });
        }
      });
      return items;
    },
  });

  if (headings.length === 0) {
    return <aside className="swan-editor-margin is-right" aria-hidden="true" />;
  }

  const jumpToHeading = (pos: number) => {
    const node = editor.view.nodeDOM(pos);
    if (!(node instanceof HTMLElement)) return;

    node.scrollIntoView({ behavior: 'auto', block: 'center' });
    if (editor.isEditable) {
      editor
        .chain()
        .setTextSelection(pos + 1)
        .focus()
        .run();
    }
  };

  return (
    <aside className="swan-editor-margin is-right swan-document-outline" aria-label="文档大纲">
      <div className="swan-document-outline-head">
        {!collapsed && <span>大纲</span>}
        <button
          type="button"
          aria-label={collapsed ? '展开文档大纲' : '收起文档大纲'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronRight
            className={collapsed ? undefined : 'is-expanded'}
            aria-hidden="true"
            size={14}
            strokeWidth={1.8}
          />
        </button>
      </div>
      {!collapsed && (
        <nav className="swan-document-outline-list">
          {headings.map((heading) => (
            <button
              type="button"
              className={`swan-document-outline-item is-h${heading.level}`}
              key={`${heading.pos}-${heading.text}`}
              title={heading.text}
              onClick={() => jumpToHeading(heading.pos)}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const activeFormats = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      h1: currentEditor.isActive('heading', { level: 1 }),
      h2: currentEditor.isActive('heading', { level: 2 }),
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      blockquote: currentEditor.isActive('blockquote'),
      codeBlock: currentEditor.isActive('codeBlock'),
      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
    }),
  });

  return (
    <div className="swan-editor-toolbar" role="toolbar" aria-label="文档格式">
      <Button
        className="swan-format-secondary"
        size="small"
        type={activeFormats.h1 ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </Button>
      <Button
        className="swan-format-secondary"
        size="small"
        type={activeFormats.h2 ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </Button>
      <Button
        size="small"
        type={activeFormats.bold ? 'primary' : 'text'}
        icon={<Bold aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="粗体"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <Button
        size="small"
        type={activeFormats.italic ? 'primary' : 'text'}
        icon={<Italic aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="斜体"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <Button
        size="small"
        type={activeFormats.bulletList ? 'primary' : 'text'}
        icon={<List aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="无序列表"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Button
        size="small"
        type={activeFormats.orderedList ? 'primary' : 'text'}
        icon={<ListOrdered aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="有序列表"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Button
        className="swan-format-secondary"
        size="small"
        type={activeFormats.blockquote ? 'primary' : 'text'}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        引用
      </Button>
      <Button
        className="swan-format-secondary"
        size="small"
        type={activeFormats.codeBlock ? 'primary' : 'text'}
        icon={<CodeXml aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="代码块"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <Dropdown
        trigger={['click']}
        placement="bottomLeft"
        menu={{
          items: [
            { key: 'h1', label: '一级标题' },
            { key: 'h2', label: '二级标题' },
            { key: 'quote', label: '引用' },
            { key: 'code', label: '代码块' },
          ],
          onClick: ({ key }) => {
            if (key === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
            if (key === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
            if (key === 'quote') editor.chain().focus().toggleBlockquote().run();
            if (key === 'code') editor.chain().focus().toggleCodeBlock().run();
          },
        }}
      >
        <Button
          className="swan-format-more"
          size="small"
          type="text"
          icon={<MoreVertical aria-hidden="true" size={18} strokeWidth={1.8} />}
          aria-label="更多格式"
        />
      </Dropdown>
      <span className="swan-editor-toolbar-spacer" />
      <Button
        size="small"
        type="text"
        icon={<Undo2 aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="撤销"
        disabled={!activeFormats.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <Button
        size="small"
        type="text"
        icon={<Redo2 aria-hidden="true" size={16} strokeWidth={1.8} />}
        aria-label="重做"
        disabled={!activeFormats.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}
