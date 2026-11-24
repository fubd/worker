/** 前后端共享的类型定义 */

import type { DocumentId, FolderId } from './ids';

export interface DocumentSummary {
  id: DocumentId;
  title: string;
  excerpt: string;
  folderId: FolderId | null;
  favorite: boolean;
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

export interface FolderSummary {
  id: FolderId;
  name: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderListResponse {
  items: FolderSummary[];
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
