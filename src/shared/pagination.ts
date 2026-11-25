export interface DocumentListCursor {
  pinned: boolean;
  favorite: boolean;
  activityAt: string;
  id: number;
}

export type DocumentListCursorField = 'activityAt' | 'updatedAt';

function toBase64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

export function encodeDocumentListCursor(
  cursor: DocumentListCursor,
  field: DocumentListCursorField = 'activityAt',
): string {
  return toBase64Url(
    JSON.stringify([
      cursor.pinned ? 1 : 0,
      cursor.favorite ? 1 : 0,
      field === 'updatedAt' ? 'updatedAt' : 'activityAt',
      cursor.activityAt,
      cursor.id,
    ]),
  );
}

export function decodeDocumentListCursor(value: string): DocumentListCursor | null {
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown;
    if (
      !Array.isArray(parsed) ||
      (parsed.length !== 4 && parsed.length !== 5) ||
      (parsed[0] !== 0 && parsed[0] !== 1) ||
      (parsed[1] !== 0 && parsed[1] !== 1) ||
      (parsed.length === 5 && parsed[2] !== 'activityAt' && parsed[2] !== 'updatedAt')
    ) {
      return null;
    }

    const offset = parsed.length === 5 ? 1 : 0;
    const time = parsed[2 + offset];
    const id = parsed[3 + offset];
    if (typeof time !== 'string' || time.length === 0 || time.length > 64) return null;
    if (!Number.isSafeInteger(id) || (id as number) <= 0) return null;

    return {
      pinned: parsed[0] === 1,
      favorite: parsed[1] === 1,
      activityAt: time,
      id: id as number,
    };
  } catch {
    return null;
  }
}
