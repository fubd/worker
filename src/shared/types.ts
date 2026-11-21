/** 前后端共享的类型定义 */

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoListResponse {
  items: Todo[];
  /** Only returned when the caller explicitly requests includeTotal=1. */
  total?: number;
}

export interface TodoListSnapshot {
  items: Todo[];
  capturedAt: string;
}

export interface TodoStats {
  total: number;
  completed: number;
  active: number;
  completionRate: number;
  database: string;
  region: string;
  runtime: string;
}

export type TodoStatusFilter = 'all' | 'active' | 'completed';

export interface DocumentSummary {
  id: number;
  title: string;
  excerpt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord extends DocumentSummary {
  content: Record<string, unknown>;
  contentHtml: string;
  contentText: string;
}

export interface DocumentListResponse {
  items: DocumentSummary[];
}
