import { generateHTML, generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { marked } from 'marked';
import { DOCUMENT_TITLE_MAX_LENGTH } from '@/shared/limits';
import type { DocumentImportInput } from '@/shared/types';

const extensions = [StarterKit];

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || '导入的文档';
}

function limitTitle(value: string): string {
  const title = value.replace(/\s+/g, ' ').trim() || '导入的文档';
  return Array.from(title).slice(0, DOCUMENT_TITLE_MAX_LENGTH).join('');
}

function htmlToText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return parsed.body.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
}

function parseJsonImport(source: string, fallbackTitle: string): DocumentImportInput {
  const parsed = JSON.parse(source) as {
    document?: Record<string, unknown>;
    title?: unknown;
    content?: unknown;
    contentHtml?: unknown;
    contentText?: unknown;
  };
  const document = parsed.document ?? parsed;
  const content = document.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('JSON 中没有可识别的文档正文');
  }

  const json = content as Record<string, unknown>;
  if (json.type !== 'doc') {
    throw new Error('JSON 正文不是 Tiptap 文档格式');
  }

  const contentHtml =
    typeof document.contentHtml === 'string'
      ? document.contentHtml
      : generateHTML(json as Parameters<typeof generateHTML>[0], extensions);
  const contentText =
    typeof document.contentText === 'string' ? document.contentText : htmlToText(contentHtml);
  const title =
    typeof document.title === 'string' && document.title.trim() ? document.title : fallbackTitle;

  return {
    title: limitTitle(title),
    content: json,
    contentHtml,
    contentText,
    folderId: null,
  };
}

function parseHtmlImport(source: string, fallbackTitle: string): DocumentImportInput {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const title =
    parsed.querySelector('title')?.textContent?.trim() ||
    parsed.querySelector('h1')?.textContent?.trim() ||
    fallbackTitle;
  const html = parsed.body.innerHTML.trim() || '<p></p>';
  const content = generateJSON(html, extensions);
  const contentHtml = generateHTML(content, extensions);

  return {
    title: limitTitle(title),
    content,
    contentHtml,
    contentText: htmlToText(contentHtml),
    folderId: null,
  };
}

function parseMarkdownImport(source: string, fallbackTitle: string): DocumentImportInput {
  const heading = source.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim();
  const markdown = heading ? source.replace(/^\s*#\s+.+?\s*$/m, '') : source;
  const html = marked.parse(markdown, { async: false });
  const content = generateJSON(html, extensions);
  const contentHtml = generateHTML(content, extensions);

  return {
    title: limitTitle(heading || fallbackTitle),
    content,
    contentHtml,
    contentText: htmlToText(contentHtml),
    folderId: null,
  };
}

export async function parseImportFile(file: File): Promise<DocumentImportInput> {
  const extension = fileExtension(file.name);
  const source = await file.text();
  const fallbackTitle = fileStem(file.name);

  if (extension === 'json') return parseJsonImport(source, fallbackTitle);
  if (extension === 'html' || extension === 'htm') return parseHtmlImport(source, fallbackTitle);
  return parseMarkdownImport(source, fallbackTitle);
}
