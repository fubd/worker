export interface DocumentListCursor {
  pinned: boolean;
  favorite: boolean;
  activityAt: string;
  id: number;
}

function toBase64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

export function encodeDocumentListCursor(cursor: DocumentListCursor): string {
  return toBase64Url(
    JSON.stringify([cursor.pinned ? 1 : 0, cursor.favorite ? 1 : 0, cursor.activityAt, cursor.id]),
  );
}

export function decodeDocumentListCursor(value: string): DocumentListCursor | null {
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 4 ||
      (parsed[0] !== 0 && parsed[0] !== 1) ||
      (parsed[1] !== 0 && parsed[1] !== 1) ||
      typeof parsed[2] !== 'string' ||
      parsed[2].length === 0 ||
      parsed[2].length > 64 ||
      !Number.isSafeInteger(parsed[3]) ||
      parsed[3] <= 0
    ) {
      return null;
    }

    return {
      pinned: parsed[0] === 1,
      favorite: parsed[1] === 1,
      activityAt: parsed[2],
      id: parsed[3],
    };
  } catch {
    return null;
  }
}
