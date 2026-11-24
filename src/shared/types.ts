/** 前后端共享的类型定义 */

import type { PublicId } from './ids';

export interface DocumentSummary {
  id: PublicId;
  title: string;
  excerpt: string;
  folderId: PublicId | null;
  favorite: boolean;
  shareId: PublicId | null;
  sharedAt: string | null;
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

export interface DocumentVersionSummary {
  version: number;
  title: string;
  excerpt: string;
  createdAt: string;
}

export interface DocumentVersionListResponse {
  items: DocumentVersionSummary[];
}

export interface DocumentVersionRecord {
  version: number;
  title: string;
  content: Record<string, unknown>;
  contentHtml: string;
  contentText: string;
  createdAt: string;
}

export interface SharedDocument {
  title: string;
  contentHtml: string;
  contentText: string;
  updatedAt: string;
}

export interface FolderSummary {
  id: PublicId;
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
