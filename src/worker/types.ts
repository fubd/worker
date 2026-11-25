/**
 * Worker 运行环境绑定（与 wrangler.jsonc 中一一对应）
 */
export interface Env {
  /** D1 数据库 */
  DB: D1Database;
  /** 文档附件对象存储 */
  ATTACHMENTS: R2Bucket;
  /** 站点公开地址，用于 OAuth 回调和登录后跳转 */
  PUBLIC_ORIGIN?: string;
  /** Google OAuth 客户端 */
  GOOGLE_ID?: string;
  GOOGLE_SECRET?: string;
  /** GitHub OAuth App */
  GITHUB_ID?: string;
  GITHUB_SECRET?: string;
  /** 历史所有者邮箱，仅用于首次登录时接管 owner_id 为空的旧文档 */
  OWNER_EMAIL?: string;
  /** 环境标识，可在 wrangler.jsonc 的 vars 里覆盖 */
  ENVIRONMENT?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: import('../shared/types').AuthUser;
  };
};

export interface DocumentRow {
  id: number;
  public_id: import('../shared/ids').PublicId;
  owner_id: number | null;
  title: string;
  content_json: string;
  content_html: string;
  content_text: string;
  folder_id: number | null;
  folder_public_id: import('../shared/ids').PublicId | null;
  parent_document_id: number | null;
  parent_document_public_id: import('../shared/ids').PublicId | null;
  child_count: number;
  is_favorite: number;
  is_pinned: number;
  last_viewed_at: string | null;
  share_id: import('../shared/ids').PublicId | null;
  shared_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderRow {
  id: number;
  public_id: import('../shared/ids').PublicId;
  owner_id: number;
  parent_id: number | null;
  parent_public_id: import('../shared/ids').PublicId | null;
  name: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface AttachmentRow {
  id: number;
  public_id: import('../shared/ids').PublicId;
  owner_id: number;
  document_id: number;
  object_key: string;
  file_name: string;
  content_type: string;
  size: number;
  created_at: string;
}

export type {
  AuthSessionResponse,
  AuthUser,
  DocumentAttachment,
  DocumentAttachmentListResponse,
  DocumentChildrenResponse,
  DocumentImportInput,
  DocumentListSort,
  DocumentListResponse,
  DocumentRecord,
  DocumentSummary,
  DocumentVersionListResponse,
  DocumentVersionRecord,
  DocumentVersionSummary,
  FolderListResponse,
  FolderSummary,
  SharedDocument,
} from '../shared/types';
