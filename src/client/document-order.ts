import type { DocumentListSort, DocumentSummary } from '@/shared/types';

export function sortDocumentSummaries(
  items: DocumentSummary[],
  sort: DocumentListSort = 'activity',
): DocumentSummary[] {
  return [...items].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      Number(right.favorite) - Number(left.favorite) ||
      (sort === 'edited'
        ? Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
        : Date.parse(right.lastViewedAt ?? right.updatedAt) -
          Date.parse(left.lastViewedAt ?? left.updatedAt)) ||
      right.id.localeCompare(left.id),
  );
}
