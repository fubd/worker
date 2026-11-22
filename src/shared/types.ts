/** 前后端共享的类型定义 */

export interface DocumentSummary {
  id: number;
  title: string;
  excerpt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DocumentRecord extends DocumentSummary {
  content: Record<string, unknown>;
  contentHtml: string;
  contentText: string;
}

export interface DocumentListResponse {
  items: DocumentSummary[];
}

export interface AuthUser {
  id: number;
  username: string | null;
  email: string | null;
  name: string;
  avatarUrl: string;
  hasPassword: boolean;
  linkedProviders: Array<'google' | 'github'>;
}

export interface AuthSessionResponse {
  user: AuthUser;
}
