import type { PublicId } from '@/shared/ids';
import type { DocumentRecord } from '@/shared/types';

export async function downloadDocumentBundle(
  ids: PublicId[],
  loadDocument: (id: PublicId) => Promise<DocumentRecord>,
): Promise<number> {
  const documents = await Promise.all(ids.map((id) => loadDocument(id)));
  const now = new Date();
  const exported = {
    format: 'yuyan-workspace-export',
    version: 1,
    exportedAt: now.toISOString(),
    documents: documents.map(({ title, content, contentHtml, contentText }) => ({
      title,
      content,
      contentHtml,
      contentText,
    })),
  };
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(exported, null, 2)}\n`], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = url;
  anchor.download = `雨燕文档-${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return documents.length;
}
