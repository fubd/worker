import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Eye, Link2Off } from 'lucide-react';
import { useParams } from 'react-router';

import { BRAND } from '@/shared/brand';
import { isPublicId } from '@/shared/ids';
import type { SharedDocument } from '@/shared/types';
import { api } from '../api/client';
import { BrandMark } from '../components/BrandMark';

function formatShareDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [document, setDocument] = useState<SharedDocument | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('分享链接不存在或已失效');

  useEffect(() => {
    if (!shareId || !isPublicId(shareId)) {
      setState('error');
      return;
    }

    const controller = new AbortController();
    setState('loading');
    api
      .getSharedDocument(shareId, { signal: controller.signal })
      .then((nextDocument) => {
        if (controller.signal.aborted) return;
        setDocument(nextDocument);
        setState('ready');
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) return;
        setError(nextError instanceof Error ? nextError.message : '分享内容加载失败');
        setState('error');
      });
    return () => controller.abort();
  }, [shareId]);

  const sanitizedHtml = useMemo(
    () =>
      document
        ? DOMPurify.sanitize(document.contentHtml, {
            USE_PROFILES: { html: true },
          })
        : '',
    [document],
  );

  return (
    <div className="swan-share swan-share-shell">
      <header className="swan-share-header">
        <a className="swan-public-brand" href="/" aria-label="雨燕首页">
          <BrandMark size={34} />
          <span>
            <strong>{BRAND.name}</strong>
            <small>{BRAND.tagline}</small>
          </span>
        </a>
        <span className="swan-share-readonly">
          <Eye aria-hidden="true" size={14} strokeWidth={1.8} />
          只读分享
        </span>
      </header>

      <main className="swan-share-main">
        {state === 'loading' ? (
          <div className="swan-share-loading" role="status" aria-label="正在加载分享文档">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : state === 'error' || !document ? (
          <section className="swan-share-unavailable">
            <span className="swan-share-unavailable-icon">
              <Link2Off aria-hidden="true" size={25} strokeWidth={1.6} />
            </span>
            <h1>这篇分享已经结束</h1>
            <p>{error}</p>
            <a href="/">返回雨燕首页</a>
          </section>
        ) : (
          <article className="swan-share-document">
            <div className="swan-share-document-meta">
              <span>YUYAN / SHARED DOCUMENT</span>
              <time>更新于 {formatShareDate(document.updatedAt)}</time>
            </div>
            <h1>{document.title}</h1>
            {document.contentText.trim() ? (
              <div
                className="swan-share-content"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : (
              <p className="swan-share-empty">这是一篇空白文档。</p>
            )}
          </article>
        )}
      </main>

      <footer className="swan-share-footer">
        <span>由 {BRAND.name} 分享</span>
        <a href="/">也去写下你的文字</a>
      </footer>
    </div>
  );
}
