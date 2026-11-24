/**
 * Worker 运行环境绑定（与 wrangler.jsonc 中一一对应）
 */
export interface Env {
  /** D1 数据库 */
  DB: D1Database;
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
  owner_id: number | null;
  title: string;
  content_json: string;
  content_html: string;
  content_text: string;
  folder_id: number | null;
  is_favorite: number;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderRow {
  id: number;
  owner_id: number;
  name: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export type {
  AuthSessionResponse,
  AuthUser,
  DocumentListResponse,
  DocumentRecord,
  DocumentSummary,
  FolderListResponse,
  FolderSummary,
} from '../shared/types';
